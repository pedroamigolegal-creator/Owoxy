// Foto de perfil das listas (amigos, busca): cabeça do noob de lado, com as cores e roupas da pessoa.
import { lookOfUser } from './items.js';
import { renderThumbnail } from './avatar.js';

export function hydrateHeads(root = document) {
  root.querySelectorAll('img[data-head]:not([data-done])').forEach(async (img) => {
    img.dataset.done = '1';
    let colors = {};
    try { colors = JSON.parse(img.dataset.colors || '{}') || {}; } catch { /* sem cores */ }
    try {
      const look = { colors, ...(await lookOfUser(img.dataset.head).catch(() => ({}))) };
      img.src = await renderThumbnail(look, { view: 'head', key: `${img.dataset.head}|${JSON.stringify(look)}` });
      img.classList.add('ready');
      img.parentElement.querySelector('.mini-noob')?.remove();
    } catch (err) { console.error('Foto de perfil falhou:', err); }
  });
}
