// Mostra o noob 3D (glTF) num <canvas>. Usa Three.js via importmap (ver os .html).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CONFIG } from './config.js';

// O rosto do modelo aponta para -X; girar 90° em Y deixa ele virado para a câmera (+Z).
const FACE_ROTATION_Y = Math.PI / 2;

/**
 * view: 'head' (foto de perfil) ou 'full' (corpo inteiro, girando devagar)
 */
export async function mountAvatar(canvas, { view = 'head', modelUrl = CONFIG.defaultAvatar } = {}) {
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

  const gltf = await new GLTFLoader().loadAsync(modelUrl);
  const pivot = new THREE.Group();
  pivot.add(gltf.scene);
  pivot.rotation.y = FACE_ROTATION_Y;
  scene.add(pivot);

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
    dist = (size.y * 1.15) / fovTan;
  }
  camera.position.set(target.x, target.y, target.z + dist);
  camera.lookAt(target);

  const draw = () => renderer.render(scene, camera);
  if (view === 'full') {
    const loop = () => { pivot.rotation.y += 0.01; draw(); requestAnimationFrame(loop); };
    loop();
  } else {
    draw();
  }
  return { renderer, scene, camera };
}
