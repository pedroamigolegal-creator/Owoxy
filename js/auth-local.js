// Autenticação do Owoxy.
// MODO DEMO: tudo fica salvo no localStorage do navegador (só serve para testar o visual e o fluxo).
// Próximo passo: trocar este arquivo por Supabase (mesmas funções exportadas), aí as contas ficam num banco real.
import { CONFIG } from './config.js';

const USERS = 'owoxy.users';
const SESSION = 'owoxy.session';
const enc = new TextEncoder();

const readUsers = () => { try { return JSON.parse(localStorage.getItem(USERS)) || {}; } catch { return {}; } };
const writeUsers = (u) => localStorage.setItem(USERS, JSON.stringify(u));

async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' }, key, 256);
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}

export function validateUsername(u) {
  if (!u) return 'Please enter a username.';
  if (u.length < 3 || u.length > 20) return 'Usernames must be 3 to 20 characters long.';
  if (!/^[A-Za-z0-9_]+$/.test(u)) return 'Usernames can only contain letters, numbers and one underscore.';
  if ((u.match(/_/g) || []).length > 1) return 'Usernames can have at most one underscore (_).';
  if (u.startsWith('_') || u.endsWith('_')) return 'Usernames cannot start or end with an underscore.';
  return '';
}

export function validatePassword(p, username) {
  if (!p) return 'Please enter a password.';
  if (p.length < 8) return 'Password must be at least 8 characters long.';
  if (username && p.toLowerCase() === username.toLowerCase()) return 'Password cannot be the same as your username.';
  return '';
}

export function validateBirthday({ year, month, day }) {
  if (!year || !month || !day) return 'Please select your birthday.';
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== +year || d.getMonth() !== month - 1 || d.getDate() !== +day) return 'Please enter a valid date.';
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  if (now < new Date(now.getFullYear(), d.getMonth(), d.getDate())) age--;
  if (age < CONFIG.minAge) return `Sorry, you must be at least ${CONFIG.minAge} years old to sign up.`;
  return '';
}

// Erros são lançados como { field, message } para a página mostrar no campo certo.
export async function signUp({ username, password, birthday, gender }) {
  let message = validateBirthday(birthday);
  if (message) throw { field: 'birthday', message };
  message = validateUsername(username);
  if (message) throw { field: 'username', message };
  message = validatePassword(password, username);
  if (message) throw { field: 'password', message };

  const users = readUsers();
  const key = username.toLowerCase();
  if (users[key]) throw { field: 'username', message: 'This username is already taken.' };

  const salt = crypto.randomUUID();
  users[key] = {
    id: crypto.randomUUID(),
    username,
    salt,
    passwordHash: await hashPassword(password, salt),
    birthday,
    gender: gender || null,
    createdAt: Date.now(),
    balance: CONFIG.startingBalance,
    avatar: { model: CONFIG.defaultAvatar }, // todo mundo começa com o noob
    friends: [],
  };
  writeUsers(users);
  localStorage.setItem(SESSION, key);
  return publicUser(users[key]);
}

export async function logIn(username, password) {
  const user = readUsers()[(username || '').toLowerCase()];
  const bad = { field: 'login', message: 'Incorrect username or password.' };
  if (!user) throw bad;
  if ((await hashPassword(password || '', user.salt)) !== user.passwordHash) throw bad;
  localStorage.setItem(SESSION, user.username.toLowerCase());
  return publicUser(user);
}

export function logOut() { localStorage.removeItem(SESSION); }

export function saveAvatar(colors) {
  const users = readUsers();
  const key = localStorage.getItem(SESSION);
  if (!users[key]) return;
  users[key].avatar = { ...users[key].avatar, colors };
  writeUsers(users);
}

const publicUser = ({ passwordHash, salt, ...rest }) => rest;

export function currentUser() {
  const user = readUsers()[localStorage.getItem(SESSION)];
  return user ? publicUser(user) : null;
}

export function requireUser() {
  const user = currentUser();
  if (!user) location.replace('login.html');
  return user;
}

export function redirectIfLoggedIn() {
  if (currentUser()) location.replace('home.html');
}
