// Cartões de item (catálogo, inventário, Create): miniatura 3D do noob vestindo o item, nome, criador e preço.
import { esc, icon, verifiedBadge } from './common.js';
import { lookOfItem, thumbView } from './items.js';
import { renderThumbnail } from './avatar.js';

// Sem preço = Offsale, 0 = Free
export function priceHTML(price) {
  if (price == null) return '<span class="price off">Offsale</span>';
  if (price === 0) return '<span class="price free">Free</span>';
  return `<span class="price">${icon('coin')}${Number(price).toLocaleString('en-US')}</span>`;
}

export function itemCard(item, { extra = '', tag = '' } = {}) {
  return `<div class="cat-item" data-id="${item.id}">
    <a class="cat-link" href="item.html?id=${item.id}">
      <div class="cat-thumb"><img alt="" data-thumb="${item.id}">${tag}</div>
      <div class="cat-name">${esc(item.name)}</div>
      <div class="cat-by">By ${esc(item.creator_name)}${item.creator_verified ? verifiedBadge() : ''}</div>
      ${priceHTML(item.price)}
    </a>${extra}</div>`;
}

// Gera as miniaturas uma de cada vez (todas usam o mesmo canvas 3D)
export function loadThumbs(root, items) {
  for (const item of items) {
    const img = root.querySelector(`img[data-thumb="${item.id}"]`);
    if (!img) continue;
    renderThumbnail(lookOfItem(item), { view: thumbView(item), key: item.id })
      .then((url) => { img.src = url; img.classList.add('ready'); })
      .catch((err) => console.error('Miniatura falhou:', err));
  }
}
