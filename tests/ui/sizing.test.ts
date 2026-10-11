/**
 * Fitting the board to the space it is given (MOBILE.md, stage M1).
 *
 * ## The regression these tests exist for
 *
 * `fitCanvas` used to compute the board's size in JavaScript, and it got the number wrong on every
 * device:
 *
 * ```js
 * const minBoard = Math.min(MIN_VIEWPORT.width - 380, MIN_VIEWPORT.height - 300);   // 420, always
 * cssScale = Math.max(minBoard / BOARD_SIZE, ...);
 * ```
 *
 * With `MIN_VIEWPORT = {1280, 720}` the board could not go below 420×560 CSS pixels anywhere in the
 * world. Stage M0 measured what that costs: at 320×568 the board centres at x = −50, putting 50px
 * off-screen on *each* side.
 *
 * The tests below are mostly ordinary arithmetic. The two that are not are `honours a display size
 * the old code could not produce` and `the old desktop floor is gone` — because a pure function that
 * does not divide by something cannot be shown to have stopped.
 */

import { describe, expect, it } from 'vitest';
import { boardSizing, type Sizing } from '../../src/ui/sizing.ts';

const BOARD = 560;

/** The matrix M0 measures against, as the CSS would hand each one to `fitCanvas`. */
const MATRIX = [
  { label: 'iPhone SE (1st gen)', viewport: 320, chrome: 32, dpr: 2 },
  { label: 'small Android', viewport: 360, chrome: 32, dpr: 3 },
  { label: 'iPhone SE (2nd/3rd)', viewport: 375, chrome: 32, dpr: 2 },
  { label: 'iPhone 12/13/14', viewport: 390, chrome: 32, dpr: 3 },
  { label: 'iPhone XR/11', viewport: 414, chrome: 32, dpr: 2 },
  { label: 'laptop', viewport: 1280, chrome: 32, dpr: 1 },
  { label: 'desktop', viewport: 1440, chrome: 32, dpr: 2 },
] as const;

/** What the container would give the canvas on each row: the viewport less the body's padding. */
function displayFor(row: (typeof MATRIX)[number]): number {
  return row.viewport - row.chrome;
}

describe('fitting the board to the space it is given', () => {
  it('never magnifies the board past its natural size', () => {
    // A 1440px desktop must not get a 1440px board. It gets 560, as it always did.
    const sizing = boardSizing({ boardPx: BOARD, displayPx: 1440, devicePixelRatio: 2 });
    expect(sizing.cssScale).toBe(1);
    expect(sizing.backingPx).toBe(BOARD * 2);
  });

  it('honours a display size the old code could not produce', () => {
    // The regression. 288 CSS pixels is what a 320px phone offers after body padding. The old
    // arithmetic floored the board at 420 and would have answered 420/560 = 0.75 for this input.
    const sizing = boardSizing({ boardPx: BOARD, displayPx: 288, devicePixelRatio: 2 });
    expect(sizing.cssScale).toBeCloseTo(0.514, 3);
    expect(sizing.cssScale).toBeLessThan(0.75);
    expect(sizing.backingPx).toBe(576);
  });

  it('the old desktop floor is gone', () => {
    // Stated as a property rather than a constant, because a constant cannot be shown to have been
    // deleted by a test that reads it.
    const below = boardSizing({ boardPx: BOARD, displayPx: 200, devicePixelRatio: 1 });
    const above = boardSizing({ boardPx: BOARD, displayPx: 420, devicePixelRatio: 1 });
    expect(below.cssScale).toBeLessThan(above.cssScale);
    expect(below.backingPx).toBe(200);
  });

  it('gives every device in the matrix a board that fits its width', () => {
    for (const row of MATRIX) {
      const display = displayFor(row);
      const sizing = boardSizing({ boardPx: BOARD, displayPx: display, devicePixelRatio: row.dpr });
      expect(BOARD * sizing.cssScale, row.label).toBeLessThanOrEqual(display);
      expect(sizing.cssScale, row.label).toBeGreaterThan(0);
    }
  });

  it('rises with the space it is given, and never falls', () => {
    // From 1px upwards. Zero is a different case with its own test below: a canvas that measures
    // nothing is *unmeasured*, not very small, and it answers differently on purpose.
    let previous = 0;
    for (let display = 1; display <= BOARD; display += 7) {
      const sizing = boardSizing({ boardPx: BOARD, displayPx: display, devicePixelRatio: 1 });
      expect(sizing.cssScale, `display ${display}`).toBeGreaterThanOrEqual(previous);
      expect(sizing.cssScale, `display ${display}`).toBeLessThanOrEqual(1);
      previous = sizing.cssScale;
    }
  });

  it('treats "unmeasured" as a different case from "tiny", and says so', () => {
    // The discontinuity is deliberate and worth pinned: a 1px board is scaled to fit, while a canvas
    // that cannot be measured falls back to natural size. Without this the two would be averaged
    // into a rule that is wrong for both — a hidden panel would come back at 1/560th scale.
    const unmeasured = boardSizing({ boardPx: BOARD, displayPx: 0, devicePixelRatio: 1 });
    const tiny = boardSizing({ boardPx: BOARD, displayPx: 1, devicePixelRatio: 1 });
    expect(unmeasured.cssScale).toBe(1);
    expect(tiny.cssScale).toBeCloseTo(1 / BOARD, 6);
    expect(tiny.cssScale).toBeLessThan(unmeasured.cssScale);
  });
});

