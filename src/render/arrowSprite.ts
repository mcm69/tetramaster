/**
 * Arrow sprites (PLAN.md §1.2).
 *
 * A card's arrows are its most important feature, so they are drawn large, high-contrast, and
 * unmistakable: a filled head with a short shaft, pointing from the card's centre toward the edge
 * it attacks. Zero-arrow cards draw nothing at all, which is itself information — the original
 * treats such cards as weak but not worthless, and the board should show that at a glance.
 */

import { DIRECTIONS } from '../core/direction.ts';
import type { Direction } from '../core/types.ts';

export interface ArrowStyle {
  readonly color: string;
  /** Stroke width of the shaft, as a fraction of the card's short side. */
  readonly width: number;
  /** How far the head sits from the edge, as a fraction of half the card. */
  readonly inset: number;
  readonly alpha: number;
}

export const DEFAULT_ARROW_STYLE: ArrowStyle = {
  color: '#f2f5ff',
  width: 0.055,
  inset: 0.16,
  alpha: 0.92,
};

/** Unit vectors pointing outward from a card's centre, indexed by direction. */
const UNIT: ReadonlyArray<readonly [number, number]> = [
  [0, -1], // N
  [0.7071, -0.7071], // NE
  [1, 0], // E
  [0.7071, 0.7071], // SE
  [0, 1], // S
  [-0.7071, 0.7071], // SW
  [-1, 0], // W
  [-0.7071, -0.7071], // NW
];

/**
 * Draws one arrow from the centre of a `size`x`size` box at `offsetX`/`offsetY`.
 * Callers translate; this only paints in local space.
 */
export function drawArrow(
  ctx: CanvasRenderingContext2D,
  dir: Direction,
  size: number,
  style: ArrowStyle = DEFAULT_ARROW_STYLE,
): void {
  const unit = UNIT[dir];
  if (!unit) return;
  const cx = size / 2;
  const cy = size / 2;
  const half = size / 2;
  const tip = half * (1 - style.inset);
  const shaftEnd = tip - size * 0.16;
  const width = size * style.width;

  ctx.save();
  ctx.globalAlpha = style.alpha;
  ctx.fillStyle = style.color;
  ctx.strokeStyle = style.color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';

  // Shaft, from just off-centre out to where the head begins.
  const start = half * 0.3;
  ctx.beginPath();
  ctx.moveTo(cx + unit[0] * start, cy + unit[1] * start);
  ctx.lineTo(cx + unit[0] * shaftEnd, cy + unit[1] * shaftEnd);
  ctx.stroke();

  // Head: a triangle whose base sits perpendicular to the shaft.
  const headWidth = size * 0.17;
  const px = -unit[1];
  const py = unit[0];
  ctx.beginPath();
  ctx.moveTo(cx + unit[0] * tip, cy + unit[1] * tip);
  ctx.lineTo(
    cx + unit[0] * shaftEnd + px * headWidth * 0.5,
    cy + unit[1] * shaftEnd + py * headWidth * 0.5,
  );
  ctx.lineTo(
    cx + unit[0] * shaftEnd - px * headWidth * 0.5,
    cy + unit[1] * shaftEnd - py * headWidth * 0.5,
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Draws every arrow in an 8-bit mask. A mask of 0 draws nothing. */
export function drawArrows(
  ctx: CanvasRenderingContext2D,
  mask: number,
  size: number,
  style: ArrowStyle = DEFAULT_ARROW_STYLE,
): void {
  for (const dir of DIRECTIONS) {
    if (((mask >> dir) & 1) === 1) drawArrow(ctx, dir, size, style);
  }
}
