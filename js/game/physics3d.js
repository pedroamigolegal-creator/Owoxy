// Física 3D simples para o Natural Disaster Survival: caixas (AABB) em que dá para subir e ficar em cima, chão com buracos e água.
export const WALK = 16, GRAVITY = 110, JUMP = 38, R = 1.2, HEIGHT = 5.2, STEP = 1.15, EPS = 0.001;

const overlapXZ = (s, b, m = 0) => s.x > b.minX - R + m && s.x < b.maxX + R - m && s.z > b.minZ - R + m && s.z < b.maxZ + R - m;
const overlapY = (s, b) => s.y < b.maxY - 1e-4 && s.y + HEIGHT > b.minY + 1e-4;

// altura do chão num ponto: ctx.groundAt(x,z) (alturas diferentes, ex. lobby no alto) ou hasGround + groundY
const groundOf = (ctx, x, z) => (ctx.groundAt ? ctx.groundAt(x, z) : (ctx.hasGround(x, z) ? ctx.groundY : -Infinity));

/** Tem chão sob os pés? (chão da ilha fora dos buracos, ou topo de uma caixa) */
export function supportAt(s, ctx) {
  let best = groundOf(ctx, s.x, s.z);
  for (const b of ctx.boxes) if (overlapXZ(s, b, 0.15) && b.maxY <= s.y + 0.05 && b.maxY > best) best = b.maxY;
  return best;
}

function moveAxis(s, axis, d, ctx) {
  if (!d) return;
  s[axis] += d;
  const lo = axis === 'x' ? 'minX' : 'minZ', hi = axis === 'x' ? 'maxX' : 'maxZ';
  for (const b of ctx.boxes) {
    if (!(overlapXZ(s, b) && overlapY(s, b))) continue;
    if (b.maxY - s.y <= STEP && s.vy <= 0) { s.y = b.maxY; continue; }          // degrau pequeno: sobe sozinho
    s[axis] = d > 0 ? b[lo] - R - EPS : b[hi] + R + EPS;                          // parede: empurra para fora
  }
}

/**
 * state = { x, y, z, vy }, input = { mx, mz, jump } (direção no mundo).
 * ctx = { boxes, hasGround(x,z), groundY, waterY (superfície da água, -Infinity se não há), pushX, pushZ (vento), lift }
 * Devolve { moving, airborne, swimming, headUnder }.
 */
export function step3d(s, input, dt, ctx) {
  const len = Math.hypot(input.mx, input.mz);
  const moving = len > 0.05;
  const water = ctx.waterY ?? -Infinity;
  const swimming = s.y + HEIGHT * 0.35 < water;
  const headUnder = s.y + HEIGHT * 0.9 < water;
  const speed = WALK * (swimming ? 0.6 : 1);
  let dx = (ctx.pushX || 0) * dt, dz = (ctx.pushZ || 0) * dt;
  if (moving) { const k = Math.min(1, len) / len; dx += input.mx * k * speed * dt; dz += input.mz * k * speed * dt; }
  moveAxis(s, 'x', dx, ctx);
  moveAxis(s, 'z', dz, ctx);

  const grounded = s.vy <= 0 && supportAt(s, ctx) >= s.y - 0.03;
  if (swimming) {
    s.vy = Math.max(-6, s.vy - 40 * dt);
    if (input.jump) s.vy = 14;
  } else {
    if (input.jump && grounded) s.vy = JUMP;
    s.vy -= GRAVITY * dt;
  }
  if (ctx.lift) s.vy = Math.max(s.vy, ctx.lift);
  const prevY = s.y;
  s.y += s.vy * dt;

  let landed = false;
  if (s.vy <= 0) {
    const g = groundOf(ctx, s.x, s.z);
    let top = g > -Infinity && prevY >= g - 0.02 ? g : -Infinity;
    for (const b of ctx.boxes) if (overlapXZ(s, b, 0.15) && prevY >= b.maxY - 0.02 && b.maxY > top) top = b.maxY;
    if (top > -Infinity && s.y <= top) { s.y = top; s.vy = 0; landed = true; }
  } else {
    for (const b of ctx.boxes) if (overlapXZ(s, b, 0.15) && prevY + HEIGHT <= b.minY + 0.02 && s.y + HEIGHT > b.minY) { s.y = b.minY - HEIGHT; s.vy = 0; }
  }
  return { moving, airborne: !landed && !grounded && !swimming, swimming, headUnder };
}

/** Tem teto (algo acima da cabeça) neste ponto? Usado para abrigos (nevasca, chuva ácida). */
export function covered(s, boxes) {
  for (const b of boxes) if (s.x > b.minX && s.x < b.maxX && s.z > b.minZ && s.z < b.maxZ && b.minY >= s.y + HEIGHT * 0.5 && b.minY < s.y + 40) return true;
  return false;
}