describe('the backing store', () => {
  it("follows the measured rect rather than the board's coordinate space", () => {
    // The memory point from M0. At dpr 3 the old code allocated 560 × 3 = 1680 device pixels to
    // display a 288 CSS pixel board: about 11MB for a screen 288 pixels wide.
    const sizing = boardSizing({ boardPx: BOARD, displayPx: 288, devicePixelRatio: 3 });
    expect(sizing.backingPx).toBe(864);
    expect(sizing.backingPx).toBeLessThan(BOARD * 3);
  });

  it('leaves desktop exactly as it was', () => {
    // Desktop previously got `BOARD_SIZE * dpr`, and CSS still caps the board at BOARD_SIZE, so
    // this is the one place where "smaller backing store" must not mean "changed".
    for (const dpr of [1, 2, 3]) {
      const sizing = boardSizing({ boardPx: BOARD, displayPx: BOARD, devicePixelRatio: dpr });
      expect(sizing.backingPx, `dpr ${dpr}`).toBe(BOARD * dpr);
    }
  });

  it('keeps the transform consistent with the two numbers it came from', () => {
    for (const row of MATRIX) {
      const sizing = boardSizing({
        boardPx: BOARD,
        displayPx: displayFor(row),
        devicePixelRatio: row.dpr,
      });
      expect(sizing.transform, row.label).toBeCloseTo(sizing.cssScale * sizing.dpr, 6);
      expect(sizing.transform, row.label).toBeCloseTo(sizing.backingPx / BOARD, 6);
    }
  });
});

describe('nonsense in, something usable out', () => {
  it('treats a canvas that measures nothing as unsized rather than scaling to zero', () => {
    // Every canvas under jsdom, and any canvas inside a `display: none` panel. A zero transform
    // draws nothing at all, silently.
    for (const displayPx of [0, -10, Number.NaN, Number.POSITIVE_INFINITY]) {
      const sizing = boardSizing({ boardPx: BOARD, displayPx, devicePixelRatio: 2 });
      expect(sizing.cssScale, String(displayPx)).toBe(1);
      expect(Number.isFinite(sizing.transform), String(displayPx)).toBe(true);
      expect(sizing.backingPx, String(displayPx)).toBeGreaterThan(0);
    }
  });

  it('sanitises the device pixel ratio', () => {
    for (const dpr of [0, -2, Number.NaN, undefined as unknown as number]) {
      const sizing = boardSizing({ boardPx: BOARD, displayPx: BOARD, devicePixelRatio: dpr });
      expect(sizing.dpr, String(dpr)).toBe(1);
      expect(sizing.backingPx, String(dpr)).toBe(BOARD);
    }
  });

  it('refuses a board with no size, rather than absorbing it', () => {
    for (const boardPx of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        () => boardSizing({ boardPx, displayPx: 100, devicePixelRatio: 1 }),
        String(boardPx),
      ).toThrow(RangeError);
    }
    expect(() =>
      boardSizing({ boardPx: BOARD, displayPx: 100, devicePixelRatio: 1, maxDisplayPx: 0 }),
    ).toThrow(RangeError);
  });

  it('returns the same shape every time, whatever came in', () => {
    const expected = Object.keys(
      boardSizing({ boardPx: BOARD, displayPx: 100, devicePixelRatio: 1 }),
    );
    const inputs: Parameters<typeof boardSizing>[0][] = [
      { boardPx: BOARD, displayPx: 0, devicePixelRatio: 0 },
      { boardPx: BOARD, displayPx: 1e9, devicePixelRatio: 4 },
      { boardPx: BOARD, displayPx: 12.7, devicePixelRatio: 1.5 },
    ];
    for (const input of inputs) {
      const sizing: Sizing = boardSizing(input);
      expect(Object.keys(sizing).sort()).toEqual([...expected].sort());
      expect(Number.isFinite(sizing.cssScale)).toBe(true);
      expect(Number.isFinite(sizing.transform)).toBe(true);
    }
  });
});

describe('the floor that used to be there', () => {
  it('would fail on the old arithmetic, at every width below the desktop minimum', () => {
    // A direct restatement of the bug, so that anyone tightening this module can see what it costs.
    const MIN_VIEWPORT = { width: 1280, height: 720 };
    const oldFit = (width: number, height: number): number => {
      const available = Math.min(width - 32, height - 260, BOARD);
      const minBoard = Math.min(MIN_VIEWPORT.width - 380, MIN_VIEWPORT.height - 300);
      return Math.max(minBoard / BOARD, Math.min(1, available / BOARD));
    };

    for (const row of MATRIX.filter((m) => m.viewport < 1280)) {
      const old = oldFit(row.viewport, 700) * BOARD;
      const now = displayFor(row);
      expect(old, `${row.label}: the old floor overstates the space available`).toBeGreaterThan(
        now,
      );
    }

    // And the new one simply takes what it is given.
    const sizing = boardSizing({ boardPx: BOARD, displayPx: 288, devicePixelRatio: 2 });
    expect(sizing.cssScale * BOARD).toBe(288);
  });
});
