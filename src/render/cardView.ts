/**
 * The card face (PLAN.md §7.5).
 *
 * A card shows four things, in priority order: **who owns it**, its **arrows**, its **art**, and
 * its **stats**. Ownership is drawn twice — a coloured frame plus a distinct corner shape — so the
 * board is readable without relying on colour vision.
 *
 * This module only draws. It never mutates game state, and it is a pure function of the card it is
 * handed.
 */

import { figureById } from '../data/cards.ts';
import { statCode } from '../core/card.ts';
import { arrowCount } from '../core/direction.ts';
import type { BattleRollFrame } from './animator.ts';
import type { BoardCard, Cell } from '../core/types.ts';
import { drawArrows } from './arrowSprite.ts';
import { cardArt } from './sprites.ts';
import { COLORS, FONTS, METRICS, SEATS, seatOf } from './theme.ts';

export interface CardDrawOptions {
  /** 0-1, used for the entry animation and for fades. */
  readonly opacity?: number;
  /** Extra scale applied about the card's centre, used by the placement animation. */
  readonly scale?: number;
  /** Draw the stat code. Off for small thumbnails. */
  readonly showStats?: boolean;
  /** Highlight ring, e.g. when this card is contested. */
  readonly highlight?: string | null;
}

/** Draws a card centred in a `size`x`size` box at the current transform origin. */
export function drawCardFace(
  ctx: CanvasRenderingContext2D,
  card: BoardCard,
  size: number,
  options: CardDrawOptions = {},
): void {
  const { opacity = 1, scale = 1, showStats = true, highlight = null } = options;
  if (opacity <= 0) return;

  const seat = seatOf(card.owner);
  const style = SEATS[seat];
  const half = size / 2;

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.translate(half, half);
  if (scale !== 1) ctx.scale(scale, scale);
  ctx.translate(-half, -half);

  // Shadow, then the face.
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = size * 0.12;
  ctx.shadowOffsetY = size * 0.04;
  roundRect(ctx, 0, 0, size, size, METRICS.cornerRadius);
  ctx.fillStyle = COLORS.cardFace;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Artwork, inset so the frame reads.
  const inset = size * 0.07;
  ctx.save();
  roundRect(ctx, inset, inset, size - inset * 2, size - inset * 2, METRICS.cornerRadius * 0.7);
  ctx.clip();
  try {
    ctx.drawImage(
      cardArt(figureById(card.figureId), 128),
      inset,
      inset,
      size - inset * 2,
      size - inset * 2,
    );
  } catch {
    // No 2D context available (headless). The frame alone still identifies the card.
  }
  ctx.restore();

  // Arrows: the most important mark on the card, drawn over the art.
  drawArrows(ctx, card.arrows, size);

  // Ownership frame. Thickness varies by seat as a second, non-colour channel.
  ctx.lineWidth = size * (seat === 'player' ? 0.045 : 0.075);
  ctx.strokeStyle = style.frame;
  roundRect(ctx, 0, 0, size, size, METRICS.cornerRadius);
  ctx.stroke();

  // Ownership pip: a square for the player, a hexagon for the AI.
  drawSeatPip(ctx, seat, size, style.frame);

  if (showStats) {
    drawStatBar(ctx, card, size);
  }

  if (highlight !== null) {
    ctx.lineWidth = size * 0.05;
    ctx.strokeStyle = highlight;
    roundRect(ctx, size * 0.03, size * 0.03, size * 0.94, size * 0.94, METRICS.cornerRadius);
    ctx.stroke();
  }

  ctx.restore();
}

