// A cidadezinha de "Talk To Others": ruas em cruz, praça com fonte, prédios, casas, parque e árvores.
import * as THREE from 'three';
import { GROUND_Y } from './physics.js';

function rng(seed) {   // gerador de números repetível: todo jogador vê a mesma cidade
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export const WORLD_BOUNDS = 118;

export function buildWorld() {
  const rand = rng(20261121);
  const group = new THREE.Group();
  const colliders = [];
  const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

  // y = parte de baixo da caixa
  const box = (w, h, d, color, x, y, z, parent = group) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), color.isMaterial ? color : lambert(color));
    m.position.set(x, y + h / 2, z);
    parent.add(m);
    return m;
  };
  const cyl = (rt, rb, h, color, x, y, z, seg = 12) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), color.isMaterial ? color : lambert(color));
    m.position.set(x, y + h / 2, z);
    group.add(m);
    return m;
  };

  // ---- chão, ruas, calçadas, praça ----
  const grass = document.createElement('canvas');
  grass.width = grass.height = 64;
  const gx = grass.getContext('2d');
  gx.fillStyle = '#5aa845'; gx.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 90; i++) { gx.fillStyle = rand() > 0.5 ? '#63b24d' : '#519c3e'; gx.fillRect(rand() * 64, rand() * 64, 3, 3); }
  const grassTex = new THREE.CanvasTexture(grass);
  grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;
  grassTex.repeat.set(60, 60);
  grassTex.colorSpace = THREE.SRGBColorSpace;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), lambert(0xffffff, { map: grassTex }));
  ground.rotation.x = -Math.PI / 2;
  group.add(ground);

  const ROAD = 0x3a3d42, WALK = 0xc9c9c4;
  const roadW = 18, half = roadW / 2, walkW = 5;
  const L = 250;
  box(L, 0.04, roadW, ROAD, 0, 0, 0);               // rua leste-oeste
  box(roadW, 0.05, L, ROAD, 0, 0, 0);               // rua norte-sul
  for (const s of [-1, 1]) {
    box(L, GROUND_Y, walkW, WALK, 0, 0, s * (half + walkW / 2));   // calçadas ao longo da rua L-O
    box(walkW, GROUND_Y, L, WALK, s * (half + walkW / 2), 0, 0);   // calçadas ao longo da rua N-S
  }
  // a praça cobre o cruzamento
  const plaza = cyl(26, 26, GROUND_Y + 0.01, 0xd9cfbd, 0, 0, 0, 48);
  plaza.position.y = (GROUND_Y + 0.01) / 2;
  const ring = cyl(26.6, 26.6, GROUND_Y, 0xa9a396, 0, 0, 0, 48);
  ring.position.y = GROUND_Y / 2 - 0.005;

  // marcações brancas (uma malha só)
  const marks = [];
  for (const s of [-1, 1]) {
    for (let i = 0; i < 8; i++) {
      const off = 32 + i * 12;
      marks.push([s * off, 0.06, 0, 5, 0.3]);            // faixa tracejada da rua L-O
      marks.push([0, 0.06, s * off, 0.3, 5]);            // faixa tracejada da rua N-S
    }
    for (let i = -3; i <= 3; i++) {                       // faixas de pedestre
      marks.push([s * 30, 0.07, i * 2.2, 3, 1.2]);
      marks.push([i * 2.2, 0.07, s * 30, 1.2, 3]);
    }
  }
  const markMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.02, 1), lambert(0xf3f3f0), marks.length);
  const dummy = new THREE.Object3D();
  marks.forEach(([x, y, z, w, d], i) => { dummy.position.set(x, y, z); dummy.scale.set(w, 1, d); dummy.updateMatrix(); markMesh.setMatrixAt(i, dummy.matrix); });
  group.add(markMesh);

  // ---- fonte da praça ----
  cyl(7.2, 7.6, 1.4, 0xb8b2a6, 0, 0, 0, 28);
  cyl(6.4, 6.4, 0.1, 0x4aa8e0, 0, 1.15, 0, 28).material.transparent = true;
  cyl(0.9, 1.1, 4.5, 0xb8b2a6, 0, 0, 0, 12);
  cyl(2.6, 0.6, 0.6, 0xb8b2a6, 0, 3.6, 0, 16);
  colliders.push({ x: 0, z: 0, r: 7.8 });

  // ---- prédios ----
  const palette = [0xc96f5a, 0xd9b26f, 0x7b9bc4, 0xa7b5a0, 0xcf8fa0, 0xe0d4b8, 0x8e8aa8];
  function windows(w, h, base) {   // textura com janelas
    const c = document.createElement('canvas');
    c.width = Math.max(64, Math.min(512, Math.round(w * 10)));
    c.height = Math.max(64, Math.min(1024, Math.round(h * 10)));
    const x = c.getContext('2d');
    x.fillStyle = '#' + base.toString(16).padStart(6, '0'); x.fillRect(0, 0, c.width, c.height);
    const cols = Math.max(2, Math.floor(w / 4)), rows = Math.max(2, Math.floor(h / 4.5));
    const cw = c.width / cols, rh = c.height / rows;
    for (let i = 0; i < cols; i++) for (let j = 1; j < rows; j++) {
      x.fillStyle = rand() > 0.35 ? '#ffe9a8' : '#2f4458';
      x.fillRect(i * cw + cw * 0.22, j * rh + rh * 0.2, cw * 0.56, rh * 0.5);
    }
    x.fillStyle = '#3b2a22'; x.fillRect(c.width / 2 - cw * 0.35, c.height - rh * 0.9, cw * 0.7, rh * 0.9);   // porta
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  function building(cx, cz, w, d, h, color) {
    const side = lambert(0xffffff, { map: windows(w, h, color) });
    const roof = lambert(0x55565a);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, roof, roof, side, side]);
    m.position.set(cx, h / 2, cz);
    group.add(m);
    box(w * 0.25, 1.4, d * 0.25, 0x6b6d72, cx + w * 0.2, h, cz - d * 0.15);   // caixa d'água/ar-condicionado no telhado
    colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
  }
  function house(cx, cz, w, d, color) {
    const h = 7;
    box(w, h, d, color, cx, 0, cz);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.78, 4.5, 4), lambert(0x8c3b2e));
    roof.rotation.y = Math.PI / 4;
    roof.position.set(cx, h + 2.25, cz);
    group.add(roof);
    box(1.8, 3.4, 0.2, 0x4a3426, cx, 0, cz + d / 2 + 0.05);
    for (const sx of [-1, 1]) box(1.6, 1.6, 0.2, 0xbfe3f5, cx + sx * (w * 0.28), 3, cz + d / 2 + 0.05);
    colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
  }

  const front = half + walkW + 2;   // distância da rua até a frente dos prédios
  // quadrante (+x,+z) e (-x,+z): prédios altos ao longo das ruas
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const w = 18 + rand() * 8, d = 18 + rand() * 6, h = 16 + rand() * 24;
      building(sx * (34 + i * 28), front + d / 2, w, d, h, palette[Math.floor(rand() * palette.length)]);
    }
  }
  // quadrante (+x,-z): prédios + segunda fileira
  for (let i = 0; i < 4; i++) {
    const w = 18 + rand() * 8, d = 18 + rand() * 6, h = 12 + rand() * 22;
    building(34 + i * 28, -(front + d / 2), w, d, h, palette[Math.floor(rand() * palette.length)]);
  }
  building(front + 11, 56, 20, 20, 30, 0x7b9bc4);
  building(front + 11, 86, 20, 18, 22, 0xcf8fa0);
  // quadrante (-x,-z): casinhas
  for (let i = 0; i < 4; i++) house(-(34 + i * 26), -(front + 8), 12 + rand() * 3, 11, palette[Math.floor(rand() * palette.length)]);
  for (let i = 0; i < 3; i++) house(-(40 + i * 28), -(front + 34), 12, 11, palette[Math.floor(rand() * palette.length)]);

  // ---- parque (lado oeste, ao norte) com lago e árvores ----
  const pond = cyl(10, 10, 0.12, 0x4aa8e0, -64, 0, 62, 32);
  pond.material = lambert(0x4aa8e0);
  cyl(11, 11, 0.1, 0xd8c9a0, -64, 0, 62, 32).position.y = 0.04;
  colliders.push({ x: -64, z: 62, r: 10.5 });

  function tree(x, z, scale = 1) {
    cyl(0.5 * scale, 0.7 * scale, 4 * scale, 0x7a5230, x, 0, z, 8);
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(3.3 * scale, 1), lambert(rand() > 0.5 ? 0x3f9a3c : 0x338a35));
    crown.position.set(x, 6 * scale, z);
    group.add(crown);
    colliders.push({ x, z, r: 0.9 * scale });
  }
  for (let i = 0; i < 26; i++) {   // árvores do parque
    const x = -64 + (rand() - 0.5) * 80, z = 62 + (rand() - 0.5) * 60;
    if (Math.hypot(x + 64, z - 62) < 14) continue;
    if (x > -(front + 4)) continue;
    tree(x, z, 0.9 + rand() * 0.5);
  }
  for (let i = 0; i < 40; i++) {   // árvores espalhadas pelas bordas
    const x = (rand() - 0.5) * 230, z = (rand() - 0.5) * 230;
    if (Math.abs(x) < half + walkW + 3 || Math.abs(z) < half + walkW + 3) continue;   // não nas ruas
    if (colliders.some((c) => (c.r !== undefined ? Math.hypot(x - c.x, z - c.z) < c.r + 5 : x > c.minX - 5 && x < c.maxX + 5 && z > c.minZ - 5 && z < c.maxZ + 5))) continue;
    tree(x, z, 0.9 + rand() * 0.6);
  }
  for (const s of [-1, 1]) for (let i = 0; i < 5; i++) {   // árvores na calçada da praça
    tree(s * (30 + i * 4) * 0 + s * 15, 0, 0);               // (vazio de propósito: mantém a praça livre)
    colliders.pop();
  }

  // ---- postes de luz e bancos ----
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff1b0 });
  function lamp(x, z) {
    cyl(0.22, 0.28, 9, 0x3b3d42, x, 0, z, 8);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8), lampMat);
    bulb.position.set(x, 9.3, z);
    group.add(bulb);
    colliders.push({ x, z, r: 0.4 });
  }
  for (const s of [-1, 1]) for (let i = 0; i < 7; i++) {
    const o = 36 + i * 28;
    lamp(s * o, half + 1.6); lamp(s * o, -(half + 1.6));
    lamp(half + 1.6, s * o); lamp(-(half + 1.6), s * o);
  }
  function bench(x, z, rot) {
    const g = new THREE.Group();
    box(4, 0.3, 1.2, 0x7a5230, 0, 1.1, 0, g);
    box(4, 1.1, 0.25, 0x7a5230, 0, 1.4, -0.5, g);
    box(0.3, 1.1, 1.0, 0x3b3d42, -1.8, 0, 0, g); box(0.3, 1.1, 1.0, 0x3b3d42, 1.8, 0, 0, g);
    g.position.set(x, 0, z); g.rotation.y = rot;
    group.add(g);
    colliders.push({ x, z, r: 1.5 });
  }
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + 0.4; bench(Math.cos(a) * 17, Math.sin(a) * 17, -a + Math.PI / 2); }

  // ---- arbustos e canteiros de flores ----
  const bushMat = [lambert(0x3a8f3a), lambert(0x2f7d33)];
  for (let i = 0, n = 0; i < 300 && n < 60; i++) {
    const x = (rand() - 0.5) * 220, z = (rand() - 0.5) * 220;
    if (Math.abs(x) < half + walkW + 2 || Math.abs(z) < half + walkW + 2 || Math.hypot(x, z) < 32) continue;
    if (colliders.some((c) => (c.r !== undefined ? Math.hypot(x - c.x, z - c.z) < c.r + 3 : x > c.minX - 3 && x < c.maxX + 3 && z > c.minZ - 3 && z < c.maxZ + 3))) continue;
    n++;
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(1.3 + rand() * 0.6, 1), bushMat[n % 2]);
    b.position.set(x, 1, z); group.add(b);
  }
  const petals = [0xff5a8a, 0xffd24a, 0xffffff, 0xb36bff, 0xff8a3d];
  for (let k = 0; k < 28; k++) {   // anel de flores em volta da fonte
    const a2 = (k / 28) * Math.PI * 2, rr = 10.5;
    box(0.9, 0.9, 0.9, 0x2f7d33, Math.cos(a2) * rr, 0, Math.sin(a2) * rr);
    box(0.7, 0.7, 0.7, petals[k % petals.length], Math.cos(a2) * rr, 0.9, Math.sin(a2) * rr);
  }

  // ---- céu e nuvens ----
  const sky = new THREE.Mesh(new THREE.SphereGeometry(450, 24, 12), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x4a97e8) }, bottom: { value: new THREE.Color(0xcfe8ff) } },
    vertexShader: 'varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying float h; void main(){ gl_FragColor = vec4(mix(bottom, top, clamp(h*1.6, 0.0, 1.0)), 1.0); }',
  }));
  group.add(sky);
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92, fog: false });
  const clouds = [];
  for (let i = 0; i < 9; i++) {
    const c = new THREE.Group();
    for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(16 + rand() * 14, 5, 10 + rand() * 6), cloudMat); b.position.set(k * 10 - 15, rand() * 3, rand() * 6); c.add(b); }
    c.position.set((rand() - 0.5) * 420, 90 + rand() * 40, (rand() - 0.5) * 420);
    group.add(c); clouds.push(c);
  }

  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(60, 120, 40);
  group.add(sun, new THREE.HemisphereLight(0xcfe8ff, 0x7a8f6a, 1.1));

  const spawnPoint = () => {   // ao redor da fonte, longe dos bancos
    const a = rand() * Math.PI * 2, r = 11 + rand() * 6;
    return { x: Math.cos(a) * r, z: Math.sin(a) * r };
  };
  return {
    group, colliders, spawnPoint, bounds: WORLD_BOUNDS,
    tick(dt) { for (const c of clouds) { c.position.x += dt * 2; if (c.position.x > 230) c.position.x = -230; } },
  };
}
