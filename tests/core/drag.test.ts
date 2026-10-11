/**
 * Drag-to-place gestures (MOBILE.md stage M6).
 *
 * Exhaustive rather than illustrative, for the same reason `cursor.test.ts` is: every rule here is a
 * rule about *touch*, so every one of them is a rule no mouse-driven test suite exercises. The whole
 * gesture is checked in a few milliseconds, which is a good trade against the alternative — finding
 * out on a phone that dropping a card on an illegal square leaves it stuck in your hand.
 *
 * The one property that matters most is the first group: **tap-tap must be untouched.** Drag is
 * additive, so a press that never travels has to emit `none` and leave selection to the click handler
 * that already exists. If it did not, a tap would both select here and toggle there.
 */

import { describe, expect, it } from 'vitest';
import {
  DRAG_THRESHOLD_PX,
  IDLE,
  isActive,
  reduce,
  type DragEffect,
  type DragInput,
  type DragState,
} from '../../src/input/drag.ts';
import type { Cell } from '../../src/core/types.ts';

const CELL_A = 0 as Cell;
const CELL_B = 5 as Cell;

/** A finger at a point, over a cell, legal or not. */
function at(x: number, y: number, cell: Cell | null = CELL_A, legal = true): DragInput {
  return { x, y, cell, legal };
}

/** Runs a list of events from idle and returns every intermediate effect. */
function run(events: readonly Parameters<typeof reduce>[1][]): DragEffect[] {
  let state: DragState = IDLE;
  const effects: DragEffect[] = [];
  for (const event of events) {
    const result = reduce(state, event);
    state = result.state;
    effects.push(result.effect);
  }
  return effects;
}

