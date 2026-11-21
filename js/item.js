import { requireUser } from './auth.js';
import { mountAvatar } from './avatar.js';
import { confirmDialog, toast, verifiedBadge } from './common.js';
import { priceHTML } from './cards.js';
import { ACCESSORY_LABEL, KIND_LABEL, buyItem, deleteItem, friendlyError, getItem, lookOfItem, priceLabel } from './items.js';
import { initShell, setBalance } from './shell.js';

const user = await requireUser();
if (user) {
  initShell(user, 'catalog');
  const $ = (id) => document.getElementById(id);
  const id = Number(new URLSearchParams(location.search).get('id'));

  let item = null;
  try { item = id ? await getItem(id) : null; } catch (err) { console.error(err); $('loading').textContent = friendlyError(err); }

  if (!item) {
    if ($('loading').textContent === 'Loading...') $('loading').textContent = 'Item not found. It may have been removed from the catalog.';
  } else {
    $('loading').hidden = true;
    $('item').hidden = false;
    document.title = `Owoxy - ${item.name}`;
    $('i-kind').textContent = item.kind === 'accessory' ? `Accessory › ${ACCESSORY_LABEL[item.accessory_type] || ''}` : KIND_LABEL[item.kind];
    $('i-name').textContent = item.name;
    $('i-by').textContent = item.creator_name;
    $('i-by').href = `profile.html?u=${encodeURIComponent(item.creator_name)}`;
    if (item.creator_verified) $('i-badge').innerHTML = verifiedBadge();

    // Pré-visualização: o noob 3D vestindo o item
    mountAvatar($('view'), { view: 'full', look: lookOfItem(item) })
      .then((api) => {
        let spinning = true;
        $('toggle-2d').addEventListener('click', () => { spinning = !spinning; api.setSpin(spinning); $('toggle-2d').textContent = spinning ? '2D' : '3D'; });
      })
      .catch((err) => console.error('Avatar 3D indisponível:', err));

    function renderBuy() {
      $('i-price').innerHTML = `<span class="label">Price</span> ${priceHTML(item.price)}`;
      const actions = $('i-actions');
      $('i-note').textContent = '';
      if (item.owned) {
        actions.innerHTML = '<span class="owned-tag">✓ You own this item</span><a class="btn-green" href="inventory.html">Wear it from your Inventory</a>';
      } else if (item.price == null) {
        actions.innerHTML = '<button class="btn-gray" disabled>Offsale</button>';
        $('i-note').textContent = 'This item is not for sale right now.';
      } else {
        actions.innerHTML = `<button class="btn-green big" id="buy">${item.price === 0 ? 'Get' : 'Buy'}</button>`;
        $('buy').addEventListener('click', buy);
      }
    }

    async function buy() {
      const ok = await confirmDialog({
        title: 'Buy Item',
        message: `Are you sure you want to buy "${item.name}" for ${priceLabel(item.price)}?`,
        confirmText: 'Buy',
        cancelText: 'Cancel',
      });
      if (!ok) return;
      try {
        const balance = await buyItem(item.id);
        setBalance(balance);
        item.owned = true;
        toast(`You got "${item.name}"! It is in your Inventory.`);
        renderBuy();
      } catch (err) {
        console.error(err);
        toast(friendlyError(err));
      }
    }
    renderBuy();

    // Só a conta Owoxy (admin) pode tirar qualquer item do catálogo
    if (user.isAdmin) {
      $('admin-box').hidden = false;
      $('i-delete').addEventListener('click', async () => {
        const ok = await confirmDialog({
          title: 'Delete from catalog',
          message: `Delete "${item.name}" from the catalog? It will also disappear from inventories and avatars.`,
          confirmText: 'Delete',
          cancelText: 'Cancel',
          danger: true,
        });
        if (!ok) return;
        try { await deleteItem(item.id); toast('Item deleted'); location.href = 'catalog.html'; }
        catch (err) { console.error(err); toast(friendlyError(err)); }
      });
    }
  }
}
