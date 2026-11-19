import { requireUser, logOut } from './auth.js';
import { mountAvatar } from './avatar.js';
import { formatCompact, toast } from './common.js';
import { CONFIG } from './config.js';

const user = requireUser();
if (user) {
  document.getElementById('username').textContent = user.username;
  document.getElementById('side-user').textContent = user.username;
  document.getElementById('balance').textContent = formatCompact(user.balance);
  document.getElementById('balance-wrap').title = `${user.balance} ${CONFIG.currencyName}`;

  // Foto de perfil = cabeça do noob 3D
  const canvas = document.getElementById('avatar-canvas');
  mountAvatar(canvas, { view: 'head', modelUrl: user.avatar?.model }).catch((err) => {
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

// Menu da engrenagem
const gear = document.getElementById('gear');
const menu = document.getElementById('gear-menu');
gear.addEventListener('click', (e) => { e.stopPropagation(); menu.classList.toggle('open'); });
document.addEventListener('click', () => menu.classList.remove('open'));
document.getElementById('logout').addEventListener('click', () => { logOut(); location.href = 'login.html'; });

// Busca (ainda não implementada)
document.getElementById('search').addEventListener('keydown', (e) => { if (e.key === 'Enter') toast('Search is coming soon!'); });
