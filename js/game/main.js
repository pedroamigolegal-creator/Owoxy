// "Talk To Others": escolha de dispositivo, carregamento, mundo, controles, chat, lista de jogadores e menu Esc.
import * as THREE from 'three';
import { requireUser } from '../auth.js';
import { esc, formDialog, toast, verifiedBadge } from '../common.js';
import { friendlyError } from '../items.js';
import { rpc } from '../supabase.js';
import { touchPresence } from '../social.js';
import { CONFIG } from '../config.js';
import { lookOfUser } from '../items.js';
import { createCharacter, loadTemplate } from './character.js';
import { setupLook } from './look.js';
import { createSound } from './sound.js';
import { joinServer, MAX_PLAYERS } from './net.js';
import { headingFor, lerpAngle, stepPlayer, GROUND_Y } from './physics.js';

const $ = (id) => document.getElementById(id);
// jogos: ?g=nds abre o Natural Disaster Survival; sem nada abre o Talk To Others
const QS = new URLSearchParams(location.search);
const GAME = QS.get('g') === 'nds' ? 'nds' : 'ttos';
const START_SERVER = Number(QS.get('s')) || 0;
const TITLE = GAME === 'nds' ? 'Natural Disaster Survival' : 'Talk To Others';
document.title = `Owoxy - ${TITLE}`;
$('device-title').textContent = TITLE; $('menu-title').textContent = TITLE;
const user = await requireUser();
if (!user) throw new Error('not logged in');

const SETTINGS_KEY = 'owoxy.ttos.settings';
const settings = { sens: 1, bubbles: true, names: true, quality: 'auto', volume: 0.6, sound: true, ...(() => { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch { return {}; } })() };
const saveSettings = () => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* sem armazenamento */ } };

let device = 'pc';
let net = null;
const remotes = new Map();        // key -> jogador remoto
let roster = [];                  // lista de presence (até 100)
let menuOpen = false;
let ready = false;                // só depois que a tela do jogo está montada

// qualquer erro aparece numa faixa vermelha (ajuda a achar o problema)
function reportError(err) {
  console.error(err);
  const el = $('err');
  if (el) { el.hidden = false; el.textContent = 'Error: ' + (err?.message || err); }
}
addEventListener('error', (e) => reportError(e.error || e.message));
addEventListener('unhandledrejection', (e) => reportError(e.reason));

// ---------- 1) escolha do dispositivo ----------
$('player-name').textContent = user.username;
const touchCapable = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
document.querySelector(touchCapable ? '[data-device="mobile"]' : '[data-device="pc"]')?.classList.add('suggested');
const chosen = await new Promise((resolve) => {
  document.querySelectorAll('[data-device]').forEach((b) => b.addEventListener('click', () => resolve(b.dataset.device), { once: true }));
});
device = chosen;
$('device').hidden = true;
document.body.classList.add(device === 'mobile' ? 'is-mobile' : 'is-pc');
try { if (device === 'mobile') await document.documentElement.requestFullscreen?.(); } catch { /* sem tela cheia, tudo bem */ }

// ---------- 2) tela de carregamento ----------
const loading = $('loading');
loading.hidden = false;
const loadText = $('load-text');
const progress = (pct, text) => { if (text) loadText.textContent = text; };
const minDelay = new Promise((r) => setTimeout(r, 2200));   // dá tempo de ver a tela, como no Roblox

function fail(err) {
  console.error(err);
  loadText.textContent = err?.message || 'Something went wrong.';
  loading.classList.add('failed');
  $('load-retry').hidden = false;
  throw err;
}
$('load-retry').addEventListener('click', () => location.reload());

progress(5, 'Joining server');
const canvas = $('stage');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) { fail(new Error('Your browser could not start 3D graphics (WebGL).')); }
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9ccdf7);
scene.fog = new THREE.Fog(0xcfe8ff, 120, 330);
const camera = new THREE.PerspectiveCamera(65, 1, 0.5, 900);

