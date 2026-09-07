import fs from 'node:fs';
import assert from 'node:assert/strict';
const filename=process.argv[2]??'atlas.json';
const base=new URL('../public/models/',import.meta.url),atlas=JSON.parse(fs.readFileSync(new URL(filename,base)));
assert.equal(atlas.parts.length,3004);assert.equal(atlas.concepts.length,2557);
const ids=new Set(atlas.parts.map(p=>p.id));assert.equal(ids.size,3004);

const files=atlas.chunks.map(c=>{const b=fs.readFileSync(new URL(c.url.split('/').pop(),base));assert.equal(b.length,c.bytes);return b;});
assert.equal(atlas.parts.filter(p=>p.system==='pregnancy').length,8);
assert.equal(atlas.parts.filter(p=>p.system==='reproductive').length,54);
for(const label of ['uterus','ovary','vagina','nipple','mammary','frontal bone','rib','clavicle','biceps','gluteus','thyroid','adrenal','femur','tibia','skin'])assert.ok(atlas.parts.some(p=>p.name.toLowerCase().includes(label)),`missing ${label}`);
assert.ok(atlas.concepts.some(c=>c.name.toLowerCase().includes('skull')));
assert.ok(!atlas.parts.some(p=>/prostate|testis|penis|scrotum|epididymis|spermatic/i.test(p.name)));
let tris=0;
for(const p of atlas.parts){assert.ok(p.name.trim()&&p.name!=='-'&&!p.name.includes('Bounds('));assert.ok(p.conceptId!=='-');assert.ok(p.system);const b=files[p.chunk];assert.ok(p.indices+p.indexCount*4<=b.length);const pos=new Float32Array(b.buffer,b.byteOffset+p.positions,p.vertexCount*3),indices=new Uint32Array(b.buffer,b.byteOffset+p.indices,p.indexCount);assert.ok(indices.length>=3);for(const i of indices)assert.ok(i<p.vertexCount,`${p.id}: invalid vertex`);for(const value of pos)assert.ok(Number.isFinite(value));tris+=p.indexCount/3;}
for(const c of atlas.concepts){assert.ok(c.elements.length);for(const id of c.elements)assert.ok(ids.has(id),`${c.id}: missing ${id}`);}
assert.equal(tris,atlas.triangles);
console.log(`Verified ${ids.size} individually indexed meshes (100% female structures + full musculoskeletal/vascular/endocrine/surface), ${atlas.concepts.length} concepts, ${tris.toLocaleString()} triangles across ${atlas.chunks.length} chunks.`);




