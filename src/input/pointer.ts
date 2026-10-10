/**
 * Pointer and keyboard input for the board.
 *
 * Input is translated into the same `Action` objects the reducer accepts, so a click and a
 * keystroke are indistinguishable to the engine. Nothing here mutates state.
 */

import { legalCells } from '../core/match.ts';
import type { Action } from '../core/match.ts';
import type { Cell, GameState } from '../core/types.ts';
import { cellRect, type BoardLayout } from '../render/boardView.ts';

/** The cell under a screen point, or null when the point misses the board entirely. */
export function hitTest(x: number, y: number, layout: BoardLayout): Cell | null {
  for (let index = 0; index < 16; index++) {
    const cell = index as Cell;
    const rect = cellRect(layout, cell);
    if (x >= rect.x && x <= rect.x + rect.size && y >= rect.y && y <= rect.y + rect.size) {
      return cell;
    }
  }
  return null;
}

export interface PointerTarget {
  /** Selected hand-card index, or null when none is picked up. */
  readonly selectedCard: number | null;
  readonly hover: Cell | null;
}

/**
 * Turns a click into an action. A click on a legal cell plays the selected card; a click with no
 * card selected is ignored, and the caller shows a hint.
 */
export function clickToAction(
  x: number,
  y: number,
  layout: BoardLayout,
  state: GameState,
  target: PointerTarget,
): Action | null {
  if (state.phase === 'chooseBattle') {
    const cell = hitTest(x, y, layout);
    if (cell !== null && state.pendingBattles.includes(cell)) {
      return { t: 'chooseBattle', cell };
    }
    return null;
  }

  if (target.selectedCard === null) return null;
  const cell = hitTest(x, y, layout);
  if (cell === null) return null;
  if (!legalCells(state).includes(cell)) return null;
  return { t: 'place', cell, cardIndex: target.selectedCard };
}

/** Moves the hover cursor with the keyboard, skipping blocked and occupied cells. */
export function moveHover(
  current: Cell | null,
  deltaRow: number,
  deltaCol: number,
  state: GameState,
): Cell | null {
  const legal = legalCells(state);
  if (legal.length === 0) return null;
  if (current === null) return legal[0] ?? null;

  let row = Math.floor(current / 4) + deltaRow;
  let col = (current % 4) + deltaCol;
  row = Math.max(0, Math.min(3, row));
  col = Math.max(0, Math.min(3, col));
  const candidate = (row * 4 + col) as Cell;
  if (legal.includes(candidate)) return candidate;
  // Fall back to the nearest legal cell in the direction of travel, so the cursor never sticks.
  const [best] = legal
    .map((cell) => ({
      cell,
      distance: Math.abs(Math.floor(cell / 4) - row) + Math.abs((cell % 4) - col),
    }))
    .sort((a, b) => a.distance - b.distance);
  return best?.cell ?? current;
}

/** Key bindings, kept declarative so the help screen can render them from one source. */
export const KEY_BINDINGS: ReadonlyArray<{ keys: string; action: string }> = [
  { keys: 'W A S D / arrows', action: 'Move the board cursor' },
  { keys: '1 – 5', action: 'Pick a card from your hand' },
  { keys: 'Enter / Space', action: 'Play the selected card here' },
  { keys: 'Q', action: 'Choose the highlighted pending battle' },
  { keys: 'Esc', action: 'Deselect the card' },
  { keys: 'H', action: 'Show a hint for this cell' },
];