// Qualidade: a imagem é desenhada numa altura fixa (720p ou 1080p), não importa o tamanho da tela. 'high' antigo = 1080p.
function applyQuality() {
  const pick = settings.quality === 'high' ? 'fhd' : settings.quality;
  const q = pick === 'auto' ? (device === 'mobile' ? 'hd' : 'fhd') : pick;
  const target = q === 'low' ? 0 : q === 'hd' ? 720 : 1080;
  renderer.setPixelRatio(target ? Math.max(1, Math.min(3, target / Math.max(1, innerHeight))) : 1);
  look?.setQuality(q === 'low' ? 'low' : 'high');
  resize();
}
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', () => applyQuality());

const sound = createSound(settings.volume);
let tpl, world, look = null;
try {
  progress(15, 'Loading character');
  tpl = await loadTemplate(user.avatar?.model || CONFIG.defaultAvatar);
  progress(40, 'Loading map');
  world = await (await import(GAME === 'nds' ? './nds.js' : './world.js')).buildWorld();
  scene.add(world.group);
} catch (e) { fail(e); }
try { look = setupLook({ renderer, scene, world, quality: settings.quality === 'low' ? 'low' : (device === 'mobile' ? 'mobile' : 'high') }); } catch (e) { console.error('Visual extra desligado:', e); }
applyQuality();

// personagem: normaliza a altura para ~5.2 studs
const H = 5.2;
const NORM = H / (tpl.height || H);
function makeActor(l) {
  const c = createCharacter(tpl);
  c.root.scale.setScalar(NORM);
  const holder = new THREE.Group();
  holder.add(c.root);
  holder.add(blobShadow());
  scene.add(holder);
  look?.track(holder);
  c.setLook(l || {}).catch((err) => console.error('Look failed', err));
  return { c, holder };
}
let shadowMat;
function blobShadow() {
  if (!shadowMat) {
    const s = document.createElement('canvas'); s.width = s.height = 64;
    const x = s.getContext('2d'), g = x.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(0,0,0,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    shadowMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(s), transparent: true, depthWrite: false });
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6), shadowMat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.12;
  m.name = 'shadow';
  return m;
}

// jogador local
progress(55, 'Loading character');
const me = { state: { x: 0, y: GROUND_Y, z: 0, vy: 0 }, heading: 0, emote: 0, ...makeActor(null) };
function respawn() {
  const p = world.spawnPoint();
  Object.assign(me.state, { x: p.x, y: p.y ?? GROUND_Y, z: p.z, vy: 0 });
  me.heading = headingFor(-p.x, -p.z);   // olha para o centro
  camTheta = Math.atan2(p.x, p.z);        // câmera atrás do personagem
}
// leva o jogador para um ponto (usado pelos jogos com rodadas)
function teleport(x, y, z, heading = me.heading) {
  Object.assign(me.state, { x, y, z, vy: 0 });
  me.heading = heading;
  camTheta = Math.atan2(Math.cos(heading), -Math.sin(heading));   // câmera atrás do personagem
  if (net) net.sendPos({ x: +x.toFixed(2), y: +y.toFixed(2), z: +z.toFixed(2), h: +heading.toFixed(2), m: 0, a: 0 });
}
let camTheta = 0, camPhi = 0.38, camDist = H * 3.4;
respawn();
lookOfUser(user.id).then((l) => me.c.setLook({ colors: user.avatar?.colors || undefined, ...l })).catch(() => me.c.setLook({ colors: user.avatar?.colors || undefined }));

// ---------- rede ----------
progress(70, 'Joining server');
const lookQueue = [];
let lookActive = 0;
function queueLook(r) { lookQueue.push(r); pumpLooks(); }
function pumpLooks() {
  while (lookActive < 3 && lookQueue.length) {
    const r = lookQueue.shift();
    if (!remotes.has(r.key)) continue;
    lookActive++;
    lookOfUser(r.uid).catch(() => ({})).then((l) => r.actor.c.setLook(l)).catch(() => {}).finally(() => { lookActive--; pumpLooks(); });
  }
}

