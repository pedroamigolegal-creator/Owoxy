import { requireUser } from './auth.js';
import { esc, formatCompact, toast } from './common.js';
import { friendlyError } from './items.js';
import { rpc } from './supabase.js';
import { initShell, setBalance } from './shell.js';

const user = await requireUser();
if (user) {
  initShell(user, 'promocodes');
  const $ = (id) => document.getElementById(id);
  const missing = (err) => /PGRST202|Could not find the function/.test(String(err?.message));

  $('promo-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = $('promo-code').value.trim();
    if (!code) return;
    $('promo-go').disabled = true;
    const out = $('promo-result');
    try {
      const r = await rpc('redeem_promo', { p_code: code });
      const row = Array.isArray(r) ? r[0] : r;
      out.className = 'promo-result ok';
      out.innerHTML = `Code redeemed! You got <b>${Number(row.owos).toLocaleString('en-US')}</b> Owos. You now have <b>${formatCompact(Number(row.balance))}</b>.`;
      setBalance(row.balance);
      $('promo-code').value = '';
    } catch (err) {
      console.error(err);
      out.className = 'promo-result bad';
      out.textContent = missing(err) ? 'Run supabase/014_promocodes.sql in the Supabase SQL Editor, then refresh.' : friendlyError(err);
    } finally { $('promo-go').disabled = false; }
  });

  if (user.isAdmin) {
    $('promo-admin').hidden = false;
    const body = $('pc-body');
    const fmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' });
    async function load() {
      try {
        const list = await rpc('admin_list_promos');
        body.innerHTML = list.map((c) => {
          const expired = c.expires_at && new Date(c.expires_at) <= new Date();
          const full = c.max_uses && c.uses >= c.max_uses;
          const st = !c.active ? ['deleted', 'Off'] : expired ? ['deleted', 'Expired'] : full ? ['deleted', 'Used up'] : ['ok', 'Active'];
          return `<tr><td><b>${esc(c.code)}</b></td><td>${Number(c.owos).toLocaleString('en-US')}</td><td>${c.uses}${c.max_uses ? ' / ' + c.max_uses : ''}</td><td>${c.expires_at ? fmt.format(new Date(c.expires_at)) : 'Never'}</td><td><span class="status-pill ${st[0]}">${st[1]}</span></td><td><div class="acc-actions"><button class="${c.active ? 'danger' : 'good'}" data-code="${esc(c.code)}" data-on="${c.active ? '0' : '1'}">${c.active ? 'Turn off' : 'Turn on'}</button></div></td></tr>`;
        }).join('') || '<tr><td colspan="6" class="muted">No codes yet.</td></tr>';
      } catch (err) { console.error(err); body.innerHTML = `<tr><td colspan="6" class="muted">${missing(err) ? 'Run supabase/014_promocodes.sql first.' : esc(friendlyError(err))}</td></tr>`; }
    }
    $('pc-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await rpc('admin_create_promo', { p_code: $('pc-code').value.trim(), p_owos: Number($('pc-owos').value), p_max_uses: $('pc-uses').value ? Number($('pc-uses').value) : null, p_days: $('pc-days').value ? Number($('pc-days').value) : null });
        toast('Code created'); $('pc-form').reset(); load();
      } catch (err) { console.error(err); toast(friendlyError(err)); }
    });
    body.addEventListener('click', async (e) => {
      const b = e.target.closest('button[data-code]'); if (!b) return;
      try { await rpc('admin_set_promo_active', { p_code: b.dataset.code, p_active: b.dataset.on === '1' }); load(); } catch (err) { toast(friendlyError(err)); }
    });
    load();
  }
}