function drawStatBar(ctx: CanvasRenderingContext2D, card: BoardCard, size: number): void {
  const barHeight = size * 0.17;
  ctx.save();
  ctx.fillStyle = 'rgba(8, 10, 15, 0.82)';
  ctx.fillRect(0, size - barHeight, size, barHeight);
  ctx.font = FONTS.stat;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = COLORS.ink;
  ctx.fillText(statCode(card), size / 2, size - barHeight / 2);
  ctx.restore();

  // Arrow count, top-left. Cards with no arrows are visibly dead, which is useful information.
  ctx.save();
  ctx.font = FONTS.statSmall;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = arrowCount(card.arrows) === 0 ? COLORS.bad : COLORS.inkMuted;
  ctx.fillText(`${arrowCount(card.arrows)}`, size * 0.08, size * 0.06);
  ctx.restore();
}

function drawSeatPip(
  ctx: CanvasRenderingContext2D,
  seat: 'player' | 'ai',
  size: number,
  color: string,
): void {
  const r = size * 0.07;
  const x = size - r * 1.5;
  const y = r * 1.5;
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  if (seat === 'player') {
    ctx.rect(x - r, y - r, r * 2, r * 2);
  } else {
    // A hexagon reads as a different shape at a glance, not just a different colour.
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const px = x + Math.cos(angle) * r;
      const py = y + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }
  ctx.fill();
  ctx.restore();
}

/** A hand card: no owner frame, drawn at reduced scale for the tray. */
export function drawHandCard(
  ctx: CanvasRenderingContext2D,
  card: BoardCard,
  size: number,
  options: CardDrawOptions = {},
): void {
  drawCardFace(ctx, { ...card, owner: 'player' }, size, {
    ...options,
    showStats: options.showStats ?? true,
  });
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/** The cell a screen point falls in, or null. Shared by the board and the pointer handler. */
export function cellFromPoint(
  x: number,
  y: number,
  originX: number,
  originY: number,
  cellSize: number,
  gutter: number,
  cellCount: number,
): Cell | null {
  const columns = Math.sqrt(cellCount);
  const col = Math.floor((x - originX) / (cellSize + gutter));
  const row = Math.floor((y - originY) / (cellSize + gutter));
  if (col < 0 || row < 0 || col >= columns || row >= columns) return null;
  return (row * columns + col) as Cell;
}

/**
 * The number rolling down during a battle (§1.6, §1.7).
 *
 * Drawn as its own overlay rather than folded into `drawCardFace`, because the card face is a pure
 * function of the card and this is a property of the *fight* — two cards, one comparison, and a
 * verdict. Keeping them apart is also what lets the numbers be tested without a card.
 */
export function drawBattleRoll(
  ctx: CanvasRenderingContext2D,
  size: number,
  roll: BattleRollFrame,
  flash: number,
): void {
  const tint = roll.won ? COLORS.good : COLORS.bad;
  const half = size / 2;

  ctx.save();
  // Scrim, so the number wins against whatever art is underneath rather than fighting it.
  ctx.fillStyle = `rgba(10, 12, 18, ${0.55 + 0.3 * flash})`;
  roundRect(ctx, 0, 0, size, size, METRICS.cornerRadius);
  ctx.fill();

  // The numbers run over the middle of the card, which is where the eye already is. The value falls
  // from the card's printed stat towards what it actually rolled — see `BattleRollFrame`.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = tint;
  ctx.font = `700 ${Math.round(size * 0.44)}px ui-monospace, "SF Mono", Menlo, monospace`;
  ctx.fillText(`${roll.value}`, half, half - size * 0.04);

  // Odds under it: small, and only while the roll is running, so it cannot be mistaken for a stat.
  ctx.font = FONTS.statSmall;
  ctx.fillStyle = COLORS.inkMuted;
  ctx.fillText(`${Math.round(roll.probability * 100)}%`, half, half + size * 0.26);

  // A hairline ring in the same colour, brightest at the peak of the flash.
  if (flash > 0.01) {
    ctx.globalAlpha = flash;
    ctx.strokeStyle = tint;
    ctx.lineWidth = Math.max(1, size * 0.03 * flash);
    roundRect(ctx, size * 0.04, size * 0.04, size * 0.92, size * 0.92, METRICS.cornerRadius);
    ctx.stroke();
  }
  ctx.restore();
}
