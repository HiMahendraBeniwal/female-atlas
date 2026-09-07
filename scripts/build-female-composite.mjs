import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const modelsDir = path.join(root, 'public', 'models');
const maleDir = path.join(root, 'temp_male', 'public', 'models');

const femaleAtlas = JSON.parse(fs.readFileSync(path.join(modelsDir, 'atlas.json'), 'utf8'));
const maleAtlas = JSON.parse(fs.readFileSync(path.join(maleDir, 'atlas.json'), 'utf8'));

console.log('Loading female chunks...');
const femaleChunks = femaleAtlas.chunks.map(c => fs.readFileSync(path.join(modelsDir, path.basename(c.url))));

console.log('Loading male chunks...');
const maleChunks = maleAtlas.chunks.map(c => fs.readFileSync(path.join(maleDir, path.basename(c.url))));

const femalePartNames = new Set(femaleAtlas.parts.map(p => p.name.toLowerCase().trim()));

function shouldAddMalePart(p) {
  // Absolutely no male reproductive or skin parts
  if (p.system === 'reproductive' || p.system === 'integumentary') return false;
  // Female visceral organs take precedence
  if (p.system === 'digestive' || p.system === 'respiratory' || p.system === 'urinary' || p.system === 'cardiac' || p.system === 'sensory' || p.system === 'nervous') return false;
  
  // Muscular system: exclude the eye muscles and rectus femoris which female model already has
  if (p.system === 'muscular') {
    if (/rectus|oblique/i.test(p.name) && /medial|lateral|superior|inferior/i.test(p.name)) return false;
    if (femalePartNames.has(p.name.toLowerCase().trim())) return false;
    return true;
  }

  // Skeletal system: exclude spine/vertebrae/sacrum and knee bones already in female
  if (p.system === 'skeletal') {
    if (/vertebra|sacrum|coccyx/i.test(p.name)) return false;
    if (femalePartNames.has(p.name.toLowerCase().trim())) return false;
    return true;
  }

  // Endocrine, connective, arterial, venous, lymphatic
  if (femalePartNames.has(p.name.toLowerCase().trim())) return false;
  return true;
}

const scaleX = 0.95;
const scaleY = 0.96335;
const scaleZ = 0.95;
const offsetZ = -0.052;

const finalParts = [];
const geometriesToPack = [];

console.log('Extracting 100% of existing female parts...');
for (const p of femaleAtlas.parts) {
  const b = femaleChunks[p.chunk];
  const pos = new Float32Array(b.buffer, b.byteOffset + p.positions, p.vertexCount * 3);
  const norm = new Int16Array(b.buffer, b.byteOffset + p.normals, p.vertexCount * 3);
  const ind = new Uint32Array(b.buffer, b.byteOffset + p.indices, p.indexCount);

  finalParts.push({
    id: p.id,
    name: p.name,
    conceptId: p.conceptId,
    system: p.system,
    vertexCount: p.vertexCount,
    indexCount: p.indexCount,
    bounds: p.bounds,
  });

  geometriesToPack.push({ pos, norm, ind });
}
console.log(`Preserved ${finalParts.length} existing female parts.`);

console.log('Extracting and scaling complementary male anatomy...');
let addedCount = 0;
const addedBySystem = {};

for (const p of maleAtlas.parts) {
  if (!shouldAddMalePart(p)) continue;

  const b = maleChunks[p.chunk];
  const srcPos = new Float32Array(b.buffer, b.byteOffset + p.positions, p.vertexCount * 3);
  const norm = new Int16Array(b.buffer, b.byteOffset + p.normals, p.vertexCount * 3);
  const ind = new Uint32Array(b.buffer, b.byteOffset + p.indices, p.indexCount);

  const pos = new Float32Array(srcPos.length);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];

  for (let i = 0; i < srcPos.length; i += 3) {
    const x = srcPos[i] * scaleX;
    const y = srcPos[i + 1] * scaleY;
    const z = srcPos[i + 2] * scaleZ + offsetZ;
    pos[i] = x;
    pos[i + 1] = y;
    pos[i + 2] = z;

    if (x < min[0]) min[0] = x;
    if (x > max[0]) max[0] = x;
    if (y < min[1]) min[1] = y;
    if (y > max[1]) max[1] = y;
    if (z < min[2]) min[2] = z;
    if (z > max[2]) max[2] = z;
  }

  const newPart = {
    id: 'BP3D_' + p.id,
    name: p.name,
    conceptId: p.conceptId || ('FMA:' + p.id),
    system: p.system,
    vertexCount: p.vertexCount,
    indexCount: p.indexCount,
    bounds: [min, max],
  };

  finalParts.push(newPart);
  geometriesToPack.push({ pos, norm, ind });
  addedCount++;
  addedBySystem[p.system] = (addedBySystem[p.system] || 0) + 1;
}

console.log('Added complementary parts:', addedBySystem);
console.log(`Total parts in composite: ${finalParts.length}`);

