// Catálogo, inventário, Create e compras (funções do banco, ver supabase/004_catalog.sql).
import { rpc, sb } from './supabase.js';
import { CONFIG, SUPABASE } from './config.js';

const first = (d) => (Array.isArray(d) ? d[0] || null : d);

export const publicUrl = (path) => `${SUPABASE.url}/storage/v1/object/public/items/${path}`;

export const catalog = (kind = null, q = '', limit = 48, offset = 0, showOffsale = false) => rpc('catalog_list', { p_kind: kind, p_q: q, p_limit: limit, p_offset: offset, p_show_offsale: showOffsale });
export const getItem = async (id) => first(await rpc('get_item', { p_id: id }));
export const createItem = ({ kind, accessoryType = null, name, price = null, imagePath = null, meshPath = null, triangles = null,
  offset = [0, 0, 0], scale = 1, limited = null, stock = null, until = null }) =>
  rpc('create_item', {
    p_kind: kind, p_accessory_type: accessoryType, p_name: name, p_price: price, p_image_path: imagePath, p_mesh_path: meshPath,
    p_triangles: triangles, p_off_x: offset[0], p_off_y: offset[1], p_off_z: offset[2],
    p_limited: limited, p_stock: stock, p_until: until, p_scale: scale,   // limited / stock / until: só a conta Owoxy
  });
export const setItemPrice = (id, price) => rpc('set_item_price', { p_id: id, p_price: price });
export const buyItem = (id) => rpc('buy_item', { p_id: id });
export const myInventory = (kind = null) => rpc('my_inventory', { p_kind: kind });
export const myCreations = (kind = null) => rpc('my_creations', { p_kind: kind });
export const equipItem = (id) => rpc('equip_item', { p_id: id });
export const unequipItem = (id) => rpc('unequip_item', { p_id: id });
export const deleteItem = (id) => rpc('delete_item', { p_id: id });
export const claimDaily = () => rpc('claim_daily');
export const listResale = (id, price) => rpc('list_resale', { p_id: id, p_price: price });
export const cancelResale = (id) => rpc('cancel_resale', { p_id: id });
export const itemResales = (id) => rpc('item_resales', { p_id: id });
export const buyResale = (id, sellerId) => rpc('buy_resale', { p_id: id, p_seller: sellerId });
export const setAvailability = (id, until) => rpc('set_item_availability', { p_id: id, p_until: until });
export const setPremium = (username, days) => rpc('admin_set_premium', { p_username: username, p_days: days });

export const LIMITED_LABEL = { limited: 'Limited', unique: 'Limited U' };
export const RESALE_FEE = 0.3;   // 30% de taxa na revenda (o vendedor recebe 70%)

// Estado da venda oficial: 'open' | 'offsale' | 'ended' | 'soldout'
export function saleState(i) {
  if (i.price == null) return 'offsale';
  if (i.available_until && new Date(i.available_until) <= new Date()) return 'ended';
  if (i.limited_kind === 'unique' && i.sold >= (i.stock || 0)) return 'soldout';
  return i.open_now === false ? 'offsale' : 'open';
}

// "2d 3h 5m" / "4m 10s" até uma data
export function timeLeft(until) {
  let s = Math.max(0, Math.floor((new Date(until) - Date.now()) / 1000));
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  return d ? `${d}d ${h}h ${m}m` : h ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
}
const avatarLookRaw = (userId) => rpc('avatar_look', { p_user: userId });

// Preço como aparece no site: sem preço = Offsale, 0 = Free
export const priceLabel = (price) => (price == null ? 'Offsale' : price === 0 ? 'Free' : `${Number(price).toLocaleString('en-US')} ${CONFIG.currencyName}`);

export const KIND_LABEL = { shirt: 'Shirt', pants: 'Pants', accessory: 'Accessory', facedecal: 'Face' };
export const ACCESSORY_LABEL = { hat: 'Hat', hair: 'Hair', face: 'Face', back: 'Back' };

// Look (para o avatar 3D) de um item sozinho: o noob vestindo só aquele item
export function lookOfItem(item) {
  if (item.kind === 'shirt') return { shirt: publicUrl(item.image_path) };
  if (item.kind === 'pants') return { pants: publicUrl(item.image_path) };
  if (item.kind === 'facedecal') return { face: publicUrl(item.image_path) };
  return { accessories: [accessoryOf(item)] };
}

const accessoryOf = (a) => ({
  type: a.accessory_type || a.type,
  meshUrl: publicUrl(a.mesh_path),
  texUrl: a.image_path ? publicUrl(a.image_path) : null,
  offset: [a.offset_x || 0, a.offset_y || 0, a.offset_z || 0],   // posição corrigida
  scale: a.scale || 1,                                           // tamanho corrigido
});

// Look montado a partir dos itens que a pessoa está vestindo (lista do inventário com equipped = true)
export function lookOfEquipped(colors, items) {
  const on = items.filter((i) => i.equipped);
  const shirt = on.find((i) => i.kind === 'shirt');
  const pants = on.find((i) => i.kind === 'pants');
  return {
    colors: colors || undefined,
    shirt: shirt ? publicUrl(shirt.image_path) : null,
    pants: pants ? publicUrl(pants.image_path) : null,
    face: on.find((i) => i.kind === 'facedecal') ? publicUrl(on.find((i) => i.kind === 'facedecal').image_path) : null,
    accessories: on.filter((i) => i.kind === 'accessory').map(accessoryOf),
  };
}