function addRemote(p) {
  const actor = makeActor(null);
  const r = { key: p.key, uid: p.uid, name: p.name, verified: p.verified, actor, tx: 0, ty: GROUND_Y, tz: 0, th: 0, moving: false, air: false, emote: 0, seen: false, tag: null, bubble: null, bubbleUntil: 0 };
  actor.holder.visible = false;       // só aparece depois da primeira posição
  remotes.set(p.key, r);
  queueLook(r);
}
function removeRemote(key) {
  const r = remotes.get(key); if (!r) return;
  scene.remove(r.actor.holder);
  look?.untrack(r.actor.holder);
  r.actor.c.dispose();
  r.tag?.remove(); r.bubble?.remove();
  remotes.delete(key);
}

try {
  net = await joinServer(user, {
    onProgress: () => progress(75, 'Joining server'),
    onRoster(list) {
      roster = list;
      const keys = new Set(list.map((p) => p.key));
      for (const p of list) if (!remotes.has(p.key) && !(net && p.key === net.key)) addRemote(p);
      for (const k of [...remotes.keys()]) if (!keys.has(k)) removeRemote(k);
      renderRoster();
      world.onRoster?.(list);
    },
    onPos(k, d) {
      const r = remotes.get(k); if (!r) return;
      r.tx = d.x; r.ty = d.y; r.tz = d.z; r.th = d.h; r.moving = !!d.m; r.air = !!d.a; r.emote = d.e || 0;
      if (!r.seen) { r.seen = true; r.actor.holder.position.set(d.x, d.y, d.z); r.actor.holder.rotation.y = d.h; r.actor.holder.visible = true; }
    },
    onEvent(k, d) { if (ready) world.onEvent?.(k, d); },
    onChat(k, text) {
      const r = remotes.get(k); if (!r || !ready) return;
      addChatLine(r.name, text, r.verified);
      showBubble(r, text);
    },
  }, GAME, START_SERVER);
} catch (e) { fail(e); }
// o roster pode ter chegado antes de net existir: garante que "eu" não vire jogador remoto
if (remotes.has(net.key)) removeRemote(net.key);
$('server-name').textContent = `Server ${net.server}`;
addEventListener('pagehide', () => { net?.leave(); });

progress(100, 'Joining server');
await minDelay;
loading.classList.add('done');
setTimeout(() => { loading.hidden = true; }, 600);
$('hud').hidden = false;

// ---------- entrada ----------
const keys = new Set();
let jumpHeld = false, stickX = 0, stickY = 0;
let chatFocused = false;

addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement && e.target.type === 'text') {
    if (e.key === 'Escape') { e.target.blur(); }
    return;
  }
  if (e.key === 'Escape') { e.preventDefault(); toggleMenu(); return; }
  if (menuOpen) return;
  if (e.key === 'Enter' || e.key === '/') { e.preventDefault(); showChat(); return; }
  if (e.key === 'Tab') { e.preventDefault(); $('players').classList.toggle('hidden'); return; }
  keys.add(e.code);
  if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); jumpHeld = false; });

