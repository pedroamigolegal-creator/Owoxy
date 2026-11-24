// Create > Games: lista os jogos do Owoxy no estilo da página My Creations do Roblox.
import { requireUser } from './auth.js';
import { toast, verifiedBadge } from './common.js';
import { GAME_LIST } from './game-data.js';
import { initShell } from './shell.js';

const user = await requireUser();
if (user) {
  initShell(user, 'create');
  document.title = 'Owoxy - Create Games';
  const $ = (id) => document.getElementById(id);
  document.querySelectorAll('#create-nav a[data-admin]').forEach((a) => { a.hidden = !user.isAdmin; });
  document.querySelectorAll('#create-nav a[data-t]').forEach((a) => a.classList.toggle('on', a.dataset.t === 'games'));
  $('items-pane').hidden = true;
  const pane = $('games-pane'); pane.hidden = false;
  pane.innerHTML = `<button class="rb-green" id="new-game" type="button">Create New Game</button>
    <h1 class="rb-title sm">Games</h1>
    <label class="rb-check"><input type="checkbox" id="pub-only"> Show Public Only</label>
    <div class="rb-rows">${GAME_LIST.map((g) => `<div class="rb-row"><img src="${g.thumb}" alt="" width="64" height="64">
      <div class="rb-row-main"><b>${g.title}</b><small>By Owoxy ${verifiedBadge()}</small><span class="rb-pub">Public</span></div>
      <a class="rb-btn" href="game-page.html?g=${g.id}">View</a></div>`).join('')}</div>`;
  $('new-game').addEventListener('click', () => toast('Creating your own games is coming soon to Owoxy.'));
}
