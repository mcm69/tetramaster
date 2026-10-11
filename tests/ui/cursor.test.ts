/**
 * Keyboard cursor movement (PLAN.md §6).
 *
 * The cursor is a rook. Each row and column is a ring; a direction key advances along that ring to
 * the next playable square, wrapping at the edges and stepping over blocked cells.
 *
 * That replaced a four-rule cascade — straight ahead, then a forward diagonal, then a slide — that
 * had to be *explained* rather than discovered. This model needed to be used once.
 *
 * The tests are exhaustive rather than illustrative. Two previous implementations of this rule failed
 * on boards nobody had pictured: one left the cursor on a square walled in on two sides (unreachable),
 * and one walked the cursor into a square it could never leave. `stepCursor` is pure, so every board
 * and every press can be checked in about a second.
 */

import { describe, expect, it } from 'vitest';
import { legalPredicate, ring, sameLine, stepCursor, type Delta } from '../../src/ui/cursor.ts';
import { createMatch } from '../../src/core/match.ts';
import type { Card, Cell, GameState } from '../../src/core/types.ts';

const DIRS: readonly (readonly [string, Delta])[] = [
  ['Up', { row: -1, col: 0 }],
  ['Down', { row: 1, col: 0 }],
  ['Left', { row: 0, col: -1 }],
  ['Right', { row: 0, col: 1 }],
];

function blocked(...cells: Cell[]): (cell: Cell) => boolean {
  const set = new Set(cells);
  return (cell) => !set.has(cell);
}

function* patterns(size: number): Generator<Cell[]> {
  const acc: Cell[] = [];
  function* rec(start: number): Generator<Cell[]> {
    if (acc.length === size) {
      yield [...acc];
      return;
    }
    for (let c = start; c < 16; c++) {
      acc.push(c as Cell);
      yield* rec(c + 1);
      acc.pop();
    }
  }
  yield* rec(0);
}

const row = (cell: Cell): number => Math.floor(cell / 4);
const col = (cell: Cell): number => cell % 4;

describe('the model', () => {
  it('moves one square along the ring', () => {
    const all = blocked();
    expect(stepCursor(0, { row: 0, col: 1 }, all)).toBe(1);
    expect(stepCursor(5, { row: 1, col: 0 }, all)).toBe(9);
    expect(stepCursor(6, { row: 0, col: -1 }, all)).toBe(5);
    expect(stepCursor(6, { row: -1, col: 0 }, all)).toBe(2);
  });

  it('wraps at the edge rather than stopping', () => {
    const all = blocked();
    // Left from the left edge is the right edge, and two presses come back to the start.
    expect(stepCursor(0, { row: 0, col: -1 }, all)).toBe(3);
    expect(stepCursor(3, { row: 0, col: -1 }, all)).toBe(2);
    expect(stepCursor(2, { row: 0, col: -1 }, all)).toBe(1);
    expect(stepCursor(1, { row: 0, col: -1 }, all)).toBe(0);
  });

  it('skips over blocked squares and wraps, exactly as reported', () => {
    // The report drew a three-wide board. Reproduced on the real 4x4 by also blocking cell 3, so
    // that row 0 is  . X X .  and row 1 is  . . X .  -- the same shape with the fourth column
    // closed off.
    const isLegal = blocked(1, 3, 6);
    //   . X X .
    //   . . X .
    //   . . . .
    //   . . . .
    expect(stepCursor(0, { row: 0, col: -1 }, isLegal)).toBe(2); // wraps past the edge
    expect(stepCursor(2, { row: 0, col: -1 }, isLegal)).toBe(0); // skips the blocked (0,1)
    expect(stepCursor(2, { row: 1, col: 0 }, isLegal)).toBe(10); // skips the blocked (1,2)
  });

  it('walks a whole line of blocked cells', () => {
    const isLegal = blocked(1, 2, 3);
    // Right from 0 crosses two blocked squares and wraps to the start, so nothing is reachable.
    expect(stepCursor(0, { row: 0, col: 1 }, isLegal)).toBe(0);
    // Down from 0 is unobstructed.
    expect(stepCursor(0, { row: 1, col: 0 }, isLegal)).toBe(4);
  });

  it('stays put only when the whole line is blocked', () => {
    const isLegal = blocked(4, 8, 12);
    expect(stepCursor(0, { row: 1, col: 0 }, isLegal)).toBe(0);
    expect(stepCursor(0, { row: 0, col: 1 }, isLegal)).toBe(1);
  });

  it('does not move for a zero delta', () => {
    const all = blocked();
    for (let cell = 0; cell < 16; cell++) {
      expect(stepCursor(cell as Cell, { row: 0, col: 0 }, all)).toBe(cell);
    }
  });

  it('recovers if it is standing on a square it cannot use', () => {
    const isLegal = blocked(3, 7, 11);
    expect(isLegal(3)).toBe(false);
    expect(isLegal(stepCursor(3, { row: 0, col: 1 }, isLegal))).toBe(true);
  });

  it('ignores the magnitude of the delta, only the direction', () => {
    const all = blocked();
    expect(stepCursor(0, { row: 0, col: 7 }, all)).toBe(stepCursor(0, { row: 0, col: 1 }, all));
    expect(stepCursor(0, { row: -3, col: 0 }, all)).toBe(stepCursor(0, { row: -1, col: 0 }, all));
  });
});

