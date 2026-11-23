import { requireUser } from './auth.js';
import { esc, formDialog, toast } from './common.js';
import { friendlyError } from './items.js';
import { createCommunity, joinCommunity, leaveCommunity, myCommunities, searchCommunities } from './social.js';
import { initShell } from './shell.js';

const user = await requireUser();
if (user) {
  initShell(user, 'groups');
  const mine = document.getElementById('mine'), all = document.getElementById('all');
  const row = (c, extra = '') => `<div class="comm-row"><div class="comm-icon">${esc(c.name[0].toUpperCase())}</div><div class="grow"><h3><a href="community.html?id=${c.id}">${esc(c.name)}</a></h3><p>${c.members} member${Number(c.members) === 1 ? '' : 's'}${c.description ? ' &middot; ' + esc(c.description) : ''}</p></div>${extra}</div>`;
  const migrationHint = (el, err) => { console.error(err); el.innerHTML = `<p class="muted">${/PGRST202|Could not find/.test(String(err?.message)) ? 'Run supabase/009_social_communities.sql in the Supabase SQL Editor, then refresh.' : esc(friendlyError(err))}</p>`; };

  async function loadMine() {
    try { const l = await myCommunities(); mine.innerHTML = l.length ? l.map((c) => row(c, `<span class="muted">${esc(c.role)}</span>`)).join('') : '<p class="muted">You have not joined any groups yet.</p>'; }
    catch (err) { migrationHint(mine, err); }
  }
  async function loadAll(q = '') {
    try {
      const l = await searchCommunities(q);
      all.innerHTML = l.length ? l.map((c) => row(c, c.joined ? '<span class="muted">Joined</span>' : `<button class="btn-green" data-join="${c.id}" type="button">Join</button>`)).join('') : '<p class="muted">No groups found.</p>';
    } catch (err) { migrationHint(all, err); }
  }
  all.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-join]'); if (!b) return;
    try { await joinCommunity(Number(b.dataset.join)); toast('Joined!'); loadMine(); loadAll(document.getElementById('gq').value.trim()); } catch (err) { toast(friendlyError(err)); }
  });
  document.getElementById('gsearch').addEventListener('submit', (e) => { e.preventDefault(); loadAll(document.getElementById('gq').value.trim()); });
  document.getElementById('create').addEventListener('click', async () => {
    const v = await formDialog({ title: 'Create Group', message: 'Costs 100 Owos. Name: 3-30 letters, numbers, spaces, . _ -', confirmText: 'Create (100 Owos)',
      fields: [{ name: 'name', label: 'Group name', maxLength: 30 }, { name: 'desc', label: 'Description (optional)', maxLength: 500 }] });
    if (!v) return;
    try { const id = await createCommunity(v.name, v.desc); toast('Group created!'); location.href = `community.html?id=${id}`; } catch (err) { toast(friendlyError(err)); }
  });
  loadMine(); loadAll();
}
