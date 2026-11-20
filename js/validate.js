// Validações (usadas no cadastro; o servidor valida de novo).
import { CONFIG } from './config.js';

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
