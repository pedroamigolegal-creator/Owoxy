import { requireUser } from './auth.js';
import { esc, formatCompact, toast } from './common.js';
import { friendlyError } from './items.js';
import { rpc } from './supabase.js';
import { initShell, setBalance } from './shell.js';

const user = await requireUser();
if (user) {
  initShell(user, 'owos');
  const $ = (id) => document.getElementById(id);
  if (!user.isAdmin) {
    $('main').innerHTML = '<h1 class="page-title">Owos Adds</h1><p>Only the Owoxy account can see this page.</p>';
  } else {
    const amountOf = () => Number(($('o-amount').value || '').replace(/[^0-9]/g, '')) || 0;
    const paint = () => { const n = amountOf(); $('o-preview').innerHTML = n ? `${n.toLocaleString('en-US')} Owos = <b>${formatCompact(n)}</b>` : '&nbsp;'; };
    $('o-amount').addEventListener('input', paint);
    $('o-quick').addEventListener('click', (e) => { const b = e.target.closest('button[data-n]'); if (b) { $('o-amount').value = b.dataset.n; paint(); } });
    $('owos-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const n = amountOf(), to = $('o-user').value.trim();
      if (!n) { toast('Type how many Owos you need.'); return; }
      $('o-go').disabled = true;
      try {
        const r = (await rpc('admin_add_owos', { p_username: to || null, p_amount: n }));
        const row = Array.isArray(r) ? r[0] : r;
        $('o-result').innerHTML = row.is_self
          ? `Added <b>${formatCompact(n)}</b> Owos to your account. You now have <b>${formatCompact(Number(row.balance))}</b>.`
          : `Gave <b>${formatCompact(n)}</b> Owos to <b>${esc(row.username)}</b>. They now have <b>${formatCompact(Number(row.balance))}</b>.`;
        if (row.is_self) setBalance(row.balance);
        toast(row.is_self ? 'Owos added!' : `Sent to ${row.username}!`);
        $('o-amount').value = ''; paint();
      } catch (err) {
        console.error(err);
        $('o-result').textContent = /PGRST202|Could not find the function/.test(String(err?.message)) ? 'Run supabase/013_owos_adds.sql in the Supabase SQL Editor, then refresh.' : friendlyError(err);
      } finally { $('o-go').disabled = false; }
    });
  }
}
