import { signUp, redirectIfLoggedIn } from './auth.js';

await redirectIfLoggedIn();

// Selects de aniversário
const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const fill = (id, label, values) => {
  const el = document.getElementById(id);
  el.innerHTML = `<option value="">${label}</option>` + values.map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
};
fill('month', 'Month', months.map((m, i) => [i + 1, m]));
fill('day', 'Day', Array.from({ length: 31 }, (_, i) => [i + 1, i + 1]));
const thisYear = new Date().getFullYear();
fill('year', 'Year', Array.from({ length: 120 }, (_, i) => [thisYear - i, thisYear - i]));

// Gênero (opcional)
let gender = null;
document.querySelectorAll('.gender button').forEach((btn) => {
  btn.addEventListener('click', () => {
    gender = gender === btn.dataset.g ? null : btn.dataset.g;
    document.querySelectorAll('.gender button').forEach((b) => b.classList.toggle('on', b.dataset.g === gender));
  });
});

const form = document.getElementById('signup-form');
const submit = document.getElementById('submit');
const showError = (field, message) => {
  document.querySelectorAll('.field-error').forEach((e) => (e.textContent = ''));
  const el = document.getElementById(`err-${field}`);
  if (el) el.textContent = message;
};

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  showError('', '');
  submit.disabled = true;
  try {
    await signUp({
      username: form.username.value.trim(),
      password: form.password.value,
      birthday: { year: +form.year.value, month: +form.month.value, day: +form.day.value },
      gender,
    });
    location.href = 'home.html';
  } catch (err) {
    showError(err.field || 'username', err.message || 'Something went wrong. Please try again.');
    submit.disabled = false;
  }
});
