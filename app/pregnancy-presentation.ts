import type {Atlas, Part, SceneState} from './anatomy';

export const PREGNANCY_SKIN_ID = 'BP3D_FJ2810';

/** Follow the parts that are actually displayed, including search and isolation. */
export function isPregnancyVisible(atlas: Atlas, state: SceneState): boolean {
  return atlas.sex === 'female' && atlas.parts.some(part =>
    part.system === 'pregnancy' && (state.isolate
      ? state.selected.includes(part.id)
      : state.visible.includes('pregnancy') || state.selected.includes(part.id)));
}

export function isPresentedPartVisible(part: Part, state: SceneState, pregnant: boolean): boolean {
  if (pregnant && part.id === PREGNANCY_SKIN_ID) return true;
  return state.isolate ? state.selected.includes(part.id)
    : state.visible.includes(part.system) || state.selected.includes(part.id);
}

function smoothstep(low: number, high: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}

/**
 * A display-only abdominal shape for the pinned Female Atlas (metres, +Z front).
 * Its placenta/cord occupy y=.874..1.105, z=.099.. .233, outside neutral skin.
 * Compact smooth weights leave the limbs, chest and back unchanged. The raw
 * source buffer is never modified, so hiding pregnancy restores it exactly.
 * This envelope is illustrative and does not encode a clinical gestational age.
 */
export function createPregnancySkinPositions(atlas: Atlas, part: Part, positions: Float32Array): Float32Array {
  if (atlas.sex !== 'female' || part.id !== PREGNANCY_SKIN_ID) return positions;
  const result = positions.slice();
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i + 1], z = positions[i + 2];
    const horizontal = x / .18;
    const vertical = (y - .985) / .25;
    if (Math.abs(horizontal) >= 1 || Math.abs(vertical) >= 1 || z <= -.12) continue;
    const sideWeight = Math.cos(horizontal * Math.PI / 2) ** 2;
    const heightWeight = Math.cos(vertical * Math.PI / 2) ** 2;
    const frontWeight = smoothstep(-.12, -.015, z);
    const weight = sideWeight * heightWeight * frontWeight;
    const widenedX = x + x * 1.3 * weight;
    const radiusSquared = (widenedX / .22) ** 2 + ((y - .985) / .255) ** 2;
    // A rounded envelope gives a broad belly instead of a stretched cone.
    // Fade into the source surface at the flanks, posterior and upper/lower rim.
    const envelope = -.08 + .41 * Math.sqrt(Math.max(0, 1 - radiusSquared));
    result[i] = widenedX;
    result[i + 2] = z + Math.max(0, envelope - z) * frontWeight * smoothstep(0, .04, sideWeight);
  }
  return result;
}

/** Refine only stretched abdominal edges, sharing midpoints to avoid cracks. */
export function createPregnancySkinMesh(atlas: Atlas, part: Part, positions: Float32Array, indices: Uint32Array): {positions: Float32Array; indices: Uint32Array} {
  if (atlas.sex !== 'female' || part.id !== PREGNANCY_SKIN_ID) return {positions, indices};
  const source = Array.from(positions);
  let triangles = Array.from(indices);
  const key = (a: number, b: number) => a < b ? `${a}:${b}` : `${b}:${a}`;
  for (let pass = 0; pass < 6; pass++) {
    const deformed = createPregnancySkinPositions(atlas, part, new Float32Array(source));
    const mids = new Map<string, number>();
    const mark = (a: number, b: number) => {
      const edge = key(a, b);
      if (mids.has(edge)) return;
      const ai = a * 3, bi = b * 3;
      if (Math.min(source[ai], source[bi]) > .18 || Math.max(source[ai], source[bi]) < -.18
        || Math.min(source[ai + 1], source[bi + 1]) > 1.235 || Math.max(source[ai + 1], source[bi + 1]) < .735
        || Math.max(source[ai + 2], source[bi + 2]) <= -.12) return;
      const length = Math.hypot(deformed[ai] - deformed[bi], deformed[ai + 1] - deformed[bi + 1], deformed[ai + 2] - deformed[bi + 2]);
      if (length <= .018) return;
      mids.set(edge, source.length / 3);
      for (let axis = 0; axis < 3; axis++) source.push((source[ai + axis] + source[bi + axis]) / 2);
    };
    for (let i = 0; i < triangles.length; i += 3) {
      const [a, b, c] = triangles.slice(i, i + 3);
      mark(a, b); mark(b, c); mark(c, a);
    }
    if (!mids.size) break;
    const refined: number[] = [];
    for (let i = 0; i < triangles.length; i += 3) {
      const [a, b, c] = triangles.slice(i, i + 3);
      const ab = mids.get(key(a, b)), bc = mids.get(key(b, c)), ca = mids.get(key(c, a));
      if (ab !== undefined && bc !== undefined && ca !== undefined) refined.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
      else if (ab !== undefined && bc !== undefined) refined.push(ab, b, bc, a, ab, c, ab, bc, c);
      else if (bc !== undefined && ca !== undefined) refined.push(bc, c, ca, b, bc, a, bc, ca, a);
      else if (ca !== undefined && ab !== undefined) refined.push(ca, a, ab, c, ca, b, ca, ab, b);
      else if (ab !== undefined) refined.push(a, ab, c, ab, b, c);
      else if (bc !== undefined) refined.push(b, bc, a, bc, c, a);
      else if (ca !== undefined) refined.push(c, ca, b, ca, a, b);
      else refined.push(a, b, c);
    }
    triangles = refined;
  }
  return {positions: createPregnancySkinPositions(atlas, part, new Float32Array(source)), indices: new Uint32Array(triangles)};
}
