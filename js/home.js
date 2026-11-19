import { requireUser } from './auth.js';
import { mountAvatar } from './avatar.js';
import { verifiedBadge } from './common.js';
import { initShell } from './shell.js';

const user = await requireUser();
if (user) {
  initShell(user);
  document.getElementById('username').textContent = user.username;
  if (user.verified) document.getElementById('badge').innerHTML = verifiedBadge();

  // Foto de perfil = cabeça do noob 3D
  const canvas = document.getElementById('avatar-canvas');
  mountAvatar(canvas, { view: 'head', modelUrl: user.avatar?.model, colors: user.avatar?.colors }).catch((err) => {
    console.error('Não foi possível carregar o avatar 3D:', err);
    const fallback = document.createElement('div');
    fallback.className = 'avatar-fallback';
    fallback.textContent = user.username[0].toUpperCase();
    canvas.replaceWith(fallback);
  });

  // Amigos
  const friends = user.friends || [];
  document.getElementById('friends-count').textContent = friends.length;
  const row = document.getElementById('friends-row');
  if (!friends.length) {
    row.innerHTML = '<p class="muted pad">No friends yet. Search for people to add them!</p>';
  } else {
    row.innerHTML = friends.map((f) =>
      `<div class="friend"><div class="friend-pic">${f.username[0].toUpperCase()}</div><span>${f.username}</span></div>`).join('');
  }
}