// Look de uma pessoa (cores + roupas vestidas)
export async function lookOfUser(userId) {
  const d = await avatarLookRaw(userId);
  if (!d) return {};
  return {
    colors: d.colors || undefined,
    shirt: d.shirt ? publicUrl(d.shirt.image_path) : null,
    pants: d.pants ? publicUrl(d.pants.image_path) : null,
    face: d.face ? publicUrl(d.face.image_path) : null,
    accessories: (d.accessories || []).map(accessoryOf),
  };
}

// Sales e Owners de vários itens: devolve Map(id -> { sales, owners })
export async function itemsStats(ids) {
  if (!ids.length) return new Map();
  try { return new Map((await rpc('items_stats', { p_ids: ids })).map((r) => [Number(r.id), r])); } catch { return new Map(); }   // migração 010 ainda não rodou
}
export const statsText = (s) => `${Number(s?.sales || 0).toLocaleString('en-US')} sales &middot; ${Number(s?.owners || 0).toLocaleString('en-US')} owners`;

// Miniatura só do item (sem o noob): roupas e rostos mostram a própria imagem; acessórios 3D são renderizados sozinhos.
export function loadItemThumb(item, img) {
  const done = (url) => { img.src = url; img.classList.add('ready'); };
  if (item.kind === 'facedecal') { img.classList.add('face'); done(publicUrl(item.image_path)); return Promise.resolve(); }   // rosto: só a imagem, sem fundo
  if (item.kind !== 'accessory') {                                                                                       // camisa/calça: noob pequeno vestindo
    return import('./avatar.js').then((m) => m.renderThumbnail(lookOfItem(item), { view: 'mini', key: String(item.id) })).then(done).catch((err) => console.error('Miniatura falhou:', err));
  }
  return import('./avatar.js')
    .then((m) => m.renderObjectThumbnail({ meshUrl: publicUrl(item.mesh_path), texUrl: item.image_path ? publicUrl(item.image_path) : null, key: `${item.id}|${item.mesh_path}` }))
    .then(done)
    .catch((err) => console.error('Miniatura falhou:', err));
}

// Miniatura que o catálogo mostra: o noob vestindo o item (cabeça e ombros para chapéus/cabelo/rosto)
export const thumbView = (item) => (item.kind === 'facedecal' ? 'head' : item.kind === 'accessory' && ['hat', 'hair', 'face'].includes(item.accessory_type) ? 'bust' : 'full');

// Envia um arquivo para a pasta da própria pessoa e devolve o caminho salvo
export async function uploadFile(userId, file, ext, contentType) {
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage.from('items').upload(path, file, { contentType, upsert: false });
  if (error) throw error;
  return path;
}

// Mensagem amigável para os erros do banco
export function friendlyError(err) {
  const m = String(err?.message || err || '');
  if (m.includes('not enough owos')) return "You don't have enough Owos. Claim your daily Owos on the Home page!";
  if (m.includes('already owned')) return 'You already own this item.';
  if (m.includes('offsale')) return 'This item is not for sale.';
  if (m.includes('sold out')) return 'This item is sold out.';
  if (m.includes('sale ended')) return 'The sale of this item has ended.';
  if (m.includes('listing gone')) return 'This listing is no longer available.';
  if (m.includes('cannot buy your own')) return 'You cannot buy your own listing.';
  if (m.includes('not resellable')) return 'Only Limited items can be resold.';
  if (m.includes('invalid end date')) return 'The end date must be in the future.';
  if (m.includes('invalid stock')) return 'Stock must be a whole number from 1 to 100,000.';
  if (m.includes('invalid days')) return 'Days must be from 0 to 3650.';
  if (m.includes('no such user')) return 'No user with that name.';
  if (m.includes('item not found')) return 'This item is no longer available.';
  if (m.includes('daily upload limit')) return 'You reached the daily upload limit. Try again tomorrow.';
  if (m.includes('too many triangles')) return 'The model has too many triangles (max 4000).';
  if (m.includes('cannot moderate yourself')) return 'You cannot do this to your own account.';
  if (m.includes('cannot moderate an admin')) return 'You cannot do this to an admin account.';
  if (m.includes('too many reports')) return 'You sent too many reports today. Try again tomorrow.';
  if (m.includes('invalid reason')) return 'Pick a reason for the report.';
  if (m.includes('community name taken')) return 'A group with that name already exists.';
  if (m.includes('invalid community name')) return 'Group names use 3-30 letters, numbers, spaces, . _ -';
  if (m.includes('too many communities')) return 'You reached the groups limit.';
  if (m.includes('owner cannot leave')) return 'The owner cannot leave. Delete the group instead.';
  if (m.includes('not the owner')) return 'Only the owner can do that.';
  if (m.includes('cannot follow yourself')) return 'You cannot follow yourself.';
  if (m.includes('admins only')) return 'Only the Owoxy account can do this.';
  if (m.includes('friend requests disabled')) return 'This user is not accepting friend requests.';
  if (m.includes('messages disabled')) return 'This user turned off messages.';
  if (m.includes('invalid scale')) return 'Scale must be between 0.05 and 20.';
  if (m.includes('not your item')) return 'You can only change items you created.';
  if (m.includes('Could not find the function') || m.includes('PGRST202')) return 'The database is out of date. In Supabase, run supabase/004 to 008 (004_catalog, 005_limiteds_premium, 006_fees_faces_settings, 007_created_accounts, 008_moderation_games) in this order, then refresh the site.';
  return 'Something went wrong. Please try again.';
}
