/**
 * The board: grid, cells, and the cards on them (PLAN.md §1.1).
 *
 * Purely a projection of state onto pixels — it reads `GameState` and the current animation frame
 * and draws. It never mutates state, and it holds none of its own beyond layout maths.
 */

import { CELLS } from '../core/constants.ts';
import { legalCells } from '../core/match.ts';
import { arrowCount } from '../core/direction.ts';
import type { Cell, GameState, Owner } from '../core/types.ts';
import { drawCardFace, roundRect } from './cardView.ts';
import { COLORS, METRICS, SEATS, seatOf } from './theme.ts';
import type { CardFrame } from './animator.ts';

/** Where the board sits and how big each cell is. Derived once, used by drawing and hit-testing. */
export interface BoardLayout {
  readonly originX: number;
  readonly originY: number;
  readonly cellSize: number;
  readonly gutter: number;
}

export function boardLayout(
  boardSize: number = METRICS.boardSize,
  originX = 0,
  originY = 0,
): BoardLayout {
  const padding = METRICS.padding;
  const columns = Math.sqrt(CELLS);
  const gutter = METRICS.gutter;
  const cellSize = (boardSize - padding * 2) / columns - gutter;
  return { originX: originX + padding, originY: originY + padding, cellSize, gutter };
}

export function cellRect(layout: BoardLayout, cell: Cell): { x: number; y: number; size: number } {
  const columns = Math.sqrt(CELLS);
  const col = cell % columns;
  const row = Math.floor(cell / columns);
  return {
    x: layout.originX + col * (layout.cellSize + layout.gutter),
    y: layout.originY + row * (layout.cellSize + layout.gutter),
    size: layout.cellSize,
  };
}

export interface BoardViewOptions {
  readonly layout: BoardLayout;
  /** Per-cell animation frames. Missing cells fall back to whatever state says. */
  readonly frames?: ReadonlyMap<Cell, CardFrame>;
  /** Cells the current player may drop into; highlighted. */
  readonly highlightLegal?: boolean;
  readonly hover?: Cell | null;
  readonly pendingBattles?: readonly Cell[];
}

/**
 * Draws the whole board. Reads state and animation frames; writes pixels only.
 */
export function drawBoard(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  options: BoardViewOptions,
): void {
  const { layout } = options;
  const legal =
    options.highlightLegal === true && state.phase === 'place' ? new Set(legalCells(state)) : null;
  const pending = new Set(options.pendingBattles ?? []);

  // Board plate.
  ctx.save();
  ctx.fillStyle = COLORS.boardBackground;
  roundRect(
    ctx,
    layout.originX - METRICS.padding,
    layout.originY - METRICS.padding,
    CELLS > 0 ? layout.cellSize * 4 + layout.gutter * 3 + METRICS.padding * 2 : 0,
    layout.cellSize * 4 + layout.gutter * 3 + METRICS.padding * 2,
    METRICS.cornerRadius * 1.5,
  );
  ctx.fill();
  ctx.strokeStyle = COLORS.boardEdge;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  for (let index = 0; index < CELLS; index++) {
    const cell = index as Cell;
    drawCell(ctx, state, options, cell, legal?.has(cell) ?? false, pending.has(cell));
  }
}

function drawCell(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  options: BoardViewOptions,
  cell: Cell,
  isLegal: boolean,
  isPending: boolean,
): void {
  const rect = cellRect(options.layout, cell);
  const blocked = state.blocked[cell] ?? false;

  ctx.save();
  roundRect(ctx, rect.x, rect.y, rect.size, rect.size, METRICS.cornerRadius);
  ctx.fillStyle = blocked
    ? COLORS.cellBlocked
    : isPending
      ? COLORS.cellPendingBattle
      : isLegal
        ? COLORS.cellLegal
        : COLORS.cell;
  ctx.fill();
  ctx.lineWidth = isLegal || isPending ? 2 : 1;
  ctx.strokeStyle = isPending
    ? COLORS.cellPendingEdge
    : options.hover === cell
      ? COLORS.accent
      : isLegal
        ? COLORS.cellLegalEdge
        : blocked
          ? COLORS.cellBlockedEdge
          : COLORS.cellEdge;
  ctx.stroke();
  ctx.restore();

  if (blocked) {
    // Blocked cells read as inert: a cross, never a drop target.
    ctx.save();
    ctx.strokeStyle = COLORS.inkFaint;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(rect.x + rect.size * 0.3, rect.y + rect.size * 0.3);
    ctx.lineTo(rect.x + rect.size * 0.7, rect.y + rect.size * 0.7);
    ctx.moveTo(rect.x + rect.size * 0.7, rect.y + rect.size * 0.3);
    ctx.lineTo(rect.x + rect.size * 0.3, rect.y + rect.size * 0.7);
    ctx.stroke();
    ctx.restore();
    return;
  }

  const card = state.board[cell];
  if (!card) return;

  const frame = options.frames?.get(cell);
  const opacity = frame?.opacity ?? 1;
  const scale = frame?.scale ?? 1;
  if (opacity <= 0) return;

  ctx.save();
  ctx.translate(rect.x, rect.y);
  drawCardFace(ctx, frame?.card ?? card, rect.size, {
    opacity,
    scale,
    highlight: isPending ? COLORS.accent : null,
  });
  ctx.restore();
}

/** Draws the two card piles and the score, above the board. */
export function drawScoreBar(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  originX: number,
  originY: number,
  width: number,
): { player: number; ai: number } {
  const counts: Record<Owner, number> = { player: 0, ai: 0 };
  for (const card of state.board) if (card) counts[card.owner]++;

  ctx.save();
  ctx.font = '600 13px system-ui, -apple-system, sans-serif';
  ctx.textBaseline = 'middle';

  // Three labels on one line, so each needs its own third of the bar.
  //
  // They used to sit at `mid - 10`, `mid` and `mid + 10`, which put the two counts on top of the
  // turn label -- and the overlap grew as the counts did, so it was worst exactly when the score
  // mattered most. Left, centre and right across the full width cannot collide.
  const left = originX;
  const mid = originX + width / 2;
  const right = originX + width;

  ctx.textAlign = 'left';
  ctx.fillStyle = SEATS.player.frame;
  ctx.fillText(`${counts.player} card${counts.player === 1 ? '' : 's'}`, left, originY);

  ctx.textAlign = 'right';
  ctx.fillStyle = SEATS.ai.frame;
  ctx.fillText(`${counts.ai} card${counts.ai === 1 ? '' : 's'}`, right, originY);

  ctx.textAlign = 'center';
  ctx.fillStyle = COLORS.inkMuted;
  ctx.fillText(turnLabel(state), mid, originY);
  ctx.restore();

  return counts;
}

/**
 * Whose turn it is, in words.
 *
 * Named rather than raw `'player'`/`'ai'`, which read as identifiers on the screen and matched
 * nothing the rest of the interface says.
 */
export function turnLabel(state: GameState): string {
  if (state.phase === 'over') return 'match over';
  if (state.phase === 'chooseBattle') return 'choose a battle';
  return state.turn === 'player' ? 'Player 1 to play' : 'Player 2 to play';
}

/** Draws a card count badge, used in the hand tray. */
export function drawBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  color: string,
): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0b0d12';
  ctx.font = '600 10px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 0.5);
  ctx.restore();
}

/** True when a card has any arrows at all — used to grey out hopeless plays. */
export function hasArrows(card: { arrows: number }): boolean {
  return arrowCount(card.arrows) > 0;
}

export { seatOf };
