// Noob 3D (glTF) em <canvas>: cores do corpo, camisa, calça e acessórios (UGC). Usa Three.js via importmap (ver os .html).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { CONFIG } from './config.js';
import { CLOTHING_MAP } from './clothing-map.js';

// O rosto do modelo aponta para -X; girar 90° em Y deixa ele virado para a câmera (+Z).
const FACE_ROTATION_Y = Math.PI / 2;
// Foto de perfil ("headshot"): o boneco fica virado ~30° (de lado), como na foto de perfil do Roblox.
// Para virar para o outro lado, troque o sinal.
const HEAD_TURN = -0.5;

// Cores originais da textura do noob; é por elas que achamos cada parte para recolorir.
const TEXTURE_KEYS = { skin: [245, 205, 48], torso: [13, 105, 172], legs: [164, 189, 71] };
const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

// Onde cada tipo de acessório "encaixa" (modelo já centralizado; frente = -X; 1 unidade = 1 stud).
// O desenho do acessório deve ter a origem (0,0,0) no ponto de encaixe, Y para cima e a frente voltada para -Z (como no Roblox).
const ATTACH = {
  hat: [0, 2.99, 0],
  hair: [0, 2.99, 0],
  face: [-0.42, 2.39, 0],
  back: [0.5, 0.89, 0],
};

