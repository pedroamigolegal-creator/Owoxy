import { requireUser } from './auth.js';
import { confirmDialog, esc, formDialog, toast } from './common.js';
import { friendlyError } from './items.js';
import { rpc } from './supabase.js';
import { initShell } from './shell.js';

const user = await requireUser();
if (user) {
  initShell(user, 'reports');
  if (!user.isAdmin) {
    document.getElementById('main').innerHTML = '<h1 class="page-title">Reports</h1><p>Only the Owoxy account can see this page.</p>';
  } else {
    const body = document.getElementById('rep-body'), total = document.getElementById('rep-total'), sel = document.getElementById('rep-status');
    const fmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' });
    let rows = new Map();
    async function load() {
      try {
        const list = await rpc('admin_list_reports', { p_status: sel.value, p_limit: 200 });
        rows = new Map(list.map((r) => [String(r.id), r]));
        body.innerHTML = list.map((r) => `<tr data-id="${r.id}"><td>${fmt.format(new Date(r.created_at))}</td><td>${esc(r.target_name)}${r.target_deleted ? ' <span class="status-pill deleted">Deleted</span>' : r.target_banned ? ' <span class="status-pill banned">Banned</span>' : ''}</td><td>${esc(r.reporter_name)}</td><td>${esc(r.reason)}</td><td>${esc(r.details || '-')}</td><td>${esc(r.context || '-')}</td><td><div class="acc-actions">${r.target_banned || r.target_deleted ? '' : '<button class="danger" data-a="ban">Ban</button><button class="danger" data-a="delete">Delete</button>'}${r.status === 'open' ? '<button data-a="close">Close</button>' : ''}</div></td></tr>`).join('');
        total.textContent = `${list.length} report${list.length === 1 ? '' : 's'}`;
      } catch (err) {
        console.error(err);
        total.textContent = /Could not find the function|PGRST202/.test(String(err?.message)) ? 'Run supabase/008_moderation_games.sql in the Supabase SQL Editor, then refresh.' : friendlyError(err);
      }
    }
    body.addEventListener('click', async (e) => {
      const b = e.target.closest('button[data-a]'), tr = e.target.closest('tr[data-id]');
      if (!b || !tr) return;
      const r = rows.get(tr.dataset.id);
      try {
        if (b.dataset.a === 'ban') {
          const v = await formDialog({ title: `Ban ${r.target_name}`, message: `Report: ${r.reason}`, confirmText: 'Ban', danger: true, fields: [{ name: 'reason', label: 'Reason (the user will see it)', value: r.reason }, { name: 'days', label: 'Days (0 = permanent)', type: 'number', value: 0, min: 0, max: 3650 }] });
          if (!v) return;
          await rpc('admin_set_ban', { p_user: r.target_id, p_banned: true, p_reason: v.reason || null, p_days: Number(v.days) || 0 });
          await rpc('admin_close_report', { p_id: r.id }); toast(`${r.target_name} was banned.`);
        } else if (b.dataset.a === 'delete') {
          if (!await confirmDialog({ title: `Delete ${r.target_name}?`, message: 'The account can be undeleted later in Created Accounts.', confirmText: 'Delete', danger: true })) return;
          await rpc('admin_set_deleted', { p_user: r.target_id, p_deleted: true });
          await rpc('admin_close_report', { p_id: r.id }); toast(`${r.target_name} was deleted.`);
        } else { await rpc('admin_close_report', { p_id: r.id }); toast('Report closed.'); }
        load();
      } catch (err) { console.error(err); toast(friendlyError(err)); }
    });
    sel.addEventListener('change', load);
    document.getElementById('rep-filter').addEventListener('submit', (e) => e.preventDefault());
    load();
  }
}
