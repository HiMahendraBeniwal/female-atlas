# Anatomy data attribution

**Female Atlas** integrates reference anatomical datasets with custom morphological adaptations by **Mahendra Beniwal** ([@MdrBwl on X](https://x.com/MdrBwl)):

### 1. Human Reference Atlas (HuBMAP)
Kristen Browne and Heidi Schlehlein, Human Reference Atlas / HuBMAP, *3D Reference Organ Set for Female v1.5* (2023). Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

- Source DOI: https://doi.org/10.48539/HBM352.BTSQ.586
- Dataset: https://lod.humanatlas.io/ref-organ/united-female/v1.5
- Original GLB: https://cdn.humanatlas.io/digital-objects/ref-organ/united-female/v1.5/assets/3d-vh-f-united.glb
- License: https://creativecommons.org/licenses/by/4.0/

Provides 100% of the female visceral organs, the complete female reproductive system (uterus, ovaries, fallopian tubes, cervix, vagina), mammary glands / solid breast structures, and pregnancy reference (placenta and umbilical cord).

### 2. BodyParts3D
BodyParts3D, © The Database Center for Life Science (DBCLS) licensed under [CC Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).

- Dataset: https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html

Provides the full skeletal framework (cranium, ribs, clavicles, arms, hands, pelvis, legs, feet), full musculature (all 416 muscle parts), and peripheral vasculature.

### 3. Anatomical Integration & Adaptations
Adaptations by Mahendra Beniwal:
- Coincident vertices welded and surface normals averaged.
- Geometry simplified with a 0.2% per-structure relative error bound using meshoptimizer and normals quantized to signed 16-bit for compact GPU delivery.
- Authentic female morphological proportions applied across all layers: slender shoulders, delicate conical rib cage, hourglass waist indentation, flared female pelvic hips and glutes, and full natural female breast contours.
- All 3,004 individual meshes and 2,557 named concepts curated and indexed for real-time 3D exploration.

The viewer can generate a temporary, locally refined abdominal skin surface around
visible pregnancy reference structures. This illustrative runtime adaptation does
not change the source binary assets, encode a gestational age, or simulate changes
to internal organs. Hiding pregnancy restores the original surface.
