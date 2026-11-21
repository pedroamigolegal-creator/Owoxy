import { requireUser } from './auth.js';
import { mountAvatar } from './avatar.js';
import { confirmDialog, esc, promptDialog, toast, verifiedBadge } from './common.js';
import { priceHTML } from './cards.js';
import {
  ACCESSORY_LABEL, KIND_LABEL, LIMITED_LABEL, RESALE_FEE, buyItem, buyResale, cancelResale, deleteItem, friendlyError, getItem,
  itemResales, listResale, lookOfItem, priceLabel, saleState, setAvailability, timeLeft,
} from './items.js';
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

    let myListing = null;   // meu anúncio de revenda (se houver)
    let timer = null;

    async function refresh() {
      try { item = await getItem(item.id) || item; } catch (err) { console.error(err); }
      render();
    }

    async function render() {
      const state = saleState(item);
      // tipo Limited
      const ltd = $('i-limited');
      ltd.hidden = !item.limited_kind;
      if (item.limited_kind) {
        ltd.innerHTML = `<span class="ltd-badge ${item.limited_kind}">${LIMITED_LABEL[item.limited_kind]}</span>` +
          (item.limited_kind === 'unique' ? ` <span class="muted">${item.sold} of ${item.stock} sold</span>` : '') +
          (item.owned && item.serial ? ` <b>You own #${item.serial}</b>` : '');
      }
      $('i-price').innerHTML = `<span class="label">Price</span> ${priceHTML(item)}`;

      // prazo da venda
      clearInterval(timer);
      const avail = $('i-avail');
      if (item.available_until && state === 'open') {
        const tick = () => {
          if (new Date(item.available_until) <= new Date()) { clearInterval(timer); item.open_now = false; render(); return; }
          avail.textContent = `Available until ${new Date(item.available_until).toLocaleString()} (${timeLeft(item.available_until)} left)`;
        };
        tick(); timer = setInterval(tick, 1000);
      } else {
        avail.textContent = item.available_until && state === 'ended' ? `The sale ended on ${new Date(item.available_until).toLocaleString()}.` : '';
      }

      // botões
      const actions = $('i-actions');
      $('i-note').textContent = '';
      let html = '';
      if (item.owned) {
        html += '<span class="owned-tag">✓ You own this item</span><a class="btn-green" href="inventory.html">Wear it from your Inventory</a>';
        if (item.limited_kind) html += `<button class="btn-gray" id="sell" type="button">${myListing ? `Change price (listed for ${myListing.price})` : 'Sell'}</button>${myListing ? '<button class="btn-outline-red" id="unlist" type="button">Remove listing</button>' : ''}`;
      } else if (state === 'open') {
        html += `<button class="btn-green big" id="buy" type="button">${item.price === 0 ? 'Get' : 'Buy'}</button>`;
      } else {
        const label = { soldout: 'Sold out', ended: 'Sale ended' }[state] || 'Offsale';
        html += `<button class="btn-gray" disabled>${label}</button>`;
        $('i-note').textContent = item.limited_kind ? 'Not sold by Owoxy anymore. You can buy it from a reseller below.' : 'This item is not for sale right now.';
      }
      actions.innerHTML = html;
      $('buy')?.addEventListener('click', buy);
      $('sell')?.addEventListener('click', sell);
      $('unlist')?.addEventListener('click', async () => {
        try { await cancelResale(item.id); toast('Listing removed'); await loadResellers(); render(); } catch (err) { console.error(err); toast(friendlyError(err)); }
      });
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
        setBalance(await buyItem(item.id));
        toast(`You got "${item.name}"! It is in your Inventory.`);
        await refresh();
        await loadResellers();
      } catch (err) { console.error(err); toast(friendlyError(err)); await refresh(); }
    }

    async function sell() {
      const v = await promptDialog({
        title: 'Sell your copy',
        message: `Price in Owos. You receive ${Math.round((1 - RESALE_FEE) * 100)}% of it (a ${Math.round(RESALE_FEE * 100)}% fee applies).`,
        placeholder: 'Price', type: 'number', confirmText: 'Put on sale', value: myListing ? String(myListing.price) : '',
      });
      if (v === null) return;
      const price = Number(v);
      if (!Number.isInteger(price) || price < 1 || price > 1000000) { toast('Price must be a whole number from 1 to 1,000,000.'); return; }
      try { await listResale(item.id, price); toast('Your copy is on sale'); await loadResellers(); render(); }
      catch (err) { console.error(err); toast(friendlyError(err)); }
    }

    // revendedores (só Limited / Limited U)
    async function loadResellers() {
      if (!item.limited_kind) return;
      $('resell-card').hidden = false;
      let rows = [];
      try { rows = await itemResales(item.id); } catch (err) { console.error(err); }
      myListing = rows.find((r) => r.seller_id === user.id) || null;
      $('resellers').innerHTML = rows.length ? `<table class="resell"><tbody>${rows.map((r) => `<tr>
        <td><a href="profile.html?u=${encodeURIComponent(r.seller_name)}">${esc(r.seller_name)}</a>${r.seller_verified ? verifiedBadge() : ''}</td>
        <td>${r.serial ? `#${r.serial}` : ''}</td>
        <td><b>${Number(r.price).toLocaleString('en-US')} Owos</b></td>
        <td>${r.seller_id === user.id ? '<span class="muted">Your listing</span>' : item.owned ? '' : `<button class="btn-green sm" data-seller="${r.seller_id}" data-name="${esc(r.seller_name)}" data-price="${r.price}">Buy</button>`}</td></tr>`).join('')}</tbody></table>`
        : '<p class="muted">Nobody is selling this item right now.</p>';
    }
    $('resellers').addEventListener('click', async (e) => {
      const b = e.target.closest('button[data-seller]');
      if (!b) return;
      const ok = await confirmDialog({
        title: 'Buy Item',
        message: `Are you sure you want to buy "${item.name}" from ${b.dataset.name} for ${Number(b.dataset.price).toLocaleString('en-US')} Owos?`,
        confirmText: 'Buy', cancelText: 'Cancel',
      });
      if (!ok) return;
      try {
        setBalance(await buyResale(item.id, b.dataset.seller));
        toast(`You got "${item.name}"!`);
        await refresh(); await loadResellers(); render();
      } catch (err) { console.error(err); toast(friendlyError(err)); await loadResellers(); }
    });

    await loadResellers();
    render();

    // Só a conta Owoxy (admin): apagar do catálogo e mudar o prazo de venda
    if (user.isAdmin) {
      $('admin-box').hidden = false;
      const toLocalInput = (iso) => { const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
      if (item.available_until) $('av-until').value = toLocalInput(item.available_until);
      $('av-save').addEventListener('click', async () => {
        const v = $('av-until').value;
        if (!v) { toast('Pick a date and time first (or press "No limit").'); return; }
        try { await setAvailability(item.id, new Date(v).toISOString()); toast('Sale end date saved'); await refresh(); }
        catch (err) { console.error(err); toast(friendlyError(err)); }
      });
      $('av-clear').addEventListener('click', async () => {
        try { await setAvailability(item.id, null); $('av-until').value = ''; toast('The sale has no end date now'); await refresh(); }
        catch (err) { console.error(err); toast(friendlyError(err)); }
      });
      $('i-delete').addEventListener('click', async () => {
        const ok = await confirmDialog({
          title: 'Delete from catalog',
          message: `Delete "${item.name}" from the catalog? It will also disappear from inventories and avatars.`,
          confirmText: 'Delete', cancelText: 'Cancel', danger: true,
        });
        if (!ok) return;
        try { await deleteItem(item.id); toast('Item deleted'); location.href = 'catalog.html'; }
        catch (err) { console.error(err); toast(friendlyError(err)); }
      });
    }
  }
}
