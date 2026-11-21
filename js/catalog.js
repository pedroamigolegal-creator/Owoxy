import { requireUser } from './auth.js';
import { toast } from './common.js';
import { itemCard, loadThumbs } from './cards.js';
import { catalog, friendlyError } from './items.js';
import { initShell } from './shell.js';

const user = await requireUser();
if (user) {
  initShell(user, 'catalog');
  const params = new URLSearchParams(location.search);
  const kind = params.get('k') || '';
  const q = (params.get('q') || '').trim();
  const PAGE = 24;
  let offset = 0;
  // Offsale começa escondido; a pessoa escolhe e o navegador lembra
  let showOffsale = false;
  try { showOffsale = localStorage.getItem('owoxy.showOffsale') === '1'; } catch { /* sem armazenamento */ }
  const toggle = document.getElementById('off-toggle');
  const paintToggle = () => toggle.querySelectorAll('button').forEach((b) => b.classList.toggle('on', (b.dataset.v === '1') === showOffsale));
  paintToggle();
  toggle.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]');
    if (!b) return;
    showOffsale = b.dataset.v === '1';
    try { localStorage.setItem('owoxy.showOffsale', showOffsale ? '1' : '0'); } catch { /* ok */ }
    paintToggle();
    offset = 0;
    load();
  });

  document.getElementById('cat-q').value = q;
  document.querySelectorAll('#filters a').forEach((a) => a.classList.toggle('on', (a.dataset.k || '') === kind));
  document.getElementById('cat-search').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = document.getElementById('cat-q').value.trim();
    const next = new URLSearchParams();
    if (kind) next.set('k', kind);
    if (v) next.set('q', v);
    location.href = `catalog.html${next.toString() ? `?${next}` : ''}`;
  });

  const grid = document.getElementById('grid');
  const more = document.getElementById('more');
  const title = document.getElementById('cat-title');

  async function load() {
    try {
      const items = await catalog(kind || null, q, PAGE, offset, showOffsale);
      if (offset === 0) grid.innerHTML = '';
      if (!items.length && offset === 0) {
        grid.innerHTML = `<p class="muted">${q ? `No items found for "${q}".` : 'Nothing on sale here.'}${showOffsale ? '' : ' Offsale items are hidden (see "Offsale items" on the left).'}</p>`;
      }
      const html = document.createElement('div');
      html.innerHTML = items.map((i) => itemCard(i, { tag: i.owned ? '<span class="owned-badge">Owned</span>' : '' })).join('');
      [...html.children].forEach((c) => grid.appendChild(c));
      loadThumbs(grid, items);
      offset += items.length;
      more.hidden = items.length < PAGE;
      title.textContent = q ? `Results for "${q}"` : '';
    } catch (err) {
      console.error(err);
      grid.innerHTML = `<p class="muted">${friendlyError(err)}</p>`;
    }
  }
  more.addEventListener('click', load);
  load();
}
