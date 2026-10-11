/**
 * Keyboard cursor movement (PLAN.md §6).
 *
 * The cursor is a rook. Each row and each column is a **ring**, and a direction key advances along
 * that ring to the next playable square, wrapping at the edges and stepping over blocked cells:
 *
 *     . X .        left from (0,0) wraps to (0,2);
 *     . . X        left again skips the blocked (0,1) and lands back on (0,0);
 *     . . .        down from (0,2) skips the blocked (1,2) and lands on (2,2).
 *
 * That is the whole rule, and it replaces a four-rule cascade of "straight ahead, then a forward
 * diagonal, then a slide along the axis" that was harder to explain than it was worth. Rings also
 * make the failure modes disappear rather than merely shrink:
 *
 *  - **A key is never dead.** It only does nothing when the entire row — or column — is blocked.
 *  - **No traps.** A square with no playable *neighbour* is still reachable, because you arrive
 *    along its row or column rather than by stepping in from next door. An earlier version moved by
 *    adjacent squares, which made the cursor walk into walled-in corners and stay there for good.
 *  - **Movement is reversible.** A ring is a cycle, so anything you can reach pressing one way you
 *    can reach pressing the other.
 *
 * Two consequences worth knowing rather than discovering:
 *
 *  - Pressing a direction at an edge **wraps**, it does not stop. That is deliberate and it is what
 *    makes two presses return you to where you started.
 *  - There are no diagonals. Reaching the square diagonally across from you takes two presses. This
 *    is what "stay in the same row or column" buys: the cursor is always somewhere you can point at.
 */

import type { Cell, GameState } from '../core/types.ts';

/** A step on the 4x4 grid. Only the sign matters, so diagonals and overshoots are harmless. */
export interface Delta {
  readonly row: number;
  readonly col: number;
}

/** The board is 4x4; every line is a ring of four squares, so a ring is exhausted in three steps. */
const SIDE = 4;

/**
 * Where the cursor goes when a direction key is pressed.
 *
 * Scans the ring from the cursor's square outwards, wrapping at the edges, and returns the first
 * playable square. The fourth step lands back on the cursor itself, so "the whole line is blocked"
 * falls out of the same loop as "nothing to move onto" — there is no separate case to get wrong.
 */
export function stepCursor(from: Cell, delta: Delta, isLegal: (cell: Cell) => boolean): Cell {
  const horizontal = delta.col !== 0;
  const step = horizontal ? Math.sign(delta.col) : Math.sign(delta.row);

  // No direction pressed, or the cursor is somehow on a square it cannot use: leave it alone.
  if (step === 0) return from;
  if (!isLegal(from)) return firstPlayable(isLegal) ?? from;

  const row = rowOf(from);
  const col = colOf(from);
  for (let distance = 1; distance <= SIDE; distance++) {
    const nextRow = horizontal ? row : wrap(row + distance * step, SIDE);
    const nextCol = horizontal ? wrap(col + distance * step, SIDE) : col;
    const cell = cellAt(nextRow, nextCol);
    if (isLegal(cell)) return cell;
  }
  return from;
}

/** Every square on the row or column the cursor is on, starting one step the way the key pointed. */
export function ring(from: Cell, delta: Delta): Cell[] {
  const horizontal = delta.col !== 0;
  const step = horizontal ? Math.sign(delta.col) : Math.sign(delta.row);
  const row = rowOf(from);
  const col = colOf(from);

  const squares: Cell[] = [];
  for (let distance = 1; distance < SIDE; distance++) {
    squares.push(
      horizontal
        ? cellAt(row, wrap(col + distance * step, SIDE))
        : cellAt(wrap(row + distance * step, SIDE), col),
    );
  }
  return squares;
}

function rowOf(cell: number): number {
  return Math.floor(cell / SIDE);
}

function colOf(cell: number): number {
  return cell % SIDE;
}

/** Negative indices wrap to the far end, which is the whole point. */
function wrap(value: number, size: number): number {
  return ((value % size) + size) % size;
}

function cellAt(row: number, col: number): Cell {
  return (row * SIDE + col) as Cell;
}

function firstPlayable(isLegal: (cell: Cell) => boolean): Cell | null {
  for (let index = 0; index < SIDE * SIDE; index++) {
    const cell = index as Cell;
    if (isLegal(cell)) return cell;
  }
  return null;
}

/** A predicate for the cursor over a live board: empty and unblocked. */
export function legalPredicate(state: GameState): (cell: Cell) => boolean {
  return (cell) => !state.blocked[cell] && (state.board[cell] ?? null) === null;
}

/**
 * Whether two squares share a row or a column — which is the same test the cursor uses to decide
 * whether it can get from one to the other in a single line.
 */
export function sameLine(a: Cell, b: Cell): boolean {
  return rowOf(a) === rowOf(b) || colOf(a) === colOf(b);
}
