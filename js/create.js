// Create: Games (lista) ou itens de avatar (Shirts, Pants, UGC, Faces). Cada parte fica em seu próprio arquivo.
import { toast } from './common.js';

document.addEventListener('click', (e) => { const a = e.target.closest('[data-soon]'); if (a) { e.preventDefault(); toast('Coming soon to Owoxy.'); } });
const t = new URLSearchParams(location.search).get('t');
await import(t === 'games' ? './create-games.js' : './create-items.js');
