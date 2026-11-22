// Os 8 desastres do Natural Disaster Survival. Tudo é calculado a partir do tempo t (segundos desde o início) e da semente da rodada,
// então todos os jogadores veem o mesmo desastre. Só o jogador local decide se ele mesmo morreu.
import * as THREE from 'three';

export const DISASTER_NAMES = ['Earthquake', 'Meteor Shower', 'Tornado', 'Flood', 'Volcanic Eruption', 'Blizzard', 'Acid Rain', 'Thunderstorm'];
export const DISASTER_TIPS = [
  'The ground is cracking. Stay away from the cracks!',
  'Meteors are falling. Watch the red circles!',
  'A tornado is coming. Run away from it!',
  'The water is rising. Climb to the highest place!',
  'The volcano erupted. Lava rises and fireballs fly. Go high!',
  'A blizzard! Stay under a roof to keep warm.',
  'Acid rain! Stay under a roof.',
  'A thunderstorm. Lightning will strike the yellow circles!',
];

const MAP = 80;
const basic = (color, extra = {}) => new THREE.MeshBasicMaterial({ color, ...extra });

// ---------- ataques com aviso (meteoros, raios, bolas de lava) ----------
function strikes(api, o) {
  const rnd = api.rng;
  const list = [];
  for (let i = 0; i < o.count; i++) {
    list.push({ t: o.start + i * o.gap + rnd() * o.jit, x: (rnd() + rnd() - 1) * o.spread, z: (rnd() + rnd() - 1) * o.spread, m: null, hit: false });
  }
  const fx = new THREE.Group();
  api.group.add(fx);
  const geo = { ring: new THREE.RingGeometry(o.radius * 0.8, o.radius, 40), disc: new THREE.CircleGeometry(o.radius * 0.7, 24), ball: new THREE.SphereGeometry(1, 12, 8), bolt: new THREE.BoxGeometry(0.8, 100, 0.8) };
  const mat = { ring: basic(o.color, { transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }), scorch: basic(0x1b1b1b, { transparent: true, opacity: 0.55, depthWrite: false }), proj: basic(o.color), tail: basic(o.tail || o.color, { transparent: true, opacity: 0.7 }), flash: basic(0xffffff, { transparent: true, opacity: 0.9 }), bolt: basic(0xffffff) };
  const v = new THREE.Vector3(), from = new THREE.Vector3(), to = new THREE.Vector3();

  function make(s) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(geo.ring, mat.ring); ring.rotation.x = -Math.PI / 2; ring.position.set(s.x, 0.18, s.z); g.add(ring);
    const scorch = new THREE.Mesh(geo.disc, mat.scorch); scorch.rotation.x = -Math.PI / 2; scorch.position.set(s.x, 0.14, s.z); scorch.visible = false; g.add(scorch);
    const flash = new THREE.Mesh(geo.ball, mat.flash); flash.position.set(s.x, 1, s.z); flash.visible = false; g.add(flash);
    let proj = null, bolt = null;
    if (o.kind === 'bolt') { bolt = new THREE.Mesh(geo.bolt, mat.bolt); bolt.position.set(s.x, 50, s.z); bolt.visible = false; g.add(bolt); }
    else {
      proj = new THREE.Group();
      proj.add(new THREE.Mesh(geo.ball, mat.proj));
      for (let k = 1; k <= 4; k++) { const tl = new THREE.Mesh(geo.ball, mat.tail); proj.add(tl); }
      proj.children[0].scale.setScalar(1.8);
      g.add(proj);
    }
    fx.add(g);
    return { g, ring, scorch, flash, proj, bolt };
  }

  return {
    update(t) {
      for (const s of list) {
        const d = t - s.t;                       // < 0: ainda no ar / aviso; >= 0: já bateu
        if (d < -o.lead || d > 7) { if (s.m) { fx.remove(s.m.g); s.m = null; } continue; }
        if (!s.m) s.m = make(s);
        const m = s.m;
        if (d < 0) {
          m.ring.visible = true; mat.ring.opacity = 0.55 + 0.3 * Math.sin(t * 12);
          if (m.proj) {
            const u = 1 + d / o.fly;             // 0 -> 1 durante o voo
            if (u <= 0) m.proj.visible = false;
            else {
              m.proj.visible = true;
              to.set(s.x, 0, s.z);
              if (o.kind === 'arc') from.set(o.origin[0], o.origin[1], o.origin[2]); else from.set(s.x + 70, 160, s.z - 50);
              v.copy(from).lerp(to, u);
              if (o.kind === 'arc') v.y += Math.sin(Math.PI * u) * 55;
              m.proj.position.copy(v);
              const dir = to.clone().sub(from).normalize();
              for (let k = 1; k <= 4; k++) { const tl = m.proj.children[k]; tl.position.copy(dir).multiplyScalar(-k * 2.6); tl.scale.setScalar(1.5 - k * 0.28); }
            }
          }
        } else {
          m.ring.visible = false;
          if (m.proj) m.proj.visible = false;
          if (!s.hit) {
            s.hit = true;
            if (d < 0.5 && api.alive() && Math.hypot(api.me().x - s.x, api.me().z - s.z) < o.radius) api.kill(o.reason);
          }
          m.scorch.visible = o.kind !== 'bolt';
          if (m.bolt) m.bolt.visible = d < 0.25;
          const k = Math.min(1, d / 0.5);
          m.flash.visible = k < 1;
          m.flash.scale.setScalar(o.radius * (0.4 + k));
        }
      }
    },
    dispose() { api.group.remove(fx); Object.values(geo).forEach((g) => g.dispose()); Object.values(mat).forEach((x) => x.dispose()); },
  };
}

