import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = fileURLToPath(new URL('..', import.meta.url))
const source = root
const publicDir = join(source, 'public')
const models = join(source, 'public', 'models')
const skinId = 'BP3D_FJ2810'
const placentaId = 'HRA:VH_F_placenta'

const json = async path => JSON.parse(await readFile(path, 'utf8'))

async function importTsModule(path) {
  const code = await readFile(path, 'utf8')
  const outputText = stripTypeScriptTypes(code)
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
}

async function loadAtlas() {
  return json(join(models, 'atlas.json'))
}

const maleAtlasFrom = atlas => ({ ...atlas, sex: 'male' })

async function loadRawChunks(atlas) {
  return Promise.all(atlas.chunks.map(chunk => readFile(join(publicDir, chunk.url.replace(/^\//, '')))))
}

function positionsFor(part, chunks) {
  const chunk = chunks[part.chunk]
  return new Float32Array(chunk.buffer, chunk.byteOffset + part.positions, part.vertexCount * 3)
}

function indicesFor(part, chunks) {
  const chunk = chunks[part.chunk]
  return new Uint32Array(chunk.buffer, chunk.byteOffset + part.indices, part.indexCount)
}

function clonePositions(part, chunks) {
  return new Float32Array(positionsFor(part, chunks))
}

function state(overrides = {}) {
  return {
    explode: 0,
    visible: ['skeletal', 'muscular', 'arterial', 'venous', 'nervous', 'respiratory', 'digestive', 'urinary', 'lymphatic', 'endocrine', 'reproductive', 'connective'],
    selected: [],
    isolate: false,
    view: 'three-quarter',
    rotate: false,
    reset: 0,
    ...overrides,
  }
}

function partMap(atlas) {
  return new Map(atlas.parts.map(part => [part.id, part]))
}

function conceptMap(atlas) {
  return new Map(atlas.concepts.map(concept => [concept.id, concept]))
}

function pregnancyParts(atlas) {
  return atlas.parts.filter(part => part.system === 'pregnancy')
}

function vertexAt(positions, index) {
  const offset = index * 3
  return [positions[offset], positions[offset + 1], positions[offset + 2]]
}

function triangleBounds(a, b, c) {
  return {
    minX: Math.min(a[0], b[0], c[0]),
    maxX: Math.max(a[0], b[0], c[0]),
    minY: Math.min(a[1], b[1], c[1]),
    maxY: Math.max(a[1], b[1], c[1]),
  }
}

function interpolateZ(point, a, b, c) {
  const [px, py] = point
  const v0x = b[0] - a[0]
  const v0y = b[1] - a[1]
  const v1x = c[0] - a[0]
  const v1y = c[1] - a[1]
  const v2x = px - a[0]
  const v2y = py - a[1]
  const den = v0x * v1y - v1x * v0y
  if (Math.abs(den) < 1e-10) return null
  const u = (v2x * v1y - v1x * v2y) / den
  const v = (v0x * v2y - v2x * v0y) / den
  const w = 1 - u - v
  const tolerance = 1e-7
  if (u < -tolerance || v < -tolerance || w < -tolerance) return null
  return a[2] * w + b[2] * u + c[2] * v
}

function buildProjectedSkinTriangles(part, positions, indices, pregnancy) {
  const margin = 0.035
  const minX = Math.min(...pregnancy.map(point => point[0])) - margin
  const maxX = Math.max(...pregnancy.map(point => point[0])) + margin
  const minY = Math.min(...pregnancy.map(point => point[1])) - margin
  const maxY = Math.max(...pregnancy.map(point => point[1])) + margin
  const triangles = []
  for (let i = 0; i < indices.length; i += 3) {
    const a = vertexAt(positions, indices[i])
    const b = vertexAt(positions, indices[i + 1])
    const c = vertexAt(positions, indices[i + 2])
    const bounds = triangleBounds(a, b, c)
    if (bounds.maxX < minX || bounds.minX > maxX || bounds.maxY < minY || bounds.minY > maxY) continue
    triangles.push({ a, b, c, ...bounds })
  }
  assert.ok(triangles.length > 0, `${part.id}: should have abdominal projected triangles`)
  return triangles
}

function containmentReport(skinPart, skinPositions, skinIndices, points) {
  const triangles = buildProjectedSkinTriangles(skinPart, skinPositions, skinIndices, points)
  let outside = 0
  let noRay = 0
  let worst = null
  for (const point of points) {
    let back = Infinity
    let front = -Infinity
    for (const triangle of triangles) {
      if (point[0] < triangle.minX || point[0] > triangle.maxX || point[1] < triangle.minY || point[1] > triangle.maxY) continue
      const z = interpolateZ(point, triangle.a, triangle.b, triangle.c)
      if (z === null) continue
      back = Math.min(back, z)
      front = Math.max(front, z)
    }
    if (front === -Infinity || back === Infinity) {
      noRay += 1
      outside += 1
      worst ??= { point, gap: Infinity, back: null, front: null }
      continue
    }
    const frontGap = point[2] - front
    const backGap = back - point[2]
    const gap = Math.max(frontGap, backGap)
    if (gap > 1e-4) {
      outside += 1
      if (!worst || gap > worst.gap) worst = { point, gap, back, front }
    }
  }
  return { checked: points.length, outside, noRay, worst }
}

function collectPregnancyVertices(atlas, chunks) {
  const points = []
  for (const part of pregnancyParts(atlas)) {
    const positions = positionsFor(part, chunks)
    for (let i = 0; i < positions.length; i += 3) points.push([positions[i], positions[i + 1], positions[i + 2]])
  }
  assert.ok(points.length > 0, 'female atlas should include pregnancy vertices')
  return points
}

function assertContainment(report) {
  assert.equal(
    report.outside,
    0,
    `all pregnancy vertices should be enclosed; outside=${report.outside}/${report.checked}, noRay=${report.noRay}, worst=${JSON.stringify(report.worst)}`,
  )
}

function assertUnchangedWhere(label, before, after, predicate) {
  let checked = 0
  for (let i = 0; i < before.length; i += 3) {
    const point = [before[i], before[i + 1], before[i + 2]]
    if (!predicate(point)) continue
    checked += 1
    assert.equal(after[i], before[i], `${label}: x changed at vertex ${i / 3}`)
    assert.equal(after[i + 1], before[i + 1], `${label}: y changed at vertex ${i / 3}`)
    assert.equal(after[i + 2], before[i + 2], `${label}: z changed at vertex ${i / 3}`)
  }
  assert.ok(checked > 0, `${label}: predicate should cover source vertices`)
}

function assertValidMesh(label, positions, indices) {
  assert.equal(positions.length % 3, 0, `${label}: positions should contain complete xyz triples`)
  assert.equal(indices.length % 3, 0, `${label}: indices should contain complete triangles`)
  const vertexCount = positions.length / 3
  for (const index of indices) {
    assert.ok(Number.isInteger(index), `${label}: index should be an integer`)
    assert.ok(index >= 0 && index < vertexCount, `${label}: index ${index} exceeds vertex count ${vertexCount}`)
  }
}

function edgeStats(indices) {
  const undirected = new Map()
  const directed = new Map()
  let degenerateTriangles = 0
  const edgeKey = (a, b) => a < b ? `${a}:${b}` : `${b}:${a}`
  const halfKey = (a, b) => `${a}:${b}`
  const add = (a, b) => {
    undirected.set(edgeKey(a, b), (undirected.get(edgeKey(a, b)) ?? 0) + 1)
    directed.set(halfKey(a, b), (directed.get(halfKey(a, b)) ?? 0) + 1)
  }
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i]
    const b = indices[i + 1]
    const c = indices[i + 2]
    if (a === b || b === c || c === a) degenerateTriangles += 1
    add(a, b)
    add(b, c)
    add(c, a)
  }
  let boundary = 0
  let nonmanifold = 0
  for (const count of undirected.values()) {
    if (count === 1) boundary += 1
    else if (count > 2) nonmanifold += 1
  }
  let duplicateHalfedges = 0
  for (const count of directed.values()) {
    if (count > 1) duplicateHalfedges += count - 1
  }
  const used = new Set(indices)
  return { boundary, nonmanifold, duplicateHalfedges, degenerateTriangles, vertices: used.size, edges: undirected.size, faces: indices.length / 3 }
}

function boundaryGraph(indices) {
  const counts = new Map()
  const edgeKey = (a, b) => a < b ? `${a}:${b}` : `${b}:${a}`
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i]
    const b = indices[i + 1]
    const c = indices[i + 2]
    for (const [from, to] of [[a, b], [b, c], [c, a]]) counts.set(edgeKey(from, to), (counts.get(edgeKey(from, to)) ?? 0) + 1)
  }
  const edges = []
  const adjacency = new Map()
  const addNeighbor = (from, to) => {
    const neighbors = adjacency.get(from) ?? new Set()
    neighbors.add(to)
    adjacency.set(from, neighbors)
  }
  for (const [key, count] of counts) {
    if (count !== 1) continue
    const [a, b] = key.split(':').map(Number)
    edges.push([a, b])
    addNeighbor(a, b)
    addNeighbor(b, a)
  }
  return { edges, adjacency }
}

function connectedComponents(adjacency) {
  const seen = new Set()
  const components = []
  for (const start of adjacency.keys()) {
    if (seen.has(start)) continue
    const component = []
    const stack = [start]
    seen.add(start)
    while (stack.length) {
      const node = stack.pop()
      component.push(node)
      for (const next of adjacency.get(node) ?? []) {
        if (seen.has(next)) continue
        seen.add(next)
        stack.push(next)
      }
    }
    components.push(component.sort((a, b) => a - b))
  }
  return components
}

function originalComponentSets(components, originalVertexCount) {
  return components
    .map(component => component.filter(vertex => vertex < originalVertexCount))
    .sort((a, b) => a[0] - b[0] || a.length - b.length)
}

function assertIncidencePreserved(rawIndices, refinedIndices, originalVertexCount) {
  const raw = edgeStats(rawIndices)
  const refined = edgeStats(refinedIndices)
  assert.equal(refined.degenerateTriangles, 0, `refined mesh should not add degenerate triangles; stats=${JSON.stringify(refined)}`)
  assert.equal(refined.nonmanifold, raw.nonmanifold, `refined mesh should preserve nonmanifold edge count; raw=${JSON.stringify(raw)}, refined=${JSON.stringify(refined)}`)
  assert.ok(
    refined.duplicateHalfedges <= raw.duplicateHalfedges,
    `refined mesh should not add duplicate halfedges; raw=${JSON.stringify(raw)}, refined=${JSON.stringify(refined)}`,
  )
  const rawEuler = raw.vertices - raw.edges + raw.faces
  const refinedEuler = refined.vertices - refined.edges + refined.faces
  assert.equal(refinedEuler, rawEuler, `refined mesh should preserve Euler characteristic; raw=${JSON.stringify(raw)}, refined=${JSON.stringify(refined)}`)

  const rawBoundary = boundaryGraph(rawIndices)
  const refinedBoundary = boundaryGraph(refinedIndices)
  const rawOriginalDegrees = new Map([...rawBoundary.adjacency].map(([vertex, neighbors]) => [vertex, neighbors.size]))
  for (const [vertex, degree] of rawOriginalDegrees) {
    assert.equal(refinedBoundary.adjacency.get(vertex)?.size, degree, `original boundary vertex ${vertex} should preserve boundary degree`)
  }
  for (const [vertex, neighbors] of refinedBoundary.adjacency) {
    if (vertex < originalVertexCount && !rawOriginalDegrees.has(vertex)) {
      assert.fail(`interior source vertex ${vertex} became a boundary vertex`)
    }
    if (vertex >= originalVertexCount) assert.equal(neighbors.size, 2, `new boundary vertex ${vertex} should split an existing boundary edge`)
  }

  const rawComponents = originalComponentSets(connectedComponents(rawBoundary.adjacency), originalVertexCount)
  const refinedComponents = originalComponentSets(connectedComponents(refinedBoundary.adjacency), originalVertexCount)
  assert.deepEqual(
    refinedComponents,
    rawComponents,
    `refined boundary components should preserve original vertex sets; raw=${JSON.stringify(raw)}, refined=${JSON.stringify(refined)}`,
  )
}

test('raw female skin is the behavior-red baseline for pregnancy containment', async () => {
  const atlas = await loadAtlas()
  const chunks = await loadRawChunks(atlas)
  const parts = partMap(atlas)
  const skin = parts.get(skinId)
  assert.ok(skin, 'female atlas should include the source skin mesh')

  const pregnancy = collectPregnancyVertices(atlas, chunks)
  const report = containmentReport(skin, positionsFor(skin, chunks), indicesFor(skin, chunks), pregnancy)
  assert.ok(
    report.outside > 0,
    `raw female skin unexpectedly encloses all pregnancy vertices; checked=${report.checked}`,
  )
  assert.ok(
    report.worst?.point?.[2] > report.worst?.front,
    `baseline miss should be at the abdominal front; worst=${JSON.stringify(report.worst)}`,
  )
})

test('pregnancy presentation visibility treats pregnancy-selected structures as skin context only on female atlas', async () => {
  const femaleAtlas = await loadAtlas()
  const maleAtlas = maleAtlasFrom(femaleAtlas)
  const { PREGNANCY_SKIN_ID, isPregnancyVisible, isPresentedPartVisible } = await importTsModule(join(source, 'app', 'pregnancy-presentation.ts'))
  assert.equal(PREGNANCY_SKIN_ID, skinId)

  const femaleParts = partMap(femaleAtlas)
  const femaleConcepts = conceptMap(femaleAtlas)
  const placenta = femaleConcepts.get(placentaId)
  assert.ok(placenta, 'female atlas should include the placenta concept')
  const skin = femaleParts.get(skinId)
  const placentaPart = femaleParts.get(placenta.elements[0])
  const unrelated = femaleAtlas.parts.find(part => part.system === 'skeletal' && !placenta.elements.includes(part.id))
  assert.ok(skin && placentaPart && unrelated, 'test fixture parts should exist')

  const pregnancyOff = state()
  assert.equal(isPregnancyVisible(femaleAtlas, pregnancyOff), false)
  assert.equal(isPresentedPartVisible(skin, pregnancyOff, false), false)
  assert.equal(isPresentedPartVisible(placentaPart, pregnancyOff, false), false)

  const systemSolo = state({ visible: ['pregnancy'] })
  assert.equal(isPregnancyVisible(femaleAtlas, systemSolo), true)
  assert.equal(isPresentedPartVisible(skin, systemSolo, true), true)
  assert.equal(isPresentedPartVisible(placentaPart, systemSolo, true), true)

  const searchSelectedLayerOff = state({ selected: placenta.elements })
  assert.equal(isPregnancyVisible(femaleAtlas, searchSelectedLayerOff), true)
  assert.equal(isPresentedPartVisible(skin, searchSelectedLayerOff, true), true)
  assert.equal(isPresentedPartVisible(placentaPart, searchSelectedLayerOff, true), true)

  const isolatePregnancy = state({ selected: placenta.elements, isolate: true })
  assert.equal(isPregnancyVisible(femaleAtlas, isolatePregnancy), true)
  assert.equal(isPresentedPartVisible(skin, isolatePregnancy, true), true)
  assert.equal(isPresentedPartVisible(placentaPart, isolatePregnancy, true), true)

  const isolateUnrelated = state({ visible: ['pregnancy'], selected: [unrelated.id], isolate: true })
  assert.equal(isPregnancyVisible(femaleAtlas, isolateUnrelated), false)
  assert.equal(isPresentedPartVisible(skin, isolateUnrelated, false), false)
  assert.equal(isPresentedPartVisible(placentaPart, isolateUnrelated, false), false)
  assert.equal(isPresentedPartVisible(unrelated, isolateUnrelated, false), true)

  assert.equal(isPregnancyVisible(maleAtlas, systemSolo), false)
})

test('pregnancy skin deformation encloses pregnancy structures without mutating the source body mesh', async () => {
  const femaleAtlas = await loadAtlas()
  const maleAtlas = maleAtlasFrom(femaleAtlas)
  const chunks = await loadRawChunks(femaleAtlas)
  const { createPregnancySkinPositions } = await importTsModule(join(source, 'app', 'pregnancy-presentation.ts'))
  const parts = partMap(femaleAtlas)
  const skin = parts.get(skinId)
  assert.ok(skin, 'female atlas should include the source skin mesh')

  const sourcePositions = clonePositions(skin, chunks)
  const originalSnapshot = new Float32Array(sourcePositions)
  const deformed = createPregnancySkinPositions(femaleAtlas, skin, sourcePositions)
  assert.notEqual(deformed, sourcePositions, 'female body skin should receive a separate deformed array')
  assert.deepEqual(sourcePositions, originalSnapshot, 'source positions passed to the helper should not be mutated')

  const nonSkin = pregnancyParts(femaleAtlas)[0]
  const nonSkinPositions = clonePositions(nonSkin, chunks)
  assert.equal(createPregnancySkinPositions(femaleAtlas, nonSkin, nonSkinPositions), nonSkinPositions)
  assert.equal(createPregnancySkinPositions(maleAtlas, skin, sourcePositions), sourcePositions)

  assertUnchangedWhere('head skin', originalSnapshot, deformed, point => point[1] > 1.28)
  assertUnchangedWhere('leg skin', originalSnapshot, deformed, point => point[1] < 0.7)
  assertUnchangedWhere('arm side skin', originalSnapshot, deformed, point => Math.abs(point[0]) > 0.22 && point[1] > 0.72 && point[1] < 1.28)
  assertUnchangedWhere('back skin', originalSnapshot, deformed, point => point[2] <= -0.12 && point[1] > 0.72 && point[1] < 1.28)

  assert.ok(
    deformed.some((value, index) => value !== originalSnapshot[index]),
    'female body skin deformation should change local abdominal vertices',
  )
})

test('pregnancy skin mesh encloses every pregnancy vertex and preserves source mesh topology', async () => {
  const femaleAtlas = await loadAtlas()
  const maleAtlas = maleAtlasFrom(femaleAtlas)
  const chunks = await loadRawChunks(femaleAtlas)
  const { createPregnancySkinMesh } = await importTsModule(join(source, 'app', 'pregnancy-presentation.ts'))
  const parts = partMap(femaleAtlas)
  const skin = parts.get(skinId)
  assert.ok(skin, 'female atlas should include the source skin mesh')

  const sourcePositions = clonePositions(skin, chunks)
  const sourceIndices = new Uint32Array(indicesFor(skin, chunks))
  const positionSnapshot = new Float32Array(sourcePositions)
  const indexSnapshot = new Uint32Array(sourceIndices)
  const mesh = createPregnancySkinMesh(femaleAtlas, skin, sourcePositions, sourceIndices)
  assert.notEqual(mesh.positions, sourcePositions, 'female body skin mesh should receive separate positions')
  assert.notEqual(mesh.indices, sourceIndices, 'female body skin mesh should receive separate indices')
  assert.deepEqual(sourcePositions, positionSnapshot, 'source positions passed to mesh helper should not be mutated')
  assert.deepEqual(sourceIndices, indexSnapshot, 'source indices passed to mesh helper should not be mutated')

  const nonSkin = pregnancyParts(femaleAtlas)[0]
  const nonSkinPositions = clonePositions(nonSkin, chunks)
  const nonSkinIndices = new Uint32Array(indicesFor(nonSkin, chunks))
  const nonSkinMesh = createPregnancySkinMesh(femaleAtlas, nonSkin, nonSkinPositions, nonSkinIndices)
  assert.equal(nonSkinMesh.positions, nonSkinPositions)
  assert.equal(nonSkinMesh.indices, nonSkinIndices)

  const maleMesh = createPregnancySkinMesh(maleAtlas, skin, sourcePositions, sourceIndices)
  assert.equal(maleMesh.positions, sourcePositions)
  assert.equal(maleMesh.indices, sourceIndices)

  assertValidMesh('pregnancy skin mesh', mesh.positions, mesh.indices)
  assert.ok(mesh.positions.length >= positionSnapshot.length, 'refined mesh should keep source vertices')
  assert.ok(mesh.indices.length >= indexSnapshot.length, 'refined mesh should keep source triangles')
  const repeated = createPregnancySkinMesh(femaleAtlas, skin, positionSnapshot, indexSnapshot)
  for (let i = 0; i < positionSnapshot.length; i += 1) {
    assert.equal(mesh.positions[i], repeated.positions[i], `source vertex ${Math.floor(i / 3)} should be deterministic`)
  }
  assertUnchangedWhere('mesh head skin', positionSnapshot, mesh.positions, point => point[1] > 1.28)
  assertUnchangedWhere('mesh leg skin', positionSnapshot, mesh.positions, point => point[1] < 0.7)
  assertUnchangedWhere('mesh arm side skin', positionSnapshot, mesh.positions, point => Math.abs(point[0]) > 0.22 && point[1] > 0.72 && point[1] < 1.28)
  assertUnchangedWhere('mesh back skin', positionSnapshot, mesh.positions, point => point[2] <= -0.12 && point[1] > 0.72 && point[1] < 1.28)

  const pregnancy = collectPregnancyVertices(femaleAtlas, chunks)
  assert.equal(pregnancy.length, 20832)
  const report = containmentReport(skin, mesh.positions, mesh.indices, pregnancy)
  assertContainment(report)
  assertIncidencePreserved(indexSnapshot, mesh.indices, positionSnapshot.length / 3)
})
