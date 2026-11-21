import { requireUser } from './auth.js';
import { hydrateHeads, userTile } from './common.js';
import { initShell } from './shell.js';
import { searchUsers } from './social.js';

const user = await requireUser();
const q = (new URLSearchParams(location.search).get('q') || '').trim();
if (user) {
  initShell(user, '', { query: q });
  const title = document.getElementById('title');
  const box = document.getElementById('results');
  if (!q) {
    title.textContent = 'Search';
    box.innerHTML = '<p class="muted">Type a username in the search bar and press Enter.</p>';
  } else {
    title.textContent = `Results for "${q}"`;
    try {
      const users = await searchUsers(q);
      box.innerHTML = users.length ? users.map(userTile).join('') : '<p class="muted">No users found.</p>';
      hydrateHeads(box);
    } catch (err) {
      console.error(err);
      box.innerHTML = '<p class="muted">Search failed. Did you run supabase/003_social.sql?</p>';
    }
  }
}
