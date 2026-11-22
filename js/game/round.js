// Máquina de rodadas do Natural Disaster Survival (sem Three.js, dá para testar no Node).
// Quem entrou primeiro no servidor ("host") decide a fase e avisa os outros a cada segundo; os outros só seguem.
// Todas as horas do estado são do relógio do host; cada jogador guarda a diferença para o seu relógio (offset).
export const DURATIONS = [55, 60, 65, 75, 70, 60, 60, 60];   // segundos de cada desastre (mesma ordem de DISASTER_NAMES em nds.js)
export const INTERMISSION = 18000, RESULTS = 7000, FIRST_WAIT = 12000;

export function createRound({ send, isHost, onTransition, aliveCount, random = Math.random }) {
  let S = null, offset = 0, haveClock = false, lastSend = -1e9;
  const startedAt = { v: null };
  const sNow = (wall) => wall + offset;

  function set(next, wall) {
    const prev = S;
    S = next;
    onTransition(prev, S);
    broadcast(wall, true);
  }
  function broadcast(wall, force) {
    if (!force && wall - lastSend < 1000) return;
    lastSend = wall;
    send({ ev: 's', ...S, now: sNow(wall) });
  }

  return {
    get state() { return S; },
    sNow,
    /** Recebeu o estado do host. */
    apply(p, wall) {
      const delta = p.now - wall;
      offset = haveClock ? offset * 0.6 + delta * 0.4 : delta;
      haveClock = true;
      if (S && p.seq < S.seq) return;
      const next = { seq: p.seq, rid: p.rid, ph: p.ph, d: p.d, seed: p.seed, b: p.b, e: p.e };
      if (!S || S.rid !== next.rid || S.ph !== next.ph) { const prev = S; S = next; onTransition(prev, S); } else S = next;
    },
    /** Chame várias vezes por segundo. Só o host muda de fase. */
    tick(wall) {
      if (startedAt.v === null) startedAt.v = wall;
      if (!isHost()) return;
      const now = sNow(wall);
      if (!S) {
        if (wall - startedAt.v > 2500) set({ seq: 1, rid: 0, ph: 'inter', d: -1, seed: 0, b: now, e: now + FIRST_WAIT }, wall);
        return;
      }
      if (S.ph === 'inter' && now >= S.e) {
        let d = Math.floor(random() * DURATIONS.length);
        if (d === S.d) d = (d + 1) % DURATIONS.length;     // nunca repete o desastre da rodada anterior
        set({ seq: S.seq + 1, rid: S.rid + 1, ph: 'active', d, seed: Math.floor(random() * 1e9), b: now, e: now + DURATIONS[d] * 1000 }, wall);
      } else if (S.ph === 'active' && (now >= S.e || (aliveCount() === 0 && now - S.b > 6000))) {
        set({ ...S, seq: S.seq + 1, ph: 'end', e: now + RESULTS }, wall);
      } else if (S.ph === 'end' && now >= S.e) {
        set({ ...S, seq: S.seq + 1, ph: 'inter', e: now + INTERMISSION }, wall);
      } else broadcast(wall, false);
    },
    /** Segundos desde o começo do desastre (no relógio do host). */
    elapsed(wall) { return S ? (sNow(wall) - S.b) / 1000 : 0; },
    remaining(wall) { return S ? Math.max(0, (S.e - sNow(wall)) / 1000) : 0; },
  };
}
