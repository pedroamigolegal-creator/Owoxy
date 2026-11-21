// Lê um arquivo .obj (modelo 3D) e confere as regras do UGC. Sem dependências: dá para testar fora do navegador.
import { CREATE_RULES } from './config.js';

export function parseOBJ(text) {
  const positions = [];
  let uvCount = 0;
  let triangles = 0;
  let faces = 0;
  let usesUVs = false;
  let badFace = null;
  let badNumber = false;
  const faceLines = [];

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line[0] === '#') continue;
    const parts = line.split(/\s+/);
    const tag = parts[0];
    if (tag === 'v') {
      const v = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
      if (v.some((n) => !Number.isFinite(n))) badNumber = true;
      positions.push(v);
    } else if (tag === 'vt') {
      uvCount++;
    } else if (tag === 'f') {
      faceLines.push(parts.slice(1));
    }
  }

  // faces são conferidas depois de ler todos os vértices (o .obj pode listar faces antes de tudo, mas é raro)
  for (const tokens of faceLines) {
    if (tokens.length < 3) { badFace = badFace || 'A face has fewer than 3 vertices.'; continue; }
    faces++;
    triangles += tokens.length - 2;
    for (const tk of tokens) {
      const [vi, ti] = tk.split('/');
      let i = parseInt(vi, 10);
      if (i < 0) i = positions.length + i + 1;
      if (!Number.isInteger(i) || i < 1 || i > positions.length) badFace = badFace || 'A face points to a vertex that does not exist.';
      if (ti) usesUVs = true;
    }
  }

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const v of positions) for (let k = 0; k < 3; k++) { if (v[k] < min[k]) min[k] = v[k]; if (v[k] > max[k]) max[k] = v[k]; }
  const size = positions.length ? max.map((m, k) => m - min[k]) : [0, 0, 0];
  const center = positions.length ? max.map((m, k) => (m + min[k]) / 2) : [0, 0, 0];

  return { vertices: positions.length, faces, triangles, uvCount, usesUVs, min, max, size, center, badFace, badNumber };
}

/**
 * Confere o acessório. info = parseOBJ(...). tex = { width, height, bytes } da textura PNG (ou null).
 * Devolve { errors: [...], warnings: [...], checks: [{ ok, text }] } para mostrar na tela.
 */
export function validateAccessory(info, { fileBytes = 0, tex = null } = {}) {
  const R = CREATE_RULES.ugc;
  const checks = [];
  const add = (ok, text, warn = false) => checks.push({ ok, text, warn });

  add(fileBytes > 0 && fileBytes <= R.maxMeshBytes, `File size is ${(fileBytes / 1024).toFixed(0)} KB (max ${R.maxMeshBytes / 1048576} MB)`);
  add(info.vertices > 0 && info.faces > 0 && !info.badFace && !info.badNumber, info.badFace || (info.badNumber ? 'The mesh has invalid numbers.' : `Valid mesh: ${info.vertices} vertices, ${info.faces} faces`));
  add(info.triangles >= 1 && info.triangles <= R.maxTriangles, `${info.triangles} triangles (max ${R.maxTriangles})`);

  const biggest = Math.max(...info.size);
  add(biggest <= R.maxSize && biggest >= R.minSize, `Largest side is ${biggest.toFixed(2)} studs (between ${R.minSize} and ${R.maxSize})`);

  // a origem do modelo é o ponto de encaixe: tem que estar perto do acessório
  const d = Math.hypot(...info.center.map((c, k) => Math.max(0, Math.abs(c) - info.size[k] / 2)));
  add(d <= R.maxOriginDistance, `Attachment point (0,0,0) is ${d.toFixed(2)} studs from the mesh (max ${R.maxOriginDistance})`);

  if (tex) {
    add(tex.width <= R.maxTextureSize && tex.height <= R.maxTextureSize, `Texture is ${tex.width} x ${tex.height} (max ${R.maxTextureSize} x ${R.maxTextureSize})`);
    add(tex.bytes <= R.maxTextureBytes, `Texture file is ${(tex.bytes / 1024).toFixed(0)} KB (max ${R.maxTextureBytes / 1048576} MB)`);
    add(info.usesUVs && info.uvCount > 0, 'The mesh has UV coordinates for the texture');
  } else {
    add(true, 'No texture: the accessory will be plain gray', true);
  }

  return {
    errors: checks.filter((c) => !c.ok && !c.warn).map((c) => c.text),
    warnings: checks.filter((c) => c.warn).map((c) => c.text),
    checks,
  };
}
