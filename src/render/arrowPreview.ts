/**
 * Arrow previews for cards outside the board (PLAN.md §6).
 *
 * The board draws every card with its real arrow pattern, so the pattern was only ever visible
 * *after* you played. The hand tray said "5 arrows" — the count without the direction — which is the
 * one piece of information you need to decide where to play and it was the one piece missing. A move
 * was effectively a guess.
 *
 * This reuses `drawArrows`, the same code the board uses, so a preview and the card it represents
 * cannot drift apart. What it adds is a frame and a centre dot: the arrows read as "out of the middle
 * and away", which is what a player has to reason about, rather than as floating triangles.
 */

import { drawArrows, DEFAULT_ARROW_STYLE, type ArrowStyle } from './arrowSprite.ts';
import { COLORS } from './theme.ts';
import type { Direction } from '../core/types.ts';

/** The compass letters, canonical order, so a player can name a direction in words. */
export const DIRECTION_LETTER: Readonly<Record<Direction, string>> = {
  0: 'N',
  1: 'NE',
  2: 'E',
  3: 'SE',
  4: 'S',
  5: 'SW',
  6: 'W',
  7: 'NW',
};

/** The directions a mask points in, as letters, in canonical order. */
export function directionLetters(mask: number): string[] {
  const letters: string[] = [];
  for (let dir = 0 as Direction; dir < 8; dir = (dir + 1) as Direction) {
    if (((mask >> dir) & 1) === 1) letters.push(DIRECTION_LETTER[dir]);
  }
  return letters;
}

/** A one-line description, for tooltips and for screen readers. */
export function describeArrows(mask: number): string {
  const letters = directionLetters(mask);
  if (letters.length === 0) return 'no arrows — cannot take anything';
  return `points ${letters.join(', ')}`;
}

const PREVIEW_STYLE: ArrowStyle = { ...DEFAULT_ARROW_STYLE, color: COLORS.ink };

export interface PreviewOptions {
  /** CSS pixels. The backing store is scaled by the device pixel ratio. */
  readonly size?: number;
  readonly style?: ArrowStyle;
}

/**
 * Draws a card's arrow pattern into a context of `size` CSS pixels.
 *
 * The caller owns the canvas and its transform; this only paints, so the same function serves a
 * `<canvas>` element in the DOM and an offscreen buffer.
 */
export function paintArrowPreview(
  ctx: CanvasRenderingContext2D,
  mask: number,
  options: PreviewOptions = {},
): void {
  const size = options.size ?? 40;
  ctx.save();
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = COLORS.boardBackground;
  ctx.fillRect(0, 0, size, size);

  // A centre dot, so the arrows read as radiating from the card rather than scattered.
  const radius = Math.max(2, size * 0.09);
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, radius, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.inkMuted;
  ctx.fill();

  drawArrows(ctx, mask, size, options.style ?? PREVIEW_STYLE);
  ctx.restore();
}

/**
 * Builds a `<canvas>` showing a card's arrows, ready to drop into a button.
 *
 * Returns a plain element rather than drawing, because the hand tray is DOM: the card is a `<button>`
 * so it is reachable and operable by keyboard, and this sits inside it. Sized by the device pixel
 * ratio so the preview is as crisp as the rest of the page.
 */
export function arrowPreviewCanvas(
  mask: number,
  options: PreviewOptions = {},
  doc: Document = document,
): HTMLCanvasElement {
  const size = options.size ?? 40;
  const dpr = Math.max(1, (globalThis as { devicePixelRatio?: number }).devicePixelRatio ?? 1);
  const canvas = doc.createElement('canvas');
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  // Decorative: the same information is in the button's accessible name, so a screen reader should
  // not announce the picture and then the words.
  canvas.setAttribute('aria-hidden', 'true');
  canvas.className = 'arrow-preview';

  const ctx = canvas.getContext('2d');
  if (ctx !== null) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintArrowPreview(ctx, mask, { ...options, size });
  }
  return canvas;
}