// câmera: arrastar gira, roda aproxima
let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  if (menuOpen) return;
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
  canvas.setPointerCapture(e.pointerId);
  $('chat-input').blur();
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag || drag.id !== e.pointerId) return;
  const k = 0.0055 * settings.sens;
  camTheta -= (e.clientX - drag.x) * k;
  camPhi = Math.max(-0.1, Math.min(1.35, camPhi + (e.clientY - drag.y) * k));
  drag.x = e.clientX; drag.y = e.clientY;
});
const endDrag = (e) => { if (drag && drag.id === e.pointerId) drag = null; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('wheel', (e) => { e.preventDefault(); camDist = Math.max(H * 1.2, Math.min(H * 9, camDist * (1 + Math.sign(e.deltaY) * 0.1))); }, { passive: false });

// celular: joystick e botão de pulo
const stick = $('stick'), knob = $('stick-knob');
let stickPtr = null;
const STICK_R = 48;
function moveStick(e) {
  const r = stick.getBoundingClientRect();
  let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
  const len = Math.hypot(dx, dy);
  if (len > STICK_R) { dx = dx / len * STICK_R; dy = dy / len * STICK_R; }
  knob.style.transform = `translate(${dx}px, ${dy}px)`;
  stickX = dx / STICK_R; stickY = dy / STICK_R;
}
stick.addEventListener('pointerdown', (e) => { stickPtr = e.pointerId; stick.setPointerCapture(e.pointerId); moveStick(e); e.preventDefault(); });
stick.addEventListener('pointermove', (e) => { if (e.pointerId === stickPtr) moveStick(e); });
const stickEnd = (e) => { if (e.pointerId !== stickPtr) return; stickPtr = null; stickX = stickY = 0; knob.style.transform = ''; };
stick.addEventListener('pointerup', stickEnd);
stick.addEventListener('pointercancel', stickEnd);
const jumpBtn = $('jump-btn');
jumpBtn.addEventListener('pointerdown', (e) => { jumpHeld = true; jumpBtn.setPointerCapture(e.pointerId); e.preventDefault(); });
jumpBtn.addEventListener('pointerup', () => { jumpHeld = false; });
jumpBtn.addEventListener('pointercancel', () => { jumpHeld = false; });

// ---------- chat ----------
const chatLog = $('chat-log');
let chatFade = 0;
function addChatLine(name, text, verified = false, system = false) {
  const li = document.createElement('div');
  li.className = 'chat-line' + (system ? ' system' : '');
  if (!system) {
    const n = document.createElement('b');
    n.textContent = name + ':';
    li.append(n, ' ');
    if (verified) { const v = document.createElement('span'); v.innerHTML = verifiedBadge(); li.insertBefore(v.firstChild, n.nextSibling); }
  }
  li.append(document.createTextNode(text));
  chatLog.append(li);
  while (chatLog.children.length > 60) chatLog.firstChild.remove();
  chatLog.scrollTop = chatLog.scrollHeight;
  $('chat').classList.remove('faded');
  chatFade = performance.now() + 12000;
}
let lastSent = 0;
$('chat-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('chat-input');
  const text = input.value.replace(/\s+/g, ' ').trim().slice(0, 120);
  input.value = '';
  if (!text) { input.blur(); return; }
  const cmd = text.toLowerCase();
  if (cmd[0] === '/') {
    const e = { '/wave': 1, '/dance': 2, '/stop': 0 }[cmd];
    if (e === undefined) addChatLine('', 'Commands: /wave  /dance  /stop', false, true); else me.emote = e;
    if (device === 'pc') input.blur();
    return;
  }
  const now = performance.now();
  if (now - lastSent < 900) { toast('Slow down a little!'); return; }
  lastSent = now;
  addChatLine(user.username, text, user.verified);
  showBubble(me, text);
  net.sendChat(text);
  if (device === 'pc') input.blur();
});
$('chat-input').addEventListener('focus', () => { chatFocused = true; keys.clear(); $('chat').classList.remove('faded'); });
$('chat-input').addEventListener('blur', () => { chatFocused = false; chatFade = performance.now() + 6000; });
const showChat = () => { $('chat').classList.remove('off', 'faded'); $('chat-input').focus(); };
$('chat-btn').addEventListener('click', () => {
  const c = $('chat');
  if (c.classList.contains('off')) showChat(); else if (chatFocused) { $('chat-input').blur(); c.classList.add('off'); } else showChat();
});

// balões (como no Roblox): até 3 mensagens empilhadas sobre a cabeça, cada uma some depois de 8 s
const bubbleLayer = $('bubbles');
function showBubble(who, text) {
  if (!who.bubble) { who.bubble = document.createElement('div'); who.bubble.className = 'bubble-stack'; bubbleLayer.append(who.bubble); }
  const b = document.createElement('div');
  b.className = 'bubble';
  b.textContent = text;
  b.dataset.until = String(performance.now() + 8000);
  who.bubble.append(b);
  while (who.bubble.children.length > 3) who.bubble.firstChild.remove();
}
me.bubble = null;