// ---------- neve / chuva em volta da câmera ----------
function precip(api, kind) {
  const snow = kind === 'snow';
  const N = snow ? 800 : 700;
  const pos = new Float32Array(N * (snow ? 3 : 6));
  const drops = Array.from({ length: N }, () => ({ x: (Math.random() - 0.5) * 80, y: Math.random() * 90, z: (Math.random() - 0.5) * 80 }));
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const obj = snow
    ? new THREE.Points(geom, new THREE.PointsMaterial({ color: 0xffffff, size: 0.8, transparent: true, opacity: 0.9, depthWrite: false }))
    : new THREE.LineSegments(geom, new THREE.LineBasicMaterial({ color: 0x9cff6a, transparent: true, opacity: 0.55, depthWrite: false }));
  obj.frustumCulled = false;
  api.group.add(obj);
  let first = true;
  return {
    update(t, dt) {
      const cam = api.camera().position;
      for (let i = 0; i < N; i++) {
        const d = drops[i];
        if (first) { d.x += cam.x; d.z += cam.z; }
        d.y -= (snow ? 9 : 70) * dt;
        if (snow) d.x += Math.sin(t * 0.8 + i) * 2 * dt + 6 * dt;
        if (d.y < 0) d.y += 90;
        if (d.x - cam.x > 40) d.x -= 80; else if (d.x - cam.x < -40) d.x += 80;
        if (d.z - cam.z > 40) d.z -= 80; else if (d.z - cam.z < -40) d.z += 80;
        if (snow) { pos[i * 3] = d.x; pos[i * 3 + 1] = d.y; pos[i * 3 + 2] = d.z; }
        else { pos[i * 6] = d.x; pos[i * 6 + 1] = d.y; pos[i * 6 + 2] = d.z; pos[i * 6 + 3] = d.x + 0.2; pos[i * 6 + 4] = d.y + 2.2; pos[i * 6 + 5] = d.z; }
      }
      first = false;
      geom.attributes.position.needsUpdate = true;
    },
    dispose() { api.group.remove(obj); geom.dispose(); obj.material.dispose(); },
  };
}

// muda a cor da névoa/céu durante o desastre
function tint(api, color, near, far) {
  const scene = api.scene();
  const fog = scene.fog, bg = scene.background && scene.background.clone();
  const old = fog ? { c: fog.color.clone(), n: fog.near, f: fog.far } : null;
  if (fog) { fog.color.set(color); fog.near = near; fog.far = far; }
  if (bg) scene.background.set(color);
  return () => { if (fog && old) { fog.color.copy(old.c); fog.near = old.n; fog.far = old.f; } if (bg) scene.background.copy(bg); };
}

