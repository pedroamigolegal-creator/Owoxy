import { requireUser } from './auth.js';
import { mountAvatar } from './avatar.js';
import { hydrateHeads, toast, verifiedBadge, userTile } from './common.js';
import { claimDaily, lookOfUser } from './items.js';
import { initShell, setBalance } from './shell.js';
import { listFriends } from './social.js';

const user = await requireUser();
if (user) {
  initShell(user, 'home');
  document.getElementById('username').textContent = user.username;
  if (user.verified) document.getElementById('badge').innerHTML = verifiedBadge();

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

  // Owos diários
  const daily = document.getElementById('daily');
  if (daily) daily.textContent = user.premium ? 'Claim 100 daily Owos (Premium)' : 'Claim 25 daily Owos';
  if (daily) daily.addEventListener('click', async () => {
    daily.disabled = true;
    try {
      const r = await claimDaily();
      if (r.claimed) { setBalance(r.balance); toast(`You got ${r.amount} Owos!`); }
      else toast('You already claimed today. Come back later!');
    } catch (err) { console.error(err); toast('Could not claim. Did you run supabase/004_catalog.sql?'); }
    daily.disabled = false;
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
