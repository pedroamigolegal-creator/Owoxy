import { requireUser, saveAvatar } from './auth.js';
import { mountAvatar } from './avatar.js';
import { toast } from './common.js';
import { CONFIG } from './config.js';
import { equipItem, friendlyError, lookOfEquipped, myInventory, publicUrl, unequipItem } from './items.js';
import { loadItemThumb } from './items.js';
import { initShell } from './shell.js';

const user = await requireUser();
if (user) initShell(user, 'avatar');

// Cores disponíveis (nomes próprios do Owoxy)
const PALETTE = [
  ['Sunny', '#f5cd30'], ['Peach', '#f6c9a3'], ['Sand', '#d9b382'], ['Caramel', '#c68b4e'], ['Cocoa', '#7a4a2a'],
  ['Mocha', '#4a2f1d'], ['Snow', '#f2f3f3'], ['Stone', '#9ba0a4'], ['Night', '#1b1c1e'], ['Ruby', '#c4281c'],
  ['Coral', '#ff7b6b'], ['Orange', '#e8761a'], ['Lemon', '#f8e04a'], ['Lime', '#7fcf3a'], ['Forest', '#287f47'],
  ['Mint', '#7fd8b6'], ['Sky', '#5bb7ff'], ['Ocean', '#0d69ac'], ['Navy', '#1f2a5c'], ['Violet', '#7c4dd6'],
  ['Pink', '#ff8fc8'], ['Magenta', '#c4309b'], ['Olive', '#a4bd47'], ['Brick', '#8b3a2e'], ['Teal', '#16888a'],
];
const PARTS = [
  { key: 'skin', label: 'Skin Tone' },
  { key: 'torso', label: 'Shirt Color' },
  { key: 'legs', label: 'Pants Color' },
];

const state = { ...CONFIG.defaultColors, ...(user?.avatar?.colors || {}) };
let tab = 'Wearing';
let sub = { Clothing: 'all', Accessories: 'all' };
const SUBS = {
  Clothing: [['all', 'All'], ['shirt', 'Shirts'], ['pants', 'Pants'], ['facedecal', 'Faces']],
  Accessories: [['all', 'All'], ['hat', 'Hats'], ['hair', 'Hair'], ['face', 'Face'], ['back', 'Back']],
};
const isClothing = (i) => i.kind !== 'accessory';
const matches = (i, t) => (t === 'Clothing' ? isClothing(i) && (sub.Clothing === 'all' || i.kind === sub.Clothing) : !isClothing(i) && (sub.Accessories === 'all' || i.accessory_type === sub.Accessories));
let part = 'skin';
let avatar = null;
let inventory = [];
let invLoaded = false;
const refreshLook = () => avatar?.setLook(lookOfEquipped(state, inventory));
async function loadInventory() {
  try { inventory = await myInventory(null); invLoaded = true; refreshLook(); } catch (err) { console.error(err); }
}

// --- Avatar 3D ---
const canvas = document.getElementById('preview');
const toggle = document.getElementById('toggle-2d');
mountAvatar(canvas, { view: 'full', modelUrl: user?.avatar?.model, colors: state })
  .then(async (api) => {
    avatar = api;
    await loadInventory();
    render();
    let spinning = true;
    toggle.addEventListener('click', () => {
      spinning = !spinning;
      avatar.setSpin(spinning);
      toggle.textContent = spinning ? '2D' : '3D';
    });
  })
  .catch((err) => {
    console.error('Não foi possível carregar o avatar 3D:', err);
    canvas.replaceWith(Object.assign(document.createElement('p'), { className: 'muted pad', textContent: 'Could not load the 3D avatar.' }));
  });

// --- Salvar (com pequena espera, para não salvar a cada clique) ---
let saveTimer;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try { await saveAvatar({ ...state }); toast('Avatar saved'); }
    catch (err) { console.error(err); toast('Could not save your avatar. Try again.'); }
  }, 500);
}

// --- Abas e grade de itens ---
const tabsEl = document.getElementById('tabs');
const crumb = document.getElementById('crumb');
const pills = document.getElementById('pills');
const grid = document.getElementById('grid');

function itemButtons(list, emptyText) {
  grid.innerHTML = list.length ? list.map((i) => `<button class="item" data-inv="${i.id}" aria-pressed="${i.equipped}">
    <span class="thumb"><img alt="" data-thumb="${i.id}">${i.equipped ? '<i class="check">✓</i>' : ''}</span>
    <span class="name">${i.name.replace(/</g, '&lt;')}</span></button>`).join('')
    : `<p class="muted empty">${invLoaded ? emptyText : 'Loading...'}</p>`;
  for (const i of list) { const img = grid.querySelector(`img[data-thumb="${i.id}"]`); if (img) loadItemThumb(i, img); }
}

function render() {
  tabsEl.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  const shop = '<a href="catalog.html"><u>Catalog</u></a> or make your own on the <a href="create.html"><u>Create</u></a> page.';
  if (tab === 'Body') {
    crumb.innerHTML = `Body &rsaquo; <b>${PARTS.find((p) => p.key === part).label}</b>`;
    pills.innerHTML = PARTS.map((p) => `<button class="pill ${p.key === part ? 'on' : ''}" data-part="${p.key}">${p.label}</button>`).join('');
    grid.innerHTML = PALETTE.map(([name, hex]) => {
      const on = state[part].toLowerCase() === hex;
      return `<button class="item" data-hex="${hex}" aria-pressed="${on}"><span class="thumb" style="background:${hex}">${on ? '<i class="check">✓</i>' : ''}</span><span class="name">${name}</span></button>`;
    }).join('');
    return;
  }
  if (tab === 'Wearing') {
    const on = inventory.filter((i) => i.equipped);
    crumb.innerHTML = `Currently Wearing &rsaquo; <b>${on.length} item${on.length === 1 ? '' : 's'}</b>`;
    pills.innerHTML = '';
    itemButtons(on, `You are not wearing anything yet. Get items in the ${shop}`);
    return;
  }
  crumb.innerHTML = `${tab} &rsaquo; <b>${SUBS[tab].find(([k]) => k === sub[tab])[1]}</b>`;
  pills.innerHTML = SUBS[tab].map(([k, label]) => `<button class="pill ${k === sub[tab] ? 'on' : ''}" data-sub="${k}">${label}</button>`).join('');
  itemButtons(inventory.filter((i) => matches(i, tab)), `Nothing here yet. Get some in the ${shop}`);
}

tabsEl.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]');
  if (b) { tab = b.dataset.tab; render(); }
});
pills.addEventListener('click', (e) => {
  const s = e.target.closest('button[data-sub]');
  if (s) { sub[tab] = s.dataset.sub; render(); return; }
  const b = e.target.closest('button[data-part]');
  if (b) { part = b.dataset.part; render(); }
});
grid.addEventListener('click', async (e) => {
  const inv = e.target.closest('button[data-inv]');
  if (inv) {
    const id = Number(inv.dataset.inv);
    const it = inventory.find((x) => x.id === id);
    try { if (it.equipped) await unequipItem(id); else await equipItem(id); await loadInventory(); render(); }
    catch (err) { console.error(err); toast(friendlyError(err)); }
    return;
  }
  const b = e.target.closest('button[data-hex]');
  if (!b) return;
  state[part] = b.dataset.hex;
  avatar?.setColors({ [part]: state[part] });
  render();
  scheduleSave();
});
document.getElementById('get-more').addEventListener('click', () => { location.href = 'catalog.html'; });
render();