// ---------- os desastres ----------
const factories = [

  // 0. Terremoto: o chão rachando abre buracos
  (api) => {
    const holes = [];
    const n = 15;
    for (let i = 0; i < n; i++) {
      const w = 7 + api.rng() * 8, d = 7 + api.rng() * 8;
      const cx = (api.rng() * 2 - 1) * (MAP - 12), cz = (api.rng() * 2 - 1) * (MAP - 12);
      holes.push({ at: 5 + i * 3.2, h: api.addHole({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 }) });
    }
    return {
      update(t) {
        for (const x of holes) api.setHole(x.h, t >= x.at, Math.min(1, Math.max(0, (t - x.at) / 0.8)));
        api.setShake(t < 3 ? t / 3 * 0.7 : t > 51 ? Math.max(0, (55 - t) / 4) * 0.7 : 0.7 + Math.sin(t * 2) * 0.2);
      },
      dispose() { api.setShake(0); holes.forEach((x) => api.removeHole(x.h)); },
    };
  },

  // 1. Chuva de meteoros
  (api) => {
    const s = strikes(api, { count: 110, start: 4, gap: 0.5, jit: 0.4, lead: 2.4, fly: 2.4, radius: 7, kind: 'fall', color: 0xff6a1a, tail: 0xffc04d, spread: 72, reason: 'hit by a meteor' });
    return { update: (t) => s.update(t), dispose: () => s.dispose() };
  },

  // 2. Tornado
  (api) => {
    const a = api.rng() * 6.28, b = api.rng() * 6.28;
    const g = new THREE.Group();
    const mat = basic(0x8a8e94, { transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
    const rings = [];
    for (let k = 0; k < 8; k++) {
      const r0 = 2.5 + k * 1.9, r1 = 2.5 + (k + 1) * 1.9;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, 7, 18, 1, true), mat);
      m.position.y = 3.5 + k * 7; g.add(m); rings.push(m);
    }
    api.group.add(g);
    const at = (t) => [58 * Math.sin(0.1 * t + a), 58 * Math.sin(0.075 * t + 1.3 + b)];
    return {
      update(t) {
        const [cx, cz] = at(t);
        g.position.set(cx, 0, cz);
        rings.forEach((m, k) => { m.rotation.y = t * (3 + k * 0.4); });
        if (!api.alive()) return;
        const me = api.me(), dx = cx - me.x, dz = cz - me.z, d = Math.hypot(dx, dz) || 0.001;
        const R = 28;
        if (d < R) {
          const s = 1 - d / R;
          api.env.pushX += (dx / d) * 22 * s - (dz / d) * 12 * s;     // puxa para o centro e gira
          api.env.pushZ += (dz / d) * 22 * s + (dx / d) * 12 * s;
          if (d < 10) api.env.lift = Math.max(api.env.lift, 6 + 18 * (1 - d / 10));
        }
        if (d < 3 || me.y > 24) api.kill('sucked into the tornado');
      },
      dispose() { api.group.remove(g); mat.dispose(); rings.forEach((m) => m.geometry.dispose()); },
    };
  },

  // 3. Enchente
  (api) => {
    let air = 1;
    return {
      update(t, dt) {
        const level = -2.5 + Math.min(t, 58) / 58 * 28;
        api.setWater(level);
        api.env.waterY = api.alive() ? level : -Infinity;
        if (!api.alive()) return;
        air = api.headUnder() ? air - dt / 7 : Math.min(1, air + dt * 0.8);
        api.meter('Air', air, '#4aa8e0', air < 1);
        if (air <= 0) api.kill('drowned');
      },
      dispose() { api.setWater(null); api.env.waterY = -Infinity; api.meterOff(); },
    };
  },

  // 4. Vulcão: lava sobe e bolas de fogo voam
  (api) => {
    const s = strikes(api, { count: 70, start: 7, gap: 0.8, jit: 0.5, lead: 3.2, fly: 3.2, radius: 6.5, kind: 'arc', origin: api.volcano, color: 0xff4a00, tail: 0xffa000, spread: 70, reason: 'hit by a fireball' });
    return {
      update(t, dt) {
        const lava = -10 + Math.min(1, Math.max(0, (t - 6) / 52)) * 24;
        api.setLava(lava);
        s.update(t, dt);
        if (api.alive() && api.me().y < lava - 0.1) api.kill('burned in the lava');
      },
      dispose() { api.setLava(null); s.dispose(); },
    };
  },

  // 5. Nevasca: fique debaixo de um teto para se aquecer
  (api) => {
    const p = precip(api, 'snow'), restore = tint(api, 0xdfe8f2, 20, 130);
    let warm = 1;
    return {
      update(t, dt) {
        p.update(t, dt);
        if (!api.alive()) return;
        warm = api.covered() ? Math.min(1, warm + dt * 0.25) : warm - dt / 24;
        api.meter('Warmth', warm, '#8fd0ff', warm < 0.35);
        if (warm <= 0) api.kill('froze to death');
      },
      dispose() { p.dispose(); restore(); api.meterOff(); },
    };
  },

  // 6. Chuva ácida
  (api) => {
    const p = precip(api, 'rain'), restore = tint(api, 0x9fb88a, 30, 160);
    let hp = 1;
    return {
      update(t, dt) {
        p.update(t, dt);
        if (!api.alive()) return;
        hp = api.covered() ? Math.min(1, hp + dt * 0.12) : hp - dt / 20;
        api.meter('Health', hp, '#8cff5a', hp < 0.35);
        if (hp <= 0) api.kill('dissolved by acid rain');
      },
      dispose() { p.dispose(); restore(); api.meterOff(); },
    };
  },

  // 7. Tempestade com raios
  (api) => {
    const s = strikes(api, { count: 100, start: 4, gap: 0.55, jit: 0.4, lead: 1.5, fly: 0, radius: 5, kind: 'bolt', color: 0xffe14a, spread: 72, reason: 'struck by lightning' });
    const p = precip(api, 'rain'), restore = tint(api, 0x6c7684, 25, 150);
    return { update: (t, dt) => { s.update(t); p.update(t, dt); }, dispose: () => { s.dispose(); p.dispose(); restore(); } };
  },
];

export function startDisaster(index, api) { return factories[index](api); }
