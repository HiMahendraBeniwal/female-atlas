import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const modelsDir = path.join(root, 'public', 'models');
const femaleDir = path.join(root, 'temp_female', 'public', 'models');
const maleDir = path.join(root, 'temp_source', 'public', 'models');

const femaleAtlas = JSON.parse(fs.readFileSync(path.join(femaleDir, 'atlas-female.json'), 'utf8'));
const maleAtlas = JSON.parse(fs.readFileSync(path.join(maleDir, 'atlas.json'), 'utf8'));

console.log(`Loaded female atlas: ${femaleAtlas.parts.length} parts`);
console.log(`Loaded male atlas: ${maleAtlas.parts.length} parts`);

const femaleChunks = femaleAtlas.chunks.map(c => fs.readFileSync(path.join(femaleDir, path.basename(c.url))));
const maleChunks = maleAtlas.chunks.map(c => fs.readFileSync(path.join(maleDir, path.basename(c.url))));

// Scale factors to map male BodyParts3D dataset into female proportions
const scaleX = 0.95;
const scaleY = 0.96335;
const scaleZ = 0.95;
const offsetZ = -0.052;

// Male exclusion regex: zero male reproductive structures
const maleRegex = /prostate|testis|penis|scrotum|epididymis|spermatic|seminal vesicle|ductus deferens|foreskin|glans/i;

const geometriesToPack = [];
const finalParts = [];

// 1. ADD FEMALE SPECIFIC ORGANS & STRUCTURES
// All female reproductive (uterus, ovary, vagina, cervix, breasts, nipples),
// pregnancy (placenta), and female visceral organs
console.log('Extracting female visceral and reproductive organs...');
const addedFemaleIds = new Set();
const addedFemaleNames = new Set();

for (const p of femaleAtlas.parts) {
  // Reclassify all 16 mammary/breast structures from integumentary to reproductive
  let system = p.system;
  if (p.system === 'integumentary' && p.id !== 'VH_F_skin') {
    system = 'reproductive';
  }


  // Skip the old VH_F_skin which had splayed limbs (we replace it with the perfectly aligned, feminized skin)
  if (p.id === 'VH_F_skin') continue;

  // Skip the isolated knee scan fragments from VH_F that clashed with the full skeleton
  if (p.system === 'skeletal' && /femur|tibia|fibula|patella|condyle|perichondular|enthesis|trochlear/i.test(p.name)) {
    continue;
  }

  // Skip the 2 rectus femoris muscle fragments from VH_F that clashed with full musculature
  if (p.system === 'muscular' && /rectus femoris/i.test(p.name)) {
    continue;
  }

  const b = femaleChunks[p.chunk];
  const pos = new Float32Array(b.buffer, b.byteOffset + p.positions, p.vertexCount * 3);
  const norm = new Int16Array(b.buffer, b.byteOffset + p.normals, p.vertexCount * 3);
  const ind = new Uint32Array(b.buffer, b.byteOffset + p.indices, p.indexCount);

  geometriesToPack.push({
    part: { ...p, system },
    positions: new Float32Array(pos),
    normals: new Int16Array(norm),
    indices: new Uint32Array(ind),
    triangleCount: p.indexCount / 3
  });
  addedFemaleIds.add(p.id);
  addedFemaleNames.add(p.name.toLowerCase().trim());
}
console.log(`Extracted ${geometriesToPack.length} pristine female organs and structures.`);

// 2. ADD BODYPARTS3D SKELETAL, MUSCULAR, VASCULAR, AND SKIN MESHES
console.log('Extracting and scaling BodyParts3D complementary systems...');
let maleAddedCount = 0;

