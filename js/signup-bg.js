// Fundo do cadastro: uma ilha de blocos 3D (criada por código, original do Owoxy) com a câmera girando devagar.
import * as THREE from 'three';

const canvas = document.getElementById('bg');
try {
  // números aleatórios com semente fixa: a ilha é sempre a mesma
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8fc8ff);
  scene.fog = new THREE.Fog(0x8fc8ff, 45, 110);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x4a7a3a, 1.6));
  const sun = new THREE.DirectionalLight(0xfff1cc, 2.2);
  sun.position.set(30, 40, 20);
  scene.add(sun);

  // água
  const water = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: 0x1f6fe0 }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.4;
  scene.add(water);

  // terreno em colunas de blocos
  const N = 34, half = N / 2;
  const heightAt = (x, z) => {
    const d = Math.hypot(x - half, z - half) / half;
    const bumps = Math.sin(x * 0.45) * Math.cos(z * 0.38) * 1.2 + Math.sin((x + z) * 0.2) * 1.5;
    return Math.round(4.2 - d * 6 + bumps);
  };
  const cubes = [];
  const heights = [];
  for (let x = 0; x < N; x++) {
    heights[x] = [];
    for (let z = 0; z < N; z++) {
      const h = heightAt(x, z);
      heights[x][z] = h;
      for (let y = 0; y < h; y++) cubes.push([x - half, y, z - half, y, h]);
    }
  }
  const box = new THREE.BoxGeometry(1, 1, 1);
  const terrain = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial(), cubes.length);
  const m = new THREE.Matrix4();
  const col = new THREE.Color();
  cubes.forEach(([x, y, z, level, top], i) => {
    m.setPosition(x, y, z);
    terrain.setMatrixAt(i, m);
    const isTop = level === top - 1;
    col.set(level <= 0 ? 0xe8d28b : level >= 5 ? 0x8a8f94 : isTop ? 0x4caf3a : 0x7a5a3a);
    terrain.setColorAt(i, col);
  });
  scene.add(terrain);

  // casas e árvores nos blocos de grama
  const mats = new Map();
  const mat = (c) => { if (!mats.has(c)) mats.set(c, new THREE.MeshLambertMaterial({ color: c })); return mats.get(c); };
  const add = (w, h, d, c, x, y, z) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
    mesh.position.set(x, y, z);
    scene.add(mesh);
  };
  const houseColors = [0xe8b04a, 0xd9534f, 0xf2f2f2, 0x5bc0de, 0xe67e22, 0xb36bd1];
  for (let x = 1; x < N - 1; x++) {
    for (let z = 1; z < N - 1; z++) {
      const h = heights[x][z];
      if (h < 2 || h > 4) continue;
      const px = x - half, pz = z - half, r = rand();
      if (r < 0.06) {
        const c = houseColors[Math.floor(rand() * houseColors.length)];
        add(1.6, 1.2, 1.6, c, px, h + 0.1, pz);
        add(1.9, 0.5, 1.9, 0x8b3a2e, px, h + 0.95, pz);
      } else if (r < 0.2) {
        add(0.4, 1.2, 0.4, 0x6b4a2b, px, h + 0.1, pz);
        add(1.3, 1.3, 1.3, 0x2f8f3a, px, h + 1.2, pz);
      }
    }
  }

  // ponte vermelha
  for (let i = -18; i <= 18; i++) {
    const arch = Math.max(0, 5 - (i * i) / 12);
    add(1, 0.4, 3, 0xc4281c, i + 22, 4 + 0.2, -half + 4 + 0 * arch);
  }
  add(1, 9, 1, 0xc4281c, 22 - 8, 7.5, -half + 2.4); add(1, 9, 1, 0xc4281c, 22 + 8, 7.5, -half + 2.4);
  add(1, 9, 1, 0xc4281c, 22 - 8, 7.5, -half + 5.6); add(1, 9, 1, 0xc4281c, 22 + 8, 7.5, -half + 5.6);
  add(17, 0.5, 0.5, 0xc4281c, 22, 11.5, -half + 2.4); add(17, 0.5, 0.5, 0xc4281c, 22, 11.5, -half + 5.6);

  // farol
  add(1.4, 3, 1.4, 0xf2f2f2, 4, 6.5, 2); add(1.4, 1, 1.4, 0xc4281c, 4, 8.5, 2); add(1.8, 0.6, 1.8, 0x333333, 4, 9.3, 2);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 300);
  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  let t = 0;
  const loop = () => {
    t += 0.0018;
    camera.position.set(Math.cos(t) * 38, 20 + Math.sin(t * 2) * 2, Math.sin(t) * 38);
    camera.lookAt(0, 3, 0);
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  };
  loop();
} catch (err) {
  console.error('Fundo 3D indisponível:', err);
  canvas.style.background = 'linear-gradient(#8fc8ff, #1f6fe0)';
}
