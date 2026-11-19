// Utilidades compartilhadas: ícones, avisos "em breve" e logo.
const ICONS = {
  home: '<path d="M3 11l9-8 9 8v10h-6v-6H9v6H3z"/>',
  profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.5 3.5-6.5 8-6.5s8 2 8 6.5"/>',
  avatar: '<circle cx="12" cy="7" r="3.5"/><path d="M6 21v-6l-3-2 2-3h14l2 3-3 2v6z"/>',
  inventory: '<path d="M5 8h14l-1 13H6z"/><path d="M9 8V6a3 3 0 016 0v2"/>',
  groups: '<circle cx="9" cy="8" r="3.5"/><circle cx="17" cy="9" r="2.5"/><path d="M2 20c0-4 3-6 7-6s7 2 7 6"/>',
  premium: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M10 17V7h3a3 3 0 010 6h-3"/>',
  money: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9 10c0-2 6-2 6 0s-6 2-6 4 6 2 6 0"/>',
  feed: '<circle cx="6" cy="18" r="1.5"/><path d="M4 11a9 9 0 019 9M4 5a15 15 0 0115 15"/>',
  blog: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  store: '<path d="M3 4h18l-1 6H4z"/><path d="M5 10v10h14V10"/>',
  gift: '<rect x="3" y="9" width="18" height="12" rx="1"/><path d="M12 9v12M3 13h18M12 9c-4 0-5-5-2-5 2 0 2 3 2 5zm0 0c4 0 5-5 2-5-2 0-2 3-2 5z"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  bell: '<path d="M6 17V11a6 6 0 0112 0v6l2 2H4z"/><path d="M10 21h4"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  list: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  coin: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/>',
  female: '<circle cx="12" cy="6" r="3"/><path d="M12 9v6m-4 0h8m-6 0v6m4-6v6"/>',
  male: '<circle cx="12" cy="6" r="3"/><path d="M8 10h8v6h-2v6h-4v-6H8z"/>',
};

export function icon(name) {
  return `<svg class="ico-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
}

// Selo de verificado do Owoxy (desenho próprio: estrela azul de 8 pontas com check branco).
export function verifiedBadge() {
  return '<svg class="verified" viewBox="0 0 24 24" role="img" aria-label="Verified"><title>Verified</title>'
    + '<rect x="3.5" y="3.5" width="17" height="17" rx="4" fill="#1a7cff"/>'
    + '<rect x="3.5" y="3.5" width="17" height="17" rx="4" fill="#1a7cff" transform="rotate(45 12 12)"/>'
    + '<path d="M7.8 12.4l2.9 2.9 5.6-5.9" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}

export function toast(message) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2200);
}

export function formatCompact(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M+';
  if (n >= 1e4) return Math.floor(n / 1e3) + 'K+';
  return String(n);
}

// Hidrata ícones (<i data-i="home">) e links que ainda não existem (data-soon).
export function hydrate() {
  document.querySelectorAll('[data-i]').forEach((el) => { el.innerHTML = icon(el.dataset.i); });
  document.querySelectorAll('[data-soon]').forEach((el) => {
    el.addEventListener('click', (e) => { e.preventDefault(); toast('Coming soon to Owoxy!'); });
  });
}
document.addEventListener('DOMContentLoaded', hydrate);
