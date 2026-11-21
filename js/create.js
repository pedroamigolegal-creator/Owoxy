// Página Create: camisas, calças e UGC (acessórios 3D), com análise do molde e pré-visualização no noob.
import { requireUser } from './auth.js';
import { mountAvatar } from './avatar.js';
import { toast } from './common.js';
import { itemCard, loadThumbs } from './cards.js';
import { CREATE_RULES } from './config.js';
import { CLOTHING_MAP } from './clothing-map.js';
import { createItem, friendlyError, myCreations, setItemPrice, uploadFile } from './items.js';
import { autoFit, parseOBJ, validateAccessory } from './obj.js';
import { initShell } from './shell.js';
import { analyzeClothing } from './template.js';

const user = await requireUser();
if (user) {
  initShell(user, 'create');
  const $ = (id) => document.getElementById(id);
  let t = new URLSearchParams(location.search).get('t');
  if (!['shirt', 'pants', 'ugc'].includes(t)) t = 'shirt';

  const TEXT = {
    shirt: { title: 'Shirts', sub: 'Create a shirt for the Owoxy catalog using the clothing template.', up: 'Upload a Shirt', mine: 'My Shirts', kind: 'shirt' },
    pants: { title: 'Pants', sub: 'Create pants for the Owoxy catalog using the clothing template.', up: 'Upload Pants', mine: 'My Pants', kind: 'pants' },
    ugc: { title: 'UGC', sub: 'Upload your own 3D accessory (hat, hair, face or back). It must follow the rules below.', up: 'Upload an Accessory', mine: 'My UGC', kind: 'accessory' },
  }[t];

  document.querySelectorAll('#create-nav a[data-t]').forEach((a) => a.classList.toggle('on', a.dataset.t === t));
  $('c-title').textContent = TEXT.title;
  $('c-sub').textContent = TEXT.sub;
  $('u-title').textContent = TEXT.up;
  $('my-title').textContent = TEXT.mine;
  document.title = `Owoxy - Create ${TEXT.title}`;

  const isUGC = t === 'ugc';
  $('clothing-fields').hidden = isUGC;
  $('ugc-fields').hidden = !isUGC;
  $('lbl-name').textContent = isUGC ? '4. Name' : '3. Name';
  $('lbl-price').textContent = isUGC ? '5. Price (Owos)' : '4. Price (Owos)';
  $('tpl-guide').href = `assets/templates/${t === 'pants' ? 'pants' : 'shirt'}-template.png`;
  $('tpl-blank').href = `assets/templates/${t === 'pants' ? 'pants' : 'shirt'}-blank.png`;
  const typeSel = $('ugc-type');
  typeSel.innerHTML = Object.entries(CREATE_RULES.accessoryTypes).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');

  // ---- pré-visualização 3D ----
  let api = null;
  const urls = [];
  const blobUrl = (file) => { const u = URL.createObjectURL(file); urls.push(u); return u; };
  mountAvatar($('preview'), { view: 'full', look: {} }).then((a) => {
    api = a;
    $('toggle-2d').addEventListener('click', () => { const on = $('toggle-2d').textContent === '3D'; a.setSpin(on); $('toggle-2d').textContent = on ? '2D' : '3D'; });
  }).catch((err) => { console.error(err); $('preview-note').textContent = '3D preview is not available in this browser.'; });

  // ---- estado do formulário ----
  const state = { file: null, ok: false, triangles: null, meshFile: null, texFile: null, info: null, auto: [0, 0, 0], meshUrl: null, texUrl: null };

  // opções só da conta Owoxy
  $('admin-sale').hidden = !user.isAdmin;
  $('sale-type').addEventListener('change', () => { $('stock-wrap').hidden = $('sale-type').value !== 'unique'; });

  // posição final do acessório = auto-posição + ajuste dos controles (Forward/Back: positivo = para a frente = -Z)
  const adjust = () => [Number($('pos-x').value), Number($('pos-y').value), -Number($('pos-z').value)];
  const currentOffset = () => state.auto.map((n, k) => Math.round((n + adjust()[k]) * 100) / 100);
  const showOutputs = () => { $('out-x').textContent = $('pos-x').value; $('out-y').textContent = $('pos-y').value; $('out-z').textContent = $('pos-z').value; };
  const previewAccessory = () => api?.setLook({ accessories: [{ type: typeSel.value, meshUrl: state.meshUrl, texUrl: state.texUrl, offset: currentOffset() }] });
  for (const k of ['x', 'y', 'z']) $(`pos-${k}`).addEventListener('input', () => { showOutputs(); if (state.ok) previewAccessory(); });
  const autoPosition = () => {
    state.auto = autoFit(state.info, typeSel.value);
    for (const k of ['x', 'y', 'z']) $(`pos-${k}`).value = 0;
    showOutputs();
    previewAccessory();
  };
  $('pos-reset').addEventListener('click', () => { if (state.info) autoPosition(); });

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

  // ---- UGC: lê o .obj e confere os critérios ----
  async function checkUGC() {
    state.ok = false;
    const mesh = state.meshFile;
    if (!mesh) { showChecks([]); $('pos-box').hidden = true; refreshButton(); return; }
    try {
      let tex = null;
      if (state.texFile) {
        if (state.texFile.type !== 'image/png') throw new Error('The texture must be a PNG file.');
        const img = await readImage(state.texFile);
        tex = { width: img.naturalWidth, height: img.naturalHeight, bytes: state.texFile.size };
      }
      const info = parseOBJ(await mesh.text());
      const res = validateAccessory(info, { fileBytes: mesh.size, tex, autoPosition: true });
      showChecks(res.checks);
      state.ok = res.errors.length === 0;
      state.triangles = info.triangles;
      state.info = info;
      $('pos-box').hidden = !state.ok;
      if (state.ok) {
        state.meshUrl = blobUrl(mesh);
        state.texUrl = state.texFile ? blobUrl(state.texFile) : null;
        if (api) { autoPosition(); $('preview-note').textContent = 'Preview: your accessory on the noob, positioned automatically.'; }
      }
    } catch (err) {
      console.error(err);
      showChecks([{ ok: false, text: err.message || 'Could not read this file.' }]);
    }
    refreshButton();
  }
  $('file-mesh').addEventListener('change', (e) => { state.meshFile = e.target.files[0] || null; checkUGC(); });
  $('file-tex').addEventListener('change', (e) => { state.texFile = e.target.files[0] || null; checkUGC(); });
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
        const imagePath = state.texFile ? await uploadFile(user.id, state.texFile, 'png', 'image/png') : null;
        args = { kind: 'accessory', accessoryType: typeSel.value, name: $('i-name').value.trim(), price, imagePath, meshPath, triangles: state.triangles, offset: currentOffset() };
      } else {
        const imagePath = await uploadFile(user.id, state.file, 'png', 'image/png');
        args = { kind: t, name: $('i-name').value.trim(), price, imagePath };
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
      state.ok = false; state.file = null; state.meshFile = null; state.texFile = null;
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
