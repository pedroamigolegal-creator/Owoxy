import { requireUser } from './auth.js';
import { esc, toast, verifiedBadge } from './common.js';
import { GAMES, pct, pushRecent } from './game-data.js';
import { friendlyError } from './items.js';
import { rpc } from './supabase.js';
import { liveCounts, MAX_PLAYERS } from './game/net.js';
import { initShell } from './shell.js';

const user = await requireUser();
if (user) {
  initShell(user, 'games');
  const id = new URLSearchParams(location.search).get('g');
  const g = GAMES[id];
  const root = document.getElementById('gp');
  if (!g) { document.getElementById('main').innerHTML = '<h1 class="page-title">Game not found</h1><p><a href="games.html">Back to Games</a></p>'; }
  else {
    document.title = `Owoxy - ${g.title}`;
    let info = { likes: 0, dislikes: 0, favorites: 0, visits: 0, my_vote: 0, my_fav: false };
    try { info = await rpc('game_info', { p_game: id }) || info; if (Array.isArray(info)) info = info[0] || {}; } catch (err) { console.error(err); }
    root.innerHTML = `
      <div class="gp-thumb"><img src="${g.thumb}" alt="" width="512" height="512"></div>
      <div>
        <h1 class="gp-title">${esc(g.title)}</h1>
        <p class="gp-by">By <b>Owoxy</b> ${verifiedBadge()}</p>
        <button class="gp-play" id="play" type="button">&#9654; Play</button>
        <div class="gp-actions">
          <button id="like" type="button">&#128077; <span id="n-like"></span></button>
          <button id="dislike" type="button">&#128078; <span id="n-dislike"></span></button>
          <button id="fav" type="button">&#9733; Favorite <span id="n-fav"></span></button>
          <span id="pctbar" class="muted"></span>
        </div>
        <div class="gp-stats"><div><b id="s-now">-</b><span>Active</span></div><div><b id="s-fav">0</b><span>Favorites</span></div><div><b id="s-visits">0</b><span>Visits</span></div><div><b>${MAX_PLAYERS}</b><span>Server size</span></div></div>
        <div class="gp-tabs"><button class="on" data-t="about" type="button">About</button><button data-t="servers" type="button">Servers</button></div>
        <section id="t-about"><p>${esc(g.about)}</p><h3>Controls</h3><ul>${g.controls.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></section>
        <section id="t-servers" hidden><div class="srv-list" id="srv-list"><p class="muted">Loading servers...</p></div></section>
      </div>`;
    const $ = (s) => root.querySelector(s);
    function paint() {
      $('#n-like').textContent = info.likes; $('#n-dislike').textContent = info.dislikes;
      $('#n-fav').textContent = info.favorites; $('#s-fav').textContent = info.favorites; $('#s-visits').textContent = Number(info.visits).toLocaleString();
      $('#like').classList.toggle('on', info.my_vote === 1); $('#dislike').classList.toggle('on', info.my_vote === -1); $('#fav').classList.toggle('on', Boolean(info.my_fav));
      const p = pct(info); $('#pctbar').textContent = p === null ? '' : `${p}% liked`;
    }
    paint();
    const play = (s) => {
      pushRecent(id);
      rpc('record_visit', { p_game: id }).catch(() => {});
      location.href = `game.html?g=${id}${s ? `&s=${s}` : ''}`;
    };
    $('#play').addEventListener('click', () => play(0));
    async function vote(v) {
      const next = info.my_vote === v ? 0 : v;
      try { await rpc('vote_game', { p_game: id, p_vote: next }); info = (await rpc('game_info', { p_game: id })) || info; if (Array.isArray(info)) info = info[0]; paint(); } catch (err) { toast(friendlyError(err)); }
    }
    $('#like').addEventListener('click', () => vote(1));
    $('#dislike').addEventListener('click', () => vote(-1));
    $('#fav').addEventListener('click', async () => {
      try { await rpc('toggle_fav_game', { p_game: id }); info = (await rpc('game_info', { p_game: id })) || info; if (Array.isArray(info)) info = info[0]; paint(); } catch (err) { toast(friendlyError(err)); }
    });
    root.querySelectorAll('.gp-tabs button').forEach((b) => b.addEventListener('click', () => {
      root.querySelectorAll('.gp-tabs button').forEach((x) => x.classList.toggle('on', x === b));
      $('#t-about').hidden = b.dataset.t !== 'about'; $('#t-servers').hidden = b.dataset.t !== 'servers';
    }));
    liveCounts(id, 6).then((counts) => {
      $('#s-now').textContent = counts.reduce((a, b) => a + b, 0);
      $('#srv-list').innerHTML = counts.map((c, i) => `<div class="srv"><b>Server ${i + 1}</b><div class="bar"><i style="width:${(c / MAX_PLAYERS) * 100}%"></i></div><span>${c} of ${MAX_PLAYERS} players</span><button type="button" data-s="${i + 1}" ${c >= MAX_PLAYERS ? 'disabled' : ''}>Join</button></div>`).join('');
      $('#srv-list').addEventListener('click', (e) => { const b = e.target.closest('button[data-s]'); if (b) play(Number(b.dataset.s)); });
    }).catch(() => { $('#srv-list').innerHTML = '<p class="muted">Could not load servers.</p>'; });
  }
}
