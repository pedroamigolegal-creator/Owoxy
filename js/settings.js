import { changePassword, logOutEverywhere, requireUser, saveSettings } from './auth.js';
import { toast } from './common.js';
import { getProfile, saveAbout } from './social.js';
import { initShell } from './shell.js';

const user = await requireUser();
if (user) {
  initShell(user, 'settings');
  const $ = (id) => document.getElementById(id);
  let t = new URLSearchParams(location.search).get('t');
  if (!['account', 'security', 'privacy'].includes(t)) t = 'account';
  document.querySelectorAll('#set-nav a').forEach((a) => a.classList.toggle('on', a.dataset.t === t));
  document.querySelectorAll('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== t; });

  // ---- Account Info ----
  $('s-username').textContent = user.username;
  $('s-birthday').textContent = user.birthday ? new Date(`${user.birthday}T12:00:00`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
  $('s-since').textContent = user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
  $('s-balance').textContent = `${user.balance.toLocaleString('en-US')} Owos`;
  $('s-premium').textContent = user.premium ? `Active until ${new Date(user.premiumUntil).toLocaleDateString()}` : 'Not active';
  $('s-gender').value = user.gender || '';
  $('s-msg').value = user.privacyMessages;
  $('s-req').value = user.privacyFriendRequests;
  getProfile(user.username).then((p) => { if (p) $('s-about').value = p.about || ''; }).catch((err) => console.error(err));

  const current = () => ({ gender: $('s-gender').value, privacyMessages: $('s-msg').value, privacyFriendRequests: $('s-req').value });
  $('save-account').addEventListener('click', async () => {
    try { await saveSettings(current()); await saveAbout($('s-about').value); toast('Saved'); }
    catch (err) { console.error(err); toast('Could not save. Did you run supabase/006_fees_faces_settings.sql?'); }
  });
  $('save-privacy').addEventListener('click', async () => {
    try { await saveSettings(current()); toast('Privacy settings saved'); }
    catch (err) { console.error(err); toast('Could not save. Did you run supabase/006_fees_faces_settings.sql?'); }
  });

  // ---- Security ----
  $('pw-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('pw-error');
    err.textContent = '';
    if ($('pw-new').value !== $('pw-new2').value) { err.textContent = 'The new passwords do not match.'; return; }
    try {
      await changePassword(user.username, $('pw-cur').value, $('pw-new').value);
      $('pw-form').reset();
      toast('Password changed');
    } catch (ex) { err.textContent = ex.message || 'Could not change the password.'; }
  });
  $('logout-all').addEventListener('click', async () => { await logOutEverywhere(); location.href = 'login.html'; });
}
