// Parte comum das páginas logadas: barra de cima (saldo, engrenagem, busca) e nome no menu lateral.
import { logOut } from './auth.js';
import { formatCompact, toast } from './common.js';
import { CONFIG } from './config.js';

export function initShell(user) {
  document.getElementById('side-user').textContent = user.username;
  document.getElementById('balance').textContent = formatCompact(user.balance);
  document.getElementById('balance-wrap').title = `${user.balance} ${CONFIG.currencyName}`;

  const gear = document.getElementById('gear');
  const menu = document.getElementById('gear-menu');
  gear.addEventListener('click', (e) => { e.stopPropagation(); menu.classList.toggle('open'); });
  document.addEventListener('click', () => menu.classList.remove('open'));
  document.getElementById('logout').addEventListener('click', async () => { await logOut(); location.href = 'login.html'; });

  document.getElementById('search').addEventListener('keydown', (e) => { if (e.key === 'Enter') toast('Search is coming soon!'); });
}
