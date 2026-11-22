// Noob R6 para o jogo: o corpo é separado em cabeça, tronco, 2 braços e 2 pernas (ver rig.js) para dar para animar.
import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { ATTACH, loadImage, loadModel, makeBodyTexture } from '../avatar.js';
import { CONFIG } from '../config.js';
import { buildDecalGeometry, classifyParts, faceMaterial, faceRegion } from '../rig.js';

const OBJ = new OBJLoader();

/** Lê o modelo uma vez e prepara as 6 partes (geometrias compartilhadas por todos os jogadores). */
export async function loadTemplate(modelUrl = CONFIG.defaultAvatar) {
  const gltf = await loadModel(modelUrl || CONFIG.defaultAvatar);
  const scene = gltf.scene.clone(true);
  scene.updateMatrixWorld(true);
  let mesh = null;
  scene.traverse((o) => { if (o.isMesh && o.material?.map?.image && !mesh) mesh = o; });
  if (!mesh) throw new Error('Model has no body mesh');
  const geo = mesh.geometry;
  const parts = classifyParts(geo);
  if (!parts) throw new Error('This avatar model cannot be split into R6 parts');

  const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv, index = geo.index.array;
  const M = mesh.matrixWorld;
  // espaço do modelo: frente = -X, cima = +Y. Centraliza em x/z e põe os pés em y = 0.
  const P = new Float32Array(pos.count * 3), N = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  const min = new THREE.Vector3(Infinity, Infinity, Infinity), max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(M); P.set([v.x, v.y, v.z], i * 3); min.min(v); max.max(v);
    v.fromBufferAttribute(nor, i).transformDirection(M); N.set([v.x, v.y, v.z], i * 3);
  }
  const cx = (min.x + max.x) / 2, cz = (min.z + max.z) / 2;
  const dy = -min.y;   // quanto subir para os pés ficarem em y = 0 (os acessórios usam este valor)
  for (let i = 0; i < pos.count; i++) { P[i * 3] -= cx; P[i * 3 + 1] += dy; P[i * 3 + 2] -= cz; }

  // amostra de cor do atlas (para achar o desenho preto do rosto original)
  const sampler = makeBodyTexture(mesh.material.clone());

  const names = ['head', 'torso', 'armA', 'armB', 'legA', 'legB'];
  const geos = {}, joints = {};
  for (const name of names) {
    const map = new Map();
    const p = [], n = [], u = [], ix = [];
    const take = (old) => {
      let k = map.get(old);
      if (k === undefined) { k = map.size; map.set(old, k); p.push(P[old * 3], P[old * 3 + 1], P[old * 3 + 2]); n.push(N[old * 3], N[old * 3 + 1], N[old * 3 + 2]); u.push(uv.getX(old), uv.getY(old)); }
      return k;
    };
    for (let t = 0; t < parts.length; t++) if (parts[t] === name) for (let k = 0; k < 3; k++) ix.push(take(index[t * 3 + k]));
    // articulação: topo da parte (ombro / quadril); cabeça e tronco ficam parados
    let joint = [0, 0, 0];
    if (name.startsWith('arm') || name.startsWith('leg')) {
      let lo = [Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], loz = Infinity;
      for (let i = 0; i < p.length; i += 3) { hi[1] = Math.max(hi[1], p[i + 1]); lo[0] = Math.min(lo[0], p[i]); hi[0] = Math.max(hi[0], p[i]); loz = Math.min(loz, p[i + 2]); hi[2] = Math.max(hi[2], p[i + 2]); }
      joint = [(lo[0] + hi[0]) / 2, hi[1], (loz + hi[2]) / 2];
      for (let i = 0; i < p.length; i += 3) { p[i] -= joint[0]; p[i + 1] -= joint[1]; p[i + 2] -= joint[2]; }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2));
    g.setIndex(ix);
    g.computeBoundingSphere();
    geos[name] = g; joints[name] = joint;
  }

  // dados do rosto (cabeça, espaço do modelo)
  const headPos = geos.head.attributes.position, headNor = geos.head.attributes.normal, headUV = geos.head.attributes.uv;
  const dark = [];
  for (let i = 0; i < headPos.count; i++) { const [r, g, b] = sampler.sample(headUV.getX(i), headUV.getY(i)); if (r + g + b < 150) dark.push(i); }
  let skin = 0;
  for (let i = 0; i < headPos.count; i++) if (!dark.includes(i)) { skin = i; break; }
  const region = faceRegion(Array.from({ length: headPos.count }, (_, i) => [headPos.getX(i), headPos.getY(i), headPos.getZ(i)]));
  const decalGeo = buildDecalGeometry({ positions: headPos.array, normals: headNor.array, index: geos.head.index.array }, region);

  return { geos, joints, material: mesh.material, dy, dark, skinUV: [headUV.getX(skin), headUV.getY(skin)], decalGeo, height: max.y - min.y };
}