// ---------- lista de jogadores e menu Esc ----------
function rowHTML(p, you) {
  const rep = !you && p.uid ? `<button class="rep-btn" type="button" data-uid="${esc(p.uid)}" data-name="${esc(p.name)}" title="Report">Report</button>` : '';
  return `<li><span class="pname">${esc(p.name)}</span>${p.verified ? verifiedBadge() : ''}${you ? '<em>you</em>' : ''}${rep}</li>`;
}
touchPresence(GAME).catch(() => {});
setInterval(() => touchPresence(GAME).catch(() => {}), 60000);
const REASONS = ['Inappropriate chat', 'Harassment or bullying', 'Scam or phishing', 'Cheating or exploiting', 'Inappropriate username', 'Other'];
async function reportPlayer(uid, name) {
  const v = await formDialog({ title: `Report ${name}`, message: 'Tell us what happened. Our moderators will review it.', confirmText: 'Submit report', danger: true,
    fields: [{ name: 'reason', label: 'Reason', options: REASONS }, { name: 'details', label: 'Details (optional)', maxLength: 300 }] });
  if (!v) return;
  try {
    await rpc('submit_report', { p_target: uid, p_reason: v.reason, p_details: v.details || null, p_context: `${TITLE}, server ${net?.server ?? '?'}` });
    toast('Report sent. Thank you!');
  } catch (err) { console.error(err); toast(friendlyError(err)); }
}
for (const id of ['players-list', 'menu-players']) {
  $(id).addEventListener('click', (e) => { const b = e.target.closest('.rep-btn'); if (b) reportPlayer(b.dataset.uid, b.dataset.name); });
}
function renderRoster() {
  const count = `${Math.min(roster.length, MAX_PLAYERS)} / ${MAX_PLAYERS}`;
  const html = roster.map((p) => rowHTML(p, net && p.key === net.key)).join('');
  $('players-count').textContent = count;
  $('players-list').innerHTML = html;
  $('menu-count').textContent = count;
  $('menu-players').innerHTML = html;
}
$('players-head').addEventListener('click', () => $('players').classList.toggle('collapsed'));
$('players-btn').addEventListener('click', () => $('players').classList.toggle('hidden'));
$('players').classList.add('hidden');

function toggleMenu(force) {
  menuOpen = force ?? !menuOpen;
  $('menu').hidden = !menuOpen;
  if (menuOpen) { keys.clear(); jumpHeld = false; $('chat-input').blur(); }
}
$('menu-btn').addEventListener('click', () => toggleMenu(true));
$('resume').addEventListener('click', () => toggleMenu(false));
$('reset').addEventListener('click', () => { if (!world.onReset?.()) respawn(); toggleMenu(false); });
$('leave').addEventListener('click', async () => { await net?.leave(); location.href = 'games.html'; });
$('menu').addEventListener('pointerdown', (e) => { if (e.target === $('menu')) toggleMenu(false); });
document.querySelectorAll('.menu-tabs button').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('.menu-tabs button').forEach((x) => x.classList.toggle('on', x === b));
  document.querySelectorAll('.menu-pane').forEach((p) => { p.hidden = p.dataset.pane !== b.dataset.tab; });
}));
// configurações
const sens = $('set-sens'), bub = $('set-bubbles'), nm = $('set-names'), qual = $('set-quality');
sens.value = settings.sens; bub.checked = settings.bubbles; nm.checked = settings.names; qual.value = settings.quality === 'high' ? 'fhd' : settings.quality;
const vol = $('set-volume'), snd = $('set-sound');
vol.value = settings.volume; snd.checked = settings.sound;
sound.setVolume(settings.volume); sound.setMuted(!settings.sound);
vol.addEventListener('input', () => { settings.volume = Number(vol.value); sound.setVolume(settings.volume); saveSettings(); });
snd.addEventListener('change', () => { settings.sound = snd.checked; sound.setMuted(!settings.sound); saveSettings(); });
sens.addEventListener('input', () => { settings.sens = Number(sens.value); saveSettings(); });
bub.addEventListener('change', () => { settings.bubbles = bub.checked; saveSettings(); });
nm.addEventListener('change', () => { settings.names = nm.checked; saveSettings(); });
qual.addEventListener('change', () => { settings.quality = qual.value; saveSettings(); applyQuality(); });

