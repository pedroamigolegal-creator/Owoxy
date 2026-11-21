// Parte comum das páginas logadas: injeta a barra de cima e o menu lateral, e liga busca, engrenagem e mensagens.
import { logOut } from './auth.js';
import { formatCompact, hydrate } from './common.js';
import { CONFIG } from './config.js';
import { unreadCount } from './social.js';

const NAV = [
  ['home', 'Home', 'home.html', 'home'],
  ['profile', 'Profile', 'profile.html', 'profile'],
  ['messages', 'Messages', 'messages.html', 'chat'],
  ['friends', 'Friends', 'friends.html', 'groups'],
  ['avatar', 'Avatar', 'avatar.html', 'avatar'],
  ['inventory', 'Inventory', 'inventory.html', 'inventory'],
  ['groups', 'Groups', null, 'groups'],
  ['premium', 'Premium', 'premium.html', 'premium'],
];

export function initShell(user, active, { query = '' } = {}) {
  document.getElementById('topbar-slot').innerHTML = `
  <header class="topbar">
    <a class="logo" href="home.html"><i></i>OWOXY</a>
    <nav>
      <a href="home.html">Home</a>
      <a href="#" data-soon>Games</a>
      <a href="catalog.html">Catalog</a>
      <a href="create.html">Create</a>
    </nav>
    <form class="search" id="search-form" role="search"><input id="search" name="q" placeholder="Search" aria-label="Search" autocomplete="off" maxlength="20"></form>
    <div class="right">
      <a class="icon-btn" href="messages.html" aria-label="Messages"><span data-i="chat"></span><b class="count" id="msg-count" hidden></b></a>
      <span class="balance" id="balance-wrap" title="${user.balance} ${CONFIG.currencyName}"><span data-i="coin"></span><span id="balance-num">${formatCompact(user.balance)}</span></span>
      <div class="gear-wrap">
        <button class="icon-btn" id="gear" data-i="gear" aria-label="Settings"></button>
        <div class="gear-menu" id="gear-menu">
          <button data-soon>Settings</button>
          <button id="logout">Log Out</button>
        </div>
      </div>
    </div>
  </header>`;

  document.getElementById('sidebar-slot').innerHTML =
    `<div class="user">${user.username.replace(/[<>&"]/g, '')}</div>` +
    NAV.map(([key, label, href, ico]) =>
      `<a ${key === active ? 'class="active"' : ''} href="${href || '#'}" ${href ? '' : 'data-soon'}><span data-i="${ico}"></span>${label}</a>`).join('') +
    '<div class="section-title">Events</div>';

  hydrate();

  document.getElementById('search').value = query;
  document.getElementById('search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = document.getElementById('search').value.trim();
    if (q) location.href = `search.html?q=${encodeURIComponent(q)}`;
  });

  const gear = document.getElementById('gear');
  const menu = document.getElementById('gear-menu');
  gear.addEventListener('click', (e) => { e.stopPropagation(); menu.classList.toggle('open'); });
  document.addEventListener('click', () => menu.classList.remove('open'));
  document.getElementById('logout').addEventListener('click', async () => { await logOut(); location.href = 'login.html'; });

  refreshUnread();
}

export async function refreshUnread() {
  try {
    const n = await unreadCount();
    const el = document.getElementById('msg-count');
    if (!el) return;
    el.hidden = !n;
    el.textContent = n > 99 ? '99+' : n;
  } catch { /* sem contador */ }
}

// Atualiza o saldo mostrado na barra de cima (depois de comprar, receber Owos etc.)
export function setBalance(n) {
  const num = document.getElementById('balance-num');
  if (num) num.textContent = formatCompact(Number(n));
  const wrap = document.getElementById('balance-wrap');
  if (wrap) wrap.title = `${n} ${CONFIG.currencyName}`;
}
