// Mostra o noob 3D (glTF) num <canvas>. Usa Three.js via importmap (ver os .html).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CONFIG } from './config.js';

// O rosto do modelo aponta para -X; girar 90° em Y deixa ele virado para a câmera (+Z).
const FACE_ROTATION_Y = Math.PI / 2;

// Cores originais da textura do noob; é por elas que achamos cada parte para recolorir.
const TEXTURE_KEYS = {
  skin: [245, 205, 48],
  torso: [13, 105, 172],
  legs: [164, 189, 71],
};
const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

// Prepara a textura para poder ser recolorida (a textura é de cores chapadas, então é só trocar os pixels).
function makeRecolorer(material) {
  const image = material.map.image;
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = data.data;

  // guarda quais pixels pertencem a cada parte
  const regions = { skin: [], torso: [], legs: [] };
  for (let i = 0; i < px.length; i += 4) {
    for (const [part, [r, g, b]] of Object.entries(TEXTURE_KEYS)) {
      if (Math.abs(px[i] - r) + Math.abs(px[i + 1] - g) + Math.abs(px[i + 2] - b) < 30) {
        regions[part].push(i);
        break;
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.flipY = material.map.flipY;          // glTF usa flipY = false
  texture.colorSpace = material.map.colorSpace;
  texture.wrapS = material.map.wrapS;
  texture.wrapT = material.map.wrapT;
  texture.anisotropy = 4;
  material.map = texture;

  return (colors) => {
    for (const [part, hex] of Object.entries(colors || {})) {
      if (!regions[part] || !/^#[0-9a-f]{6}$/i.test(hex)) continue;
      const [r, g, b] = hexToRgb(hex);
      for (const i of regions[part]) { px[i] = r; px[i + 1] = g; px[i + 2] = b; }
    }
    ctx.putImageData(data, 0, 0);
    texture.needsUpdate = true;
  };
}

/**
 * view: 'head' (foto de perfil) ou 'full' (corpo inteiro)
 * opções: colors, spin (gira no corpo inteiro)
 * Retorna { setColors(colors), setSpin(bool), render() }
 */
export async function mountAvatar(canvas, { view = 'head', modelUrl = CONFIG.defaultAvatar, colors = null, spin = true } = {}) {
  const w = canvas.clientWidth || 200;
  const h = canvas.clientHeight || 200;
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h, false);

  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 1.8);
  sun.position.set(2, 4, 5);
  scene.add(sun);

  const gltf = await new GLTFLoader().loadAsync(modelUrl || CONFIG.defaultAvatar);
  const pivot = new THREE.Group();
  pivot.add(gltf.scene);
  scene.add(pivot);

  // O modelo original não está centrado na origem; sem isto ele "orbita" em vez de girar no próprio eixo.
  pivot.updateMatrixWorld(true);
  const raw = new THREE.Box3().setFromObject(gltf.scene).getCenter(new THREE.Vector3());
  gltf.scene.position.x -= raw.x;
  gltf.scene.position.z -= raw.z;
  pivot.rotation.y = FACE_ROTATION_Y;

  let recolor = null;
  gltf.scene.traverse((o) => {
    if (o.isMesh && o.material?.map?.image && !recolor) recolor = makeRecolorer(o.material);
  });
  const setColors = (c) => { if (recolor) recolor(c); };
  if (colors) setColors(colors);

  pivot.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(pivot);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const camera = new THREE.PerspectiveCamera(25, w / h, 0.1, 100);
  const fovTan = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  let target, dist;
  if (view === 'head') {
    target = new THREE.Vector3(center.x, box.max.y - size.y * 0.13, center.z);
    dist = (size.y * 0.3) / fovTan;
  } else {
    target = center.clone();
    dist = (size.y * 1.12) / fovTan;
  }
  camera.position.set(target.x, target.y, target.z + dist);
  camera.lookAt(target);

  const render = () => renderer.render(scene, camera);
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
  } else {
    render();
  }

  // on = giro automático (visão "3D"); off = parado de frente (visão "2D")
  const setSpin = (on) => {
    spinning = on;
    flat = !on;
    if (!on) pivot.rotation.y = FACE_ROTATION_Y;
    if (view !== 'full') render();
  };

  return { setColors, setSpin, render };
}
