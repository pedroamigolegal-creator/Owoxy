import { requireUser } from './auth.js';
import { itemCard, loadThumbs } from './cards.js';
import { catalog, friendlyError } from './items.js';
import { initShell } from './shell.js';

const SCOPES = [['', 'All Items'], ['shirt', 'Shirts'], ['pants', 'Pants'], ['facedecal', 'Faces'], ['accessory', 'All Accessories'], ['hat', 'Hats'], ['hair', 'Hair'], ['face', 'Face'], ['back', 'Back'], ['neck', 'Neck'], ['gear', 'Gear']];

const user = await requireUser();
if (user) {
  initShell(user, 'catalog');
  const params = new URLSearchParams(location.search);
  const kind = params.get('k') || '';
  const q = (params.get('q') || '').trim();
  const PAGE = 24;
  let offset = 0;
  const $ = (id) => document.getElementById(id);
  const all = [];                                   // itens carregados, na ordem do servidor
  const nodes = new Map();                          // id -> elemento (a miniatura 3D só é gerada uma vez)

  // "Unavailable Items": esconder/mostrar fora de venda (o navegador lembra)
  let showOffsale = false;
  try { showOffsale = localStorage.getItem('owoxy.showOffsale') === '1'; } catch { /* sem armazenamento */ }
  document.querySelectorAll('input[name=off]').forEach((r) => { r.checked = (r.value === '1') === showOffsale; });
  document.querySelectorAll('input[name=off]').forEach((r) => r.addEventListener('change', () => {
    showOffsale = r.value === '1';
    try { localStorage.setItem('owoxy.showOffsale', showOffsale ? '1' : '0'); } catch { /* ok */ }
    offset = 0; all.length = 0; nodes.clear(); for (const el of [...$('grid').children]) el.remove(); load();
  }));

  // busca + escolha de categoria
  $('cat-q').value = q;
  const scope = $('cat-scope');
  scope.innerHTML = SCOPES.map(([k, n]) => `<option value="${k}">${n}</option>`).join('');
  scope.value = kind;
  const go = () => { const next = new URLSearchParams(); if (scope.value) next.set('k', scope.value); const v = $('cat-q').value.trim(); if (v) next.set('q', v); location.href = `catalog.html${next.toString() ? `?${next}` : ''}`; };
  $('cat-search').addEventListener('submit', (e) => { e.preventDefault(); go(); });
  scope.addEventListener('change', go);

  // categorias que abrem com "+"
  document.querySelectorAll('#filters a').forEach((a) => a.classList.toggle('on', (a.dataset.k || '') === kind));
  document.querySelectorAll('#filters .grp').forEach((g) => {
    const h = g.querySelector('.grp-h'), ico = h.querySelector('i');
    const set = (open) => { g.classList.toggle('open', open); ico.textContent = open ? '–' : '+'; };
    set(!!g.querySelector('a.on'));
    h.addEventListener('click', () => set(!g.classList.contains('open')));
  });

  // filtros e ordem (feitos aqui, sobre o que já foi carregado)
  const filt = () => {
    const mode = document.querySelector('input[name=pr]:checked').value;
    const min = Number($('f-min').value), max = Number($('f-max').value);
    const cr = document.querySelector('input[name=cr]:checked').value === 'user' ? $('f-creator').value.trim().toLowerCase() : '';
    return (i) => {
      if (cr && !String(i.creator_name || '').toLowerCase().includes(cr)) return false;
      if (mode === 'free') return i.price === 0;
      if (mode === 'range') { if (i.price == null) return false; if ($('f-min').value !== '' && i.price < min) return false; if ($('f-max').value !== '' && i.price > max) return false; }
      return true;
    };
  };
  function render() {
    const keep = filt(), sort = $('cat-sort').value;
    const list = all.filter(keep);
    if (sort === 'plh') list.sort((a, b) => (a.price ?? 1e12) - (b.price ?? 1e12));
    else if (sort === 'phl') list.sort((a, b) => (b.price ?? -1) - (a.price ?? -1));
    else if (sort === 'az') list.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    const grid = $('grid'), ok = new Set(list.map((x) => x.id));
    for (const i of list) grid.appendChild(nodes.get(i.id));                 // reordena sem recriar (a miniatura continua)
    for (const i of all) nodes.get(i.id).hidden = !ok.has(i.id);
    const empty = $('cat-empty');
    empty.hidden = list.length > 0;
    empty.textContent = `${all.length ? 'No items match these filters.' : (q ? `No items found for "${q}".` : 'Nothing on sale here.')}${showOffsale ? '' : ' Unavailable items are hidden (see "Unavailable Items" on the left).'}`;
    $('cat-title').textContent = q ? `Results for "${q}"` : (SCOPES.find(([k]) => k === kind)?.[1] || 'All Items');
  }
  document.querySelectorAll('#filters input, #cat-sort').forEach((el) => el.addEventListener(el.type === 'text' || el.type === 'number' ? 'input' : 'change', render));

  const more = $('more');
  async function load() {
    try {
      const items = await catalog(kind || null, q, PAGE, offset, showOffsale);
      const tmp = document.createElement('div');
      tmp.innerHTML = items.map((i) => itemCard(i, { tag: i.owned ? '<span class="owned-badge">Owned</span>' : '' })).join('');
      items.forEach((i, n) => { nodes.set(i.id, tmp.children[n]); all.push(i); });
      render();
      loadThumbs($('grid'), items);
      offset += items.length;
      more.hidden = items.length < PAGE;
    } catch (err) {
      console.error(err);
      $('cat-empty').hidden = false; $('cat-empty').textContent = friendlyError(err);
    }
  }
  more.addEventListener('click', load);
  load();
}
