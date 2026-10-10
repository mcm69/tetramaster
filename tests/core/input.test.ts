/**
 * Board input (PLAN.md §6, Stage 7 groundwork).
 *
 * `hitTest` and `clickToAction` turn screen points into the same `Action` objects the reducer
 * accepts, which is what makes a click indistinguishable from a keystroke at the engine. These are
 * pure functions with no DOM dependency, so they are tested in the node environment.
 */

import { describe, expect, it } from 'vitest';
import { clickToAction, hitTest, moveHover, type PointerTarget } from '../../src/input/pointer.ts';
import { boardLayout, cellRect } from '../../src/render/boardView.ts';
import { applyAction, createMatch, legalCells } from '../../src/core/match.ts';
import { createRng } from '../../src/core/rng.ts';
import { rollInstance } from '../../src/core/card.ts';
import { FIGURES } from '../../src/data/cards.ts';
import type { Cell, GameState } from '../../src/core/types.ts';

const layout = boardLayout(620, 0, 0);

function matchAt(seed: number): GameState {
  const rng = createRng(seed);
  const deck = Array.from({ length: 5 }, () =>
    rollInstance(FIGURES[rng.int(FIGURES.length)]!, rng),
  );
  return createMatch({ seed, playerDeck: deck, aiDeck: deck.slice() });
}

const centreOf = (cell: Cell): { x: number; y: number } => {
  const rect = cellRect(layout, cell);
  return { x: rect.x + rect.size / 2, y: rect.y + rect.size / 2 };
};

const nothing: PointerTarget = { selectedCard: null, hover: null };
const holding = (cardIndex: number): PointerTarget => ({ selectedCard: cardIndex, hover: null });

describe('hitTest', () => {
  it('maps each cell centre back to that cell', () => {
    for (let index = 0; index < 16; index++) {
      const cell = index as Cell;
      const { x, y } = centreOf(cell);
      expect(hitTest(x, y, layout), `cell ${cell}`).toBe(cell);
    }
  });

  it('misses cleanly outside the board', () => {
    expect(hitTest(-10, -10, layout)).toBeNull();
    expect(hitTest(10_000, 10_000, layout)).toBeNull();
  });

  it('resolves the four corners distinctly', () => {
    for (const cell of [0, 3, 12, 15] as Cell[]) {
      const point = centreOf(cell);
      expect(hitTest(point.x, point.y, layout), `corner ${cell}`).toBe(cell);
    }
  });
});

describe('clickToAction', () => {
  it('plays the selected card into a legal cell', () => {
    const state = matchAt(1);
    const cell = legalCells(state)[0] as Cell;
    const { x, y } = centreOf(cell);
    expect(clickToAction(x, y, layout, state, holding(0))).toEqual({
      t: 'place',
      cell,
      cardIndex: 0,
    });
  });

  it('does nothing when no card is selected', () => {
    const state = matchAt(1);
    const { x, y } = centreOf(legalCells(state)[0] as Cell);
    expect(clickToAction(x, y, layout, state, nothing)).toBeNull();
  });

  it('refuses blocked and occupied cells', () => {
    const state = matchAt(1);
    // Occupied after a placement.
    const cell = legalCells(state)[0] as Cell;
    const after = applyAction(state, { t: 'place', cell, cardIndex: 0 }).state;
    const { x, y } = centreOf(cell);
    expect(clickToAction(x, y, layout, after, holding(0))).toBeNull();
  });

  it('refuses a blocked cell', () => {
    for (let seed = 0; seed < 60; seed++) {
      const state = matchAt(seed);
      const blockedIndex = state.blocked.findIndex(Boolean);
      if (blockedIndex < 0) continue;
      const { x, y } = centreOf(blockedIndex as Cell);
      expect(clickToAction(x, y, layout, state, holding(0)), `seed ${seed}`).toBeNull();
      return;
    }
    throw new Error('expected at least one seed to block a cell');
  });

  it('misses cleanly off the board', () => {
    const state = matchAt(1);
    expect(clickToAction(-5, -5, layout, state, holding(0))).toBeNull();
  });

  it('chooses a pending battle when one is contested', () => {
    // Drive to a contested placement, then click the contested cell.
    for (let seed = 0; seed < 300; seed++) {
      let state = matchAt(seed);
      for (let step = 0; step < 6; step++) {
        if (state.phase !== 'place') break;
        const cell = legalCells(state)[0];
        if (cell === undefined) break;
        state = applyAction(state, { t: 'place', cell, cardIndex: 0 }).state;
      }
      if (state.phase !== 'chooseBattle') continue;
      const contested = state.pendingBattles[0] as Cell;
      const { x, y } = centreOf(contested);
      expect(clickToAction(x, y, layout, state, nothing)).toEqual({
        t: 'chooseBattle',
        cell: contested,
      });
      // Clicking a cell that is not contested does nothing.
      const other = legalCells(state)[0];
      if (other !== undefined && !state.pendingBattles.includes(other)) {
        const p = centreOf(other);
        expect(clickToAction(p.x, p.y, layout, state, nothing)).toBeNull();
      }
      return;
    }
  });
});

describe('moveHover', () => {
  /** A match with nothing blocked, so movement assertions are about movement and nothing else. */
  function openBoard(): GameState {
    for (let seed = 0; seed < 50; seed++) {
      const state = matchAt(seed);
      if (!state.blocked.some(Boolean)) return state;
    }
    throw new Error('expected a seed with no blocked cells');
  }

  it('starts at the first legal cell when nothing is selected', () => {
    const state = openBoard();
    expect(moveHover(null, 0, 0, state)).toBe(legalCells(state)[0]);
  });

  it('moves right, left, up and down within the grid', () => {
    const state = openBoard();
    expect(moveHover(5, 0, 1, state)).toBe(6);
    expect(moveHover(6, 0, -1, state)).toBe(5);
    expect(moveHover(5, -1, 0, state)).toBe(1);
    expect(moveHover(5, 1, 0, state)).toBe(9);
  });

  it('clamps at the board edges rather than wrapping', () => {
    const state = openBoard();
    // Column 0 cannot go further left; there is no wrap to column 3.
    expect(moveHover(0, 0, -1, state)).toBe(0);
    expect(moveHover(3, 0, 1, state)).toBe(3);
    expect(moveHover(0, -1, 0, state)).toBe(0);
    expect(moveHover(15, 1, 0, state)).toBe(15);
  });

  it('falls back to a legal cell when the exact one is taken', () => {
    const state = matchAt(2);
    const cell = legalCells(state)[0] as Cell;
    const after = applyAction(state, { t: 'place', cell, cardIndex: 0 }).state;
    // Moving off a cell we just filled must land somewhere legal, never back on the filled cell.
    const moved = moveHover(cell, 0, 1, after);
    expect(moved).not.toBe(cell);
    expect(legalCells(after)).toContain(moved ?? -1);
  });

  it('returns null when nothing is legal', () => {
    // A real match can never fill the board - ten cards on at least ten free cells - so this state
    // is synthetic. The guard still matters: the cursor needs a defined answer when it is stuck.
    const state = matchAt(2);
    const filler = {
      figureId: 0,
      arrows: 0,
      atk: 0,
      type: 'P' as const,
      pdef: 0,
      mdef: 0,
      owner: 'player' as const,
    };
    const filled: GameState = {
      ...state,
      board: Array.from({ length: 16 }, () => ({ ...filler })),
    };
    // Null whatever the input: with no legal cell there is nowhere sensible for the cursor to be.
    expect(moveHover(null, 0, 0, filled)).toBeNull();
    expect(moveHover(5, 1, 0, filled)).toBeNull();
  });
});
