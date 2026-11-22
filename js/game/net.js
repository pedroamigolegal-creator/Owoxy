// Rede dos jogos: cada servidor é um canal do Supabase Realtime ("ttos-1", "nds-1"...).
// Presence = quem está no servidor. Broadcast = posições ('p') e chat ('c').
// O limite de 100 é conferido pela ordem de entrada na presence: quem ficar na posição 100 ou depois vai para o próximo servidor.
import { sb } from '../supabase.js';

export const MAX_PLAYERS = 100;
const MAX_SERVERS = 20;
const tabId = Math.random().toString(36).slice(2, 10);

const rankOf = (state) => Object.entries(state)
  .map(([key, metas]) => ({ key, ...(metas[0] || {}) }))
  .sort((a, b) => (a.t - b.t) || (a.key < b.key ? -1 : 1));

/**
 * Entra no primeiro servidor com vaga.
 * handlers: { onRoster(list), onPos(key, data), onChat(key, text), onProgress(text) }
 * Devolve { server, key, sendPos(data), sendChat(text), leave() }.
 */
export async function joinServer(user, handlers, prefix = 'ttos') {
  const key = `${user.id}:${tabId}`;
  for (let n = 1; n <= MAX_SERVERS; n++) {
    handlers.onProgress?.(`Looking for a server (${n})...`);
    const conn = await tryServer(n, user, key, handlers, prefix);
    if (conn) return conn;
  }
  throw new Error('All servers are full. Try again in a moment.');
}

function tryServer(n, user, key, handlers, prefix) {
  return new Promise((resolve, reject) => {
    const channel = sb.channel(`${prefix}-${n}`, { config: { presence: { key }, broadcast: { self: false, ack: false } } });
    let settled = false, joined = false, t = Date.now();

    const roster = () => rankOf(channel.presenceState()).slice(0, MAX_PLAYERS);
    const finish = (value) => { if (settled) return; settled = true; clearTimeout(timer); resolve(value); };
    const timer = setTimeout(() => { if (!settled) { settled = true; sb.removeChannel(channel); reject(new Error('Could not connect to the game server. Check your connection and try again.')); } }, 15000);

    channel.on('presence', { event: 'sync' }, () => { if (joined) handlers.onRoster?.(roster()); });
    channel.on('broadcast', { event: 'p' }, ({ payload }) => { if (joined && payload?.k) handlers.onPos?.(payload.k, payload); });
    channel.on('broadcast', { event: 'e' }, ({ payload }) => { if (joined && payload?.k) handlers.onEvent?.(payload.k, payload); });
    channel.on('broadcast', { event: 'c' }, ({ payload }) => { if (joined && payload?.k) handlers.onChat?.(payload.k, String(payload.m || '').slice(0, 120)); });

    channel.subscribe(async (status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        if (!settled) { settled = true; clearTimeout(timer); sb.removeChannel(channel); reject(new Error('Could not connect to the game server. Check your connection and try again.')); }
        return;
      }
      if (status !== 'SUBSCRIBED' || joined || settled) return;
      await channel.track({ t, uid: user.id, name: user.username, verified: Boolean(user.verified) });
      // espera a lista chegar e confere minha posição na fila
      setTimeout(async () => {
        if (settled) return;
        const list = rankOf(channel.presenceState());
        const mine = list.findIndex((p) => p.key === key);
        if (mine >= MAX_PLAYERS || mine === -1 && list.length >= MAX_PLAYERS) {
          settled = true; clearTimeout(timer);
          await channel.untrack().catch(() => {});
          sb.removeChannel(channel);
          resolve(null);          // cheio: tenta o próximo
          return;
        }
        joined = true;
        handlers.onRoster?.(roster());
        finish({
          server: n,
          key,
          sendPos: (d) => channel.send({ type: 'broadcast', event: 'p', payload: { ...d, k: key } }),
          sendEvent: (d) => channel.send({ type: 'broadcast', event: 'e', payload: { ...d, k: key } }),
          sendChat: (m) => channel.send({ type: 'broadcast', event: 'c', payload: { k: key, m } }),
          leave: async () => { try { await channel.untrack(); } catch { /* sem problema */ } sb.removeChannel(channel); },
        });
      }, 900);
    });
  });
}