// ---------- laço principal ----------
const colliders = world.colliders || [];
const tmp = new THREE.Vector3();
const camTarget = new THREE.Vector3();
let last = performance.now(), sendAt = 0, lastSent2 = '';
function project(pos, yOff) {
  tmp.set(pos.x, pos.y + yOff, pos.z).project(camera);
  return { x: (tmp.x * 0.5 + 0.5) * innerWidth, y: (-tmp.y * 0.5 + 0.5) * innerHeight, front: tmp.z < 1 };
}
function placeLabel(el, pos, yOff, maxDist, camPos) {
  const d = Math.hypot(pos.x - camPos.x, pos.y - camPos.y, pos.z - camPos.z);
  const p = project(pos, yOff);
  if (!p.front || d > maxDist) { el.style.display = 'none'; return; }
  el.style.display = '';
  el.style.transform = `translate(-50%, -100%) translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
}

function frame(now) {
  requestAnimationFrame(frame);
  try { tick(now); } catch (err) { reportError(err); }
}
function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;

  // entrada -> direção no mundo (relativa à câmera)
  let h = 0, v = 0, jump = false;
  if (!menuOpen && !chatFocused) {
    h = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    v = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    jump = keys.has('Space') || jumpHeld;
    if (stickX || stickY) { h = stickX; v = -stickY; }
  }
  const fx = -Math.sin(camTheta), fz = -Math.cos(camTheta), rx = Math.cos(camTheta), rz = -Math.sin(camTheta);
  const mx = rx * h + fx * v, mz = rz * h + fz * v;
  const res = world.step ? world.step(me.state, { mx, mz, jump }, dt) : stepPlayer(me.state, { mx, mz, jump }, dt, colliders, world.bounds);
  sound.frame(res, me.state);
  if (me.state.y < -40) { if (world.onFall) world.onFall(); else respawn(); }
  if (res.moving) me.heading = lerpAngle(me.heading, headingFor(mx, mz), 1 - Math.exp(-dt * 14));
  me.holder.position.set(me.state.x, me.state.y, me.state.z);
  me.holder.rotation.y = me.heading;
  if (res.moving || res.airborne) me.emote = 0;           // andar ou pular para a animação
  me.c.update(dt, { moving: res.moving, airborne: res.airborne, emote: me.emote });
  const sh = me.holder.getObjectByName('shadow');
  if (sh) { const gy = world.groundBelow ? world.groundBelow(me.state.x, me.state.y, me.state.z) : GROUND_Y; const k = Math.max(0.4, 1 - (me.state.y - gy) / 14); sh.scale.set(k, k, k); sh.position.y = 0.12 - (me.state.y - gy); }

  // posição enviada ~5x por segundo (e a cada 1 s mesmo parado)
  if (now - sendAt > 200) {
    const s = me.state;
    const msg = `${s.x.toFixed(2)},${s.y.toFixed(2)},${s.z.toFixed(2)},${me.heading.toFixed(2)},${res.moving ? 1 : 0},${res.airborne ? 1 : 0},${me.emote}`;
    if (msg !== lastSent2 || now - sendAt > 1000) {
      sendAt = now; lastSent2 = msg;
      net.sendPos({ x: +s.x.toFixed(2), y: +s.y.toFixed(2), z: +s.z.toFixed(2), h: +me.heading.toFixed(2), m: res.moving ? 1 : 0, a: res.airborne ? 1 : 0, e: me.emote });
    }
  }

  // jogadores remotos (interpolação)
  const kPos = 1 - Math.exp(-dt * 9);
  for (const r of remotes.values()) {
    if (!r.seen) continue;
    const g = r.actor.holder;
    if (Math.hypot(r.tx - g.position.x, r.tz - g.position.z) > 40 || Math.abs(r.ty - g.position.y) > 40) g.position.set(r.tx, r.ty, r.tz);   // teletransporte: não desliza pelo mapa
    g.position.x += (r.tx - g.position.x) * kPos;
    g.position.y += (r.ty - g.position.y) * kPos;
    g.position.z += (r.tz - g.position.z) * kPos;
    g.rotation.y = lerpAngle(g.rotation.y, r.th, 1 - Math.exp(-dt * 12));
    const moving = Math.hypot(r.tx - g.position.x, r.tz - g.position.z) > 0.15 || r.moving;
    r.actor.c.update(dt, { moving, airborne: r.air, emote: moving ? 0 : r.emote });
    const s = g.getObjectByName('shadow');
    if (s) { const gy = world.groundBelow ? world.groundBelow(g.position.x, g.position.y, g.position.z) : GROUND_Y; const k = Math.max(0.4, 1 - (g.position.y - gy) / 14); s.scale.set(k, k, k); s.position.y = 0.12 - (g.position.y - gy); }
  }

  // câmera
  camTarget.set(me.state.x, me.state.y + H * 0.75, me.state.z);
  const cp = Math.cos(camPhi);
  camera.position.set(camTarget.x + Math.sin(camTheta) * cp * camDist, Math.max(0.6, camTarget.y + Math.sin(camPhi) * camDist), camTarget.z + Math.cos(camTheta) * cp * camDist);
  if (world.shake) { camera.position.x += (Math.random() - 0.5) * world.shake; camera.position.y += (Math.random() - 0.5) * world.shake; camera.position.z += (Math.random() - 0.5) * world.shake; }
  camera.lookAt(camTarget);
  world.tick?.(dt);
  world.update?.(dt, now);
  look?.update(me.state, dt);
  renderer.render(scene, camera);

  // textos sobre as cabeças: balões (todos) e nomes (os 30 mais perto)
  const cpos = camera.position;
  const t = performance.now();
  const near = [];
  for (const r of remotes.values()) if (r.seen) near.push([Math.hypot(r.actor.holder.position.x - me.state.x, r.actor.holder.position.z - me.state.z), r]);
  near.sort((a, b) => a[0] - b[0]);
  const nameSet = new Set(settings.names ? near.slice(0, 30).filter(([d]) => d < 90).map(([, r]) => r) : []);
  for (const [, r] of near) {
    const pos = r.actor.holder.position;
    if (nameSet.has(r)) {
      if (!r.tag) { r.tag = document.createElement('div'); r.tag.className = 'nametag'; r.tag.innerHTML = `${esc(r.name)}${r.verified ? verifiedBadge() : ''}`; $('tags').append(r.tag); }
      placeLabel(r.tag, pos, H + 1.3, 95, cpos);
    } else if (r.tag) { r.tag.style.display = 'none'; }
  }
  for (const r of [me, ...remotes.values()]) {
    if (!r.bubble) continue;
    for (const b of [...r.bubble.children]) if (t > Number(b.dataset.until)) b.remove();
    if (!settings.bubbles || !r.bubble.children.length) { r.bubble.style.display = 'none'; continue; }
    placeLabel(r.bubble, r === me ? me.holder.position : r.actor.holder.position, H + (r.tag && r.tag.style.display !== 'none' ? 3.4 : 2.0), 110, cpos);
  }
  if (!chatFocused && t > chatFade) $('chat').classList.add('faded');
}
resize();
world.attach?.({ me, remotes, net, user, teleport, hud: $('hud'), say: (t) => addChatLine('', t, false, true), roster: () => roster, camera: () => camera });
ready = true;
addChatLine('', `Welcome to ${TITLE}, ${user.username}! Say hi!`, false, true);
requestAnimationFrame(frame);