describe('the ring, spelled out', () => {
  it('lists the three other squares on the line, in the direction pressed', () => {
    expect(ring(0, { row: 0, col: 1 })).toEqual([1, 2, 3]);
    expect(ring(0, { row: 0, col: -1 })).toEqual([3, 2, 1]);
    expect(ring(0, { row: 1, col: 0 })).toEqual([4, 8, 12]);
    // Wrapping again: up from cell 5 goes 1, then over the top edge to 13, then 9.
    expect(ring(5, { row: -1, col: 0 })).toEqual([1, 13, 9]);
  });

  it('never lists the square it started on', () => {
    for (let cell = 0; cell < 16; cell++) {
      for (const [, delta] of DIRS) {
        expect(ring(cell as Cell, delta).includes(cell as Cell)).toBe(false);
        expect(ring(cell as Cell, delta)).toHaveLength(3);
      }
    }
  });

  it('knows which squares share a line', () => {
    expect(sameLine(0, 3)).toBe(true);
    expect(sameLine(0, 4)).toBe(true);
    expect(sameLine(0, 5)).toBe(false);
  });
});

describe('every board, exhaustively', () => {
  const BOARDS = [...patterns(5)];

  it('only ever lands on a playable square', () => {
    let presses = 0;
    for (const blockedCells of BOARDS) {
      const isLegal = blocked(...blockedCells);
      for (let from = 0; from < 16; from++) {
        if (!isLegal(from as Cell)) continue;
        for (const [, delta] of DIRS) {
          presses++;
          expect(isLegal(stepCursor(from as Cell, delta, isLegal))).toBe(true);
        }
      }
    }
    expect(presses).toBeGreaterThan(100_000);
  });

  it('stays on the same row or column it was told to move along', () => {
    // The point of a rook. Nothing here can drift sideways, which is what makes the movement
    // predictable without reading a rule.
    for (const blockedCells of BOARDS) {
      const isLegal = blocked(...blockedCells);
      for (let from = 0; from < 16; from++) {
        if (!isLegal(from as Cell)) continue;
        for (const [name, delta] of DIRS) {
          const to = stepCursor(from as Cell, delta, isLegal);
          const label = `blocked ${blockedCells.join(',')} from ${from} press ${name} -> ${to}`;
          if (delta.col !== 0) expect(row(to), label).toBe(row(from as Cell));
          else expect(col(to), label).toBe(col(from as Cell));
        }
      }
    }
  });

  it('only stays put when the whole line is blocked', () => {
    // Dead keys are still possible -- a fully blocked row or column -- but they are now rare and
    // unavoidable rather than the 46% they were.
    let dead = 0;
    let avoidable = 0;
    for (const blockedCells of BOARDS) {
      const isLegal = blocked(...blockedCells);
      for (let from = 0; from < 16; from++) {
        if (!isLegal(from as Cell)) continue;
        for (const [name, delta] of DIRS) {
          const to = stepCursor(from as Cell, delta, isLegal);
          if (to !== (from as Cell)) continue;
          dead++;
          const somewherePlayable = ring(from as Cell, delta).some(isLegal);
          if (somewherePlayable) {
            avoidable++;
            expect(
              somewherePlayable,
              `blocked ${blockedCells.join(',')} from ${from} ${name}`,
            ).toBe(false);
          }
        }
      }
    }
    expect(avoidable).toBe(0);
    expect(dead).toBeGreaterThan(0);
  });

  it('reaches every square it shares a line with, and every square beyond those', () => {
    // Rook connectivity. A square with no playable neighbour is no longer a trap: you arrive along
    // its row or column instead of stepping in from next door.
    for (const blockedCells of BOARDS) {
      const isLegal = blocked(...blockedCells);
      const legal = ([...Array(16).keys()] as Cell[]).filter(isLegal);
      if (legal.length < 2) continue;
      for (const start of legal) {
        const seen = explore(start, isLegal);
        expect(seen.has(start), `blocked ${blockedCells.join(',')} from ${start}`).toBe(true);
        // Whatever the cursor can reach, it can also get back from.
        for (const reached of seen) {
          expect(explore(reached, isLegal).has(start)).toBe(true);
        }
        // And nothing outside the rook-connected component.
        for (const cell of legal) {
          if (!seen.has(cell)) {
            expect(sameLine(cell, start), `${cell} is not on a line with ${start}`).toBe(false);
          }
        }
      }
    }
  }, 60_000);

  it('enters a square walled in on both sides', () => {
    // Cell 15 with 11 and 14 blocked has no playable neighbour, so it can only be arrived at along
    // row 3 or column 3 -- which is exactly what wrapping is for.
    const isLegal = blocked(11, 14);
    expect(stepCursor(13, { row: 0, col: 1 }, isLegal)).toBe(15);
    expect(stepCursor(7, { row: 1, col: 0 }, isLegal)).toBe(15);
  });

  it('escapes a square with no playable neighbour at all', () => {
    // Cell 3 with 0, 1, 2, 6 and 7 blocked: pressing Left used to walk the cursor into cell 0 and
    // strand it there permanently.
    const isLegal = blocked(0, 1, 2, 6, 7);
    const seen = explore(3, isLegal);
    expect(seen.size).toBeGreaterThan(1);
  });

  it('is deterministic', () => {
    for (let from = 0; from < 16; from++) {
      for (const [, delta] of DIRS) {
        expect(stepCursor(from as Cell, delta, blocked(3, 7))).toBe(
          stepCursor(from as Cell, delta, blocked(3, 7)),
        );
      }
    }
  });
});

function explore(start: Cell, isLegal: (cell: Cell) => boolean): Set<Cell> {
  const seen = new Set<Cell>([start]);
  const queue: Cell[] = [start];
  while (queue.length > 0) {
    const current = queue.shift() as Cell;
    for (const [, delta] of DIRS) {
      const next = stepCursor(current, delta, isLegal);
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

describe('the board predicate', () => {
  it('treats a square as playable only when it is empty and unblocked', () => {
    const state: GameState = createMatch({ seed: 1, playerDeck: deckOf(), aiDeck: deckOf() });
    const legal = legalPredicate(state);
    for (let cell = 0; cell < 16; cell++) {
      const occupied = (state.board[cell] ?? null) !== null;
      expect(legal(cell as Cell), `cell ${cell}`).toBe(!occupied && !state.blocked[cell]);
    }
  });
});

/** A throwaway deck: the predicate tests only care about occupancy, not about the cards. */
function deckOf(): Card[] {
  return Array.from({ length: 5 }, () => ({
    figureId: 0,
    arrows: 0,
    atk: 5,
    type: 'P',
    pdef: 5,
    mdef: 5,
  }));
}
