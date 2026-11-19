import { requireUser, saveAvatar } from './auth.js';
import { mountAvatar } from './avatar.js';
import { toast } from './common.js';
import { CONFIG } from './config.js';
import { initShell } from './shell.js';

const user = await requireUser();
if (user) initShell(user);

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
let tab = 'Body';
let part = 'skin';
let avatar = null;

// --- Avatar 3D ---
const canvas = document.getElementById('preview');
const toggle = document.getElementById('toggle-2d');
mountAvatar(canvas, { view: 'full', modelUrl: user?.avatar?.model, colors: state })
  .then((api) => {
    avatar = api;
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

function render() {
  tabsEl.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  const isBody = tab === 'Body';
  crumb.innerHTML = isBody ? `Body &rsaquo; <b>${PARTS.find((p) => p.key === part).label}</b>` : `${tab} &rsaquo; All`;
  pills.innerHTML = isBody
    ? PARTS.map((p) => `<button class="pill ${p.key === part ? 'on' : ''}" data-part="${p.key}">${p.label}</button>`).join('')
    : '';

  if (!isBody) {
    grid.innerHTML = `<p class="muted empty">Nothing here yet. ${tab === 'Recent' ? 'Items you use will show up here.' : 'Clothes and accessories are coming with the Owoxy catalog.'}</p>`;
    return;
  }
  grid.innerHTML = PALETTE.map(([name, hex]) => {
    const on = state[part].toLowerCase() === hex;
    return `<button class="item" data-hex="${hex}" aria-pressed="${on}">
      <span class="thumb" style="background:${hex}">${on ? '<i class="check">✓</i>' : ''}</span>
      <span class="name">${name}</span></button>`;
  }).join('');
}

tabsEl.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]');
  if (b) { tab = b.dataset.tab; render(); }
});
pills.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-part]');
  if (b) { part = b.dataset.part; render(); }
});
grid.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-hex]');
  if (!b) return;
  state[part] = b.dataset.hex;
  avatar?.setColors({ [part]: state[part] });
  render();
  scheduleSave();
});
document.getElementById('get-more').addEventListener('click', () => toast('The Owoxy catalog is coming soon!'));
render();
