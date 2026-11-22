// Dados dos jogos para as páginas do site (lista, detalhes, home).
export const GAMES = {
  ttos: {
    id: 'ttos', title: 'Talk To Others', thumb: 'assets/games/talk-to-others.svg',
    short: 'Chat and hang out in a small town',
    about: 'Welcome to Talk To Others! Meet people in a cozy little town, chat, wave, dance and make friends. Customize your avatar in the editor and show it off to everyone in the server.',
    controls: ['Move: W A S D or arrow keys (joystick on mobile)', 'Jump: Space', 'Camera: hold the right mouse button and drag (drag the screen on mobile)', 'Chat: press / or click the chat box. Try /wave and /dance', 'Menu: Esc'],
  },
  nds: {
    id: 'nds', title: 'Natural Disaster Survival', thumb: 'assets/games/natural-disaster-survival.svg',
    short: 'Survive 8 different disasters',
    about: 'A disaster is coming! Each round you get a few seconds to look around the island, then a random natural disaster hits. Find high ground, avoid water and lava, and be the last one standing. Survive to win!',
    controls: ['Move: W A S D or arrow keys (joystick on mobile)', 'Jump: Space', 'Camera: hold the right mouse button and drag', 'Chat: press / or click the chat box', 'Menu: Esc'],
  },
};
export const GAME_LIST = Object.values(GAMES);
export const RECENT_KEY = 'owoxy.recentGames';
export function recentGames() { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').filter((g) => GAMES[g]); } catch { return []; } }
export function pushRecent(id) { try { localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...recentGames().filter((g) => g !== id)].slice(0, 6))); } catch { /* sem storage */ } }
export const pct = (info) => { const t = (info?.likes || 0) + (info?.dislikes || 0); return t ? Math.round((info.likes / t) * 100) : null; };
export function cardHTML(g, info, { verified = '' } = {}) {
  const p = pct(info);
  return `<a class="game-card" href="game-page.html?g=${g.id}"><div class="game-thumb"><img src="${g.thumb}" alt="" width="512" height="512"></div><h3>${g.title}</h3><p class="by">By Owoxy ${verified}</p><p class="rate">${p === null ? 'No votes yet' : `\u{1F44D} ${p}%`}${info ? ` &middot; ${Number(info.visits || 0).toLocaleString()} visits` : ''}</p></a>`;
}
