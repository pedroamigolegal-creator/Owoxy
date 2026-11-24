// Visual dos jogos: plástico liso com brilho, studs nos pisos, sombras de verdade do sol e personagens que projetam sombra.
// Tudo é opcional: se algo falhar, o jogo continua com o visual simples.
import * as THREE from 'three';

const STUD = 1;   // 1 stud = 1 unidade
let studTile = null;
function studTexture() {
  if (studTile) return studTile;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#dcdcdc'; g.fillRect(0, 0, 64, 64);
  const r = g.createRadialGradient(28, 26, 3, 32, 32, 21);
  r.addColorStop(0, '#ffffff'); r.addColorStop(0.75, '#f0f0f0'); r.addColorStop(1, '#c4c4c4');
  g.fillStyle = r; g.beginPath(); g.arc(32, 32, 21, 0, Math.PI * 2); g.fill();
  studTile = new THREE.CanvasTexture(c);
  studTile.wrapS = studTile.wrapT = THREE.RepeatWrapping;
  studTile.colorSpace = THREE.SRGBColorSpace;
  studTile.anisotropy = 4;
  return studTile;
}

export function setupLook({ renderer, scene, world, quality = 'high' }) {
  const std = new Map();
  const plastic = (m) => {
    if (!m.isMeshLambertMaterial) return m;
    const key = `${m.color.getHex()}|${m.opacity}|${m.transparent}|${m.map ? m.map.uuid : ''}`;
    if (!std.has(key)) std.set(key, new THREE.MeshStandardMaterial({ color: m.color.clone(), map: m.map || null, transparent: m.transparent, opacity: m.opacity, roughness: 0.55, metalness: 0 }));
    return std.get(key);
  };
  const topCache = new Map();
  const studded = (m, w, d) => {
    const key = `${m.uuid}|${w}|${d}`;
    if (!topCache.has(key)) {
      const mat = m.clone();
      mat.map = studTexture().clone();
      mat.map.needsUpdate = true;
      mat.map.repeat.set(Math.max(1, Math.round(w / STUD)), Math.max(1, Math.round(d / STUD)));
      topCache.set(key, mat);
    }
    return topCache.get(key);
  };

  let sun = null;
  const shadowOn = quality !== 'low';
  world.group.traverse((o) => {
    if (o.isDirectionalLight && !sun) sun = o;
    if (!o.isMesh) return;
    if (o.material?.isShaderMaterial || o.material?.isMeshBasicMaterial || Array.isArray(o.material)) return;   // céu, nuvens, lava, lâmpadas
    o.material = plastic(o.material);
    const p = o.geometry?.parameters;
    const isBox = o.geometry?.type === 'BoxGeometry' && p;
    const isGround = o.geometry?.type === 'PlaneGeometry';
    if (isBox && p.width >= 3 && p.depth >= 3 && p.height <= 4 && o.material.isMeshStandardMaterial && !o.material.transparent) {
      const side = o.material, top = studded(o.material, p.width, p.depth);
      o.material = [side, side, top, side, side, side];   // ordem do BoxGeometry: +x, -x, +y (topo), -y, +z, -z
    }
    o.receiveShadow = true;
    o.castShadow = !isGround && !(isBox && p.height < 0.6);
  });

  if (sun) {
    sun.castShadow = shadowOn;
    sun.shadow.mapSize.set(quality === 'mobile' ? 2048 : 4096, quality === 'mobile' ? 2048 : 4096);
    const cam = sun.shadow.camera;
    cam.left = -80; cam.right = 80; cam.top = 80; cam.bottom = -80; cam.near = 10; cam.far = 400; cam.updateProjectionMatrix();
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05;
    scene.add(sun.target);
  }
  renderer.shadowMap.enabled = shadowOn;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const actors = new Set();
  let acc = 0;
  const markActors = () => { for (const h of actors) h.traverse((o) => { if (o.isMesh && o.name !== 'shadow') { o.castShadow = true; } if (o.isMesh && o.name === 'shadow') o.visible = !renderer.shadowMap.enabled; }); };
  const offset = new THREE.Vector3(60, 120, 40);
  return {
    track(holder) { actors.add(holder); markActors(); },
    untrack(holder) { actors.delete(holder); },
    update(pos, dt = 0.016) {
      if (sun && renderer.shadowMap.enabled) {   // a sombra acompanha o jogador, em passos para não tremer
        const sx = Math.round(pos.x / 4) * 4, sz = Math.round(pos.z / 4) * 4;
        const sy = Math.round(pos.y / 4) * 4;
        sun.target.position.set(sx, sy, sz);
        sun.position.set(sx + offset.x, sy + offset.y, sz + offset.z);
        sun.target.updateMatrixWorld();
      }
      acc += dt; if (acc > 1.2) { acc = 0; markActors(); }   // acessórios chegam depois: marca de novo
    },
    setQuality(q) {
      const on = q !== 'low';
      if (renderer.shadowMap.enabled === on) return;
      renderer.shadowMap.enabled = on;
      if (sun) sun.castShadow = on;
      scene.traverse((o) => { const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach((x) => { x.needsUpdate = true; }); });
      markActors();
    },
  };
}
