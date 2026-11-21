// Física simples do jogo (sem Three.js, dá para testar no Node): movimento no chão, pulo e colisões com prédios/árvores.
export const GROUND_Y = 0.08;      // altura do chão (calçada)
export const GRAVITY = 110;
export const JUMP_SPEED = 38;      // pulo de ~6.5 studs
export const WALK_SPEED = 16;
export const PLAYER_RADIUS = 1.2;

// Empurra o jogador para fora de colisores: { minX, maxX, minZ, maxZ } (caixa) ou { x, z, r } (círculo).
export function resolveCollisions(pos, radius, colliders) {
  for (let pass = 0; pass < 2; pass++) {
    for (const c of colliders) {
      if (c.r !== undefined) {
        const dx = pos.x - c.x, dz = pos.z - c.z;
        const d = Math.hypot(dx, dz), min = c.r + radius;
        if (d < min) {
          if (d > 1e-6) { pos.x = c.x + (dx / d) * min; pos.z = c.z + (dz / d) * min; } else pos.x = c.x + min;
        }
      } else {
        const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
        const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
        const dx = pos.x - cx, dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= radius * radius) continue;
        if (d2 > 1e-9) {
          const d = Math.sqrt(d2);
          pos.x = cx + (dx / d) * radius; pos.z = cz + (dz / d) * radius;
        } else {
          // o centro está dentro da caixa: sai pelo lado mais próximo
          const l = pos.x - c.minX, r = c.maxX - pos.x, f = pos.z - c.minZ, b = c.maxZ - pos.z;
          const m = Math.min(l, r, f, b);
          if (m === l) pos.x = c.minX - radius; else if (m === r) pos.x = c.maxX + radius;
          else if (m === f) pos.z = c.minZ - radius; else pos.z = c.maxZ + radius;
        }
      }
    }
  }
}

/**
 * Um passo de simulação. state = { x, y, z, vy }, input = { mx, mz (direção no mundo, tamanho 0 a 1), jump }.
 * Devolve { moving, airborne }.
 */
export function stepPlayer(state, input, dt, colliders, bounds) {
  const len = Math.hypot(input.mx, input.mz);
  const moving = len > 0.05;
  if (moving) {
    const k = Math.min(1, len) / len;
    state.x += input.mx * k * WALK_SPEED * dt;
    state.z += input.mz * k * WALK_SPEED * dt;
  }
  const onGround = state.y <= GROUND_Y + 1e-4 && state.vy <= 0;
  if (input.jump && onGround) state.vy = JUMP_SPEED;
  state.vy -= GRAVITY * dt;
  state.y += state.vy * dt;
  if (state.y <= GROUND_Y) { state.y = GROUND_Y; if (state.vy < 0) state.vy = 0; }
  resolveCollisions(state, PLAYER_RADIUS, colliders);
  state.x = Math.max(-bounds, Math.min(bounds, state.x));
  state.z = Math.max(-bounds, Math.min(bounds, state.z));
  return { moving, airborne: state.y > GROUND_Y + 0.05 };
}

// Ângulo (em Y) que faz a frente do noob (-X) apontar para a direção (dx, dz)
export const headingFor = (dx, dz) => Math.atan2(dz, -dx);

// Gira "a" na direção de "b" pelo caminho mais curto
export function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  return a + d * t;
}
