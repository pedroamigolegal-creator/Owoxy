import { requireUser } from './auth.js';
import { esc, verifiedBadge } from './common.js';
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
    let offset = 0, query = '', shown = 0;
    const body = document.getElementById('acc-body'), more = document.getElementById('acc-more');
    const date = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' });
    const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    async function load(reset) {
      if (reset) { offset = 0; shown = 0; body.innerHTML = ''; }
      try {
        const rows = await rpc('admin_list_accounts', { p_limit: PAGE, p_offset: offset, p_query: query || null });
        const total = rows[0] ? Number(rows[0].total) : 0;
        for (const r of rows) {
          const d = new Date(r.created_at);
          const premium = r.premium_until && new Date(r.premium_until) > new Date();
          body.insertAdjacentHTML('beforeend', `<tr><td>${++shown}</td><td>${esc(r.username)}${r.verified ? verifiedBadge() : ''}</td><td>${date.format(d)}</td><td>${time.format(d)}</td><td>${esc(r.gender || '-')}</td><td>${r.balance}</td><td>${premium ? 'Yes' : 'No'}</td></tr>`);
        }
        offset += rows.length;
        more.hidden = offset >= total;
        document.getElementById('acc-total').textContent = `${total} account${total === 1 ? '' : 's'}`;
      } catch (err) {
        console.error(err);
        const m = String(err?.message || err);
        document.getElementById('acc-total').textContent = /Could not find the function|PGRST202/.test(m) ? 'Run supabase/007_created_accounts.sql in the Supabase SQL Editor, then refresh.' : friendlyError(err);
      }
    }
    document.getElementById('acc-search').addEventListener('submit', (e) => { e.preventDefault(); query = document.getElementById('acc-q').value.trim(); load(true); });
    more.addEventListener('click', () => load(false));
    load(true);
  }
}
