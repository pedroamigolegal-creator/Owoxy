// Escolhe o backend: Supabase (se as chaves estiverem em config.js) ou modo demo (localStorage).
import { SUPABASE } from './config.js';

export const usingSupabase = Boolean(SUPABASE.url && SUPABASE.anonKey);
const impl = usingSupabase ? await import('./auth-supabase.js') : await import('./auth-local.js');

export const { validateUsername, validatePassword, validateBirthday, signUp, logIn } = impl;
export const logOut = async () => impl.logOut();
export const saveAvatar = async (colors) => impl.saveAvatar(colors);
export const currentUser = async () => impl.currentUser();

export async function requireUser() {
  const user = await currentUser();
  if (!user) location.replace('login.html');
  return user;
}

export async function redirectIfLoggedIn() {
  if (await currentUser()) location.replace('home.html');
}
