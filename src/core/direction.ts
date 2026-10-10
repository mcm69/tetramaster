/**
 * Grid geometry and arrow directions (PLAN.md §7.3).
 *
 * The board is row-major over 4x4, so cell 5 is row 1, column 1. **The grid does not wrap**:
 * there is no such thing as the left edge of row 0 being adjacent to the right edge of row 3.
 * Every off-grid neighbour is `null`, which is what makes arrow takedown and combo propagation
 * stop at the border (§1.5, §1.7).
 */

import { ARROW_SLOTS, CELLS, DIRECTION_NAMES, GRID } from './constants';
import type { Cell, Direction } from './types';

/** Row/column deltas per direction, keyed by the Direction union so lookups never yield undefined. */
const DELTAS: Record<Direction, readonly [number, number]> = {
  0: [-1, 0], // N
  1: [-1, 1], // NE
  2: [0, 1], // E
  3: [1, 1], // SE
  4: [1, 0], // S
  5: [1, -1], // SW
  6: [0, -1], // W
  7: [-1, -1], // NW
};

/** All eight directions, in canonical order. */
export const DIRECTIONS = [0, 1, 2, 3, 4, 5, 6, 7] as const satisfies readonly Direction[];

export function rowOf(cell: Cell): number {
  return Math.floor(cell / GRID);
}

export function colOf(cell: Cell): number {
  return cell % GRID;
}

/** The cell at `row`/`col`, or null when that position is off the board. */
export function cellAt(row: number, col: number): Cell | null {
  if (row < 0 || row >= GRID || col < 0 || col >= GRID) return null;
  return (row * GRID + col) as Cell;
}

/**
 * The cell one step from `cell` in direction `dir`, or null if that step leaves the board.
 *
 * Returns null rather than wrapping — the single most important property of this module.
 */
export function neighbor(cell: Cell, dir: Direction): Cell | null {
  const delta = DELTAS[dir];
  return cellAt(rowOf(cell) + delta[0], colOf(cell) + delta[1]);
}

/** The direction pointing the opposite way, e.g. N <-> S, NE <-> SW. */
export function opposite(dir: Direction): Direction {
  return ((dir + 4) % ARROW_SLOTS) as Direction;
}

/** True when `dir` points exactly opposite `other`. */
export function isOpposite(dir: Direction, other: Direction): boolean {
  return opposite(dir) === other;
}

/**
 * The direction that points *at* `from` as seen from `to`, or null when the two cells are not
 * adjacent. This is the query the battle rules need: "does the defender point back?" (§1.5).
 */
export function directionBetween(from: Cell, to: Cell): Direction | null {
  for (const dir of DIRECTIONS) {
    if (neighbor(from, dir) === to) return dir;
  }
  return null;
}

/** The bit for a direction in an 8-bit arrow mask (§1.2). */
export function arrowBit(dir: Direction): number {
  return 1 << dir;
}

/** True when the arrow mask has a bit set in this direction. */
export function hasArrow(mask: number, dir: Direction): boolean {
  return (mask & arrowBit(dir)) !== 0;
}

/** True when the card has an arrow pointing at `target` from `origin`. Non-adjacent cells are false. */
export function pointsAt(mask: number, origin: Cell, target: Cell): boolean {
  const dir = directionBetween(origin, target);
  return dir !== null && hasArrow(mask, dir);
}

/** Every direction in which the mask has an arrow set. */
export function arrowsOf(mask: number): Direction[] {
  return DIRECTIONS.filter((dir) => hasArrow(mask, dir));
}

/** How many arrows the mask carries. */
export function arrowCount(mask: number): number {
  return arrowsOf(mask).length;
}

/** The direction that points at `cell` from the origin used to build this mask. */
export function directionName(dir: Direction): string {
  return DIRECTION_NAMES[dir];
}

/** Every cell on the board, row-major. */
export function allCells(): Cell[] {
  return Array.from({ length: CELLS }, (_, i) => i as Cell);
}
