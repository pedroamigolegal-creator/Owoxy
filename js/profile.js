import { requireUser } from './auth.js';
import { mountAvatar } from './avatar.js';
import { hydrateHeads, toast, userTile, verifiedBadge } from './common.js';
import { CONFIG } from './config.js';
import { friendlyError, lookOfUser } from './items.js';
import { initShell } from './shell.js';
import { friendStatus, getProfile, listFriends, removeFriend, respondFriendRequest, saveAbout, sendFriendRequest, sendMessage } from './social.js';

const me = await requireUser();
if (me) {
  initShell(me, 'profile');
  const $ = (id) => document.getElementById(id);
  const name = new URLSearchParams(location.search).get('u') || me.username;

  let p = null;
  try { p = await getProfile(name); } catch (err) { console.error(err); }
  $('loading').hidden = true;
  if (!p) {
    $('loading').hidden = false;
    $('loading').textContent = 'User not found. (If this is unexpected, make sure you ran supabase/003_social.sql.)';
  } else {
    $('profile').hidden = false;
    const isSelf = p.id === me.id;
    const colors = { ...CONFIG.defaultColors, ...(p.avatar_colors || {}) };
    document.title = `Owoxy - ${p.username}`;

    const look = { colors, ...(await lookOfUser(p.id).catch(() => ({}))) };

    // Cabeçalho
    $('p-name').textContent = p.username;
    if (p.verified) $('p-badge').innerHTML = verifiedBadge();
    mountAvatar($('head'), { view: 'head', modelUrl: p.avatar_model, colors, look })
      .catch((err) => console.error('Avatar 3D indisponível:', err));

    // About
    const aboutEl = $('about');
    const showAbout = () => { aboutEl.textContent = p.about || (isSelf ? 'Write something about yourself!' : 'This user has not written anything yet.'); aboutEl.classList.toggle('muted', !p.about); };
    showAbout();
    if (isSelf) {
      $('edit-about').hidden = false;
      $('edit-about').addEventListener('click', () => { $('about-text').value = p.about || ''; $('about-edit').hidden = false; aboutEl.hidden = true; $('edit-about').hidden = true; });
      $('about-cancel').addEventListener('click', () => { $('about-edit').hidden = true; aboutEl.hidden = false; $('edit-about').hidden = false; });
      $('about-save').addEventListener('click', async () => {
        try {
          await saveAbout($('about-text').value);
          p.about = $('about-text').value.trim().slice(0, 1000);
          showAbout(); toast('Saved');
          $('about-cancel').click();
        } catch (err) { console.error(err); toast('Could not save. Did you run supabase/003_social.sql?'); }
      });
    }

    // Currently Wearing
    mountAvatar($('full'), { view: 'full', modelUrl: p.avatar_model, colors, look })
      .then((api) => {
        let spinning = true;
        $('toggle-2d').addEventListener('click', () => { spinning = !spinning; api.setSpin(spinning); $('toggle-2d').textContent = spinning ? '2D' : '3D'; });
      })
      .catch((err) => { console.error(err); $('full').replaceWith(Object.assign(document.createElement('p'), { className: 'muted pad', textContent: '3D avatar unavailable.' })); });
    $('wear-grid').innerHTML = [['Skin', colors.skin], ['Shirt', colors.torso], ['Pants', colors.legs]]
      .map(([label, hex]) => `<div class="item"><span class="thumb" style="background:${hex}"></span><span class="name">${label}</span></div>`).join('');

    // Amigos
    $('see-all').href = isSelf ? 'friends.html' : `friends.html?u=${encodeURIComponent(p.username)}`;
    async function loadFriends() {
      try {
        const friends = await listFriends(p.id);
        $('p-friends').textContent = friends.length;
        $('friends-count').textContent = friends.length;
        $('friends-row').innerHTML = friends.length ? friends.map(userTile).join('') : '<p class="muted pad">No friends yet.</p>';
        hydrateHeads($('friends-row'));
      } catch (err) { console.error(err); }
    }
    loadFriends();

    // Botões (mudam conforme a relação entre nós)
    const actions = $('actions');
    async function renderActions() {
      if (isSelf) { actions.innerHTML = '<a class="btn-gray" href="avatar.html">Edit Avatar</a>'; return; }
      let status = 'none';
      try { status = await friendStatus(p.id); } catch (err) { console.error(err); }
      actions.innerHTML = {
        none: '<button class="btn-green" data-act="add">Add Friend</button>',
        sent: '<button class="btn-gray" data-act="cancel" title="Click to cancel">Request Sent</button>',
        received: '<button class="btn-green" data-act="accept">Accept</button><button class="btn-gray" data-act="decline">Decline</button>',
        friends: '<button class="btn-dark" data-act="message">Message</button><button class="btn-outline-red" data-act="unfriend">Unfriend</button>',
      }[status] || '';
    }
    actions.addEventListener('click', async (e) => {
      const act = e.target.closest('button')?.dataset.act;
      if (!act) return;
      try {
        if (act === 'add') { await sendFriendRequest(p.id); toast('Friend request sent'); }
        else if (act === 'cancel' || act === 'unfriend') { await removeFriend(p.id); toast(act === 'cancel' ? 'Request cancelled' : 'Removed from friends'); }
        else if (act === 'accept') { await respondFriendRequest(p.id, true); toast('Friend added!'); }
        else if (act === 'decline') { await respondFriendRequest(p.id, false); }
        else if (act === 'message') { $('msg-title').textContent = `Message ${p.username}`; $('msg-dialog').showModal(); return; }
        await renderActions();
        loadFriends();
      } catch (err) { console.error(err); toast(friendlyError(err)); }
    });
    renderActions();

    // Enviar mensagem (só para amigos)
    $('msg-form').addEventListener('submit', async (e) => {
      if (e.submitter?.value !== 'send') return;
      try {
        await sendMessage(p.id, $('msg-subject').value.trim(), $('msg-body').value.trim());
        toast('Message sent');
        $('msg-subject').value = ''; $('msg-body').value = '';
      } catch (err) {
        console.error(err);
        toast(String(err.message || '').includes('disabled') ? 'This user turned off messages.' : String(err.message || '').includes('friends') ? 'You can only message friends.' : 'Could not send the message.');
      }
    });

    // Abas About / Creations
    $('tabs2').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-tab]');
      if (!b) return;
      $('tabs2').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      $('tab-about').hidden = b.dataset.tab !== 'about';
      $('tab-creations').hidden = b.dataset.tab !== 'creations';
    });
  }
}