// ---- texturas do corpo: jogadores com a mesma aparência dividem o mesmo material ----
const bodyCache = new Map();
function bodyMaterial(tpl, look) {
  const key = JSON.stringify([look.colors || null, look.shirt || null, look.pants || null]);
  if (!bodyCache.has(key)) {
    bodyCache.set(key, (async () => {
      const [shirt, pants] = await Promise.all([
        look.shirt ? loadImage(look.shirt).catch(() => null) : null,
        look.pants ? loadImage(look.pants).catch(() => null) : null,
      ]);
      const material = tpl.material.clone();
      const ctl = makeBodyTexture(material);
      ctl.setColors({ ...CONFIG.defaultColors, ...(look.colors || {}) });
      ctl.setClothes({ shirt, pants });
      return material;
    })());
  }
  return bodyCache.get(key);
}

/** Cria um noob (Group com os pés em y = 0 e a frente em -X). Use root.rotation.y para virar (ver headingFor). */
export function createCharacter(tpl) {
  const root = new THREE.Group();
  const meshes = {};
  for (const name of Object.keys(tpl.geos)) {
    const m = new THREE.Mesh(tpl.geos[name], tpl.material);
    m.position.set(...tpl.joints[name]);
    root.add(m);
    meshes[name] = m;
  }
  let accessories = [];
  let decal = null;
  let ownHeadGeo = null;
  let version = 0;

  async function setLook(look = {}) {
    const my = ++version;
    const [material, face] = await Promise.all([bodyMaterial(tpl, look), look.face ? loadImage(look.face).catch(() => null) : null]);
    if (my !== version) return;
    for (const m of Object.values(meshes)) m.material = material;

    // rosto
    if (decal) { meshes.head.remove(decal); decal.material.map?.dispose(); decal.material.dispose(); decal = null; }
    if (ownHeadGeo) { ownHeadGeo.dispose(); ownHeadGeo = null; }
    meshes.head.geometry = tpl.geos.head;
    if (face && tpl.decalGeo) {
      ownHeadGeo = tpl.geos.head.clone();
      const uv = ownHeadGeo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, tpl.skinUV[0], tpl.skinUV[1]);   // cabeça toda lisa: o rosto original não vaza
      uv.needsUpdate = true;
      meshes.head.geometry = ownHeadGeo;
      decal = new THREE.Mesh(tpl.decalGeo, faceMaterial(face));
      meshes.head.add(decal);
    }

    // acessórios (UGC)
    accessories.forEach((g) => root.remove(g));
    accessories = [];
    const built = await Promise.all((look.accessories || []).map(async (a) => {
      try {
        const [obj, tex] = await Promise.all([OBJ.loadAsync(a.meshUrl), a.texUrl ? loadImage(a.texUrl).catch(() => null) : null]);
        let map = null;
        if (tex) { map = new THREE.Texture(tex); map.colorSpace = THREE.SRGBColorSpace; map.wrapS = map.wrapT = THREE.RepeatWrapping; map.needsUpdate = true; }
        obj.traverse((o) => { if (o.isMesh) o.material = new THREE.MeshStandardMaterial({ map, color: map ? 0xffffff : 0xcccccc, roughness: 0.7, metalness: 0, side: THREE.DoubleSide }); });
        obj.position.set(...(a.offset || [0, 0, 0]));
        obj.scale.setScalar(a.scale || 1);
        const holder = new THREE.Group();
        holder.add(obj);
        holder.rotation.y = Math.PI / 2;
        const at = ATTACH[a.type] || ATTACH.hat;
        holder.position.set(at[0], at[1] + tpl.dy, at[2]);
        return holder;
      } catch (err) { console.error('Acessório não carregou:', err); return null; }
    }));
    if (my !== version) return;
    built.filter(Boolean).forEach((g) => { root.add(g); accessories.push(g); });
  }

  // ---- animação R6 ----
  // Eixo dos braços/pernas = Z. Rotação negativa leva um braço que pende para a frente (-X) e para cima.
  let phase = 0;
  const pose = { armA: 0, armB: 0, legA: 0, legB: 0 };
  const ease = (cur, target, dt) => cur + (target - cur) * (1 - Math.exp(-dt * 16));
  function update(dt, { moving = false, airborne = false, speed = 1 } = {}) {
    let target;
    if (airborne) target = { armA: -2.7, armB: -2.7, legA: 0.35, legB: -0.35 };            // pulo: braços para cima
    else if (moving) {
      phase += dt * 11 * speed;
      const s = Math.sin(phase) * 0.95;
      target = { armA: s, armB: -s, legA: -s, legB: s };                                    // braço de um lado vai com a perna do outro
    } else {
      phase += dt * 1.6;
      const b = Math.sin(phase) * 0.04;                                                      // parado: respiração leve
      target = { armA: b, armB: -b, legA: 0, legB: 0 };
    }
    for (const k of Object.keys(pose)) { pose[k] = ease(pose[k], target[k], dt); meshes[k].rotation.z = pose[k]; }
  }

  function dispose() { if (ownHeadGeo) ownHeadGeo.dispose(); if (decal) { decal.material.map?.dispose(); decal.material.dispose(); } }
  return { root, setLook, update, dispose, meshes };
}
