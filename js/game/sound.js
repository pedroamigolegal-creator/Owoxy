// Sons do jogo (passos e pulo) com Web Audio. O navegador só libera áudio depois de um toque/tecla, então o contexto é criado no primeiro gesto.
const FILES = { walk: new URL('../../assets/sounds/walk.mp3', import.meta.url), jump: new URL('../../assets/sounds/jump.mp3', import.meta.url) };

export function createSound(volume = 0.6) {
  let ctx = null, master = null, vol = volume, muted = false, walkSrc = null, walkGain = null;
  const buffers = {};
  let loading = false;

  async function load() {
    if (loading || !ctx) return;
    loading = true;
    for (const [k, url] of Object.entries(FILES)) {
      try { buffers[k] = await ctx.decodeAudioData(await (await fetch(url)).arrayBuffer()); } catch (e) { console.warn('Som não carregou:', k, e); }
    }
  }
  function unlock() {
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
        ctx = new AC(); master = ctx.createGain(); master.gain.value = muted ? 0 : vol; master.connect(ctx.destination);
        load();
      }
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) { console.warn('Áudio indisponível:', e); }
  }
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) addEventListener(ev, unlock, { passive: true });

  function playOnce(name, gain = 1, rate = 1) {
    if (!ctx || !buffers[name] || ctx.state !== 'running') return;
    const src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = buffers[name]; src.playbackRate.value = rate; g.gain.value = gain;
    src.connect(g); g.connect(master); src.start();
  }
  function setWalking(on) {
    if (!ctx || !buffers.walk || ctx.state !== 'running') return;
    if (on && !walkSrc) {
      walkSrc = ctx.createBufferSource(); walkGain = ctx.createGain();
      walkSrc.buffer = buffers.walk; walkSrc.loop = true; walkGain.gain.value = 0.0001;
      walkSrc.connect(walkGain); walkGain.connect(master); walkSrc.start();
      walkGain.gain.setTargetAtTime(0.9, ctx.currentTime, 0.03);
    } else if (!on && walkSrc) {
      const s = walkSrc, g = walkGain; walkSrc = null; walkGain = null;
      g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.04);
      setTimeout(() => { try { s.stop(); } catch { /* já parou */ } }, 200);
    }
  }
  let wasUp = false;
  return {
    /** chamado todo quadro com o resultado da física do jogador local */
    frame(res, state) {
      setWalking(!!res.moving && !res.airborne && !res.swimming);
      const up = state.vy > 25;                       // começou a subir = pulou
      if (up && !wasUp) playOnce('jump', 1, 0.97 + Math.random() * 0.06);
      wasUp = up;
    },
    setVolume(v) { vol = v; if (master) master.gain.value = muted ? 0 : vol; },
    setMuted(m) { muted = m; if (master) master.gain.value = muted ? 0 : vol; },
    unlock,
  };
}
