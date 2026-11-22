import { requireUser } from './auth.js';
import { verifiedBadge } from './common.js';
import { initShell } from './shell.js';

const user = await requireUser();
if (user) {
  initShell(user, 'games');
  document.getElementById('badge').innerHTML = verifiedBadge();
  document.getElementById('badge2').innerHTML = verifiedBadge();
}
