// Autenticação real com Supabase. Mesmas funções do auth-local.js.
// Login por nome de usuário: o Supabase exige e-mail, então usamos um e-mail interno fictício
// (usuario@users.owoxy.app). Ele nunca recebe mensagens. Em Authentication > Providers > Email,
// "Confirm email" precisa estar DESLIGADO.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE } from './config.js';
import { validateUsername, validatePassword, validateBirthday } from './auth-local.js';

export { validateUsername, validatePassword, validateBirthday };

const sb = createClient(SUPABASE.url, SUPABASE.anonKey);
const emailOf = (username) => `${username.toLowerCase()}@users.owoxy.app`;
const pad = (n) => String(n).padStart(2, '0');

export async function signUp({ username, password, birthday, gender }) {
  let message = validateBirthday(birthday);
  if (message) throw { field: 'birthday', message };
  message = validateUsername(username);
  if (message) throw { field: 'username', message };
  message = validatePassword(password, username);
  if (message) throw { field: 'password', message };

  const { data: free, error: freeError } = await sb.rpc('username_available', { name: username });
  if (freeError) throw { field: 'username', message: 'Could not reach the server. Please try again.' };
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

export async function currentUser() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return null;
  const { data, error } = await sb.rpc('my_profile');
  const p = Array.isArray(data) ? data[0] : data;
  if (error || !p) return null;
  return {
    id: p.id,
    username: p.username,
    gender: p.gender,
    birthday: p.birthday,
    balance: Number(p.balance),
    avatar: { model: p.avatar_model },
    friends: [], // amigos entram no próximo passo
    createdAt: p.created_at,
  };
}
