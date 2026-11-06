import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from '../public/vendor/three.module.js';
import { GLTFExporter } from './GLTFExporter.js';

globalThis.FileReader ??= class FileReader {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then(result => {
    this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(result).toString('base64')}`;
    this.onloadend?.();
  }); }
};

const here = path.dirname(fileURLToPath(import.meta.url));
const output = path.resolve(here, '../public/assets/characters/hachi.glb');
const scene = new THREE.Scene(); scene.name = 'GrainCharacterLibrary';

const mat = (name, color, options = {}) => {
  const value = new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0, ...options });
  value.name = name; return value;
};
const add = (parent, name, geometry, material, position, scale, rotation) => {
  const mesh = new THREE.Mesh(geometry, material); mesh.name = name;
  if (position) mesh.position.set(...position); if (scale) mesh.scale.set(...scale); if (rotation) mesh.rotation.set(...rotation);
  mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
};
const sphere = new THREE.SphereGeometry(0.5, 32, 24);
const dot = new THREE.CircleGeometry(0.5, 24);

const variants = [
  { key: 'Rice', body: 0xf7f0df, band: 0xe58f79, cheek: 0xf29a93, face: 0x4b342d,
    centerY: 0.75, eyeY: 0.87, eyeX: 0.16, faceZ: 0.55, bandY: 0.35, bandScale: [1.16, 0.46, 1.02],
    arm: [0.56, 0.61, 0.23], footX: 0.18, rootTilt: 0 },
  { key: 'Oat', body: 0xd9bb7e, band: 0x8fa88a, cheek: 0xd98770, face: 0x533e2a,
    centerY: 0.84, eyeY: 1.02, eyeX: 0.135, faceZ: 0.47, bandY: 0.43, bandScale: [0.91, 0.48, 0.87],
    arm: [0.45, 0.72, 0.19], footX: 0.15, rootTilt: -0.08 },
  { key: 'BlackBean', body: 0x403a4e, band: 0xd0a762, cheek: 0xb96f86, face: 0xffead7,
    centerY: 0.6, eyeY: 0.67, eyeX: 0.18, faceZ: 0.56, bandY: 0.3, bandScale: [1.22, 0.42, 1.08],
    arm: [0.6, 0.51, 0.24], footX: 0.2, rootTilt: 0.1 }
];

function bodyGeometry(kind) {
  const geometry = new THREE.SphereGeometry(0.5, 44, 30), p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), yn = y * 2;
    if (kind === 'Rice') {
      const width = 1.08 + 0.13 * (1 - yn) - 0.08 * Math.max(yn, 0);
      p.setXYZ(i, x * width, y * 1.32, z * width * 0.92);
    } else if (kind === 'Oat') {
      const width = 0.86 + 0.06 * (1 - yn);
      p.setXYZ(i, x * width + 0.055 * (1 - yn * yn), y * 1.5, z * width * 0.9);
    } else {
      const bulge = 1.12 + 0.06 * Math.cos(yn * Math.PI);
      p.setXYZ(i, x * bulge + 0.07 * Math.sin(yn * Math.PI), y, z * 1.02);
    }
  }
  geometry.computeVertexNormals(); return geometry;
}

function createCharacter(config) {
  const root = new THREE.Group(); root.name = `Variant_${config.key}`; root.rotation.z = config.rootTilt; scene.add(root);
  const bodyMaterial = mat(`Body_${config.key}`, config.body);
  const bandMaterial = mat(`Band_${config.key}`, config.band);
  const faceMaterial = mat(`Face_${config.key}`, config.face, { roughness: 0.65 });
  const cheekMaterial = mat(`Cheek_${config.key}`, config.cheek, { roughness: 0.8 });
  const mouthMaterial = mat(`Mouth_${config.key}`, config.key === 'BlackBean' ? 0xf5b59d : 0x75443e);
  const tongueMaterial = mat(`Tongue_${config.key}`, 0xf4a09b);

  add(root, 'Body_Core', bodyGeometry(config.key), bodyMaterial, [0, config.centerY, 0]);
  add(root, 'Lower_Band', sphere, bandMaterial, [0, config.bandY, 0.012], config.bandScale);

  const arms = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group(); arm.name = `${side < 0 ? 'Arm_L' : 'Arm_R'}_${config.key}`;
    arm.position.set(side * config.arm[0], config.arm[1], config.arm[2]); arm.rotation.z = side * -0.28; root.add(arm);
    add(arm, `${arm.name}_Mesh`, sphere, bodyMaterial, [0, 0, 0], [0.14, 0.19, 0.12]); arms.push(arm);
    add(root, side < 0 ? 'Foot_L' : 'Foot_R', sphere, bodyMaterial,
      [side * config.footX, 0.09, 0.07], [0.17, 0.1, 0.2]);
  }

  const eyes = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Group(); eye.name = `${side < 0 ? 'Eye_L' : 'Eye_R'}_${config.key}`;
    eye.position.set(side * config.eyeX, config.eyeY, config.faceZ); root.add(eye);
    add(eye, 'Eye_Dot', dot, faceMaterial, [0, 0, 0], [0.065, 0.075, 1]); eyes.push(eye);
    add(root, side < 0 ? 'Cheek_L' : 'Cheek_R', dot, cheekMaterial,
      [side * (config.eyeX + 0.11), config.eyeY - 0.14, config.faceZ + 0.004], [0.075, 0.038, 1]);
  }

  const mouth = new THREE.Group(); mouth.name = `Mouth_${config.key}`; mouth.position.set(0, config.eyeY - 0.12, config.faceZ + 0.009); root.add(mouth);
  add(mouth, 'Mouth_Cavity', dot, mouthMaterial, [0, 0, 0], [0.12, 0.075, 1]);
  add(mouth, 'Tongue', dot, tongueMaterial, [0, -0.027, 0.004], [0.064, 0.027, 1]);

  root.userData.grain = config.key;
  root.traverse(object => { if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; } });
  return { root, eyes, arms, mouth };
}

variants.forEach(createCharacter);

const exporter = new GLTFExporter();
const arrayBuffer = await exporter.parseAsync(scene, { binary: true, onlyVisible: true });
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, Buffer.from(arrayBuffer));
console.log(`Wrote ${output} (${Math.round(arrayBuffer.byteLength / 1024)} KB, rice/oat/black-bean)`);
