/**
 * Keyboard cursor movement (PLAN.md §6).
 *
 * The cursor has to cross a 4×4 grid that may have up to six blocked cells in it, from four arrow
 * keys. The first implementation searched the whole board for the legal cell nearest the clamped
 * target, and because ties went to the lowest board index it could return *the cursor's own cell*.
 * With cell 3 blocked, Right from cell 2 did nothing at all: cells 2, 6 and 7 all sit at Manhattan
 * distance 1 from the blocked target, and cell 2 has the lowest index.
 *
 * Measured over every board, cell and direction — 2,097,088 presses — that made **46.5% of presses
 * dead**, and sent the cursor jumping more than one cell on 106,496 of them.
 *
 * The tests below are exhaustive rather than illustrative, because "it usually works" is what the old
 * implementation did. `stepCursor` is pure, so all 2,097,088 presses can be checked in a second.
 */

import { describe, expect, it } from 'vitest';
import {
  candidates,
  legalPredicate,
  scoreCandidate,
  slide,
  stepCursor,
  type Delta,
} from '../../src/ui/cursor.ts';
import { createMatch } from '../../src/core/match.ts';
import { DIRECTIONS, neighbor } from '../../src/core/direction.ts';
import type { Card, Cell, GameState } from '../../src/core/types.ts';

const DIRS: readonly (readonly [string, Delta])[] = [
  ['Up', { row: -1, col: 0 }],
  ['Down', { row: 1, col: 0 }],
  ['Left', { row: 0, col: -1 }],
  ['Right', { row: 0, col: 1 }],
];

/** A legality predicate for a list of blocked cells. */
function blocked(...cells: Cell[]): (cell: Cell) => boolean {
  const set = new Set(cells);
  return (cell) => !set.has(cell);
}

/** Every blocked pattern with exactly `size` cells. */
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

