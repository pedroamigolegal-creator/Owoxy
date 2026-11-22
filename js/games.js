import { requireUser } from './auth.js';
import { verifiedBadge } from './common.js';
import { cardHTML, GAME_LIST, GAMES, recentGames } from './game-data.js';
import { rpc } from './supabase.js';
import { initShell } from './shell.js';

const user = await requireUser();
if (user) {
  initShell(user, 'games');
  const v = verifiedBadge();
  const infos = {};
  await Promise.all(GAME_LIST.map(async (g) => { try { const r = await rpc('game_info', { p_game: g.id }); infos[g.id] = Array.isArray(r) ? r[0] : r; } catch { /* sem dados ainda */ } }));
  const fill = (el, ids) => { document.getElementById(el).innerHTML = ids.map((id) => cardHTML(GAMES[id], infos[id], { verified: v })).join(''); };
  fill('g-all', GAME_LIST.map((g) => g.id));
  const recent = recentGames();
  if (recent.length) { fill('g-recent', recent); document.getElementById('row-recent').hidden = false; }
  try {
    const favs = ((await rpc('my_fav_games')) || []).map((r) => (typeof r === 'string' ? r : r.game || r.my_fav_games)).filter((g) => GAMES[g]);
    if (favs.length) { fill('g-fav', favs); document.getElementById('row-fav').hidden = false; }
  } catch { /* migration 008 ainda não rodou */ }
}
