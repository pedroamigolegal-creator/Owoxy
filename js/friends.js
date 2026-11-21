import { requireUser } from './auth.js';
import { esc, hydrateHeads, miniNoob, toast, userTile, verifiedBadge } from './common.js';
import { initShell } from './shell.js';
import { friendRequests, getProfile, listFriends, respondFriendRequest } from './social.js';

const user = await requireUser();
if (user) {
  initShell(user, 'friends');
  const name = new URLSearchParams(location.search).get('u');
  const owner = name && name.toLowerCase() !== user.username.toLowerCase() ? await getProfile(name) : null;
  const isSelf = !owner;
  const targetId = isSelf ? user.id : owner.id;
  document.getElementById('title').textContent = isSelf ? 'Friends' : `${owner.username}'s Friends`;

  async function render() {
    try {
      const friends = await listFriends(targetId);
      document.getElementById('f-count').textContent = friends.length;
      document.getElementById('friends').innerHTML = friends.length ? friends.map(userTile).join('') : '<p class="muted">No friends yet.</p>';
      hydrateHeads(document.getElementById('friends'));

      if (isSelf) {
        const reqs = await friendRequests();
        document.getElementById('requests-wrap').hidden = reqs.length === 0;
        document.getElementById('req-count').textContent = reqs.length;
        document.getElementById('requests').innerHTML = reqs.map((r) => `
          <div class="friend req">
            <a href="profile.html?u=${encodeURIComponent(r.username)}"><div class="friend-pic">${miniNoob(r.avatar_colors)}<img alt="" data-head="${r.id}" data-colors="${esc(JSON.stringify(r.avatar_colors || {}))}"></div>
            <span class="friend-name">${esc(r.username)}${r.verified ? verifiedBadge() : ''}</span></a>
            <div class="req-actions"><button class="btn-green sm" data-id="${r.id}" data-ok="1">Accept</button><button class="btn-gray sm" data-id="${r.id}" data-ok="0">Decline</button></div>
          </div>`).join('');
        hydrateHeads(document.getElementById('requests'));
      }
    } catch (err) {
      console.error(err);
      document.getElementById('friends').innerHTML = '<p class="muted">Could not load friends. Did you run supabase/003_social.sql?</p>';
    }
  }

  document.getElementById('requests').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-id]');
    if (!b) return;
    try { await respondFriendRequest(b.dataset.id, b.dataset.ok === '1'); toast(b.dataset.ok === '1' ? 'Friend added!' : 'Request declined'); render(); }
    catch (err) { console.error(err); toast('Something went wrong. Try again.'); }
  });
  render();
}