// ---------- carregamento com cache ----------
const imageCache = new Map();
export function loadImage(url) {
  if (!imageCache.has(url)) {
    imageCache.set(url, new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Could not load image ${url}`));
      img.src = url;
    }));
  }
  return imageCache.get(url);
}
const modelCache = new Map();
const loadModel = (url) => {
  if (!modelCache.has(url)) modelCache.set(url, new GLTFLoader().loadAsync(url));
  return modelCache.get(url);
};

// ---------- textura do corpo (cores + roupas) ----------
function makeBodyTexture(material) {
  const image = material.map.image;
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  const base = ctx.getImageData(0, 0, canvas.width, canvas.height);

  // pixels de cada parte (pele, camisa, calça) para recolorir depois
  const regions = { skin: [], torso: [], legs: [] };
  const px = base.data;
  for (let i = 0; i < px.length; i += 4) {
    for (const [part, [r, g, b]] of Object.entries(TEXTURE_KEYS)) {
      if (Math.abs(px[i] - r) + Math.abs(px[i + 1] - g) + Math.abs(px[i + 2] - b) < 30) { regions[part].push(i); break; }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.flipY = material.map.flipY;
  texture.colorSpace = material.map.colorSpace;
  texture.wrapS = material.map.wrapS;
  texture.wrapT = material.map.wrapT;
  texture.anisotropy = 4;
  material.map = texture;

  const state = { colors: {}, shirt: null, pants: null };

  // joga cada painel do molde 585x559 na face certa do corpo
  const paint = (img, parts) => {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    for (const part of parts) {
      for (const face of Object.values(CLOTHING_MAP[part])) {
        const [sx, sy, sw, sh] = face.src;
        ctx.save();
        ctx.setTransform(...face.m);
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
        ctx.restore();
      }
    }
  };

  const redraw = () => {
    const work = new ImageData(new Uint8ClampedArray(base.data), base.width, base.height);
    for (const [part, hex] of Object.entries(state.colors)) {
      if (!regions[part] || !/^#[0-9a-f]{6}$/i.test(hex)) continue;
      const [r, g, b] = hexToRgb(hex);
      for (const i of regions[part]) { work.data[i] = r; work.data[i + 1] = g; work.data[i + 2] = b; }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.putImageData(work, 0, 0);
    if (state.shirt) paint(state.shirt, ['torso', 'rarm', 'larm']);
    if (state.pants) paint(state.pants, ['torso', 'rleg', 'lleg']);
    texture.needsUpdate = true;
  };

  return {
    setColors(colors) { state.colors = { ...state.colors, ...(colors || {}) }; redraw(); },
    setClothes({ shirt, pants }) { state.shirt = shirt || null; state.pants = pants || null; redraw(); },
  };
}

/**
 * Cria o palco 3D de um avatar.
 * view: 'head' (foto de perfil), 'bust' (cabeça e ombros, para acessórios) ou 'full' (corpo inteiro)
 */
export async function createStage(canvas, { view = 'full', modelUrl = CONFIG.defaultAvatar } = {}) {
  const w = canvas.clientWidth || canvas.width || 200;
  const h = canvas.clientHeight || canvas.height || 200;
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h, false);

  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 1.8);
  sun.position.set(2, 4, 5);
  scene.add(sun);

  // cada palco usa a sua própria cópia do modelo (as texturas são individuais)
  const gltf = await loadModel(modelUrl || CONFIG.defaultAvatar);
  const model = gltf.scene.clone(true);
  const pivot = new THREE.Group();
  pivot.add(model);
  scene.add(pivot);

  // O modelo original não está centrado na origem; sem isto ele "orbita" em vez de girar no próprio eixo.
  pivot.updateMatrixWorld(true);
  const raw = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());
  model.position.x -= raw.x;
  model.position.z -= raw.z;
  pivot.rotation.y = FACE_ROTATION_Y;

  let body = null;
  model.traverse((o) => {
    if (o.isMesh && o.material?.map?.image && !body) {
      o.material = o.material.clone();
      body = makeBodyTexture(o.material);
    }
  });

  pivot.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(pivot);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const camera = new THREE.PerspectiveCamera(25, w / h, 0.1, 100);
  const fovTan = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  // [altura que cabe no quadro, quanto abaixo do topo fica o centro do quadro]
  const FRAMES = { head: [0.36, 0.175], bust: [0.5, 0.2] };
  const setView = (v) => {
    let target, dist;
    if (FRAMES[v]) {
      target = new THREE.Vector3(center.x, box.max.y - size.y * FRAMES[v][1], center.z);
      dist = (size.y * FRAMES[v][0]) / fovTan;
    } else {
      target = center.clone();
      dist = (size.y * 1.12) / fovTan;
    }
    camera.position.set(target.x, target.y, target.z + dist);
    camera.lookAt(target);
    pivot.rotation.y = FACE_ROTATION_Y - (FRAMES[v] ? HEAD_TURN : 0);   // cabeça/busto: de lado; corpo inteiro: de frente
  };
  setView(view);

  const render = () => renderer.render(scene, camera);

  // ---- acessórios (UGC) ----
  const objLoader = new OBJLoader();
  let accessories = [];
  const setAccessories = async (list) => {
    accessories.forEach((g) => pivot.remove(g));
    accessories = [];
    const built = await Promise.all((list || []).map(async (a) => {
      const [obj, tex] = await Promise.all([
        objLoader.loadAsync(a.meshUrl),
        a.texUrl ? loadImage(a.texUrl).catch(() => null) : null,
      ]);
      let map = null;
      if (tex) { map = new THREE.Texture(tex); map.colorSpace = THREE.SRGBColorSpace; map.needsUpdate = true; }
      obj.traverse((o) => {
        if (o.isMesh) o.material = new THREE.MeshStandardMaterial({ map, color: map ? 0xffffff : 0xcccccc, roughness: 0.7, metalness: 0, side: THREE.DoubleSide });
      });
      const holder = new THREE.Group();
      holder.add(obj);
      holder.rotation.y = Math.PI / 2;                       // frente do acessório (-Z) -> frente do modelo (-X)
      holder.position.set(...(ATTACH[a.type] || ATTACH.hat));
      return holder;
    }));
    built.forEach((g) => { pivot.add(g); accessories.push(g); });
  };

  /**
   * Veste o avatar. look = { colors, shirt: url, pants: url, accessories: [{ type, meshUrl, texUrl }] }
   * (qualquer campo pode faltar; o que faltar fica "sem roupa")
   */
  const setLook = async (look = {}) => {
    const [shirt, pants] = await Promise.all([
      look.shirt ? loadImage(look.shirt).catch(() => null) : null,
      look.pants ? loadImage(look.pants).catch(() => null) : null,
    ]);
    if (body) {
      body.setColors({ ...CONFIG.defaultColors, ...(look.colors || {}) });
      body.setClothes({ shirt, pants });
    }
    await setAccessories(look.accessories).catch((err) => console.error('Acessório não carregou:', err));
  };

  const resize = (rw, rh) => { renderer.setSize(rw, rh, false); camera.aspect = rw / rh; camera.updateProjectionMatrix(); };

  return { pivot, camera, renderer, canvas, render, setView, resize, setLook, setColors: (c) => body?.setColors(c) };
}

/**
 * Mostra o avatar num canvas (com giro automático no corpo inteiro, arrastar para girar).
 * Retorna { setColors, setLook, setSpin, render }
 */
export async function mountAvatar(canvas, { view = 'head', modelUrl = CONFIG.defaultAvatar, colors = null, look = null, spin = true } = {}) {
  const stage = await createStage(canvas, { view, modelUrl });
  const { pivot, render } = stage;
  if (colors) stage.setColors(colors);
  if (look) await stage.setLook({ colors, ...look });
  render();

  let spinning = view === 'full' && spin;
  let flat = false; // visão "2D": parado, de frente
  if (view === 'full') {
    const loop = () => {
      if (spinning) pivot.rotation.y += 0.01;
      render();
      requestAnimationFrame(loop);
    };
    loop();

    // Arrastar com o mouse/dedo gira o boneco (e para o giro automático)
    let dragX = null;
    canvas.style.touchAction = 'pan-y';
    canvas.style.cursor = 'grab';
    canvas.addEventListener('pointerdown', (e) => { if (flat) return; dragX = e.clientX; spinning = false; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; });
    canvas.addEventListener('pointermove', (e) => { if (dragX === null) return; pivot.rotation.y += (e.clientX - dragX) * 0.012; dragX = e.clientX; });
    const end = () => { dragX = null; canvas.style.cursor = 'grab'; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  // on = giro automático (visão "3D"); off = parado de frente (visão "2D")
  const setSpin = (on) => {
    spinning = on;
    flat = !on;
    if (!on) pivot.rotation.y = FACE_ROTATION_Y;
    if (view !== 'full') render();
  };

  const setLook = async (l) => { await stage.setLook(l); if (view !== 'full') render(); };
  const setColors = (c) => { stage.setColors(c); if (view !== 'full') render(); };
  return { setColors, setLook, setSpin, render, stage };
}

// ---------- miniaturas (um único canvas 3D para gerar várias imagens) ----------
const thumbCache = new Map();
let thumbStage = null;
let thumbQueue = Promise.resolve();

/** Devolve (promessa de) um dataURL com o noob vestindo o look. view: 'full' | 'head' | 'bust' */
export function renderThumbnail(look, { view = 'full', key = null } = {}) {
  const cacheKey = key ? `${key}|${view}` : null;
  if (cacheKey && thumbCache.has(cacheKey)) return thumbCache.get(cacheKey);
  const job = thumbQueue.then(async () => {
    if (!thumbStage) {
      const c = document.createElement('canvas');
      c.width = 240; c.height = 300;
      thumbStage = await createStage(c, { view });
    }
    thumbStage.setView(view);
    if (view === 'head') thumbStage.resize(256, 256); else thumbStage.resize(240, 300);   // foto de perfil é quadrada (cabe no círculo)
    await thumbStage.setLook(look);
    thumbStage.render();
    return thumbStage.canvas.toDataURL('image/png');
  });
  thumbQueue = job.catch(() => {});
  if (cacheKey) thumbCache.set(cacheKey, job);
  return job;
}
