import { requireUser } from './auth.js';
import { toast } from './common.js';
import { claimDaily, friendlyError, setPremium } from './items.js';
import { initShell, setBalance } from './shell.js';

const user = await requireUser();
if (user) {
  initShell(user, 'premium');
  const $ = (id) => document.getElementById(id);

  $('p-status').textContent = user.premium ? 'You are a Premium member' : 'You do not have Premium';
  $('p-until').textContent = user.premium ? `Premium until ${new Date(user.premiumUntil).toLocaleDateString()}` : '';
  $('p-note').textContent = user.premium ? '' : 'Premium is given out by the Owoxy account for now. Without Premium you still get 25 Owos every day.';
  $('p-claim').textContent = user.premium ? 'Claim 100 daily Owos' : 'Claim 25 daily Owos';

  $('p-claim').addEventListener('click', async () => {
    $('p-claim').disabled = true;
    try {
      const r = await claimDaily();
      if (r.claimed) { setBalance(r.balance); toast(`You got ${r.amount} Owos!`); }
      else toast(`You already claimed today. Next claim: ${new Date(r.next_at).toLocaleString()}`);
    } catch (err) { console.error(err); toast(friendlyError(err)); }
    $('p-claim').disabled = false;
  });

  if (user.isAdmin) {
    $('p-admin').hidden = false;
    $('pa-go').addEventListener('click', async () => {
      const name = $('pa-user').value.trim();
      const days = Number($('pa-days').value);
      if (!name) { toast('Type a username.'); return; }
      if (!Number.isInteger(days) || days < 0 || days > 3650) { toast('Days must be from 0 to 3650.'); return; }
      try { await setPremium(name, days); toast(days === 0 ? `Premium removed from ${name}` : `${name} got ${days} days of Premium`); }
      catch (err) { console.error(err); toast(friendlyError(err)); }
    });
  }
}
