import { describe, expect, it } from 'vitest';
import {
  DIRECTIONS,
  allCells,
  arrowBit,
  arrowsOf,
  cellAt,
  colOf,
  directionBetween,
  directionName,
  hasArrow,
  isOpposite,
  neighbor,
  opposite,
  pointsAt,
  rowOf,
} from '../../src/core/direction.ts';
import { CELLS, GRID } from '../../src/core/constants.ts';
import { maskFrom } from '../../src/core/card.ts';
import type { Cell, Direction } from '../../src/core/types.ts';

/**
 * The authoritative adjacency table, hand-derived from the layout rather than computed from the
 * implementation, so this test cannot pass by agreeing with a bug in `neighbor()`.
 *
 *     0  1  2  3
 *     4  5  6  7
 *     8  9 10 11
 *    12 13 14 15
 *
 * Columns are N, NE, E, SE, S, SW, W, NW. `null` means the step leaves the board.
 */
const EXPECTED: Record<Cell, readonly (Cell | null)[]> = {
  0: [null, null, 1, 5, 4, null, null, null],
  1: [null, null, 2, 6, 5, 4, 0, null],
  2: [null, null, 3, 7, 6, 5, 1, null],
  3: [null, null, null, null, 7, 6, 2, null],
  4: [0, 1, 5, 9, 8, null, null, null],
  5: [1, 2, 6, 10, 9, 8, 4, 0],
  6: [2, 3, 7, 11, 10, 9, 5, 1],
  7: [3, null, null, null, 11, 10, 6, 2],
  8: [4, 5, 9, 13, 12, null, null, null],
  9: [5, 6, 10, 14, 13, 12, 8, 4],
  10: [6, 7, 11, 15, 14, 13, 9, 5],
  11: [7, null, null, null, 15, 14, 10, 6],
  12: [8, 9, 13, null, null, null, null, null],
  13: [9, 10, 14, null, null, null, 12, 8],
  14: [10, 11, 15, null, null, null, 13, 9],
  15: [11, null, null, null, null, null, 14, 10],
};

describe('grid geometry', () => {
  it('has 16 cells on a 4x4 board', () => {
    expect(GRID).toBe(4);
    expect(CELLS).toBe(16);
    expect(allCells()).toHaveLength(16);
  });

  it('maps every cell to its row and column, row-major', () => {
    for (const cell of allCells()) {
      expect(rowOf(cell)).toBe(Math.floor(cell / 4));
      expect(colOf(cell)).toBe(cell % 4);
      // Round-trips back through cellAt, which is the invariant everything else depends on.
      expect(cellAt(rowOf(cell), colOf(cell))).toBe(cell);
    }
  });

  it('cellAt returns null off the board in every direction', () => {
    expect(cellAt(-1, 0)).toBeNull();
    expect(cellAt(0, -1)).toBeNull();
    expect(cellAt(4, 0)).toBeNull();
    expect(cellAt(0, 4)).toBeNull();
    expect(cellAt(-5, -5)).toBeNull();
    expect(cellAt(99, 99)).toBeNull();
  });

  // The load-bearing test of this module: no wraparound, anywhere.
  it('[grid] matches the hand-derived neighbour table for all 128 cell/direction pairs', () => {
    let checked = 0;
    for (const cell of allCells()) {
      const expected = EXPECTED[cell];
      for (const dir of DIRECTIONS) {
        expect(neighbor(cell, dir), `cell ${cell} dir ${directionName(dir)}`).toBe(
          expected[dir] ?? null,
        );
        checked++;
      }
    }
    expect(checked).toBe(128);
  });

  it('[grid] has 84 on-grid adjacencies and 44 off-grid steps', () => {
    let onGrid = 0;
    for (const cell of allCells()) {
      for (const dir of DIRECTIONS) {
        if (neighbor(cell, dir) !== null) onGrid++;
      }
    }
    // 4 corners x 3 + 8 edge cells x 5 + 4 interior x 8 = 84, i.e. 42 undirected edges.
    expect(onGrid).toBe(84);
    expect(onGrid % 2).toBe(0);
    expect(onGrid / 2).toBe(42);
    expect(128 - onGrid).toBe(44);
  });

  it('[grid] never wraps: the row-0 left edge is not adjacent to the row-3 right edge', () => {
    // The specific wrap bugs a 1D-modulo implementation would produce.
    expect(neighbor(0, 6)).toBeNull(); // W from cell 0
    expect(neighbor(3, 2)).toBeNull(); // E from cell 3
    expect(neighbor(12, 4)).toBeNull(); // S from cell 12
    expect(neighbor(15, 4)).toBeNull(); // S from cell 15, the bottom edge
    // and the diagonals that a naive wrap would also get wrong
    expect(neighbor(0, 7)).toBeNull(); // NW from cell 0
    expect(neighbor(3, 1)).toBeNull(); // NE from cell 3
    expect(neighbor(15, 3)).toBeNull(); // SE from cell 15
    expect(neighbor(12, 5)).toBeNull(); // SW from cell 12
    // Inward steps from the same corners are on-grid; a wrapping implementation breaks these.
    expect(neighbor(15, 0)).toBe(11);
    expect(neighbor(0, 4)).toBe(4);
  });

  it('adjacency is symmetric for every on-grid pair', () => {
    for (const cell of allCells()) {
      for (const dir of DIRECTIONS) {
        const n = neighbor(cell, dir);
        if (n === null) continue;
        expect(neighbor(n, opposite(dir))).toBe(cell);
      }
    }
  });

  it('never returns the cell itself', () => {
    for (const cell of allCells()) {
      for (const dir of DIRECTIONS) {
        expect(neighbor(cell, dir)).not.toBe(cell);
      }
    }
  });

  it('directionBetween is the inverse of neighbor', () => {
    for (const cell of allCells()) {
      for (const dir of DIRECTIONS) {
        const n = neighbor(cell, dir);
        if (n === null) continue;
        expect(directionBetween(cell, n)).toBe(dir);
      }
    }
    // Cells that are not adjacent have no direction between them, and neither does a cell itself.
    expect(directionBetween(0, 0)).toBeNull();
    expect(directionBetween(0, 6)).toBeNull();
    expect(directionBetween(0, 15)).toBeNull();
    expect(directionBetween(5, 5)).toBeNull();
    // Cell 5 is the SE neighbour of cell 0, so this one is adjacent, not a null case.
    expect(directionBetween(0, 5)).toBe(3);
  });
});