for (const p of maleAtlas.parts) {
  // Absolutely no male reproductive or penile structures
  if (p.system === 'reproductive' || maleRegex.test(p.name)) continue;

  // If already present in female organs (e.g. brain, liver, kidneys, stomach, heart, lungs), female takes precedence
  if (p.system === 'digestive' || p.system === 'urinary' || p.system === 'cardiac' || p.system === 'respiratory' || p.system === 'sensory' || p.system === 'nervous') {
    if (addedFemaleNames.has(p.name.toLowerCase().trim())) continue;
  }

  // Avoid duplicate pubic hair
  if (p.name.toLowerCase().includes('pubic hair')) continue;

  const b = maleChunks[p.chunk];
  const posBuf = b.subarray(p.positions, p.positions + p.vertexCount * 3 * 4);
  const normBuf = b.subarray(p.normals, p.normals + p.vertexCount * 3 * 2);
  const indBuf = b.subarray(p.indices, p.indices + p.indexCount * 4);

  const posSrc = new Float32Array(posBuf.buffer.slice(posBuf.byteOffset, posBuf.byteOffset + posBuf.byteLength));
  const normSrc = new Int16Array(normBuf.buffer.slice(normBuf.byteOffset, normBuf.byteOffset + normBuf.byteLength));
  const indSrc = new Uint32Array(indBuf.buffer.slice(indBuf.byteOffset, indBuf.byteOffset + indBuf.byteLength));

  const pos = new Float32Array(posSrc.length);

  const isSkin = (p.id === 'FJ2810' || p.name.toLowerCase() === 'skin');
  const isArm = /humerus|radius|ulna|biceps|triceps|brachii|brachialis|deltoid|forearm|carpi|digitorum|pollicis|hand|finger/i.test(p.name);

  function applyFullFemaleMorphology(x, y, z) {
    // 1. Slender feminine neck
    if (y >= 1.38 && y <= 1.50) {
      x *= 0.88;
      z *= 0.90;
    }

    // 2. Narrow feminine shoulders & upper torso (biacromial diameter reduction)
    if (y >= 1.25 && y <= 1.42) {
      const sFactor = 0.82 + 0.18 * Math.min(1.0, Math.abs((y - 1.33) / 0.14)**2);
      x *= Math.max(0.82, Math.min(1.0, sFactor));
    }

    // 3. Narrow, delicate rib cage (conical feminine thorax)
    if (y >= 1.10 && y <= 1.28 && Math.abs(x) <= 0.16) {
      x *= 0.88;
      z *= 0.92;
    }

    // 4. Feminine hourglass waist indentation (centered at y = 1.04m, above navel)
    const yw = 1.04, sigmaW = 0.062;
    const wIndent = 0.19 * Math.exp(-((y - yw)**2) / (2 * sigmaW**2));

    // 5. Feminine hip & pelvic flare (centered at y = 0.85m, across iliac crest & greater trochanters)
    const yh = 0.85, sigmaH = 0.072;
    const hFlare = 0.15 * Math.exp(-((y - yh)**2) / (2 * sigmaH**2));

    const torsoFactor = 1.0 - wIndent + hFlare;

    if (Math.abs(x) <= 0.17) {
      x *= torsoFactor;
      // Gentle feminine lower back arch (lordosis)
      if (y >= 0.94 && y <= 1.12 && z < -0.03) {
        z *= (1.0 - wIndent * 0.5);
      }
      // Feminine rounded glutes (posterior projection at hips)
      if (y >= 0.74 && y <= 0.92 && z < -0.02) {
        z *= (1.0 + hFlare * 0.45);
      }
    } else if (y >= 0.60 && y <= 1.32) {
      // Arms: brought inward to follow the narrower shoulders and cinched waist naturally
      const armShift = 0.028 * Math.exp(-((y - 1.05)**2) / (2 * 0.16**2)) + 0.015 * Math.exp(-((y - 1.30)**2) / (2 * 0.10**2));
      x -= Math.sign(x) * armShift;
    }

    // 6. Slenderize muscular bulk of arms so they are feminine, not bodybuilder
    if (isArm && Math.abs(x) > 0.14 && y >= 0.65 && y <= 1.35) {
      const armCenterX = Math.sign(x) * 0.22;
      const armCenterZ = -0.05;
      x = armCenterX + (x - armCenterX) * 0.88;
      z = armCenterZ + (z - armCenterZ) * 0.88;
    }

    return [x, y, z];
  }

  for (let i = 0; i < posSrc.length; i += 3) {
    let x = posSrc[i] * scaleX;
    let y = posSrc[i + 1] * scaleY;
    let z = posSrc[i + 2] * scaleZ + offsetZ;

    // Apply synchronized female morphological transformation
    [x, y, z] = applyFullFemaleMorphology(x, y, z);

    // FEMINIZATION OF THE BODY SURFACE SKIN
    if (isSkin) {
      // 1. Natural, full female breasts matching the mammary glands & nipples
      // Left breast center: (0.082, 1.19), Right breast center: (-0.082, 1.19)
      if (y >= 1.08 && y <= 1.33 && z > 0.005) {
        const dL = Math.hypot(x - 0.082, y - 1.19);
        const dR = Math.hypot(x + 0.082, y - 1.19);
        const sigma = 0.056;
        const breastLift = 0.052 * (Math.exp(-(dL * dL) / (2 * sigma * sigma)) + Math.exp(-(dR * dR) / (2 * sigma * sigma)));
        z += breastLift;
      }

      // 2. Smooth feminine pubic/pelvic contour (remove any male protrusion)
      if (y >= 0.74 && y <= 0.86 && Math.abs(x) <= 0.065 && z > 0.005) {
        const groinDist = Math.hypot(x, y - 0.79);
        if (groinDist < 0.06) {
          const factor = (0.06 - groinDist) / 0.06;
          z -= 0.025 * factor;
        }
      }
    }

    pos[i] = x;
    pos[i + 1] = y;
    pos[i + 2] = z;
  }



  // Recalculate bounds
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    if (pos[i] < minX) minX = pos[i];
    if (pos[i] > maxX) maxX = pos[i];
    if (pos[i+1] < minY) minY = pos[i+1];
    if (pos[i+1] > maxY) maxY = pos[i+1];
    if (pos[i+2] < minZ) minZ = pos[i+2];
    if (pos[i+2] > maxZ) maxZ = pos[i+2];
  }

  geometriesToPack.push({
    part: {
      ...p,
      id: `BP3D_${p.id}`,
      bounds: [[minX, minY, minZ], [maxX, maxY, maxZ]]
    },
    positions: pos,
    normals: normSrc,
    indices: indSrc,
    triangleCount: indSrc.length / 3
  });
  maleAddedCount++;
}
console.log(`Added ${maleAddedCount} complementary musculoskeletal, vascular, and surface parts.`);
console.log(`Total assembled pieces: ${geometriesToPack.length}`);

