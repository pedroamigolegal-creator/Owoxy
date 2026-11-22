import { requireUser } from './auth.js';
import { confirmDialog, esc, formDialog, toast, verifiedBadge } from './common.js';
import { friendlyError } from './items.js';
import { rpc } from './supabase.js';
import { initShell } from './shell.js';

const user = await requireUser();
if (user) {
  initShell(user, 'accounts');
  if (!user.isAdmin) {
    document.getElementById('main').innerHTML = '<h1 class="page-title">Created Accounts</h1><p>Only the Owoxy account can see this page.</p>';
  } else {
    const PAGE = 100;
    let offset = 0, query = '', status = 'all', shown = 0;
    const body = document.getElementById('acc-body'), more = document.getElementById('acc-more'), total = document.getElementById('acc-total');
    const date = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' });
    const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const rows = new Map();

    function statusOf(r) {
      if (r.deleted_at) return { cls: 'deleted', text: 'Deleted' };
      if (r.banned_at && (!r.ban_until || new Date(r.ban_until) > new Date())) return { cls: 'banned', text: r.ban_until ? `Banned until ${new Date(r.ban_until).toLocaleDateString()}` : 'Banned', title: r.ban_reason || '' };
      return { cls: 'ok', text: 'Active' };
    }
    function actionsOf(r) {
      if (r.is_admin) return '<span class="muted">Admin</span>';
      const st = statusOf(r);
      const b = [];
      if (st.cls === 'banned') b.push('<button class="good" data-a="unban">Unban</button>'); else if (st.cls === 'ok') b.push('<button class="danger" data-a="ban">Ban</button>');
      if (st.cls === 'deleted') b.push('<button class="good" data-a="restore">Undelete</button>'); else b.push('<button class="danger" data-a="delete">Delete</button>');
      return `<div class="acc-actions">${b.join('')}</div>`;
    }
    function rowHTML(r, n) {
      const d = new Date(r.created_at), st = statusOf(r);
      return `<tr data-id="${r.id}"><td>${n}</td><td>${esc(r.username)}${r.verified ? verifiedBadge() : ''}</td><td>${date.format(d)}</td><td>${time.format(d)}</td><td>${esc(r.gender || '-')}</td><td>${r.balance}</td><td>${r.premium_until && new Date(r.premium_until) > new Date() ? 'Yes' : 'No'}</td><td><span class="status-pill ${st.cls}" title="${esc(st.title || '')}">${esc(st.text)}</span></td><td>${actionsOf(r)}</td></tr>`;
    }

    async function load(reset) {
      if (reset) { offset = 0; shown = 0; body.innerHTML = ''; rows.clear(); }
      try {
        const list = await rpc('admin_list_accounts', { p_limit: PAGE, p_offset: offset, p_query: query || null, p_status: status });
        const count = list[0] ? Number(list[0].total) : 0;
        for (const r of list) { rows.set(r.id, r); body.insertAdjacentHTML('beforeend', rowHTML(r, ++shown)); }
        offset += list.length;
        more.hidden = offset >= count;
        total.textContent = `${count} account${count === 1 ? '' : 's'}`;
      } catch (err) {
        console.error(err);
        const m = String(err?.message || err);
        total.textContent = /Could not find the function|PGRST202/.test(m) ? 'Run supabase/007_created_accounts.sql and supabase/008_moderation_games.sql in the Supabase SQL Editor, then refresh.' : friendlyError(err);
      }
    }

    async function act(r, a) {
      try {
        if (a === 'ban') {
          const v = await formDialog({ title: `Ban ${r.username}`, message: 'The account will not be able to log in. You can unban it later.', confirmText: 'Ban',
            danger: true, fields: [{ name: 'reason', label: 'Reason (the user will see it)', maxLength: 200 }, { name: 'days', label: 'Days (0 = permanent)', type: 'number', value: 0, min: 0, max: 3650 }] });
          if (!v) return;
          await rpc('admin_set_ban', { p_user: r.id, p_banned: true, p_reason: v.reason || null, p_days: Number(v.days) || 0 });
          toast(`${r.username} was banned.`);
        } else if (a === 'unban') {
          if (!await confirmDialog({ title: `Unban ${r.username}?`, message: 'They will be able to log in again.', confirmText: 'Unban' })) return;
          await rpc('admin_set_ban', { p_user: r.id, p_banned: false });
          toast(`${r.username} was unbanned.`);
        } else if (a === 'delete') {
          if (!await confirmDialog({ title: `Delete ${r.username}?`, message: 'The account disappears from the site and cannot log in. You can undelete it later.', confirmText: 'Delete', danger: true })) return;
          await rpc('admin_set_deleted', { p_user: r.id, p_deleted: true });
          toast(`${r.username} was deleted.`);
        } else if (a === 'restore') {
          if (!await confirmDialog({ title: `Undelete ${r.username}?`, message: 'The account comes back and can log in again.', confirmText: 'Undelete' })) return;
          await rpc('admin_set_deleted', { p_user: r.id, p_deleted: false });
          toast(`${r.username} was restored.`);
        }
        const keep = offset; offset = 0; shown = 0; body.innerHTML = ''; rows.clear();
        // recarrega o mesmo tanto que já estava na tela
        do { await load(false); } while (offset < keep && !more.hidden);
      } catch (err) { console.error(err); toast(friendlyError(err)); }
    }

    body.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-a]');
      const tr = e.target.closest('tr[data-id]');
      if (btn && tr) act(rows.get(tr.dataset.id), btn.dataset.a);
    });
    document.getElementById('acc-search').addEventListener('submit', (e) => { e.preventDefault(); query = document.getElementById('acc-q').value.trim(); status = document.getElementById('acc-status').value; load(true); });
    more.addEventListener('click', () => load(false));
    load(true);
  }
}
