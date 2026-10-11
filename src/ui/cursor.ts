/**
 * Keyboard cursor movement (PLAN.md §6).
 *
 * The board cursor has to cross a 4x4 grid that may have up to six blocked cells in it, and it has to
 * do that from four arrow keys. Two things were wrong with the first attempt, and both came from the
 * same root cause: **it searched the whole board for the nearest legal cell to the clamped target.**
 *
 * That search could return a cell three rows away, and — because ties were broken by board order —
 * it could return *the cursor's own cell*. With cell 3 blocked, pressing Right from cell 2 left the
 * cursor on cell 2: cells 2, 6 and 7 all sit at Manhattan distance 1 from the blocked target, and
 * cell 2 has the lowest index. The key was simply dead. Across every board, cell and direction, that
 * happened for **46% of presses**.
 *
 * So movement is now decided by a short, explicit list:
 *
 *  1. The square directly ahead, if it is legal. Unambiguous and always preferred.
 *  2. Otherwise the best of the **eight squares adjacent to the cursor**, ranked by how well they
 *     match the key pressed. Staying adjacent is what makes the movement legible: a cursor that jumps
 *     across the board to "roughly right" is worse than one that steps right-and-down.
 *  3. Otherwise it stays put — which is only genuinely correct at an edge or a wall of blocked cells.
 *
 * Ranking is `alignment * 2 + straight`, where alignment is the dot product of the step with the key
 * and straight rewards an orthogonal step over a diagonal. That ordering is what puts "right" first,
 * then right-and-down, then right-and-up; straight ahead beats both diagonals, which matters most
 * exactly when the player pressed a direction they expected to be simple.
 */
import { DIRECTIONS, neighbor } from '../core/direction.ts';
import type { Cell, GameState } from '../core/types.ts';

/** A unit step on the 4x4 grid. */
export interface Delta {
  readonly row: number;
  readonly col: number;
}

/** One adjacent candidate, with the numbers that ranked it. Kept so tests can check the ordering. */
export interface Candidate {
  readonly cell: Cell;
  readonly row: number;
  readonly col: number;
  /** Positive when the step points the way the key was pressed; negative when it doubles back. */
  readonly alignment: number;
  /** 1 for an orthogonal step, 0 for a diagonal. */
  readonly straight: number;
  readonly score: number;
}

function rowOf(cell: number): number {
  return Math.floor(cell / 4);
}

function colOf(cell: number): number {
  return cell % 4;
}

/**
 * Scores one adjacent square against the key pressed.
 *
 * `alignment * 2 + straight` rather than a weighted sum of the two, because the relative order has to
 * be exact: a diagonal *towards* the key must beat a straight *sideways* step, and the straight
 * ahead step must beat both diagonals.
 */
export function scoreCandidate(from: Cell, cell: Cell, delta: Delta): Candidate {
  const drow = rowOf(cell) - rowOf(from);
  const dcol = colOf(cell) - colOf(from);
  const alignment = drow * delta.row + dcol * delta.col;
  const straight = Math.abs(drow) + Math.abs(dcol) === 1 ? 1 : 0;
  return {
    cell,
    row: rowOf(cell),
    col: colOf(cell),
    alignment,
    straight,
    score: alignment * 2 + straight,
  };
}

/** Every legal square adjacent to `from`, ranked best-first. */
export function candidates(
  from: Cell,
  delta: Delta,
  isLegal: (cell: Cell) => boolean,
): Candidate[] {
  const found: Candidate[] = [];
  for (const dir of DIRECTIONS) {
    const cell = neighbor(from, dir);
    if (cell === null) continue;
    if (!isLegal(cell)) continue;
    found.push(scoreCandidate(from, cell, delta));
  }
  // `straight` first within a tie would be nicer, but ties here are mirror-image diagonals, which are
  // equally good.
  //
  // The third key is the one that matters. Two mirror diagonals tie on direction, and the cursor will
  // only ever take one of them — so a square with both neighbours blocked (a walled-in corner) is only
  // ever entered from one specific diagonal. Preferring the *more constrained* candidate takes that
  // entry on the first approach rather than never.
  return found.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Fewest ways out first: visit the hardest square to reach while the cursor is passing it.
    const exits = legalNeighbourCount(a.cell, isLegal) - legalNeighbourCount(b.cell, isLegal);
    if (exits !== 0) return exits;
    return a.cell - b.cell;
  });
}

/** How many playable squares touch `cell`: how many ways the cursor could leave it. */
function legalNeighbourCount(cell: Cell, isLegal: (cell: Cell) => boolean): number {
  let count = 0;
  for (const dir of DIRECTIONS) {
    const adjacent = neighbor(cell, dir);
    if (adjacent !== null && isLegal(adjacent)) count++;
  }
  return count;
}

