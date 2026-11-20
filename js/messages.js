import { requireUser } from './auth.js';
import { esc, toast, verifiedBadge } from './common.js';
import { initShell, refreshUnread } from './shell.js';
import { inbox, markRead, sendMessage } from './social.js';

const user = await requireUser();
if (user) {
  initShell(user, 'messages');
  const list = document.getElementById('list');
  const view = document.getElementById('view');
  let messages = [];
  let selected = null;

  const fmt = (d) => new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

  function renderList() {
    list.innerHTML = messages.length
      ? messages.map((m) => `
        <button class="msg-row ${m.is_read ? '' : 'unread'} ${m.id === selected ? 'on' : ''}" data-id="${m.id}">
          <span class="dot"></span>
          <span class="msg-from">${esc(m.sender_username)}${m.sender_verified ? verifiedBadge() : ''}</span>
          <span class="msg-subject">${esc(m.subject || '(no subject)')}</span>
          <span class="msg-date">${fmt(m.created_at)}</span>
        </button>`).join('')
      : '<p class="muted pad">Your inbox is empty.</p>';
  }

  function renderView(m) {
    // textContent evita HTML injetado nas mensagens
    view.innerHTML = `
      <div class="msg-head">
        <h2></h2>
        <p class="muted">From <b>${esc(m.sender_username)}</b>${m.sender_verified ? verifiedBadge() : ''} &middot; ${fmt(m.created_at)}</p>
      </div>
      <div class="msg-body"></div>
      ${m.is_system || !m.sender_id ? '' : `
      <div class="reply">
        <textarea id="reply-text" maxlength="1000" rows="4" placeholder="Write a reply"></textarea>
        <div class="row-end"><button class="btn-green" id="reply-send" type="button">Reply</button></div>
      </div>`}`;
    view.querySelector('h2').textContent = m.subject || '(no subject)';
    view.querySelector('.msg-body').textContent = m.body;
    const send = document.getElementById('reply-send');
    if (send) send.addEventListener('click', async () => {
      const body = document.getElementById('reply-text').value.trim();
      if (!body) return;
      send.disabled = true;
      try {
        const subject = (m.subject || '').startsWith('Re: ') ? m.subject : `Re: ${m.subject || ''}`.trim();
        await sendMessage(m.sender_id, subject.slice(0, 100), body);
        toast('Message sent');
        document.getElementById('reply-text').value = '';
      } catch (err) {
        console.error(err);
        toast(String(err.message || '').includes('friends') ? 'You can only message friends.' : 'Could not send the message.');
      }
      send.disabled = false;
    });
  }

  list.addEventListener('click', async (e) => {
    const row = e.target.closest('.msg-row');
    if (!row) return;
    const m = messages.find((x) => String(x.id) === row.dataset.id);
    selected = m.id;
    renderView(m);
    if (!m.is_read) {
      m.is_read = true;
      try { await markRead(m.id); refreshUnread(); } catch (err) { console.error(err); }
    }
    renderList();
  });

  try {
    messages = await inbox();
    renderList();
  } catch (err) {
    console.error(err);
    list.innerHTML = '<p class="muted pad">Could not load messages. Did you run supabase/003_social.sql?</p>';
  }
}