describe('directions', () => {
  it('names directions in canonical order N, NE, E, SE, S, SW, W, NW', () => {
    expect(DIRECTIONS.map(directionName)).toEqual(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']);
  });

  it('opposite() pairs each direction with its inverse', () => {
    const pairs: ReadonlyArray<[Direction, Direction]> = [
      [0, 4],
      [1, 5],
      [2, 6],
      [3, 7],
    ];
    for (const [a, b] of pairs) {
      expect(opposite(a)).toBe(b);
      expect(opposite(b)).toBe(a);
      expect(isOpposite(a, b)).toBe(true);
      expect(isOpposite(a, a)).toBe(false);
    }
  });
});

describe('arrow masks', () => {
  it('[§1.2] maps each direction to a distinct bit and reads it back', () => {
    for (const dir of DIRECTIONS) {
      const bit = arrowBit(dir);
      expect(bit).toBe(1 << dir);
      expect(hasArrow(bit, dir)).toBe(true);
      for (const other of DIRECTIONS) {
        if (other !== dir) expect(hasArrow(bit, other)).toBe(false);
      }
    }
  });

  it('[§1.2] accepts 0 (no arrows) and 255 (all eight) as legal masks', () => {
    expect(hasArrow(0, 0)).toBe(false);
    expect(hasArrow(0b1111_1111, 7)).toBe(true);
    expect(arrowsOf(0b1111_1111)).toHaveLength(8);
    expect(arrowsOf(0)).toEqual([]);
  });

  it('[§1.2] round-trips a mask built from directions', () => {
    const dirs: Direction[] = [0, 3, 6];
    const mask = maskFrom(dirs);
    expect(arrowsOf(mask)).toEqual(dirs);
  });

  it('[§1.2] pointsAt is true only when an arrow aims at an adjacent cell', () => {
    const mask = maskFrom([2]); // E only
    expect(pointsAt(mask, 0, 1)).toBe(true);
    expect(pointsAt(mask, 1, 0)).toBe(false); // the E arrow does not also point W
    expect(pointsAt(mask, 0, 5)).toBe(false); // not adjacent
    expect(pointsAt(mask, 0, 0)).toBe(false);
  });
});
