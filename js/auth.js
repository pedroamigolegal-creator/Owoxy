// Login, cadastro e dados do usuário logado (Supabase).
// Login por nome de usuário: o Supabase exige e-mail, então usamos um e-mail interno fictício
// (usuario@users.owoxy.app). Em Authentication > Providers > Email, "Confirm email" precisa estar DESLIGADO.
import { sb, rpc } from './supabase.js';
import { validateUsername, validatePassword, validateBirthday } from './validate.js';

export { validateUsername, validatePassword, validateBirthday };

const emailOf = (username) => `${username.toLowerCase()}@users.owoxy.app`;
const pad = (n) => String(n).padStart(2, '0');

// Erros são lançados como { field, message } para a página mostrar no campo certo.
export async function signUp({ username, password, birthday, gender }) {
  let message = validateBirthday(birthday);
  if (message) throw { field: 'birthday', message };
  message = validateUsername(username);
  if (message) throw { field: 'username', message };
  message = validatePassword(password, username);
  if (message) throw { field: 'password', message };

  let free;
  try { free = await rpc('username_available', { name: username }); }
  catch { throw { field: 'username', message: 'Could not reach the server. Please try again.' }; }
  if (!free) throw { field: 'username', message: 'This username is already taken.' };

  const { data, error } = await sb.auth.signUp({
    email: emailOf(username),
    password,
    options: {
      data: {
        username,
        birthday: `${birthday.year}-${pad(birthday.month)}-${pad(birthday.day)}`,
        gender: gender || '',
      },
    },
  });
  if (error) throw { field: 'username', message: 'Could not create the account. Please try again.' };
  if (!data.session) {
    throw { field: 'username', message: 'Account created, but Supabase "Confirm email" is still ON. Turn it off and try logging in.' };
  }
  return currentUser();
}

export async function logIn(username, password) {
  const { error } = await sb.auth.signInWithPassword({ email: emailOf(username || ''), password: password || '' });
  if (error) throw { field: 'login', message: 'Incorrect username or password.' };
  return currentUser();
}

export async function logOut() { await sb.auth.signOut(); }
// Sai em todos os aparelhos
export async function logOutEverywhere() { await sb.auth.signOut({ scope: 'global' }); }

// Troca de senha: confere a senha atual entrando de novo, depois grava a nova.
export async function changePassword(username, current, next) {
  const message = validatePassword(next, username);
  if (message) throw { message };
  const { error: e1 } = await sb.auth.signInWithPassword({ email: emailOf(username), password: current || '' });
  if (e1) throw { message: 'Your current password is incorrect.' };
  const { error: e2 } = await sb.auth.updateUser({ password: next });
  if (e2) throw { message: 'Could not change the password. Please try again.' };
}

export async function saveSettings({ gender, privacyMessages, privacyFriendRequests }) {
  await rpc('update_settings', { p_gender: gender || '', p_privacy_messages: privacyMessages, p_privacy_friend_requests: privacyFriendRequests });
}

export async function saveAvatar(colors) { await rpc('save_avatar', { colors }); }

export async function currentUser() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return null;
  let p;
  try { p = await rpc('my_profile'); } catch { return null; }
  p = Array.isArray(p) ? p[0] : p;
  if (!p) return null;
  return {
    id: p.id,
    username: p.username,
    gender: p.gender,
    birthday: p.birthday,
    balance: Number(p.balance),
    avatar: { model: p.avatar_model, colors: p.avatar_colors || null },
    verified: Boolean(p.verified),
    isAdmin: Boolean(p.is_admin),
    premiumUntil: p.premium_until || null,
    privacyMessages: p.privacy_messages || 'friends',
    privacyFriendRequests: p.privacy_friend_requests || 'everyone',
    premium: Boolean(p.premium_until && new Date(p.premium_until) > new Date()),
    createdAt: p.created_at,
  };
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) location.replace('login.html');
  return user;
}

export async function redirectIfLoggedIn() {
  if (await currentUser()) location.replace('home.html');
}
