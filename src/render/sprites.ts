/**
 * Procedural card artwork (PLAN.md §7.5).
 *
 * Every card face is **generated** from its figure id — no artwork is extracted from *Final
 * Fantasy IX*, and nothing is bundled as an asset. A seeded generator picks a family palette and
 * layers geometric sigils, so each of the 100 figures gets a distinct, stable face: the same
 * figure always looks the same, and the whole catalogue costs zero bytes of image data.
 *
 * Faces are cached to offscreen canvases because they never change once drawn.
 */

import { createRng } from '../core/rng.ts';
import type { CardFigure } from '../core/types.ts';
import { FAMILY_HUE } from './theme.ts';

const DEFAULT_HUE = 200;

function hueFor(figure: CardFigure): number {
  return FAMILY_HUE[figure.family] ?? DEFAULT_HUE;
}

/** Creates a detached canvas, or falls back to an inline-sized one where OffscreenCanvas is absent. */
function makeCanvas(size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

/**
 * Draws the sigil for a figure onto `ctx`, filling a `size`x`size` area.
 *
 * Exported separately from the cache so the drawing can be tested directly, and so the cache can
 * be dropped in tests without losing coverage of the actual artwork.
 */
export function drawSigil(ctx: CanvasRenderingContext2D, figure: CardFigure, size: number): void {
  const rng = createRng(figure.id * 7919 + 17);
  const hue = hueFor(figure);
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.38;

  // Background: a two-stop gradient in the family's hue, darkened so the arrows stay legible.
  const bg = ctx.createLinearGradient(0, 0, size, size);
  bg.addColorStop(0, `hsl(${hue} 32% 22%)`);
  bg.addColorStop(1, `hsl(${(hue + 40) % 360} 28% 13%)`);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  // A soft halo behind the sigil, sized by the figure's tier: stronger figures read as brighter.
  const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 1.3);
  const glow = 12 + figure.tier * 8;
  halo.addColorStop(0, `hsl(${hue} 70% ${glow}%)`);
  halo.addColorStop(1, 'hsla(0 0% 0% / 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, size, size);

  // Layered sigils. The count and the kinds come from the seeded stream, so every figure differs.
  const layers = 3 + rng.int(3);
  for (let i = 0; i < layers; i++) {
    const kind = rng.int(4);
    const r = radius * (0.45 + rng.next() * 0.55);
    const rot = rng.next() * Math.PI * 2;
    const sides = 3 + rng.int(6);
    const light = 45 + rng.int(30);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.strokeStyle = `hsla(${(hue + i * 25) % 360} 65% ${light}% / 0.85)`;
    ctx.fillStyle = `hsla(${(hue + i * 25) % 360} 60% ${light - 12}% / 0.35)`;
    ctx.lineWidth = Math.max(1, size * 0.012);

    if (kind === 0) {
      polygon(ctx, sides, r);
      ctx.fill();
    } else if (kind === 1) {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
    } else if (kind === 2) {
      // An open arc, drawn twice for a woven look.
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 1.3);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.6, Math.PI, Math.PI * 2.4);
      ctx.stroke();
    } else {
      // Concentric rings.
      for (let ring = 1; ring <= 3; ring++) {
        ctx.beginPath();
        ctx.arc(0, 0, (r * ring) / 3, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // A central glyph, so every face has a focal point even when the layers are sparse.
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rng.next() * Math.PI);
  ctx.fillStyle = `hsla(${hue} 80% 78% / 0.9)`;
  const spokes = 3 + rng.int(4);
  ctx.beginPath();
  for (let i = 0; i < spokes * 2; i++) {
    const angle = (i / (spokes * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? radius * 0.22 : radius * 0.1;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function polygon(ctx: CanvasRenderingContext2D, sides: number, radius: number): void {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

const cache = new Map<string, HTMLCanvasElement>();

/**
 * The cached artwork for a figure at a given size. Regenerating is deterministic, so a cache miss
 * is invisible to the player.
 */
export function cardArt(figure: CardFigure, size: number): HTMLCanvasElement {
  const key = `${figure.id}:${size}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d');
  if (ctx) drawSigil(ctx, figure, size);
  cache.set(key, canvas);
  return canvas;
}

/** Empties the artwork cache. Used by tests and by any future artwork settings change. */
export function clearArtCache(): void {
  cache.clear();
}

/** How many faces are currently cached, for diagnostics. */
export function artCacheSize(): number {
  return cache.size;
}
