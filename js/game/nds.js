// Natural Disaster Survival: ilha com cidade, lobby, rodadas sincronizadas e desastres.
import * as THREE from 'three';
import { DISASTER_NAMES, DISASTER_TIPS, startDisaster } from './disasters.js';
import { GROUND_Y, headingFor } from './physics.js';
import { covered, HEIGHT, R as PR, step3d } from './physics3d.js';
import { createRound } from './round.js';

const MAP = 80;                                   // meia largura da ilha
const LOBBY = { x: 220, z: 0, half: 26 };         // plataforma do lobby, longe da ilha
const VOLCANO = [0, 0, -68];

function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hash = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function buildWorld() {
  const rand = mulberry(777);
  const group = new THREE.Group();
  const boxes = [];                               // colisão: { minX, maxX, minY, maxY, minZ, maxZ }
  const holes = [];                               // buracos do terremoto

  function box(cx, cz, w, d, y0, y1, color, collide = true, mat = null) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, y1 - y0, d), mat || lambert(color));
    m.position.set(cx, (y0 + y1) / 2, cz);
    group.add(m);
    if (collide) boxes.push({ minX: cx - w / 2, maxX: cx + w / 2, minY: y0, maxY: y1, minZ: cz - d / 2, maxZ: cz + d / 2 });
    return m;
  }

  // ---- chão ----
  const gc = document.createElement('canvas'); gc.width = gc.height = 64;
  const gx = gc.getContext('2d'); gx.fillStyle = '#5aa845'; gx.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 80; i++) { gx.fillStyle = rand() > 0.5 ? '#63b24d' : '#519c3e'; gx.fillRect(rand() * 64, rand() * 64, 3, 3); }
  const gtex = new THREE.CanvasTexture(gc); gtex.wrapS = gtex.wrapT = THREE.RepeatWrapping; gtex.repeat.set(40, 40); gtex.colorSpace = THREE.SRGBColorSpace;
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(MAP * 2, MAP * 2), lambert(0xffffff, { map: gtex }));
  grass.rotation.x = -Math.PI / 2; grass.position.y = GROUND_Y; group.add(grass);
  box(0, 0, MAP * 2 + 14, MAP * 2 + 14, -8, GROUND_Y - 0.05, 0xe6d3a3, false);              // praia em volta da ilha
  box(0, 0, MAP * 2, MAP * 2, -8, GROUND_Y - 0.02, 0x7a5a3a, false);                       // terra por baixo da ilha
  const roadMat = lambert(0x3a3d42);
  for (const [w, d] of [[MAP * 2, 12], [12, MAP * 2]]) { const r = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), roadMat); r.position.y = GROUND_Y + 0.03; group.add(r); }
  // praça redonda no cruzamento, calçadas e faixas
  { const plaza = new THREE.Mesh(new THREE.CylinderGeometry(20, 20, 0.12, 48), lambert(0xd9cfbd)); plaza.position.y = GROUND_Y + 0.05; group.add(plaza);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(20.8, 20.8, 0.1, 48), lambert(0xa9a396)); rim.position.y = GROUND_Y + 0.03; group.add(rim);
    const walk = lambert(0xc9c9c4);
    for (const sgn of [-1, 1]) for (const [w, d, x, z] of [[MAP * 2, 3, 0, sgn * 7.5], [3, MAP * 2, sgn * 7.5, 0]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), walk); m.position.set(x, GROUND_Y + 0.07, z); group.add(m); }
    const marks = [];
    for (let p = 24; p < MAP - 2; p += 9) for (const sgn of [-1, 1]) { marks.push([sgn * p, 0, 4.5, 0.3]); marks.push([0, sgn * p, 0.3, 4.5]); }
    for (let i = -2; i <= 2; i++) for (const sgn of [-1, 1]) { marks.push([sgn * 23, i * 2.2, 2.6, 1.1]); marks.push([i * 2.2, sgn * 23, 1.1, 2.6]); }
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.02, 1), new THREE.MeshLambertMaterial({ color: 0xf3f3f0 }), marks.length);
    const dm = new THREE.Object3D();
    marks.forEach(([x, z, w, d], i) => { dm.position.set(x, GROUND_Y + 0.07, z); dm.scale.set(w, 1, d); dm.updateMatrix(); inst.setMatrixAt(i, dm.matrix); });
    group.add(inst);
    // fonte (dá para subir na borda: 1.0 de altura)
    const base = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.9, 1.0, 28), lambert(0xb8b2a6)); base.position.y = 0.5; group.add(base);
    const pool = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 0.1, 28), new THREE.MeshLambertMaterial({ color: 0x4aa8e0 })); pool.position.y = 0.95; group.add(pool);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 3.4, 10), lambert(0xb8b2a6)); col.position.y = 2.2; group.add(col);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 0.5, 0.5, 14), lambert(0xb8b2a6)); bowl.position.y = 3.9; group.add(bowl);
    boxes.push({ minX: -4.4, maxX: 4.4, minY: 0, maxY: 1.0, minZ: -4.4, maxZ: 4.4 }); }
  // lobby
  box(LOBBY.x, LOBBY.z, LOBBY.half * 2, LOBBY.half * 2, -8, GROUND_Y, 0xb8b4aa, false);
  const lobbyTop = new THREE.Mesh(new THREE.PlaneGeometry(LOBBY.half * 2, LOBBY.half * 2), lambert(0xd9d5c8));
  lobbyTop.rotation.x = -Math.PI / 2; lobbyTop.position.set(LOBBY.x, GROUND_Y + 0.02, LOBBY.z); group.add(lobbyTop);
  // placa do lobby
  { const c = document.createElement('canvas'); c.width = 1024; c.height = 256; const x = c.getContext('2d');
    x.fillStyle = '#1d2a3a'; x.fillRect(0, 0, 1024, 256); x.fillStyle = '#ffd24a'; x.font = 'bold 84px sans-serif'; x.textAlign = 'center'; x.fillText('NATURAL DISASTER', 512, 110); x.fillStyle = '#fff'; x.fillText('SURVIVAL', 512, 210);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(32, 8), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide }));
    sign.position.set(LOBBY.x + 22, 12, LOBBY.z); sign.rotation.y = -Math.PI / 2; group.add(sign);
    box(LOBBY.x + 22.5, LOBBY.z - 12, 1, 1, 0, 8, 0x555a60, false); box(LOBBY.x + 22.5, LOBBY.z + 12, 1, 1, 0, 8, 0x555a60, false); }

  // enfeites do lobby
  for (const [ox, oz] of [[-22, -22], [22, -22], [-22, 22], [22, 22], [0, -24], [0, 24]]) {
    box(LOBBY.x + ox, LOBBY.z + oz, 0.5, 0.5, 0, 8, 0x3b3d42, false);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff1b0 })); b.position.set(LOBBY.x + ox, 8.3, LOBBY.z + oz); group.add(b);
  }
  for (const [ox, oz] of [[-18, -8], [-18, 8], [18, -14], [18, 14]]) {
    box(LOBBY.x + ox, LOBBY.z + oz, 1.4, 1.4, 0, 3.6, 0x7a5230, false);
    const cr = new THREE.Mesh(new THREE.IcosahedronGeometry(3, 1), lambert(0x3f9a3c)); cr.position.set(LOBBY.x + ox, 5.8, LOBBY.z + oz); group.add(cr);
  }
  for (let i = 0; i < 4; i++) { const bedx = LOBBY.x - 10 + i * 6.6; box(bedx, LOBBY.z - 20, 4.4, 1.6, 0, 0.7, 0x8a5a2b, false); for (let k = 0; k < 4; k++) box(bedx - 1.5 + k, LOBBY.z - 20, 0.6, 0.6, 0.7, 1.4, [0xff5a8a, 0xffd24a, 0xffffff, 0xb36bff][(i + k) % 4], false); }
  for (const oz of [-9, 9]) { box(LOBBY.x - 8, LOBBY.z + oz, 1.4, 4.4, 0.6, 1.0, 0x7a5230, false); box(LOBBY.x - 8.9, LOBBY.z + oz, 0.4, 4.4, 1.0, 2.2, 0x7a5230, false); box(LOBBY.x - 8, LOBBY.z + oz - 1.9, 1.2, 0.4, 0, 0.6, 0x3b3d42, false); box(LOBBY.x - 8, LOBBY.z + oz + 1.9, 1.2, 0.4, 0, 0.6, 0x3b3d42, false); }

  // ---- prédios (com degraus em espiral por fora, para dar para subir pulando) ----
  const palette = [0xc96f5a, 0xd9b26f, 0x7b9bc4, 0xa7b5a0, 0xcf8fa0, 0xe0d4b8, 0x8e8aa8];
  function windowTex(w, h, base) {
    const c = document.createElement('canvas'); c.width = Math.max(64, Math.min(256, Math.round(w * 8))); c.height = Math.max(64, Math.min(512, Math.round(h * 8)));
    const x = c.getContext('2d'); x.fillStyle = '#' + base.toString(16).padStart(6, '0'); x.fillRect(0, 0, c.width, c.height);
    const cols = Math.max(2, Math.floor(w / 4)), rows = Math.max(2, Math.floor(h / 4.5)), cw = c.width / cols, rh = c.height / rows;
    for (let i = 0; i < cols; i++) for (let j = 1; j < rows; j++) { x.fillStyle = rand() > 0.35 ? '#ffe9a8' : '#2f4458'; x.fillRect(i * cw + cw * 0.22, j * rh + rh * 0.2, cw * 0.56, rh * 0.5); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  function building(cx, cz, w, d, h, color) {
    const side = lambert(0xffffff, { map: windowTex(w, h, color) }), roof = lambert(0x55565a);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, roof, roof, side, side]);
    m.position.set(cx, h / 2, cz); group.add(m);
    boxes.push({ minX: cx - w / 2, maxX: cx + w / 2, minY: 0, maxY: h, minZ: cz - d / 2, maxZ: cz + d / 2 });
    // degraus: cada um 2.5 mais alto que o anterior, em volta do prédio
    const n = Math.max(1, Math.floor((h - 1) / 2.5));
    const px = w / 2 + 2, pz = d / 2 + 2;                       // caminho (centro dos degraus) em volta
    const per = 2 * (2 * px + 2 * pz), gap = Math.min(3.6, per / (n + 1));
    const stepColor = 0x9a9a96;
    for (let k = 1; k <= n; k++) {
      let s = ((k - 1) * gap + px) % per;                        // começa no meio do lado sul
      let x, z;
      if (s < 2 * px) { x = -px + s; z = pz; } else if ((s -= 2 * px) < 2 * pz) { x = px; z = pz - s; } else if ((s -= 2 * pz) < 2 * px) { x = px - s; z = -pz; } else { s -= 2 * px; x = -px; z = -pz + s; }
      box(cx + x, cz + z, 4, 4, 0, k * 2.5, stepColor);
    }
  }
  const spec = [[30, 30, 20, 20, 14], [58, 30, 18, 18, 22], [30, 58, 18, 18, 28], [-30, 30, 20, 20, 18], [-58, 30, 18, 18, 34], [-30, 58, 18, 18, 12],
    [30, -30, 20, 20, 24], [58, -30, 18, 18, 16], [-30, -30, 20, 20, 20], [-58, -30, 18, 18, 30], [-58, 58, 14, 14, 26], [58, 58, 14, 14, 20]];
  spec.forEach(([x, z, w, d, h], i) => building(x, z, w, d, h, palette[i % palette.length]));
  spec.forEach(([x, z, w, d, h], i) => {
    const t = 0.7, rim = lambert(0x6b6d72);
    for (const [px, pz, pw, pd] of [[0, d / 2 - t / 2, w, t], [0, -d / 2 + t / 2, w, t], [w / 2 - t / 2, 0, t, d], [-w / 2 + t / 2, 0, t, d]]) box(x + px, z + pz, pw, pd, h, h + 1, 0, false, rim);   // parapeito
    box(x - w * 0.22, z + d * 0.18, 3.4, 2.6, h, h + 2.2, 0x9aa0a6, false);                                                                          // ar-condicionado
    const dz = z + (z > 0 ? -1 : 1) * (d / 2 + 0.05);                                                                                                // porta e toldo viradas para a praça
    box(x, dz, 3.4, 0.3, 0, 4.6, 0x3b2a22, false);
    box(x, dz + (z > 0 ? -1 : 1) * 0.9, 5.6, 1.8, 5.0, 5.4, [0xc4281c, 0x1f7a4d, 0x1a5fb4][i % 3], false);
  });

  // ---- vulcão (enfeite sempre visível; a lava só aparece no desastre) ----
  const volcano = new THREE.Mesh(new THREE.ConeGeometry(20, 44, 20), lambert(0x5b4a40));
  volcano.position.set(VOLCANO[0], 22, VOLCANO[2] - 4); group.add(volcano);
  box(VOLCANO[0], VOLCANO[2] - 4, 22, 22, 0, 14, 0x5b4a40, true, lambert(0x5b4a40)).visible = false;
  const crater = new THREE.Mesh(new THREE.CylinderGeometry(4, 5, 1, 12), new THREE.MeshBasicMaterial({ color: 0xff5a14 })); crater.position.set(VOLCANO[0], 43.5, VOLCANO[2] - 4); group.add(crater);
  const SUMMIT = [VOLCANO[0], 44, VOLCANO[2] - 4];

  // ---- abrigos (4 pilares + teto): protegem da nevasca e da chuva ácida ----
  for (const [hx, hz] of [[12, 12], [-12, 12], [12, -12], [-12, -12]]) {
    box(hx, hz, 14, 14, 7.5, 8.7, 0xb5651d);
    for (const [px, pz] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) box(hx + px, hz + pz, 1.4, 1.4, 0, 7.5, 0x8a5a2b);
  }
  // ---- árvores ----
  const free = (x, z, m) => !boxes.some((b) => x > b.minX - m && x < b.maxX + m && z > b.minZ - m && z < b.maxZ + m);
  for (let i = 0, n = 0; i < 200 && n < 34; i++) {
    const x = (rand() * 2 - 1) * (MAP - 6), z = (rand() * 2 - 1) * (MAP - 6);
    if (Math.abs(x) < 9 || Math.abs(z) < 9 || !free(x, z, 6)) continue;
    n++;
    box(x, z, 1.6, 1.6, 0, 4, 0x7a5230);
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(3.4, 1), lambert(rand() > 0.5 ? 0x3f9a3c : 0x338a35)); crown.position.set(x, 6.4, z); group.add(crown);
  }
  // ---- postes de luz ----
  for (const s of [-1, 1]) for (let i = 1; i <= 5; i++) {
    for (const [x, z] of [[s * i * 14, 8], [s * i * 14, -8], [8, s * i * 14], [-8, s * i * 14]]) {
      if (Math.abs(x) > MAP - 3 || Math.abs(z) > MAP - 3 || !free(x, z, 2)) continue;
      box(x, z, 0.5, 0.5, 0, 9, 0x3b3d42, false);
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff1b0 })); b.position.set(x, 9.3, z); group.add(b);
    }
  }

  // ---- água e lava ----
  const water = new THREE.Mesh(new THREE.PlaneGeometry(380, 380), new THREE.MeshLambertMaterial({ color: 0x2f8fd8, transparent: true, opacity: 0.75 }));
  water.rotation.x = -Math.PI / 2; water.position.y = -2.5; group.add(water);
  const lava = new THREE.Mesh(new THREE.BoxGeometry(MAP * 2, 0.4, MAP * 2), new THREE.MeshBasicMaterial({ color: 0xff5a14 }));
  lava.visible = false; group.add(lava);

  // ---- céu, luz ----
  const sky = new THREE.Mesh(new THREE.SphereGeometry(450, 24, 12), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x4a97e8) }, bottom: { value: new THREE.Color(0xcfe8ff) } },
    vertexShader: 'varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying float h; void main(){ gl_FragColor = vec4(mix(bottom, top, clamp(h*1.6, 0.0, 1.0)), 1.0); }',
  }));
  sky.position.set(60, 0, 0); group.add(sky);
  const clouds = [];
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, fog: false });
  for (let i = 0; i < 12; i++) {
    const c = new THREE.Group();
    for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(16 + rand() * 14, 5, 10 + rand() * 6), cloudMat); b.position.set(k * 10 - 15, rand() * 3, rand() * 6); c.add(b); }
    c.position.set((rand() - 0.5) * 520 + 60, 110 + rand() * 40, (rand() - 0.5) * 420); group.add(c); clouds.push(c);
  }
  const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(60, 120, 40);
  group.add(sun, new THREE.HemisphereLight(0xcfe8ff, 0x7a8f6a, 1.1));

  // ---- chão com buracos ----
  const inLobby = (x, z) => Math.abs(x - LOBBY.x) <= LOBBY.half && Math.abs(z - LOBBY.z) <= LOBBY.half;
  const hasGround = (x, z) => {
    if (inLobby(x, z)) return true;
    if (Math.abs(x) > MAP || Math.abs(z) > MAP) return false;
    for (const h of holes) if (h.open && x > h.minX && x < h.maxX && z > h.minZ && z < h.maxZ) return false;
    return true;
  };
  const holeGeo = new THREE.PlaneGeometry(1, 1), holeMat = new THREE.MeshBasicMaterial({ color: 0x050505 }), holeEdge = new THREE.MeshBasicMaterial({ color: 0x7a2a12 });

  // ---------- estado do jogo ----------
  const env = { pushX: 0, pushZ: 0, lift: 0, waterY: -Infinity };
  const local = { alive: false, shake: 0, lastStep: { headUnder: false }, survived: 0 };
  let ctx = null;                                  // preenchido em attach()
  let round = null, disaster = null, aliveSet = new Set(), ui = null, shownMsg = 0, lastRid = -1;

  const spawnLobby = () => ({ x: LOBBY.x + (rand() * 2 - 1) * 14, z: LOBBY.z + (rand() * 2 - 1) * 14 });
  function spawnMap(key, rid) {
    const r = mulberry(hash(key) ^ (rid * 2654435761));
    for (let i = 0; i < 60; i++) {
      const a = r() * Math.PI * 2, d = 4 + r() * 26, x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (free(x, z, PR + 1)) return { x, z };
    }
    return { x: 0, z: 0 };
  }
  const toLobby = () => { const p = spawnLobby(); ctx.teleport(p.x, GROUND_Y, p.z, Math.PI); };   // olha para a placa

  function say(text, ms = 4500) {
    ui.msg.textContent = text; ui.msg.classList.add('show');
    const my = ++shownMsg;
    setTimeout(() => { if (my === shownMsg) ui.msg.classList.remove('show'); }, ms);
  }
  function die(reason) {
    if (!local.alive) return;
    local.alive = false;
    aliveSet.delete(ctx.net.key);
    ctx.net.sendEvent({ ev: 'd' });
    api.meterOff();
    say(`You died: ${reason}`);
    toLobby();
  }

  // API que os desastres usam
  const api = {
    group: new THREE.Group(),
    rng: Math.random, env, volcano: SUMMIT,
    me: () => ctx.me.state,
    alive: () => local.alive,
    kill: die,
    covered: () => covered(ctx.me.state, boxes),
    headUnder: () => local.lastStep.headUnder,
    scene: () => group.parent,
    camera: () => ctx.camera(),
    addHole(r) {
      const h = { ...r, open: false, mesh: new THREE.Group() };
      const w = r.maxX - r.minX, d = r.maxZ - r.minZ;
      const edge = new THREE.Mesh(holeGeo, holeEdge); edge.rotation.x = -Math.PI / 2; edge.scale.set(w + 1.6, d + 1.6, 1); edge.position.set((r.minX + r.maxX) / 2, GROUND_Y + 0.06, (r.minZ + r.maxZ) / 2);
      const dark = new THREE.Mesh(holeGeo, holeMat); dark.rotation.x = -Math.PI / 2; dark.scale.set(w, d, 1); dark.position.set(edge.position.x, GROUND_Y + 0.08, edge.position.z);
      h.mesh.add(edge, dark); h.mesh.visible = false; group.add(h.mesh); h.edge = edge; h.dark = dark; h.baseW = w; h.baseD = d;
      holes.push(h);
      return h;
    },
    setHole(h, open, grow) { h.open = open && grow >= 1; h.mesh.visible = open; h.dark.scale.set(h.baseW * grow, h.baseD * grow, 1); h.edge.scale.set(h.baseW * grow + 1.6, h.baseD * grow + 1.6, 1); },
    removeHole(h) { group.remove(h.mesh); const i = holes.indexOf(h); if (i >= 0) holes.splice(i, 1); },
    setShake: (v) => { local.shake = v; world.shake = v; },
    setWater(y) { if (y === null) { water.position.y = -2.5; } else water.position.y = y; },
    setLava(y) { lava.visible = y !== null; if (y !== null) lava.position.set(0, y, 0); },
    meter: (label, frac, color, warn) => { ui.meterWrap.hidden = false; ui.meterLabel.textContent = label; ui.meterFill.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`; ui.meterFill.style.background = color; ui.meterWrap.classList.toggle('warn', !!warn); },
    meterOff: () => { if (ui) ui.meterWrap.hidden = true; },
  };
  group.add(api.group);

  // ---------- transições de fase ----------
  function onTransition(prev, S) {
    if (!ctx) return;
    const wall = Date.now();
    if (S.ph === 'active' && (!prev || prev.rid !== S.rid)) {
      disaster?.dispose();
      api.rng = mulberry(S.seed);
      env.pushX = env.pushZ = env.lift = 0; env.waterY = -Infinity;
      disaster = startDisaster(S.d, api);
      lastRid = S.rid;
      const late = !prev && round.elapsed(wall) > 4;                    // entrou com a rodada já andando: só assiste
      aliveSet = new Set(ctx.roster().map((p) => p.key));
      if (late) { local.alive = false; aliveSet.delete(ctx.net.key); ctx.net.sendEvent({ ev: 'd' }); say('A round is in progress. You will play in the next one!', 5000); if (inLobby(ctx.me.state.x, ctx.me.state.z) === false) toLobby(); }
      else {
        local.alive = true;
        const p = spawnMap(ctx.net.key, S.rid);
        ctx.teleport(p.x, GROUND_Y, p.z, headingFor(-p.x, -p.z));
        say(`${DISASTER_NAMES[S.d]}! ${DISASTER_TIPS[S.d]}`, 6000);
      }
    } else if (S.ph === 'end' && prev && prev.ph === 'active') {
      disaster?.dispose(); disaster = null; api.meterOff(); local.shake = 0; world.shake = 0; env.waterY = -Infinity;
      if (local.alive) { local.alive = false; local.survived++; say(`You survived the ${DISASTER_NAMES[S.d]}!`, 5000); }
      else if (aliveSet.size === 0) say('Nobody survived this time.', 4000);
      aliveSet.delete(ctx.net.key);
      toLobby();
    } else if (S.ph === 'inter' && (!prev || prev.ph !== 'inter')) {
      env.waterY = -Infinity;
      if (!prev && disaster) { disaster.dispose(); disaster = null; }
    }
  }

  function buildUI(hud) {
    const el = document.createElement('div');
    el.id = 'nds-hud';
    el.innerHTML = '<div id="nds-top"><b id="nds-phase"></b><span id="nds-timer"></span><small id="nds-sub"></small></div><div id="nds-msg"></div><div id="nds-meter" hidden><span id="nds-meter-label"></span><div><i id="nds-meter-fill"></i></div></div>';
    hud.append(el);
    return { phase: el.querySelector('#nds-phase'), timer: el.querySelector('#nds-timer'), sub: el.querySelector('#nds-sub'), msg: el.querySelector('#nds-msg'), meterWrap: el.querySelector('#nds-meter'), meterLabel: el.querySelector('#nds-meter-label'), meterFill: el.querySelector('#nds-meter-fill') };
  }

  const world = {
    group, shake: 0,
    spawnPoint: spawnLobby,
    attach(c) {
      ctx = c;
      ui = buildUI(c.hud);
      round = createRound({
        send: (m) => ctx.net.sendEvent(m),
        isHost: () => { const r = ctx.roster(); return r.length > 0 && r[0].key === ctx.net.key; },
        onTransition,
        aliveCount: () => aliveSet.size,
      });
      toLobby();
      ctx.say('Wait for the round to start. When it begins, survive the disaster!');
    },
    onRoster(list) {
      const keys = new Set(list.map((p) => p.key));
      for (const k of [...aliveSet]) if (!keys.has(k)) aliveSet.delete(k);
    },
    onEvent(k, p) {
      if (!round) return;
      if (p.ev === 's') {
        const r = ctx.roster();
        if (!round.state || (r[0] && r[0].key === k) || p.seq > round.state.seq) round.apply(p, Date.now());
      } else if (p.ev === 'd') aliveSet.delete(k);
    },
    step(s, input, dt) {
      const water = env.waterY;
      const res = step3d(s, input, dt, { boxes, hasGround, groundY: GROUND_Y, waterY: water, pushX: env.pushX, pushZ: env.pushZ, lift: env.lift });
      local.lastStep = res;
      // limites: a ilha ou o lobby
      if (s.x > 100) { const lim = LOBBY.half - PR; s.x = Math.max(LOBBY.x - lim, Math.min(LOBBY.x + lim, s.x)); s.z = Math.max(LOBBY.z - lim, Math.min(LOBBY.z + lim, s.z)); }
      else { const lim = MAP - PR; s.x = Math.max(-lim, Math.min(lim, s.x)); s.z = Math.max(-lim, Math.min(lim, s.z)); }
      return res;
    },
    onFall() { if (local.alive) die('fell'); else toLobby(); },
    onReset() { if (local.alive) { die('you reset your character'); return true; } toLobby(); return true; },
    update(dt, now) {
      if (!round) return;
      const wall = Date.now();
      round.tick(wall);
      env.pushX = env.pushZ = env.lift = 0;
      const S = round.state;
      if (S && S.ph === 'active' && disaster) disaster.update(round.elapsed(wall), dt);
      // caiu num buraco do terremoto
      if (local.alive && ctx.me.state.y < -2) die('fell into a crack');
      // texto do topo
      if (!S) { ui.phase.textContent = 'Connecting...'; ui.timer.textContent = ''; ui.sub.textContent = ''; return; }
      if (S.ph === 'inter') { ui.phase.textContent = 'Intermission'; ui.timer.textContent = fmt(round.remaining(wall)); ui.sub.textContent = `Next round starts soon  •  Survivals: ${local.survived}`; }
      else if (S.ph === 'active') { ui.phase.textContent = DISASTER_NAMES[S.d]; ui.timer.textContent = fmt(round.remaining(wall)); ui.sub.textContent = `Survivors: ${aliveSet.size}  •  ${local.alive ? 'You are alive' : 'You are out'}`; }
      else { ui.phase.textContent = 'Round over'; ui.timer.textContent = ''; ui.sub.textContent = `Survivors: ${aliveSet.size}  •  Survivals: ${local.survived}`; }
    },
    tick(dt) { for (const c of clouds) { c.position.x += dt * 2.5; if (c.position.x > 320) c.position.x = -200; } },
  };
  return world;
}