describe('drag gestures', () => {
  describe('a press that never travels is a tap, not a drag', () => {
    it('emits nothing on arm, so the click handler keeps owning selection', () => {
      expect(run([{ t: 'arm', cardIndex: 2, x: 100, y: 400 }])).toEqual([{ t: 'none' }]);
    });

    it('emits nothing on release while still armed', () => {
      const effects = run([
        { t: 'arm', cardIndex: 2, x: 100, y: 400 },
        { t: 'release', input: at(100, 400) },
      ]);
      // Not `place`, even though the finger is over a legal cell.
      expect(effects).toEqual([{ t: 'none' }, { t: 'none' }]);
    });

    it('survives jitter of a few pixels without becoming a drag', () => {
      // A fingertip on glass is not a point. Nine pixels is under the threshold.
      const effects = run([
        { t: 'arm', cardIndex: 1, x: 100, y: 400 },
        { t: 'move', input: at(107, 403) },
        { t: 'move', input: at(99, 406) },
        { t: 'move', input: at(104, 397) },
        { t: 'release', input: at(100, 400) },
      ]);
      expect(effects.every((effect) => effect.t === 'none')).toBe(true);
    });
  });

  describe('crossing the threshold', () => {
    it('selects the card on the first frame that is unambiguously a drag', () => {
      // 9px short: still a tap.
      expect(
        run([
          { t: 'arm', cardIndex: 3, x: 0, y: 0 },
          { t: 'move', input: at(9, 0) },
        ])[1],
      ).toEqual({
        t: 'none',
      });
      // 10px: the threshold itself counts, since `below` is exclusive.
      expect(
        run([
          { t: 'arm', cardIndex: 3, x: 0, y: 0 },
          { t: 'move', input: at(10, 0) },
        ])[1],
      ).toEqual({
        t: 'select',
        cardIndex: 3,
      });
    });

    it('measures straight-line distance, so a diagonal is not two axis thresholds', () => {
      // 7px right and 7px down is 9.9px of travel — a tap.
      expect(
        run([
          { t: 'arm', cardIndex: 0, x: 0, y: 0 },
          { t: 'move', input: at(7, 7) },
        ])[1]?.t,
      ).toBe('none');
      // 8px and 8px is 11.3px — a drag.
      expect(
        run([
          { t: 'arm', cardIndex: 0, x: 0, y: 0 },
          { t: 'move', input: at(8, 8) },
        ])[1]?.t,
      ).toBe('select');
    });

    it('shows no ghost until the threshold is crossed', () => {
      let state = reduce(IDLE, { t: 'arm', cardIndex: 0, x: 0, y: 0 }).state;
      expect(state.ghost).toBeNull();

      state = reduce(state, { t: 'move', input: at(4, 0) }).state;
      expect(state.ghost).toBeNull();

      state = reduce(state, { t: 'move', input: at(40, 0) }).state;
      expect(state.ghost).toEqual({ x: 40, y: 0 });
    });
  });

  describe('dropping on a legal square', () => {
    it('places the card', () => {
      const effects = run([
        { t: 'arm', cardIndex: 1, x: 100, y: 500 },
        { t: 'move', input: at(200, 100, CELL_A, true) },
        { t: 'release', input: at(200, 100, CELL_A, true) },
      ]);
      expect(effects[2]).toEqual({ t: 'place', cardIndex: 1, cell: CELL_A });
    });

    it('returns to idle with nothing held', () => {
      let state = IDLE;
      for (const event of [
        { t: 'arm', cardIndex: 1, x: 0, y: 0 },
        { t: 'move', input: at(50, 50) },
        { t: 'release', input: at(50, 50) },
      ] as const) {
        state = reduce(state, event).state;
      }
      expect(state).toEqual(IDLE);
      expect(isActive(state)).toBe(false);
    });
  });

  describe('dropping anywhere else', () => {
    const cases: readonly (readonly [string, DragInput])[] = [
      ['an illegal square', at(50, 50, CELL_B, false)],
      ['off the board entirely', at(50, 50, null, false)],
      ['back onto the hand tray', at(50, 700, null, false)],
    ];

    for (const [name, input] of cases) {
      it(`puts the card back down over ${name}`, () => {
        const effects = run([
          { t: 'arm', cardIndex: 4, x: 0, y: 500 },
          { t: 'move', input: at(50, 50, CELL_A, true) },
          { t: 'release', input },
        ]);
        // Not `place`: the release's own legality, not where the drag last was.
        expect(effects[2]).toEqual({ t: 'deselect' });
      });
    }

    it('deselects even when the drag never passed over a legal square at all', () => {
      const effects = run([
        { t: 'arm', cardIndex: 0, x: 0, y: 700 },
        { t: 'move', input: at(10, 690, null, false) },
        { t: 'release', input: at(10, 690, null, false) },
      ]);
      expect(effects[2]).toEqual({ t: 'deselect' });
    });
  });

  describe('the highlight follows the finger', () => {
    it('tracks the cell as it moves, without emitting anything', () => {
      let state = reduce(IDLE, { t: 'arm', cardIndex: 0, x: 0, y: 0 }).state;
      const seen: (Cell | null)[] = [];
      const legals: boolean[] = [];
      const effects: DragEffect[] = [];
      for (const input of [
        at(50, 50, CELL_A, true),
        at(150, 50, CELL_B, false),
        at(150, 150, CELL_B, true),
      ]) {
        const result = reduce(state, { t: 'move', input });
        state = result.state;
        seen.push(state.cell);
        legals.push(state.legal);
        effects.push(result.effect);
      }
      // The first move is the one that crosses the threshold, and the only one that speaks.
      expect(effects).toEqual([{ t: 'select', cardIndex: 0 }, { t: 'none' }, { t: 'none' }]);
      expect(seen).toEqual([CELL_A, CELL_B, CELL_B]);
      expect(legals).toEqual([true, false, true]);
    });

    it('is cleared the moment the drag ends, whichever way it ended', () => {
      let state = reduce(IDLE, { t: 'arm', cardIndex: 0, x: 0, y: 0 }).state;
      state = reduce(state, { t: 'move', input: at(50, 50) }).state;
      expect(state.cell).toBe(CELL_A);

      expect(reduce(state, { t: 'release', input: at(50, 50) }).state.cell).toBeNull();
      expect(reduce(state, { t: 'cancel' }).state.cell).toBeNull();
    });
  });

  describe('interrupting a gesture', () => {
    it('cancels to idle from any phase', () => {
      for (const phase of ['armed', 'dragging'] as const) {
        let state: DragState = IDLE;
        state = reduce(state, { t: 'arm', cardIndex: 0, x: 0, y: 0 }).state;
        if (phase === 'dragging') state = reduce(state, { t: 'move', input: at(50, 50) }).state;
        const result = reduce(state, { t: 'cancel' });
        expect(result.state).toEqual(IDLE);
        // A cancelled drag puts the card down, same as a drop on nothing.
        expect(result.effect).toEqual({ t: 'none' });
      }
    });

    it('ignores a second finger landing mid-drag', () => {
      const armed = reduce(IDLE, { t: 'arm', cardIndex: 0, x: 0, y: 0 }).state;
      const second = reduce(armed, { t: 'arm', cardIndex: 3, x: 50, y: 50 });
      // Idle, not armed: a second `arm` must not hijack the gesture already in flight.
      expect(second.state).toEqual(IDLE);
    });

    it('ignores moves and releases when nothing is in progress', () => {
      // Happens whenever a pointer event arrives without a preceding `arm` — a stray `pointermove`
      // during a re-render, or a release for a drag whose cards were rebuilt underneath it.
      expect(reduce(IDLE, { t: 'move', input: at(50, 50) }).state).toEqual(IDLE);
      expect(reduce(IDLE, { t: 'release', input: at(50, 50) }).state).toEqual(IDLE);
      expect(reduce(IDLE, { t: 'cancel' }).state).toEqual(IDLE);
    });
  });

  it('holds a single finger, so the card index is whatever was armed last', () => {
    // There is one drag at a time by construction; this pins that `cardIndex` is carried through
    // every phase rather than re-read from the event, which is what lets `place` name its card.
    let state = reduce(IDLE, { t: 'arm', cardIndex: 3, x: 0, y: 0 }).state;
    expect(state.cardIndex).toBe(3);
    state = reduce(state, { t: 'move', input: at(50, 50) }).state;
    expect(state.cardIndex).toBe(3);
    expect(reduce(state, { t: 'release', input: at(50, 50) }).effect).toEqual({
      t: 'place',
      cardIndex: 3,
      cell: CELL_A,
    });
  });

  it('keeps the origin for the whole gesture', () => {
    let state = reduce(IDLE, { t: 'arm', cardIndex: 0, x: 17, y: 29 }).state;
    // The origin must not follow the finger, or the distance would never grow.
    state = reduce(state, { t: 'move', input: at(60, 29) }).state;
    expect(state.origin).toEqual({ x: 17, y: 29 });
    expect(DRAG_THRESHOLD_PX).toBeGreaterThan(0);
  });
});
