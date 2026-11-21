import { requireUser } from './auth.js';
import { toast } from './common.js';
import { itemCard, loadThumbs } from './cards.js';
import { equipItem, friendlyError, myInventory, unequipItem } from './items.js';
import { initShell } from './shell.js';

const user = await requireUser();
if (user) {
  initShell(user, 'inventory');
  const grid = document.getElementById('grid');
  let kind = '';

  async function load() {
    try {
      const items = await myInventory(kind || null);
      grid.innerHTML = items.length
        ? items.map((i) => itemCard(i, {
          tag: i.equipped ? '<span class="owned-badge on">Wearing</span>' : '',
          extra: `<button class="btn-gray sm wear" data-id="${i.id}" data-on="${i.equipped ? 1 : 0}">${i.equipped ? 'Remove' : 'Wear'}</button>`,
        })).join('')
        : '<p class="muted">Nothing here yet. Buy something in the Catalog or create your own on the Create page.</p>';
      loadThumbs(grid, items);
    } catch (err) {
      console.error(err);
      grid.innerHTML = `<p class="muted">${friendlyError(err)}</p>`;
    }
  }

  grid.addEventListener('click', async (e) => {
    const b = e.target.closest('button.wear');
    if (!b) return;
    b.disabled = true;
    try {
      if (b.dataset.on === '1') await unequipItem(Number(b.dataset.id)); else await equipItem(Number(b.dataset.id));
      toast(b.dataset.on === '1' ? 'Removed' : 'Now wearing it!');
      await load();
    } catch (err) { console.error(err); toast(friendlyError(err)); b.disabled = false; }
  });

  document.getElementById('inv-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-k]');
    if (!b) return;
    kind = b.dataset.k;
    document.querySelectorAll('#inv-tabs button').forEach((x) => x.classList.toggle('on', x === b));
    load();
  });
  load();
}