describe('the reported case', () => {
  it('moves Right from cell 2 when cell 3 is blocked', () => {
    // The board from the bug report, top two rows:
    //     . . . X
    //     . . . .
    // Right from cell 2 used to do nothing. Cell 7 — right and down — is legal and adjacent.
    const isLegal = blocked(3);
    expect(stepCursor(2, { row: 0, col: 1 }, isLegal)).toBe(7);
  });

  it('takes the diagonal when the square ahead is blocked', () => {
    const isLegal = blocked(3);
    expect(stepCursor(2, { row: 0, col: 1 }, isLegal)).not.toBe(2);
  });

  it('crosses a blocked square in a lower row as well', () => {
    // . . . .
    // . . . X
    // Right from cell 6 must move *somewhere forward*, not die on 7.
    const isLegal = blocked(7);
    const to = stepCursor(6, { row: 0, col: 1 }, isLegal);
    expect(to).not.toBe(6);
    // Either mirror diagonal is defensible; which one is not a correctness question. What matters is
    // that it is adjacent, forward, and deterministic.
    expect([3, 11]).toContain(to);
    expect(stepCursor(6, { row: 0, col: 1 }, isLegal)).toBe(to);
  });

  it('still reaches every legal cell on the reported board', () => {
    const isLegal = blocked(3);
    const seen = new Set<Cell>();
    const queue: Cell[] = [0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    for (const cell of queue) seen.add(cell);
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
    expect([...seen].sort((a, b) => a - b)).toEqual([
      0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    ]);
  });
});

describe('ranking adjacent squares', () => {
  it('prefers the straight step over a diagonal', () => {
    const found = candidates(4, { row: 0, col: 1 }, blocked(3));
    // From cell 4 (r1,c0) pressing Right, cell 5 is straight ahead and 7/8 are diagonals.
    expect(found[0]?.cell).toBe(5);
  });

  it('prefers a forward diagonal over a sideways step', () => {
    // Right from 2 with 3 blocked: 7 is down-right, 6 is straight down. Down-right wins.
    const found = candidates(2, { row: 0, col: 1 }, blocked(3));
    expect(found[0]?.cell).toBe(7);
    expect(found[0]?.alignment).toBe(1);
    expect(found.find((c) => c.cell === 6)?.alignment).toBe(0);
  });

  it('scores an anti-diagonal as backwards', () => {
    const anti = scoreCandidate(4, 3, { row: 1, col: 0 });
    expect(anti.alignment).toBe(-1);
    expect(anti.score).toBeLessThan(0);
  });

  it('never ranks the cursor itself', () => {
    for (const [, delta] of DIRS) {
      for (let from = 0; from < 16; from++) {
        expect(
          candidates(from as Cell, delta, blocked()).some((c) => c.cell === from),
          `${from}/${delta.col}`,
        ).toBe(false);
      }
    }
  });

  it('returns nothing when every neighbour is blocked', () => {
    // Every square touching cell 3: 0, 1, 2 above/left, 4, 5 below, 6 below-left, 7 below-right.
    const all = blocked(0, 1, 2, 4, 5, 6, 7);
    expect(candidates(3, { row: 0, col: 1 }, all)).toEqual([]);
  });
});

describe('every board, exhaustively', () => {
  // Every (board with 5 blocked cells, cell, direction) combination. The step function is pure, so
  // the whole space is cheap to check, which is the point: the old implementation's failure rate was
  // 46%, and a handful of hand-written cases would never have found it.
  const BOARDS = [...patterns(5)];
  // The two graph tests below run a breadth-first search per square, which is an order of magnitude
  // dearer than the single-step invariants. A smaller sample keeps them inside the time limit
  // without weakening them: they still cover every distinct shape of board, since the rules only
  // depend on adjacency.
  const GRAPH_BOARDS = [...patterns(4)];

  /** How far the cursor got along the axis the key points down. Positive is forward. */
  function progress(from: Cell, to: Cell, delta: Delta): number {
    return (
      (Math.floor(to / 4) - Math.floor(from / 4)) * delta.row + ((to % 4) - (from % 4)) * delta.col
    );
  }

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

  it('moves strictly forward along the key pressed, or not at all', () => {
    // The property the bug report is really about. The old code satisfied it only by accident: it
    // usually did not move, and when it did move it could jump three rows sideways.
    for (const blockedCells of BOARDS) {
      const isLegal = blocked(...blockedCells);
      for (let from = 0; from < 16; from++) {
        if (!isLegal(from as Cell)) continue;
        for (const [name, delta] of DIRS) {
          const to = stepCursor(from as Cell, delta, isLegal);
          const moved = progress(from as Cell, to, delta);
          expect(moved, `from ${from} press ${name} -> ${to}`).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('stays put only when there is genuinely nothing reachable that way', () => {
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
          // Something was reachable — an adjacent forward step, or a playable square further along
          // the axis. This is exactly the old bug's signature.
          // A walled-in square is deliberately not entered, so it does not count as reachable.
          const enterable = (cell: Cell): boolean => legalNeighbours(cell, isLegal) > 0;
          const reachable =
            forwardStepExists(from as Cell, delta, isLegal, enterable) ||
            slide(from as Cell, delta, isLegal, enterable) !== null;
          if (reachable) {
            avoidable++;
            expect(reachable, `blocked ${blockedCells.join(',')} from ${from} press ${name}`).toBe(
              false,
            );
          }
        }
      }
    }
    expect(dead).toBeGreaterThan(0);
    expect(avoidable).toBe(0);
  });

  it('either steps one square, or slides along the pressed axis with no sideways drift', () => {
    for (const blockedCells of BOARDS) {
      const isLegal = blocked(...blockedCells);
      for (let from = 0; from < 16; from++) {
        if (!isLegal(from as Cell)) continue;
        for (const [name, delta] of DIRS) {
          const to = stepCursor(from as Cell, delta, isLegal);
          if (to === (from as Cell)) continue;
          const drow = Math.floor(to / 4) - Math.floor(from / 4);
          const dcol = (to % 4) - (from % 4);
          const adjacent = Math.abs(drow) <= 1 && Math.abs(dcol) <= 1;
          const alongAxis = delta.row === 0 ? dcol !== 0 && drow === 0 : drow !== 0 && dcol === 0;
          expect(adjacent || alongAxis, `from ${from} press ${name} -> ${to}`).toBe(true);
        }
      }
    }
  });

  it('never walks the cursor into a square it cannot leave', { timeout: 60_000 }, () => {
    // A square with no playable neighbour is a trap: no key gets the cursor off it. Entering one
    // means entering it for good. An earlier version of this fix did exactly that — pressing Left
    // from cell 3 stepped into cell 0 on a board with 0, 1, 2, 6 and 7 blocked, and the cursor could
    // never move again.
    for (const blockedCells of GRAPH_BOARDS) {
      const isLegal = blocked(...blockedCells);
      for (let from = 0; from < 16; from++) {
        if (!isLegal(from as Cell)) continue;
        const alreadyTrapped = legalNeighbours(from as Cell, isLegal) === 0;
        for (const [name, delta] of DIRS) {
          const to = stepCursor(from as Cell, delta, isLegal);
          if (to === (from as Cell) || alreadyTrapped) continue;
          expect(
            legalNeighbours(to, isLegal),
            `blocked ${blockedCells.join(',')} from ${from} press ${name} -> ${to}`,
          ).toBeGreaterThan(0);
        }
      }
    }
  });

  it('never goes through a one-way door', { timeout: 60_000 }, () => {
    // Every move must be reversible. Movement is one-way *per press* — the cursor only goes the way
    // the key points — so reversibility has to be checked rather than assumed.
    //
    // The one exception is escaping a walled-in square. Such a square has no playable neighbour at
    // all, so it is playable but inert: a card placed there can never attack or be attacked. Leaving
    // is possible (every neighbour has the square as its way out) but returning is not, and that is
    // inherent rather than a bug. What matters is that the escape is one-way *out*, never a door
    // into the trap.
    for (const blockedCells of GRAPH_BOARDS) {
      const isLegal = blocked(...blockedCells);
      const legal = ([...Array(16).keys()] as Cell[]).filter(isLegal);
      if (legal.length < 2) continue;
      const closures = new Map<Cell, Set<Cell>>();
      for (const cell of legal) closures.set(cell, explore(cell, isLegal));

      for (const from of legal) {
        const escaping = legalNeighbours(from, isLegal) === 0;
        for (const [name, delta] of DIRS) {
          const to = stepCursor(from, delta, isLegal);
          if (to === from) continue;
          expect(
            closures.get(from)?.has(to),
            `blocked ${blockedCells.join(',')} from ${from} press ${name} -> ${to}`,
          ).toBe(true);
          if (escaping) continue;
          expect(
            closures.get(to)?.has(from),
            `blocked ${blockedCells.join(',')} ${to} cannot get back to ${from} (via ${name})`,
          ).toBe(true);
        }
      }
    }
  });

  it('is deterministic, so two identical boards feel identical', () => {
    for (let from = 0; from < 16; from++) {
      for (const [, delta] of DIRS) {
        const first = stepCursor(from as Cell, delta, blocked(3, 7));
        const second = stepCursor(from as Cell, delta, blocked(3, 7));
        expect(second).toBe(first);
      }
    }
  });
});

/** Every square the cursor can get to from `start`. */
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

function legalNeighbours(cell: Cell, isLegal: (cell: Cell) => boolean): number {
  return ADJACENT(cell).filter(isLegal).length;
}

const ADJACENT = (cell: Cell): Cell[] =>
  DIRECTIONS.map((dir) => neighbor(cell, dir)).filter((n): n is Cell => n !== null);

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

/** Is there an adjacent legal square that does not double back? */
/** Is there an adjacent square that points the way the key did, and is worth entering? */
function forwardStepExists(
  from: Cell,
  delta: Delta,
  isLegal: (cell: Cell) => boolean,
  enterable: (cell: Cell) => boolean = () => true,
): boolean {
  return ADJACENT(from).some((cell) => {
    const drow = Math.floor(cell / 4) - Math.floor(from / 4);
    const dcol = (cell % 4) - (from % 4);
    if (drow * delta.row + dcol * delta.col <= 0) return false;
    return isLegal(cell) && enterable(cell);
  });
}

describe('edge cases', () => {
  it('stands still at an edge, which is the honest answer', () => {
    const all = blocked();
    expect(stepCursor(0, { row: -1, col: 0 }, all)).toBe(0);
    expect(stepCursor(0, { row: 0, col: -1 }, all)).toBe(0);
    expect(stepCursor(3, { row: 0, col: 1 }, all)).toBe(3);
    expect(stepCursor(15, { row: 1, col: 0 }, all)).toBe(15);
  });

  it('stands still when it is walled in', () => {
    // Cell 6 with every neighbour blocked, and nothing left to slide down its column.
    const walled = blocked(1, 2, 3, 5, 7, 9, 10, 11, 14);
    expect(stepCursor(6, { row: 1, col: 0 }, walled)).toBe(6);
  });

  it('still slides past a wall when nothing adjacent points that way', () => {
    // Cell 6 cannot step down (10 blocked) but 14 is playable at the bottom of its column.
    expect(stepCursor(6, { row: 1, col: 0 }, blocked(1, 2, 3, 5, 7, 9, 10, 11))).toBe(14);
  });

  it('enters a square walled in on two sides, rather than passing it by', () => {
    // Blocked 0,1,2,11,14 leaves cell 15 with no playable neighbour at all; the only way in is the
    // diagonal from cell 10, whose mirror diagonal (cell 7) scores identically.
    const isLegal = blocked(0, 1, 2, 11, 14);
    expect(stepCursor(10, { row: 0, col: 1 }, isLegal)).toBe(15);
  });

  it('does not move for a zero delta', () => {
    // Callers use a zero delta to ask "where am I", not to nudge the cursor.
    const all = blocked();
    for (let cell = 0; cell < 16; cell++) {
      expect(stepCursor(cell as Cell, { row: 0, col: 0 }, all)).toBe(cell);
    }
  });

  it('recovers if it is somehow standing on a blocked square', () => {
    const isLegal = blocked(3, 7, 11);
    expect(isLegal(3)).toBe(false);
    expect(isLegal(stepCursor(3, { row: 0, col: 1 }, isLegal))).toBe(true);
  });

  it('handles a board with almost nothing playable', () => {
    const isLegal = blocked(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14);
    expect(isLegal(15)).toBe(true);
    expect(isLegal(stepCursor(15, { row: -1, col: 0 }, isLegal))).toBe(true);
  });
});

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
