import { logIn, redirectIfLoggedIn } from './auth.js';

await redirectIfLoggedIn();

const form = document.getElementById('login-form');
const error = document.getElementById('login-error');
const submit = document.getElementById('submit');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  error.textContent = '';
  form.password.classList.remove('bad');
  submit.disabled = true;
  try {
    await logIn(form.username.value.trim(), form.password.value);
    location.href = 'home.html';
  } catch (err) {
    error.textContent = err.message || 'Something went wrong. Please try again.';
    form.password.classList.add('bad');
    submit.disabled = false;
  }
});