// Packing into binary chunks
console.log('Packing geometry into progressive binary chunks...');
const CHUNK_SIZE_LIMIT = 4_000_000;
const chunks = [];
let segments = [];
let bytes = 0;
let totalTriangles = 0;

const flush = () => {
  if (!bytes) return;
  const chunkIndex = chunks.length;
  const url = `/models/female-${chunkIndex}.bin`;
  const filename = path.join(modelsDir, `female-${chunkIndex}.bin`);
  fs.writeFileSync(filename, Buffer.concat(segments));
  chunks.push({ url, bytes });
  segments = [];
  bytes = 0;
};

const append = (typedArray) => {
  const padding = (4 - (bytes % 4)) % 4;
  if (padding) {
    segments.push(Buffer.alloc(padding));
    bytes += padding;
  }
  const offset = bytes;
  const buf = Buffer.from(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);
  segments.push(buf);
  bytes += buf.length;
  return offset;
};

for (let i = 0; i < finalParts.length; i++) {
  const p = finalParts[i];
  const { pos, norm, ind } = geometriesToPack[i];

  if (bytes > CHUNK_SIZE_LIMIT) flush();

  p.chunk = chunks.length;
  p.positions = append(pos);
  p.normals = append(norm);
  p.indices = append(ind);
  totalTriangles += p.indexCount / 3;
}
flush();
console.log(`Created ${chunks.length} binary chunks containing ${totalTriangles.toLocaleString()} triangles.`);

// Merge concepts
console.log('Merging concepts...');
const finalConcepts = [...femaleAtlas.concepts];
const existingConceptNames = new Set(femaleAtlas.concepts.map(c => c.name.toLowerCase().trim()));

for (let i = femaleAtlas.parts.length; i < finalParts.length; i++) {
  const p = finalParts[i];
  if (!existingConceptNames.has(p.name.toLowerCase().trim())) {
    finalConcepts.push({
      id: p.conceptId,
      name: p.name,
      elements: [p.id],
    });
    existingConceptNames.add(p.name.toLowerCase().trim());
  }
}

// Add compound group concepts
const skullParts = finalParts.filter(p => p.system === 'skeletal' && /frontal|parietal|temporal|occipital|sphenoid|ethmoid|mandible|maxilla|zygomatic|nasal|lacrimal|palatine|vomer/i.test(p.name)).map(p => p.id);
if (skullParts.length) {
  finalConcepts.unshift({ id: 'COMPOSITE:skull', name: 'Skull (Cranium & Facial Bones)', elements: skullParts });
}

const ribParts = finalParts.filter(p => p.system === 'skeletal' && /rib|costal/i.test(p.name)).map(p => p.id);
if (ribParts.length) {
  finalConcepts.unshift({ id: 'COMPOSITE:rib_cage', name: 'Rib Cage & Costal Cartilages', elements: ribParts });
}

const armMuscles = finalParts.filter(p => p.system === 'muscular' && /biceps|triceps|deltoid|brachialis|brachioradialis|pronator|supinator/i.test(p.name)).map(p => p.id);
if (armMuscles.length) {
  finalConcepts.unshift({ id: 'COMPOSITE:arm_muscles', name: 'Arm & Shoulder Muscles', elements: armMuscles });
}

const legMuscles = finalParts.filter(p => p.system === 'muscular' && /gluteus|gastrocnemius|soleus|tibialis|peroneus|fibularis|biceps femoris|semitendinosus|semimembranosus/i.test(p.name)).map(p => p.id);
if (legMuscles.length) {
  finalConcepts.unshift({ id: 'COMPOSITE:leg_muscles', name: 'Hip & Leg Muscles', elements: legMuscles });
}

const abdominalMuscles = finalParts.filter(p => p.system === 'muscular' && /abdominis|abdominal|oblique/i.test(p.name)).map(p => p.id);
if (abdominalMuscles.length) {
  finalConcepts.unshift({ id: 'COMPOSITE:abdominals', name: 'Abdominal Wall Muscles', elements: abdominalMuscles });
}

const compositeManifest = {
  version: 'Female Atlas v2.0 (HRA Female + BodyParts3D Musculoskeletal)',
  sex: 'female',
  source: 'Human Reference Atlas (HuBMAP) & BodyParts3D (CC BY 4.0)',
  scope: 'Complete female anatomy: 100% preserved female reproductive & visceral organs with complete skeleton, musculature, endocrine glands, and peripheral vasculature.',
  parts: finalParts,
  concepts: finalConcepts,
  chunks: chunks,
  triangles: totalTriangles,
};

fs.writeFileSync(path.join(modelsDir, 'atlas.json'), JSON.stringify(compositeManifest));
console.log('Composite atlas.json written successfully.');
console.log(`Summary: ${finalParts.length} parts, ${finalConcepts.length} concepts, ${chunks.length} chunks.`);
