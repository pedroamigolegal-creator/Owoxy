// Partes do noob (R6) e rosto "colado" na cabeça. Só depende do Three.js.
import * as THREE from 'three';

export const PART_NAMES = ['head', 'torso', 'armA', 'armB', 'legA', 'legB'];

/**
 * O noob é uma malha só, mas cada parte do corpo é um grupo de triângulos ligado entre si.
 * Achamos os grupos (union-find nos vértices) e decidimos de que parte cada um é pelo tamanho/posição (coordenadas originais do arquivo:
 * x = profundidade, y = largura, z = altura). Devolve um array: para cada triângulo, o nome da parte (ou null se o modelo for outro).
 */
export function classifyParts(geometry) {
  const pos = geometry.attributes.position;
  const index = geometry.index ? geometry.index.array : null;
  if (!index) return null;
  const parent = new Int32Array(pos.count).map((_, i) => i);
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  for (let t = 0; t < index.length; t += 3) {
    const r = find(index[t]);
    parent[find(index[t + 1])] = r;
    parent[find(index[t + 2])] = find(r);
  }
  const boxes = new Map();
  for (let t = 0; t < index.length; t += 3) {
    const r = find(index[t]);
    let b = boxes.get(r);
    if (!b) { b = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }; boxes.set(r, b); }
    for (let k = 0; k < 3; k++) {
      const v = index[t + k];
      const p = [pos.getX(v), pos.getY(v), pos.getZ(v)];
      for (let a = 0; a < 3; a++) { if (p[a] < b.min[a]) b.min[a] = p[a]; if (p[a] > b.max[a]) b.max[a] = p[a]; }
    }
  }
  const kindOf = (b) => {
    const cy = (b.min[1] + b.max[1]) / 2;
    const cz = (b.min[2] + b.max[2]) / 2;
    if (cz > 4.2) return 'head';
    if (b.max[1] - b.min[1] >= 1.2) return 'torso';
    if (cy < 1) return 'armA';
    if (cy > 3) return 'armB';
    return cy < 2 ? 'legA' : 'legB';
  };
  const out = new Array(index.length / 3);
  const found = new Set();
  for (let t = 0; t < out.length; t++) { out[t] = kindOf(boxes.get(find(index[t * 3]))); found.add(out[t]); }
  return PART_NAMES.every((n) => found.has(n)) ? out : null;
}

/**
 * Rosto que acompanha a superfície da cabeça: copia os triângulos da frente da cabeça (um pouquinho para fora) e projeta a imagem
 * neles. Espaço de entrada: frente = -X, cima = +Y, direita (de quem olha de frente) = +Z.
 * region = { cy, cz, size }: centro e tamanho da área do rosto; a imagem ocupa o meio (1/1.3) dessa área e a borda é transparente.
 */
export const DECAL_PAD = 1.3;
export function buildDecalGeometry({ positions, normals, index }, { cy, cz, size }, eps = 0.006) {
  const R = size * DECAL_PAD;
  const p = [];
  const n = [];
  const uv = [];
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t] * 3, b = index[t + 1] * 3, c = index[t + 2] * 3;
    const nx = (normals[a] + normals[b] + normals[c]) / 3;
    if (nx > -0.25) continue;                                   // só triângulos virados para a frente
    const ccy = (positions[a + 1] + positions[b + 1] + positions[c + 1]) / 3;
    const ccz = (positions[a + 2] + positions[b + 2] + positions[c + 2]) / 3;
    if (Math.abs(ccy - cy) > R * 0.6 || Math.abs(ccz - cz) > R * 0.6) continue;
    for (const o of [a, b, c]) {
      p.push(positions[o] + normals[o] * eps, positions[o + 1] + normals[o + 1] * eps, positions[o + 2] + normals[o + 2] * eps);
      n.push(normals[o], normals[o + 1], normals[o + 2]);
      uv.push((positions[o + 2] - cz) / R + 0.5, (positions[o + 1] - cy) / R + 0.5);
    }
  }
  if (!p.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

// Imagem do rosto com borda transparente (assim a borda do desenho não "escorre" fora da área)
export function faceTexture(img) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const size = Math.round(Math.max(w, h) * DECAL_PAD);
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  canvas.getContext('2d').drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function faceMaterial(img) {
  return new THREE.MeshStandardMaterial({
    map: faceTexture(img), transparent: true, alphaTest: 0.02, roughness: 1, metalness: 0,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
}

// Tamanho/posição do rosto a partir de uma lista de vértices da cabeça (espaço: frente -X, cima +Y, direita +Z)
export function faceRegion(points) {
  let minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [, y, z] of points) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
  return { cy: (minY + maxY) / 2, cz: (minZ + maxZ) / 2, size: Math.min(maxY - minY, maxZ - minZ) * 0.97 };
}
