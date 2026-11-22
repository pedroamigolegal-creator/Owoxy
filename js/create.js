// Página Create: camisas, calças e UGC (acessórios 3D), com análise do molde e pré-visualização no noob.
import { requireUser } from './auth.js';
import { mountAvatar } from './avatar.js';
import { toast } from './common.js';
import { itemCard, loadThumbs } from './cards.js';
import { CREATE_RULES } from './config.js';
import { CLOTHING_MAP } from './clothing-map.js';
import { createItem, friendlyError, myCreations, setItemPrice, uploadFile } from './items.js';
import { autoFit, autoScale, parseOBJ, validateAccessory } from './obj.js';
import { initShell } from './shell.js';
import { analyzeClothing } from './template.js';

const user = await requireUser();
if (user) {
  initShell(user, 'create');
  const $ = (id) => document.getElementById(id);
  let t = new URLSearchParams(location.search).get('t');
  if (!['shirt', 'pants', 'ugc', 'face'].includes(t)) t = 'shirt';
  // UGC e Faces: só a conta Owoxy. Camisa e calça: todo mundo.
  document.querySelectorAll('#create-nav a[data-admin]').forEach((a) => { a.hidden = !user.isAdmin; });
  const restricted = !user.isAdmin && (t === 'ugc' || t === 'face');

  const TEXT = {
    shirt: { title: 'Shirts', sub: 'Create a shirt for the Owoxy catalog using the clothing template.', up: 'Upload a Shirt', mine: 'My Shirts', kind: 'shirt' },
    pants: { title: 'Pants', sub: 'Create pants for the Owoxy catalog using the clothing template.', up: 'Upload Pants', mine: 'My Pants', kind: 'pants' },
    face: { title: 'Faces', sub: 'Upload a face image (PNG). When worn, it replaces the default face of the noob.', up: 'Upload a Face', mine: 'My Faces', kind: 'facedecal' },
    ugc: { title: 'UGC', sub: 'Upload your own 3D accessory (hat, hair, face or back). It must follow the rules below.', up: 'Upload an Accessory', mine: 'My UGC', kind: 'accessory' },
  }[t];

  document.querySelectorAll('#create-nav a[data-t]').forEach((a) => a.classList.toggle('on', a.dataset.t === t));
  $('c-title').textContent = TEXT.title;
  $('c-sub').textContent = TEXT.sub;
  $('u-title').textContent = TEXT.up;
  $('my-title').textContent = TEXT.mine;
  document.title = `Owoxy - Create ${TEXT.title}`;

  const isUGC = t === 'ugc';
  const isFace = t === 'face';
  $('clothing-fields').hidden = isUGC || isFace;
  $('ugc-fields').hidden = !isUGC;
  $('face-fields').hidden = !isFace;
  $('lbl-name').textContent = isUGC ? '4. Name' : isFace ? '2. Name' : '3. Name';
  $('lbl-price').textContent = isUGC ? '5. Price (Owos)' : isFace ? '3. Price (Owos)' : '4. Price (Owos)';
  if (restricted) {
    $('upload-card').innerHTML = '<h2>Only the Owoxy account can create this</h2><p class="muted">UGC accessories and Faces are made by the official Owoxy account. You can still create Shirts and Pants!</p><p><a class="btn-green" href="create.html?t=shirt">Create a Shirt</a></p>';
    $('my-title').hidden = true; $('mine').hidden = true; $('c-sub').textContent = '';
  }
  $('tpl-guide').href = `assets/templates/${t === 'pants' ? 'pants' : 'shirt'}-template.png`;
  $('tpl-blank').href = `assets/templates/${t === 'pants' ? 'pants' : 'shirt'}-blank.png`;
  const typeSel = $('ugc-type');
  typeSel.innerHTML = Object.entries(CREATE_RULES.accessoryTypes).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');

  // ---- pré-visualização 3D ----
  let api = null;
  const urls = [];
  const blobUrl = (file) => { const u = URL.createObjectURL(file); urls.push(u); return u; };
  mountAvatar($('preview'), { view: isFace ? 'head' : 'full', look: {} }).then((a) => {
    api = a;
    $('toggle-2d').addEventListener('click', () => { const on = $('toggle-2d').textContent === '3D'; a.setSpin(on); $('toggle-2d').textContent = on ? '2D' : '3D'; });
  }).catch((err) => { console.error(err); $('preview-note').textContent = '3D preview is not available in this browser.'; });

  // ---- estado do formulário ----
  const state = { file: null, ok: false, triangles: null, meshFile: null, texFile: null, mtlFile: null, texPng: null, info: null, auto: [0, 0, 0], meshUrl: null, texUrl: null, scale: 1 };

  // opções só da conta Owoxy
  $('admin-sale').hidden = !user.isAdmin;
  $('sale-type').addEventListener('change', () => { $('stock-wrap').hidden = $('sale-type').value !== 'unique'; });

  // posição final do acessório = auto-posição + ajuste dos controles (Forward/Back: positivo = para a frente = -Z)
  const adjust = () => [Number($('pos-x').value), Number($('pos-y').value), -Number($('pos-z').value)];
  const currentOffset = () => state.auto.map((n, k) => Math.round((n + adjust()[k]) * 100) / 100);
  const showOutputs = () => { $('out-x').textContent = $('pos-x').value; $('out-y').textContent = $('pos-y').value; $('out-z').textContent = $('pos-z').value; };
  const previewAccessory = () => api?.setLook({ accessories: [{ type: typeSel.value, meshUrl: state.meshUrl, texUrl: state.texUrl, offset: currentOffset(), scale: state.scale }] });
  for (const k of ['x', 'y', 'z']) $(`pos-${k}`).addEventListener('input', () => { showOutputs(); if (state.ok) previewAccessory(); });
  const autoPosition = () => {
    state.auto = autoFit(state.info, typeSel.value, state.scale);
    for (const k of ['x', 'y', 'z']) $(`pos-${k}`).value = 0;
    showOutputs();
    previewAccessory();
  };
  $('pos-reset').addEventListener('click', () => { if (state.info) autoPosition(); });
  // Auto scale: ajusta o tamanho do acessório ao boneco (e reposiciona)
  const setScale = (v) => { state.scale = v; $('ugc-scale').value = v; };
  $('auto-scale').addEventListener('click', () => { if (!state.info) return; setScale(autoScale(state.info, typeSel.value)); toast(`Scale set to x${state.scale}`); checkUGC(false); });
  $('ugc-scale').addEventListener('change', () => {
    const v = Number($('ugc-scale').value);
    if (!(v >= 0.05 && v <= 20)) { $('ugc-scale').value = state.scale; return; }
    state.scale = v;
    if (state.info) checkUGC(false);
  });

  function showChecks(checks) {
    $('checks').innerHTML = checks.map((c) => `<li class="${c.ok ? 'ok' : c.warn ? 'warn' : 'bad'}">${c.ok ? '✓' : c.warn ? '!' : '✕'} ${c.text}</li>`).join('');
  }
  function refreshButton() {
    const name = $('i-name').value.trim();
    $('upload-btn').disabled = !(state.ok && name.length >= 3 && name.length <= 50);
  }
  $('i-name').addEventListener('input', refreshButton);

  const readImage = (file) => new Promise((resolve, reject) => {
    const img = new Image();
    const u = blobUrl(file);
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('This file is not a valid image.'));
    img.src = u;
  });

  // ---- camisas e calças: analisa o molde ----
  const regionsFor = () => {
    const parts = t === 'pants' ? ['torso', 'rleg', 'lleg'] : ['torso', 'rarm', 'larm'];
    const out = [];
    for (const part of parts) for (const [face, v] of Object.entries(CLOTHING_MAP[part])) out.push({ part, face, src: v.src });
    return out;
  };

  $('file-image').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    state.ok = false; state.file = null;
    if (!file) { showChecks([]); refreshButton(); return; }
    try {
      if (file.type !== 'image/png') throw new Error('The template must be a PNG file.');
      if (file.size > CREATE_RULES.clothing.maxBytes) throw new Error('The file is bigger than 5 MB.');
      const img = await readImage(file);
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, c.width, c.height);
      const res = analyzeClothing({ width: c.width, height: c.height, data: data.data }, regionsFor());
      const checks = [...res.checks];
      for (const w of res.warnings) if (!checks.some((k) => k.text === w) && !/outside/.test(w)) checks.push({ ok: false, warn: true, text: w });
      showChecks(checks);
      state.ok = res.errors.length === 0;
      state.file = file;
      if (state.ok && api) await api.setLook(t === 'pants' ? { pants: blobUrl(file) } : { shirt: blobUrl(file) });
      $('preview-note').textContent = state.ok ? 'Preview: your design on the noob.' : 'Fix the problems on the left to see the preview.';
    } catch (err) {
      showChecks([{ ok: false, text: err.message }]);
    }
    refreshButton();
  });

  // ---- Faces: um PNG quadrado ----
  $('file-face').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    state.ok = false; state.file = null;
    if (!file) { showChecks([]); refreshButton(); return; }
    try {
      const checks = [];
      const typeOk = file.type === 'image/png';
      checks.push({ ok: typeOk, text: typeOk ? 'PNG file' : 'The face must be a PNG file.' });
      const sizeOk = file.size <= CREATE_RULES.clothing.maxBytes;
      checks.push({ ok: sizeOk, text: sizeOk ? `File size is ${(file.size / 1024).toFixed(0)} KB (max 5 MB)` : 'The file is bigger than 5 MB.' });
      let dimsOk = false;
      if (typeOk) {
        const img = await readImage(file);
        const { naturalWidth: w, naturalHeight: h } = img;
        const range = w >= 64 && h >= 64 && w <= 1024 && h <= 1024;
        const square = Math.abs(w / h - 1) <= 0.1;
        dimsOk = range && square;
        checks.push({ ok: range, text: range ? `Size is ${w} x ${h}` : `Size must be between 64 x 64 and 1024 x 1024 (yours is ${w} x ${h})` });
        checks.push({ ok: square, text: square ? 'The image is square' : 'The image must be square (same width and height)' });
      }
      showChecks(checks);
      state.ok = typeOk && sizeOk && dimsOk;
      state.file = file;
      if (state.ok && api) { await api.setLook({ face: blobUrl(file) }); $('preview-note').textContent = 'Preview: your face on the noob.'; }
    } catch (err) { showChecks([{ ok: false, text: err.message || 'Could not read this image.' }]); }
    refreshButton();
  });

  // ---- UGC: lê o modelo (.obj ou .fbx), o .mtl e a textura, e confere os critérios ----
  const extOf = (f) => (f.name.split('.').pop() || '').toLowerCase();

  // .fbx vira .obj (o resto do Owoxy trabalha com .obj)
  async function fbxToObj(file) {
    const [{ FBXLoader }, { OBJExporter }, THREE] = await Promise.all([
      import('three/addons/loaders/FBXLoader.js'), import('three/addons/exporters/OBJExporter.js'), import('three')]);
    const root = new FBXLoader().parse(await file.arrayBuffer(), '');
    root.updateMatrixWorld(true);
    let meshes = 0;
    root.traverse((o) => { if (o.isMesh) meshes++; });
    if (!meshes) throw new Error('This .fbx has no 3D mesh inside.');
    const text = new OBJExporter().parse(root);
    return new File([text], file.name.replace(/\.fbx$/i, '') + '.obj', { type: 'text/plain' });
  }

  // lê o .mtl: textura citada e cor principal
  async function readMtl(file) {
    const out = { tex: null, color: null };
    for (const raw of (await file.text()).split(/\r?\n/)) {
      const l = raw.trim();
      if (/^map_Kd\s/i.test(l)) out.tex = l.split(/\s+/).pop().split(/[\\/]/).pop();
      else if (/^Kd\s/i.test(l) && !out.color) { const c = l.split(/\s+/).slice(1, 4).map(Number); if (c.length === 3 && c.every(Number.isFinite)) out.color = c; }
    }
    return out;
  }

  // textura final em PNG: a imagem escolhida (png/jpg), ou uma cor lisa vinda do .mtl; vira de cabeça para baixo se pedido
  async function buildTexture(mtl) {
    const flip = $('tex-flip').checked;
    const c = document.createElement('canvas');
    if (state.texFile) {
      if (!/^image\/(png|jpeg)$/.test(state.texFile.type)) throw new Error('The texture must be a PNG or JPG image.');
      const img = await readImage(state.texFile);
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const x = c.getContext('2d');
      if (flip) { x.translate(0, c.height); x.scale(1, -1); }
      x.drawImage(img, 0, 0);
    } else if (mtl?.color && !mtl.color.every((v) => v > 0.98)) {
      c.width = c.height = 16;
      const x = c.getContext('2d');
      x.fillStyle = `rgb(${mtl.color.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255)).join(',')})`;
      x.fillRect(0, 0, 16, 16);
    } else return null;
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    return { blob, width: c.width, height: c.height, bytes: blob.size };
  }

  async function checkUGC(fresh = true) {
    if (fresh) setScale(1);
    state.ok = false;
    const mesh = state.meshFile;
    if (!mesh) { showChecks([]); $('pos-box').hidden = true; refreshButton(); return; }
    try {
      const mtl = state.mtlFile ? await readMtl(state.mtlFile) : null;
      const notes = [];
      if (mtl?.tex && !state.texFile) notes.push({ ok: false, warn: true, text: `The .mtl uses the texture "${mtl.tex}". Select that image too (step 3).` });
      const built = await buildTexture(mtl);
      state.texPng = built ? built.blob : null;
      const tex = built ? { width: built.width, height: built.height, bytes: built.bytes } : null;
      const info = parseOBJ(await mesh.text());
      // arquivo novo grande demais: já aplica o Auto scale (o botão serve para refazer quando quiser)
      if (fresh && Math.max(...info.size) > CREATE_RULES.ugc.maxSize) setScale(autoScale(info, typeSel.value));
      const res = validateAccessory(info, { fileBytes: mesh.size, tex, autoPosition: true, scale: state.scale });
      if (state.mtlFile && !state.texFile && state.texPng) notes.push({ ok: true, text: 'Color taken from the .mtl file' });
      showChecks([...notes, ...res.checks]);
      state.ok = res.errors.length === 0;
      state.triangles = info.triangles;
      state.info = info;
      $('pos-box').hidden = !state.ok;
      if (state.ok) {
        state.meshUrl = blobUrl(mesh);
        state.texUrl = state.texPng ? blobUrl(state.texPng) : null;
        if (api) { autoPosition(); $('preview-note').textContent = 'Preview: your accessory on the noob, positioned automatically.'; }
      }
    } catch (err) {
      console.error(err);
      showChecks([{ ok: false, text: err.message || 'Could not read this file.' }]);
    }
    refreshButton();
  }
  $('file-mesh').addEventListener('change', async (e) => {
    const files = [...e.target.files];
    state.meshFile = null; state.mtlFile = null;
    const img = files.find((f) => /^image\//.test(f.type));
    if (img) { state.texFile = img; }
    state.mtlFile = files.find((f) => extOf(f) === 'mtl') || null;
    const model = files.find((f) => ['obj', 'fbx'].includes(extOf(f)));
    try {
      if (model) state.meshFile = extOf(model) === 'fbx' ? await fbxToObj(model) : model;
      else if (files.length) throw new Error('Select a .obj or .fbx model file.');
    } catch (err) { console.error(err); showChecks([{ ok: false, text: err.message || 'Could not read this model.' }]); state.meshFile = null; refreshButton(); return; }
    checkUGC();
  });
  $('file-tex').addEventListener('change', (e) => { state.texFile = e.target.files[0] || null; checkUGC(false); });
  $('tex-flip').addEventListener('change', () => { if (state.meshFile) checkUGC(false); });
  typeSel.addEventListener('change', () => { if (state.meshFile) checkUGC(); });

  // ---- upload ----
  $('upload-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if ($('upload-btn').disabled) return;
    const priceRaw = $('i-price').value.trim();
    let price = null; // vazio = Offsale
    if (priceRaw !== '') {
      price = Number(priceRaw);
      if (!Number.isInteger(price) || price < 0 || price > 1000000) { toast('Price must be a whole number from 0 to 1,000,000 (or blank for Offsale).'); return; }
    }
    if (user.isAdmin && $('sale-type').value === 'unique') {
      const n = Number($('i-stock').value);
      if (!Number.isInteger(n) || n < 1 || n > 100000) { toast('Stock must be a whole number from 1 to 100,000.'); return; }
    }
    if (user.isAdmin && $('i-until').value && new Date($('i-until').value) <= new Date()) { toast('The end date must be in the future.'); return; }
    $('upload-btn').disabled = true;
    $('upload-btn').textContent = 'Uploading...';
    try {
      let args;
      if (isUGC) {
        const meshPath = await uploadFile(user.id, state.meshFile, 'obj', 'text/plain');
        const imagePath = state.texPng ? await uploadFile(user.id, state.texPng, 'png', 'image/png') : null;
        args = { kind: 'accessory', accessoryType: typeSel.value, name: $('i-name').value.trim(), price, imagePath, meshPath, triangles: state.triangles, offset: currentOffset(), scale: state.scale };
      } else {
        const imagePath = await uploadFile(user.id, state.file, 'png', 'image/png');
        args = { kind: isFace ? 'facedecal' : t, name: $('i-name').value.trim(), price, imagePath };
      }
      if (user.isAdmin) {
        const limited = $('sale-type').value || null;
        if (limited) args.limited = limited;
        if (limited === 'unique') args.stock = Number($('i-stock').value);
        if ($('i-until').value) args.until = new Date($('i-until').value).toISOString();
      }
      await createItem(args);
      toast('Uploaded! It is in your Inventory and in the Catalog.');
      $('upload-form').reset();
      $('stock-wrap').hidden = true; $('pos-box').hidden = true; state.info = null;
      state.ok = false; state.file = null; state.meshFile = null; state.texFile = null; state.mtlFile = null; state.texPng = null;
      showChecks([]);
      if (api) api.setLook({});
      await loadMine();
    } catch (err) {
      console.error(err);
      toast(friendlyError(err));
    }
    $('upload-btn').textContent = 'Upload';
    refreshButton();
  });

  // ---- minhas criações (com edição de preço) ----
  async function loadMine() {
    const box = $('mine');
    try {
      const items = await myCreations(TEXT.kind);
      box.innerHTML = items.length ? items.map((i) => itemCard(i, {
        extra: `<form class="price-edit" data-id="${i.id}"><input type="number" min="0" max="1000000" step="1" value="${i.price ?? ''}" placeholder="Offsale" aria-label="Price"><button class="btn-gray sm">Save</button></form>`,
      })).join('') : '<p class="muted">You have not created anything here yet.</p>';
      loadThumbs(box, items);
    } catch (err) { console.error(err); box.innerHTML = `<p class="muted">${friendlyError(err)}</p>`; }
  }
  $('mine').addEventListener('submit', async (e) => {
    const f = e.target.closest('form.price-edit');
    if (!f) return;
    e.preventDefault();
    const v = f.querySelector('input').value.trim();
    const price = v === '' ? null : Number(v);
    if (price !== null && (!Number.isInteger(price) || price < 0 || price > 1000000)) { toast('Invalid price.'); return; }
    try { await setItemPrice(Number(f.dataset.id), price); toast(price === null ? 'Now Offsale' : price === 0 ? 'Now Free' : 'Price updated'); await loadMine(); }
    catch (err) { console.error(err); toast(friendlyError(err)); }
  });
  loadMine();
}
