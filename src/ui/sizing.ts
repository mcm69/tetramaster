/**
 * How big the board is, and how to draw it.
 *
 * ## What this replaces
 *
 * `fitCanvas` used to compute a pixel size in JavaScript and hand it to CSS:
 *
 * ```js
 * const available = Math.min(window.innerWidth - 32, window.innerHeight - 260, BOARD_SIZE);
 * const minBoard = Math.min(MIN_VIEWPORT.width - 380, MIN_VIEWPORT.height - 300);   // = 420
 * cssScale = Math.max(minBoard / BOARD_SIZE, Math.min(1, available / BOARD_SIZE));
 * ```
 *
 * Three things in six lines were wrong, and `MOBILE-baseline.md` measured all three:
 *
 *  - `MIN_VIEWPORT` was `{1280, 720}`, so the floor was a *desktop* constant applied to every
 *    device. The board could not go below 420×420 anywhere, which is 50px off-screen on each side of
 *    a 320px phone.
 *  - `260` stood in for "the height of everything that is not the board", as a constant, forever. The
 *    real chrome measured **1117px** on a 320×568 phone and **444px** on a 1280×720 laptop.
 *  - Both guessed at a space the browser already knows the size of.
 *
 * So the arithmetic moved here, the guessing moved to CSS, and this file holds what is left: the part
 * that genuinely is calculation. The browser decides how big the board is; this decides what that
 * means for the backing store and the transform.
 *
 * ## The coordinate system, unchanged
 *
 * The board is always *drawn* in `boardPx` units — 560 of them — whatever size it ends up on screen.
 * Hit-testing and every drawing routine already speak those units, and there is exactly one of them
 * across the whole renderer. Only the transform moves, and this module is where it is computed.
 */

/** The result of fitting the board to a space. All lengths are pixels unless the name says otherwise. */
export interface Sizing {
  /** CSS pixels per board unit. This is what hit-testing divides by. */
  readonly cssScale: number;
  /** The device pixel ratio actually used, after sanitising. */
  readonly dpr: number;
  /** The backing store's width, in device pixels. */
  readonly backingPx: number;
  /** Device pixels per board unit — what `ctx.setTransform` wants. */
  readonly transform: number;
}

export interface SizingInput {
  /** The board's own coordinate space, in units. 560 in this game. */
  readonly boardPx: number;
  /** How wide the canvas ended up in CSS pixels, as measured by the browser. */
  readonly displayPx: number;
  /** `window.devicePixelRatio`, which can be absent, zero, or nonsense. */
  readonly devicePixelRatio: number;
  /**
   * The largest the board may be displayed, in CSS pixels. Defaults to `boardPx`, i.e. never
   * magnified past its natural size.
   *
   * This is enforced here as well as in CSS on purpose. A board drawn at 2× on a high-DPI display is
   * not "premium", it is a 4× memory allocation for pixels nobody can see.
   */
  readonly maxDisplayPx?: number;
}

/**
 * Fits a board of `boardPx` units to a measured `displayPx` of screen.
 *
 * Total by construction: any nonsense in the inputs produces a sane answer rather than a `NaN`
 * transform, because a canvas with a `NaN` transform draws nothing and says nothing about why.
 *
 * @throws RangeError when `boardPx` or `maxDisplayPx` is not positive — those are programming
 * errors rather than conditions to absorb, and the floor of 1 would hide them.
 */
export function boardSizing(input: SizingInput): Sizing {
  const { boardPx, displayPx, devicePixelRatio } = input;
  if (!Number.isFinite(boardPx) || boardPx <= 0) {
    throw new RangeError(`boardPx must be a positive number, got ${String(boardPx)}`);
  }
  const maxDisplayPx = input.maxDisplayPx ?? boardPx;
  if (!Number.isFinite(maxDisplayPx) || maxDisplayPx <= 0) {
    throw new RangeError(`maxDisplayPx must be a positive number, got ${String(maxDisplayPx)}`);
  }

  // A canvas inside a `display: none` panel, and every canvas under jsdom, measure zero. There is
  // nothing to fit, so fall back to natural size rather than scaling everything to nothing.
  const usable = Number.isFinite(displayPx) ? Math.min(Math.max(displayPx, 0), maxDisplayPx) : 0;
  const cssScale = usable > 0 ? usable / boardPx : 1;
  const dpr = Number.isFinite(devicePixelRatio) ? Math.max(1, devicePixelRatio) : 1;

  // The backing store follows the *measured* rect, which is the point of the change: at dpr 3 the old
  // code allocated 560 × 3 = 1680 device pixels to display a 288px board, about 11MB for a screen
  // 288 CSS pixels wide. It now allocates 288 × 3 = 864, about 3MB, for the same pixels.
  const backingPx = Math.max(1, Math.round(usable * dpr));

  return { cssScale, dpr, backingPx, transform: backingPx / boardPx };
}