// PACK INTO 20 GZIPPED CHUNKS WITH STRICT 4-BYTE ALIGNMENT
const CHUNK_SIZE_LIMIT = 4_200_000;
const chunks = [];
let segments = [];
let bytes = 0;
let totalTriangles = 0;

const flush = () => {
  if (!segments.length) return;
  const chunkBuffer = Buffer.concat(segments);
  const chunkIdx = chunks.length;
  const url = `/models/female-${chunkIdx}.bin`;
  fs.writeFileSync(path.join(modelsDir, `female-${chunkIdx}.bin`), chunkBuffer);
  chunks.push({ url, bytes: chunkBuffer.length });
  console.log(`Wrote female-${chunkIdx}.bin (${(chunkBuffer.length / 1024 / 1024).toFixed(2)} MB)`);
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

for (let i = 0; i < geometriesToPack.length; i++) {
  const g = geometriesToPack[i];
  if (bytes > CHUNK_SIZE_LIMIT) flush();

  const p = { ...g.part };
  p.chunk = chunks.length;
  p.positions = append(g.positions);
  p.normals = append(g.normals);
  p.indices = append(g.indices);
  totalTriangles += g.triangleCount;
  finalParts.push(p);
}
flush();
console.log(`Packed ${finalParts.length} parts across ${chunks.length} chunks containing ${totalTriangles.toLocaleString()} triangles.`);

// BUILD MERGED CONCEPTS
console.log('Building search concepts...');
const preservedPartIds = new Set(finalParts.map(p => p.id));
const finalConcepts = [];
const existingConceptNames = new Set();

for (const c of femaleAtlas.concepts) {
  const activeElements = c.elements.filter(id => preservedPartIds.has(id));
  if (activeElements.length > 0) {
    finalConcepts.push({
      ...c,
      elements: activeElements
    });
    existingConceptNames.add(c.name.toLowerCase().trim());
  }
}

for (const p of finalParts) {
  if (!existingConceptNames.has(p.name.toLowerCase().trim())) {
    finalConcepts.push({
      id: p.conceptId || `BP3D:${p.id}`,
      name: p.name,
      elements: [p.id]
    });
    existingConceptNames.add(p.name.toLowerCase().trim());
  }
}


// Add compound concepts
const compoundConcepts = [
  { name: 'Skull (Cranium & Facial Bones)', match: /frontal bone|parietal bone|occipital bone|temporal bone|sphenoid|ethmoid|maxilla|mandible|zygomatic/i },
  { name: 'Rib Cage (Thoracic Cage)', match: /rib|sternum|costal cartilage|xiphoid/i },
  { name: 'Spine (Verbral Column)', match: /vertebra/i },
  { name: 'Biceps (Biceps Brachii)', match: /biceps brachii/i },
  { name: 'Triceps (Triceps Brachii)', match: /triceps brachii/i },
  { name: 'Quadriceps Femoris', match: /rectus femoris|vastus lateralis|vastus medialis|vastus intermedius/i },
  { name: 'Hamstrings', match: /biceps femoris|semitendinosus|semimembranosus/i },
  { name: 'Calf Muscles (Triceps Surae)', match: /gastrocnemius|soleus/i },
  { name: 'Gluteal Muscles', match: /gluteus maximus|gluteus medius|gluteus minimus/i },
  { name: 'Female Reproductive System', match: /uterus|ovary|vagina|fallopian|cervix|mammary|nipple/i },
  { name: 'Breast (Mammary Gland)', match: /mammary|lactiferous|nipple/i }
];

for (const compound of compoundConcepts) {
  const matchingParts = finalParts.filter(p => compound.match.test(p.name));
  if (matchingParts.length > 0) {
    const existing = finalConcepts.find(c => c.name.toLowerCase() === compound.name.toLowerCase());
    if (existing) {
      existing.elements = matchingParts.map(p => p.id);
    } else {
      finalConcepts.unshift({
        id: `HRA:compound_${compound.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
        name: compound.name,
        elements: matchingParts.map(p => p.id)
      });
    }
  }
}

const atlas = {
  version: 'Female Atlas v2.0 (Complete Musculoskeletal & Visceral Integration)',
  sex: 'female',
  source: 'Human Reference Atlas (HuBMAP) & BodyParts3D (DBCLS)',
  scope: 'Complete female anatomical reference with full musculoskeletal, vascular, endocrine, and feminized surface coverage',
  parts: finalParts,
  concepts: finalConcepts,
  chunks: chunks,
  triangles: totalTriangles
};

fs.writeFileSync(path.join(modelsDir, 'atlas.json'), JSON.stringify(atlas, null, 2), 'utf8');
console.log(`Saved atlas.json with ${finalParts.length} parts, ${totalTriangles.toLocaleString()} triangles, ${finalConcepts.length} concepts.`);
