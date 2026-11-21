// Catálogo, inventário, Create e compras (funções do banco, ver supabase/004_catalog.sql).
import { rpc, sb } from './supabase.js';
import { CONFIG, SUPABASE } from './config.js';

const first = (d) => (Array.isArray(d) ? d[0] || null : d);

export const publicUrl = (path) => `${SUPABASE.url}/storage/v1/object/public/items/${path}`;

export const catalog = (kind = null, q = '', limit = 48, offset = 0) => rpc('catalog_list', { p_kind: kind, p_q: q, p_limit: limit, p_offset: offset });
export const getItem = async (id) => first(await rpc('get_item', { p_id: id }));
export const createItem = ({ kind, accessoryType = null, name, price = null, imagePath = null, meshPath = null, triangles = null }) =>
  rpc('create_item', { p_kind: kind, p_accessory_type: accessoryType, p_name: name, p_price: price, p_image_path: imagePath, p_mesh_path: meshPath, p_triangles: triangles });
export const setItemPrice = (id, price) => rpc('set_item_price', { p_id: id, p_price: price });
export const buyItem = (id) => rpc('buy_item', { p_id: id });
export const myInventory = (kind = null) => rpc('my_inventory', { p_kind: kind });
export const myCreations = (kind = null) => rpc('my_creations', { p_kind: kind });
export const equipItem = (id) => rpc('equip_item', { p_id: id });
export const unequipItem = (id) => rpc('unequip_item', { p_id: id });
export const deleteItem = (id) => rpc('delete_item', { p_id: id });
export const claimDaily = () => rpc('claim_daily');
const avatarLookRaw = (userId) => rpc('avatar_look', { p_user: userId });

// Preço como aparece no site: sem preço = Offsale, 0 = Free
export const priceLabel = (price) => (price == null ? 'Offsale' : price === 0 ? 'Free' : `${Number(price).toLocaleString('en-US')} ${CONFIG.currencyName}`);

export const KIND_LABEL = { shirt: 'Shirt', pants: 'Pants', accessory: 'Accessory' };
export const ACCESSORY_LABEL = { hat: 'Hat', hair: 'Hair', face: 'Face', back: 'Back' };

// Look (para o avatar 3D) de um item sozinho: o noob vestindo só aquele item
export function lookOfItem(item) {
  if (item.kind === 'shirt') return { shirt: publicUrl(item.image_path) };
  if (item.kind === 'pants') return { pants: publicUrl(item.image_path) };
  return { accessories: [accessoryOf(item)] };
}

const accessoryOf = (a) => ({ type: a.accessory_type || a.type, meshUrl: publicUrl(a.mesh_path), texUrl: a.image_path ? publicUrl(a.image_path) : null });

// Look montado a partir dos itens que a pessoa está vestindo (lista do inventário com equipped = true)
export function lookOfEquipped(colors, items) {
  const on = items.filter((i) => i.equipped);
  const shirt = on.find((i) => i.kind === 'shirt');
  const pants = on.find((i) => i.kind === 'pants');
  return {
    colors: colors || undefined,
    shirt: shirt ? publicUrl(shirt.image_path) : null,
    pants: pants ? publicUrl(pants.image_path) : null,
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
    accessories: (d.accessories || []).map(accessoryOf),
  };
}

// Miniatura que o catálogo mostra: o noob vestindo o item (cabeça e ombros para chapéus/cabelo/rosto)
export const thumbView = (item) => (item.kind === 'accessory' && ['hat', 'hair', 'face'].includes(item.accessory_type) ? 'bust' : 'full');

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
  if (m.includes('item not found')) return 'This item is no longer available.';
  if (m.includes('daily upload limit')) return 'You reached the daily upload limit. Try again tomorrow.';
  if (m.includes('too many triangles')) return 'The model has too many triangles (max 4000).';
  if (m.includes('admins only')) return 'Only the Owoxy account can do this.';
  if (m.includes('not your item')) return 'You can only change items you created.';
  if (m.includes('Could not find the function') || m.includes('PGRST202')) return 'The catalog is not ready yet. Run supabase/004_catalog.sql in Supabase.';
  return 'Something went wrong. Please try again.';
}