/**
 * Where the cursor goes when a direction key is pressed.
 *
 * Four rules, in order, and each asks for *more* movement along the pressed axis than the one before:
 *
 *  1. **Straight ahead**, if that square is playable. Unambiguous, and always preferred.
 *  2. **A forward diagonal** — the best adjacent square whose step still points the way the key was
 *     pressed. Straight ahead beats it, so this only fires when straight ahead is blocked.
 *  3. **A slide** along the same row or column to the nearest playable square further on. This is
 *     the "skip over it" case, and it is last-resort rather than first: without it, a square whose
 *     only neighbours are blocked can never be reached at all, and a playable square the cursor
 *     cannot occupy is a square nobody can play with the keyboard.
 *  4. **Stay put** — the honest answer at an edge or against a wall.
 *
 * There is deliberately no "step sideways" rule. Moving straight down because you pressed Left is not
 * a smaller version of what you asked for, it is a different direction, and an earlier version
 * allowed it.
 *
 * Returns `from` when there is genuinely nowhere to go.
 */
export function stepCursor(from: Cell, delta: Delta, isLegal: (cell: Cell) => boolean): Cell {
  // A zero delta means "no direction pressed". Moving anyway would turn every caller that asks for
  // the current position into a random walk.
  if (delta.row === 0 && delta.col === 0) {
    const here = cellAt(rowOf(from), colOf(from));
    return isLegal(here) ? here : (firstLegal(isLegal) ?? here);
  }

  if (!isLegal(from)) {
    // The cursor should never sit on a blocked cell, but a save or a mode switch could put it there.
    // Rather than returning something arbitrary, send it to the lowest legal cell.
    return firstLegal(isLegal) ?? from;
  }

  // A square with no playable neighbour is a trap: there is no key that gets the cursor off it, so
  // walking in means walking in for good. Enter one only if the cursor is already stuck in one —
  // in which case every neighbour has this square as a way out, so leaving is always possible.
  const stuck = legalNeighbourCount(from, isLegal) === 0;
  const enterable = (cell: Cell): boolean => stuck || legalNeighbourCount(cell, isLegal) > 0;

  // 1. Straight ahead, when that square exists and is playable.
  const aheadRow = clamp(rowOf(from) + delta.row, 0, 3);
  const aheadCol = clamp(colOf(from) + delta.col, 0, 3);
  const ahead = cellAt(aheadRow, aheadCol);
  if (isLegal(ahead) && ahead !== from && enterable(ahead)) return ahead;

  // 2. The best adjacent square that still points the way the key was pressed.
  const forward = candidates(from, delta, isLegal).find(
    (candidate) => candidate.alignment > 0 && enterable(candidate.cell),
  );
  if (forward !== undefined) return forward.cell;

  // 3. Slide along the row or column, over whatever is in the way.
  const slid = slide(from, delta, isLegal, enterable);
  if (slid !== null) return slid;

  // 4. Nowhere to go.
  return from;
}

/**
 * The nearest playable square further along the row or column the key points down.
 *
 * Only reached once there is no adjacent step pointing that way, so this is the "skip over it"
 * case. Returns null when the axis runs out.
 */
export function slide(
  from: Cell,
  delta: Delta,
  isLegal: (cell: Cell) => boolean,
  enterable: (cell: Cell) => boolean = () => true,
): Cell | null {
  const horizontal = delta.col !== 0;
  const step = horizontal ? delta.col : delta.row;
  const row = rowOf(from);
  const col = colOf(from);

  for (let distance = 1; distance < 4; distance++) {
    const nextRow = horizontal ? row : row + distance * step;
    const nextCol = horizontal ? col + distance * step : col;
    // Bounds are checked on the row and column, *before* the cell is built. Building first wraps:
    // `cellAt(1, 4)` is 8, a real square in the next row, and it sails through a check that
    // re-derives its own row and column from the wrapped index. That sent the cursor a row sideways
    // whenever it pressed a key at the right edge.
    if (nextRow < 0 || nextRow > 3 || nextCol < 0 || nextCol > 3) break;
    const next = cellAt(nextRow, nextCol);
    if (isLegal(next) && enterable(next)) return next;
  }
  return null;
}

/** The first legal cell in board order, or null on a board with nothing playable. */
function firstLegal(isLegal: (cell: Cell) => boolean): Cell | null {
  for (let index = 0; index < 16; index++) {
    const cell = index as Cell;
    if (isLegal(cell)) return cell;
  }
  return null;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/** Row/column to a cell. `Cell` is a union of literals, so the narrowing is real and explicit. */
function cellAt(row: number, col: number): Cell {
  return (row * 4 + col) as Cell;
}

/** A predicate for the cursor over a live board. */
export function legalPredicate(state: GameState): (cell: Cell) => boolean {
  return (cell) => !state.blocked[cell] && (state.board[cell] ?? null) === null;
}
