import { requireUser } from './auth.js';
import { confirmDialog, esc, formDialog, hydrateHeads, toast, userTile } from './common.js';
import { friendlyError } from './items.js';
import { communityMembers, deleteCommunity, getCommunity, joinCommunity, leaveCommunity, updateCommunity } from './social.js';
import { initShell } from './shell.js';

const user = await requireUser();
if (user) {
  initShell(user, 'groups');
  const id = Number(new URLSearchParams(location.search).get('id'));
  const box = document.getElementById('comm'), loading = document.getElementById('loading');
  async function render() {
    let c = null;
    try { c = id ? await getCommunity(id) : null; } catch (err) { console.error(err); }
    if (!c) { loading.textContent = 'Group not found.'; loading.hidden = false; box.hidden = true; return; }
    loading.hidden = true; box.hidden = false;
    document.title = `Owoxy - ${c.name}`;
    const mem = await communityMembers(id).catch(() => []);
    const owner = c.owner_id === user.id, member = Boolean(c.my_role);
    box.innerHTML = `<section class="card"><div class="comm-head"><div class="comm-icon">${esc(c.name[0].toUpperCase())}</div><div class="grow" style="flex:1"><h1 style="margin:0">${esc(c.name)}</h1><p class="muted">By <a href="profile.html?u=${encodeURIComponent(c.owner_name)}">${esc(c.owner_name)}</a> &middot; ${c.members} member${Number(c.members) === 1 ? '' : 's'} &middot; Created ${new Date(c.created_at).toLocaleDateString()}</p></div>
      <div class="acc-actions">${member ? (owner ? '<button data-a="edit">Edit</button>' : '<button data-a="leave">Leave</button>') : '<button class="good" data-a="join">Join Group</button>'}${owner || user.isAdmin ? '<button class="danger" data-a="del">Delete</button>' : ''}</div></div></section>
      <section class="card"><h2>Description</h2><p class="about">${esc(c.description || 'No description.')}</p></section>
      <section class="card"><h2>Members (${mem.length})</h2><div class="friends-row">${mem.map((m) => userTile({ ...m, avatar_colors: m.avatar_colors })).join('')}</div></section>`;
    hydrateHeads(box);
  }
  box.addEventListener('click', async (e) => {
    const a = e.target.closest('button[data-a]')?.dataset.a; if (!a) return;
    try {
      if (a === 'join') { await joinCommunity(id); toast('Joined!'); }
      else if (a === 'leave') { if (!await confirmDialog({ title: 'Leave group?', message: 'You can join again later.', confirmText: 'Leave' })) return; await leaveCommunity(id); }
      else if (a === 'edit') {
        const cur = box.querySelector('.about').textContent;
        const v = await formDialog({ title: 'Edit description', fields: [{ name: 'd', label: 'Description', value: cur === 'No description.' ? '' : cur, maxLength: 500 }], confirmText: 'Save' });
        if (!v) return; await updateCommunity(id, v.d); toast('Saved');
      } else if (a === 'del') {
        if (!await confirmDialog({ title: 'Delete this group?', message: 'This cannot be undone.', confirmText: 'Delete', danger: true })) return;
        await deleteCommunity(id); location.href = 'groups.html'; return;
      }
      render();
    } catch (err) { console.error(err); toast(friendlyError(err)); }
  });
  render();
}
