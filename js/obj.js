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
export function validateAccessory(info, { fileBytes = 0, tex = null, autoPosition = false, scale = 1 } = {}) {
  const R = CREATE_RULES.ugc;
  const checks = [];
  const add = (ok, text, warn = false) => checks.push({ ok, text, warn });

  add(fileBytes > 0 && fileBytes <= R.maxMeshBytes, `File size is ${(fileBytes / 1024).toFixed(0)} KB (max ${R.maxMeshBytes / 1048576} MB)`);
  add(info.vertices > 0 && info.faces > 0 && !info.badFace && !info.badNumber, info.badFace || (info.badNumber ? 'The mesh has invalid numbers.' : `Valid mesh: ${info.vertices} vertices, ${info.faces} faces`));
  add(info.triangles >= 1 && info.triangles <= R.maxTriangles, `${info.triangles} triangles (max ${R.maxTriangles})`);

  const biggest = Math.max(...info.size) * scale;   // com a escala escolhida
  add(biggest <= R.maxSize && biggest >= R.minSize, `Largest side is ${biggest.toFixed(2)} studs${scale !== 1 ? ` (after scale x${scale})` : ''} (between ${R.minSize} and ${R.maxSize})`);

  // a origem do modelo é o ponto de encaixe: tem que estar perto do acessório
  // (com o auto-posicionamento ligado, o Owoxy corrige isso sozinho)
  const d = Math.hypot(...info.center.map((c, k) => Math.max(0, Math.abs(c) - info.size[k] / 2)));
  if (autoPosition) add(true, d > R.maxOriginDistance ? `Attachment point was ${d.toFixed(2)} studs away: it will be auto-positioned` : 'Attachment point is close to the mesh', d > R.maxOriginDistance);
  else add(d <= R.maxOriginDistance, `Attachment point (0,0,0) is ${d.toFixed(2)} studs from the mesh (max ${R.maxOriginDistance})`);

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

/**
 * Auto scale: escala que deixa o acessório do tamanho certo para o noob (cabeça ~1.2 studs de largura, corpo ~5 de altura).
 *  - hat / hair: a largura (maior lado na horizontal) fica 1.4 studs, um pouco maior que a cabeça
 *  - face (acessório de rosto): a largura fica 1.0 stud
 *  - back: o maior lado fica 2.0 studs
 */
export const SCALE_TARGET = { hat: 1.4, hair: 1.4, face: 1.0, back: 2.0 };
export function autoScale(info, type) {
  const [sx, sy, sz] = info.size;
  const current = type === 'back' ? Math.max(sx, sy, sz) : Math.max(sx, sz);
  if (!(current > 0)) return 1;
  const s = (SCALE_TARGET[type] || 1.4) / current;
  return Math.max(0.05, Math.min(20, Math.round(s * 100) / 100));
}

/**
 * Auto-posicionamento: calcula o deslocamento [x, y, z] (em studs, no espaço do modelo; frente = -Z, cima = +Y)
 * para o acessório ficar no lugar certo do boneco, não importa onde o criador deixou a origem do modelo.
 * "scale" é a escala já escolhida (o deslocamento é aplicado depois de escalar).
 *  - hat / hair: centrado em cima da cabeça, com a base do modelo no topo da cabeça
 *  - face: centrado no rosto, com a parte de trás do modelo encostada no rosto e o resto para a frente
 *  - back: centrado nas costas, com o lado de dentro do modelo encostado nas costas
 */
export function autoFit(info, type, scale = 1) {
  const c = info.center.map((n) => n * scale);
  const lo = info.min.map((n) => n * scale);
  const hi = info.max.map((n) => n * scale);
  const clamp = (n) => Math.max(-50, Math.min(50, Math.round(n * 100) / 100));
  let off;
  if (type === 'face') off = [-c[0], -c[1], -hi[2]];
  else if (type === 'back') off = [-c[0], -c[1], -lo[2]];
  else off = [-c[0], -lo[1], -c[2]];   // hat, hair
  return off.map((n) => clamp(n + 0));
}
