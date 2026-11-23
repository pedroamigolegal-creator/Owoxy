// Cartões de item (catálogo, inventário, Create): miniatura 3D do noob vestindo o item, nome, criador e preço.
import { esc, icon, verifiedBadge } from './common.js';
import { LIMITED_LABEL, loadItemThumb, saleState } from './items.js';

const coin = (n) => `<span class="price">${icon('coin')}${Number(n).toLocaleString('en-US')}</span>`;

// Sem preço = Offsale, 0 = Free. Limited fora de venda mostra o menor preço de revenda.
export function priceHTML(item) {
  const state = saleState(item);
  if (state === 'open') return item.price === 0 ? '<span class="price free">Free</span>' : coin(item.price);
  if (item.limited_kind && item.resale_from != null) return `<span class="price best">Best price ${coin(item.resale_from)}</span>`;
  if (state === 'soldout') return '<span class="price off">Sold out</span>';
  if (state === 'ended') return '<span class="price off">Sale ended</span>';
  return '<span class="price off">Offsale</span>';
}

export const limitedBadge = (item) => (item.limited_kind
  ? `<span class="ltd-badge ${item.limited_kind}">${LIMITED_LABEL[item.limited_kind]}${item.serial ? ` #${item.serial}` : ''}</span>` : '');

export function itemCard(item, { extra = '', tag = '' } = {}) {
  return `<div class="cat-item" data-id="${item.id}">
    <a class="cat-link" href="item.html?id=${item.id}">
      <div class="cat-thumb"><img alt="" data-thumb="${item.id}">${tag}${limitedBadge(item)}</div>
      <div class="cat-name">${esc(item.name)}</div>
      <div class="cat-by">By ${esc(item.creator_name)}${item.creator_verified ? verifiedBadge() : ''}</div>
      ${priceHTML(item)}
    </a>${extra}</div>`;
}

// Mostra a imagem de cada item (sem o noob). Acessórios 3D são gerados um de cada vez.
export function loadThumbs(root, items) {
  for (const item of items) {
    const img = root.querySelector(`img[data-thumb="${item.id}"]`);
    if (img) loadItemThumb(item, img);
  }
}
