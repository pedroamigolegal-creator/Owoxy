import { requireUser } from './auth.js';
import { mountAvatar } from './avatar.js';
import { hydrateHeads, toast, verifiedBadge, userTile } from './common.js';
import { lookOfUser } from './items.js';
import { initShell, setBalance } from './shell.js';
import { listFriends } from './social.js';
import { cardHTML, GAME_LIST, recentGames, GAMES } from './game-data.js';

const user = await requireUser();
if (user) {
  initShell(user, 'home');
  document.getElementById('username').textContent = user.username;
  if (user.verified) document.getElementById('badge').innerHTML = verifiedBadge();

  { const rec = recentGames(); const ids = [...rec, ...GAME_LIST.map((g) => g.id).filter((i) => !rec.includes(i))];
    document.getElementById('home-grid').innerHTML = ids.map((i) => cardHTML(GAMES[i], null, { verified: verifiedBadge() })).join(''); }

  // Foto de perfil = cabeça do noob 3D
  const canvas = document.getElementById('avatar-canvas');
  const look = await lookOfUser(user.id).catch(() => ({}));
  mountAvatar(canvas, { view: 'head', modelUrl: user.avatar?.model, colors: user.avatar?.colors, look: { colors: user.avatar?.colors, ...look } }).catch((err) => {
    console.error('Não foi possível carregar o avatar 3D:', err);
    const fallback = document.createElement('div');
    fallback.className = 'avatar-fallback';
    fallback.textContent = user.username[0].toUpperCase();
    canvas.replaceWith(fallback);
  });

  // Amigos
  const row = document.getElementById('friends-row');
  try {
    const friends = await listFriends(user.id);
    document.getElementById('friends-count').textContent = friends.length;
    row.innerHTML = friends.length
      ? friends.map(userTile).join('')
      : '<p class="muted pad">No friends yet. Use the search bar to find people and add them!</p>';
    hydrateHeads(row);
  } catch (err) {
    console.error(err);
    row.innerHTML = '<p class="muted pad">Could not load friends. Did you run supabase/003_social.sql?</p>';
  }
}
