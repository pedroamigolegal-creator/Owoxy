// Parede de "capas de jogos" do fundo do cadastro: cenas simples desenhadas em CSS (nada copiado de ninguém).
const wall = document.getElementById('wall');
if (wall) {
  let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const real = ['assets/games/natural-disaster-survival.svg', 'assets/games/talk-to-others.svg'];
  const n = Math.ceil((innerWidth * 1.6 / 172) * (innerHeight * 1.6 / 172)) + 8;
  for (let i = 0; i < n; i++) {
    const t = document.createElement('i');
    if (i % 9 === 4) { t.style.backgroundImage = `url(${real[(i / 9 | 0) % real.length]})`; wall.append(t); continue; }
    const h = Math.floor(rnd() * 360), sky = `linear-gradient(180deg,hsl(${h},70%,${55 + rnd() * 15}%) 0%,hsl(${(h + 40) % 360},65%,${72 + rnd() * 10}%) 58%,transparent 58%)`;
    const ground = `linear-gradient(0deg,hsl(${(h + 120) % 360},45%,${28 + rnd() * 10}%),hsl(${(h + 120) % 360},45%,${36 + rnd() * 8}%))`;
    const blocks = [];
    for (let k = 0; k < 3; k++) { const w = 14 + rnd() * 20, hh = 22 + rnd() * 38, x = 6 + rnd() * 70, c = `hsl(${Math.floor(rnd() * 360)},55%,${40 + rnd() * 20}%)`; blocks.push(`linear-gradient(${c},${c}) ${x}% 62% / ${w}% ${hh}% no-repeat`); }
    const sun = `radial-gradient(circle at ${15 + rnd() * 70}% ${14 + rnd() * 14}%, rgba(255,255,255,.85) 0 6%, transparent 7%)`;
    t.style.background = `${sun},${blocks.join(',')},${sky},${ground}`;
    wall.append(t);
  }
}
