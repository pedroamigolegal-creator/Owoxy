// Analisa o molde de camisa/calça (PNG 585 x 559) antes do upload. Sem dependências: dá para testar fora do navegador.
import { CREATE_RULES } from './config.js';

const PART_LABEL = { torso: 'Torso', rarm: 'Right arm', larm: 'Left arm', rleg: 'Right leg', lleg: 'Left leg' };
const FACE_LABEL = { front: 'front', back: 'back', lside: 'left side', rside: 'right side', top: 'top', bottom: 'bottom' };
export const regionLabel = (part, face) => `${PART_LABEL[part] || part} ${FACE_LABEL[face] || face}`;

/**
 * image = { width, height, data: Uint8ClampedArray RGBA }.  regions = [{ part, face, src: [x, y, w, h] }]
 * Devolve { errors, warnings, regions: [{ label, coverage }], checks }
 */
export function analyzeClothing(image, regions) {
  const R = CREATE_RULES.clothing;
  const errors = [];
  const warnings = [];
  const checks = [];

  const sizeOk = image.width === R.width && image.height === R.height;
  checks.push({ ok: sizeOk, text: sizeOk ? `Size is ${R.width} x ${R.height}` : `Size must be exactly ${R.width} x ${R.height} (yours is ${image.width} x ${image.height})` });
  if (!sizeOk) return { errors: [checks[0].text], warnings, regions: [], checks };

  const { width: W, height: H, data } = image;
  const opaque = (x, y) => data[(y * W + x) * 4 + 3] > 16;

  // máscara: quais pixels pertencem a alguma região do molde
  const inside = new Uint8Array(W * H);
  const report = [];
  let regionOpaque = 0;
  let regionArea = 0;
  let grayish = 0;
  for (const r of regions) {
    const [sx, sy, sw, sh] = r.src;
    let count = 0;
    for (let y = sy; y < sy + sh && y < H; y++) {
      for (let x = sx; x < sx + sw && x < W; x++) {
        inside[y * W + x] = 1;
        if (opaque(x, y)) {
          count++;
          const i = (y * W + x) * 4;
          const rr = data[i], gg = data[i + 1], bb = data[i + 2];
          if (Math.abs(rr - gg) < 4 && Math.abs(gg - bb) < 4 && rr > 170 && rr < 250) grayish++;
        }
      }
    }
    regionOpaque += count;
    regionArea += sw * sh;
    report.push({ label: regionLabel(r.part, r.face), part: r.part, face: r.face, coverage: count / (sw * sh) });
  }

  let outside = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!inside[y * W + x] && opaque(x, y)) outside++;

  const filled = regionOpaque / regionArea;
  checks.push({ ok: filled >= 0.01, text: filled >= 0.01 ? `Artwork found (${(filled * 100).toFixed(0)}% of the template areas)` : 'The template looks empty: draw your design inside the boxes' });
  if (filled < 0.01) errors.push('The template looks empty: draw your design inside the boxes.');

  const stray = outside / Math.max(1, outside + regionOpaque);
  if (stray > 0.02) { warnings.push('Some artwork is outside the template boxes and will not show on the avatar.'); }
  checks.push({ ok: stray <= 0.02, warn: stray > 0.02, text: stray > 0.02 ? 'Some artwork is outside the template boxes (it will not show)' : 'Artwork stays inside the template boxes' });

  const front = report.find((r) => r.part === 'torso' && r.face === 'front');
  if (front && front.coverage < 0.02 && filled >= 0.01) {
    warnings.push('The front of the torso is empty.');
  }
  if (regionOpaque > 0 && grayish / regionOpaque > 0.85) {
    warnings.push('This looks like the unedited template. Did you paint your design on it?');
  }

  return { errors, warnings, regions: report, checks };
}
