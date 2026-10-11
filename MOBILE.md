# Mobile

Making Tetra Master genuinely playable on a phone, in portrait, with touch — and keeping desktop
working exactly as it does today.

Status: **plan only, nothing built.** This document is the design; implementation happens stage by
stage, each stage committed on its own with `npm run verify` green.

---

## 1. What is true today

Measured from the code, not assumed. Every number below is arithmetic on what is in the repo; the
ones marked _estimated_ need a real device and are what stage **M0** exists to confirm.

### What already works

|                                                                          |                                                                                                          |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `<meta name="viewport" content="width=device-width, initial-scale=1.0">` | present                                                                                                  |
| `touch-action: none` on the canvas                                       | present — a finger-drag over the board does not scroll the page                                          |
| Hand cards are real `<button>` elements                                  | they fire `click` on tap and are focusable                                                               |
| Every keyboard action has a pointer equivalent                           | the rook cursor is a _convenience_; tapping a hand card then a square plays a move with no cursor at all |
| `.keys` control legend                                                   | already hidden below 760px tall (`@media (max-height: 760px)`)                                           |
| `.collection-panel` width                                                | `min(64rem, 96vw)` — already viewport-relative                                                           |

So the game is _technically_ playable on a phone today. It is not _comfortably_ playable, and in
landscape it does not fit at all.

### The blocking defect: the board cannot shrink below 420px

```js
// src/main.ts:100-109
const available = Math.min(window.innerWidth - 32, window.innerHeight - 260, BOARD_SIZE);
const minBoard = Math.min(MIN_VIEWPORT.width - 380, MIN_VIEWPORT.height - 300); // min(900, 420) = 420
cssScale = Math.max(minBoard / BOARD_SIZE, Math.min(1, available / BOARD_SIZE)); // floor of 0.75
```

`MIN_VIEWPORT` is `{ width: 1280, height: 720 }`. On a 375px phone the width term wants a scale of
0.61, and the floor overrides it to 0.75 — so the board renders **420×420 CSS px on a 375px screen**
and overflows. The comment above it states the intent:

> _Below 1280x720 the page scrolls rather than the board becoming illegible._

That is a defensible desktop decision. On a phone, scrolling the board off-screen is not an
acceptable trade — there is nowhere else to scroll to.

### Three more sizing defects in the same function

1. **`260` is a guess.** It stands in for "room for the toolbar, hand tray and status lines", and it
   is a constant, so it never adapts. It is wrong on desktop too, and badly wrong on a phone: the
   real chrome on a 375×667 screen is _estimated_ at ~390px — h1 (~26), toolbar bar wrapped to
   three rows (~120), the two toolbar buttons (~40), status (~21), the hand tray wrapped to two rows
   (~70), body padding (32) and flex gaps (~84). The board would be ~274px in a 375px-wide area:
   limited by height, with ~50px of dead margin either side.
2. **`window.innerHeight` is the layout viewport.** On mobile it disagrees with what is actually on
   screen as the URL bar collapses. `visualViewport.height` is the honest number.
3. **`window.addEventListener('resize')` only.** That fires every time a mobile URL bar slides away,
   so `fitCanvas` re-runs on incidental scrolls.

### Everything else

|                                    |                                                                                                                                  |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Width media queries                | **none exist** — the only media queries are `max-height: 760px` and `prefers-reduced-motion`                                     |
| `body { min-height: 100vh }`       | the _large_ viewport height; a collapsing URL bar overlaps the bottom. `100dvh` is correct                                       |
| Safe areas                         | `env(safe-area-inset-*)` appears nowhere; a home-indicator phone can clip the hand tray                                          |
| Hand tray                          | `flex-wrap: wrap`, cards `min-width: 7.5rem`, no `min-height`. Five cards plus gaps ≈ 640px, so they wrap to two rows on a phone |
| `touch-action: none` on the canvas | also disables pinch-zoom over the main play area — a real accessibility cost                                                     |
| Touch hygiene                      | no `user-select: none`, no `-webkit-tap-highlight-color`; a fast double-tap can select text or flash a blue box                  |
| Deck editor                        | `.deck-slot { flex: 1 1 12rem }` — below ~384px wide the slots shrink below a usable size                                        |

### The verification gap that makes all of this risky

jsdom has no layout engine. `getBoundingClientRect()` returns zeros, so **no unit test can say
whether the board fits on a phone.** Every sizing claim in this document is arithmetic. This project
has now had four real bugs in a row that headless tests could not see — sound fired at the end of the
match, hotseat unwired, the computer playing hotseat's second seat, and an entire animation system
that had never rendered a frame. A plan for mobile layout that verifies nothing is a plan for four
more.

---

## 2. Design principles

1. **Target 360×640 portrait.** The narrowest phone still in real use (iPhone SE 1st gen, small
   Android). Everything wider gets the same layout with room to spare. One layout, not a phone
   layout and a desktop layout.
2. **The browser lays out; JavaScript observes.** The current design has JS compute a pixel size and
   hand it to CSS, which is why `260` and `MIN_VIEWPORT` exist. Inverting it removes both constants
   and makes the arithmetic a pure, testable function over numbers we control.
3. **Touch is an addition, never a replacement.** Tap-tap already works and is tested. Drag is added
   on top.
4. **No new runtime dependencies.** Everything here is CSS, Pointer Events, and code we already have.
5. **Every stage is independently shippable and leaves `npm run verify` green.**

---

## 3. Stages

Each stage is a separate commit. M0 and M1 come first because every sizing decision downstream depends
on the numbers they produce.

### M0 — Measure before changing anything

Build the thing that tells us the truth, so the rest of this document stops being arithmetic.

- `tools/viewport.ts`: loads the built page in a headless browser at a matrix of device sizes, and
  reports for each — board rect, document scroll width vs client width, total chrome height, and any
  element whose touch target is under 44px.
- A `?debug=layout` query parameter that overlays the measured numbers on the page, for use on a
  real device.
- Output committed as `MOBILE-baseline.md`.

**Done when** the baseline exists and the estimated numbers in §1 are either confirmed or corrected.
**Depends on** the decision in §5 about a headless browser.

### M1 — Sizing core

- New `src/ui/sizing.ts`, pure and DOM-free:
  ```ts
  export interface Sizing {
    readonly cssScale: number;
    readonly dpr: number;
  }
  export function boardSizing(boardPx: number, displayPx: number, dpr: number): Sizing;
  ```
  One coordinate system, unchanged: the canvas keeps drawing in `BOARD_SIZE` units and only the
  transform moves.
- Delete `MIN_VIEWPORT` and the `260`. The floor stops being a desktop constant and becomes
  whatever CSS says the board is.
- While here: the backing store is currently `BOARD_SIZE * dpr` regardless of display size, so a
  560-unit board at `dpr = 3` allocates 1680² pixels to draw into ~360 CSS px of screen. Size it to
  the measured rect instead. Not a visible fix; a memory one.
- Tests: the sizing arithmetic over a device matrix, in Node.

**Done when** `cssScale` is derived entirely from a measured rect, and `MIN_VIEWPORT` and `260` no
longer exist.

### M2 — Viewport and document

- `viewport-fit=cover` on the meta tag.
- `min-height: 100vh` → `100dvh` (with a `100vh` fallback declared first).
- `overflow-x: clip` on the document, so nothing can ever scroll sideways.
- `padding-bottom: max(1rem, env(safe-area-inset-bottom))` and the matching top/left/right.
- The board moves into a `flex: 1 1 auto; min-height: 0` slot so the browser does the height
  arithmetic, and `aspect-ratio: 1` keeps it square.
- `visualViewport` drives the fit; `resize` on `window` is no longer the only signal.

**Done when** the board fits at 360×640 and the page never scrolls horizontally.

### M3 — Narrow-screen layout

The toolbar is what costs the board its space, so it collapses first. Estimated saving on a 375px
screen: ~76px of board.

- `.toolbar-bar` becomes a single horizontally-scrollable row under ~640px, instead of wrapping to
  three rows. `scroll-snap-type: x mandatory`, snap points on the mode buttons.
- `.hand` becomes a single horizontally-scrolling row with `scroll-snap-align` on the cards.
  Five cards at ~76px each fit 375px without scrolling; below that they scroll rather than wrap,
  because vertical space is the scarce resource and wrapping costs two rows.
- First width-based media query in the project, and the first use of `@media (max-width: …)` for
  layout rather than for hiding things.
- Hide `.mode-note` and `.keys` by width as well as by height.
- Tighten the flex `gap` and the `h1` at narrow widths.

**Done when** the board is materially larger on a phone than it would be without M3, measured by M0.

### M4 — Touch targets and touch hygiene

- Every interactive element gets `min-height: 44px` and `min-width: 44px` at narrow widths. Today
  `.hand-card` has `min-width: 7.5rem` and no height at all.
- `user-select: none` and `-webkit-touch-callout: none` on the play area; `user-select: text`
  restored on the rules and collection screens, which are prose and should be selectable.
- `-webkit-tap-highlight-color: transparent` plus a visible `:active` state, so a tap is felt rather
  than flashed blue.
- **`touch-action` policy.** `none` on the canvas currently blocks pinch-zoom over the play area.
  Change it to `manipulation`, which kills the 300ms double-tap delay and still permits pinch-zoom.
  During an M5 drag we set `touch-action: none` on the dragging element via pointer capture instead,
  which scopes the suppression to the gesture that needs it.

**Done when** no interactive target is under 44px, and pinch-zoom still works over the board.

### M5 — Drag to place

Tap-tap stays. Drag is added on top, because it is the gesture a thumb expects.

- A pure state machine in `src/input/drag.ts` — `idle → dragging(ghost at x,y) → placed | cancelled`
  — testable in Node with no DOM, in the same spirit as `src/ui/turn.ts` (which exists precisely
  because game flow used to be unreachable from tests).
- `pointerdown` on a hand card selects it and begins a drag; `setPointerCapture` keeps it alive when
  the finger leaves the element.
- `pointermove` runs the existing `hitTest` and sets the controller's hover, so the legal-cell
  highlight follows the finger. No new geometry code — `hitTest` is already the single source.
- `pointerup` over a legal cell places. Over anything else, or back over the hand, cancels and
  deselects.
- The ghost reuses `drawCardFace`, which is already a pure function of `(card, size, options)`.
- Tap-tap is unchanged and still covered.

**Done when** a drag from the hand to a legal square places the card, and every input state is
covered by tests on the pure reducer.

### M6 — Orientation

- Portrait is primary and the layout M2–M5 describe is designed for it.
- Landscape: the board and the hand tray sit side by side, because vertical space is the binding
  constraint and a landscape phone has none to spare.
- Handle `orientationchange`; re-run the fit.
- Decide explicitly whether to lock orientation. **Recommendation: do not.** The browser already
  lets users rotate, and a lock that fights the user is worse than a layout that handles both.

**Done when** rotating mid-match keeps the board fully visible and playable, and nothing is lost.

### M7 — Collection and rules on a narrow screen

These are the screens players leave the board for, and neither has been looked at below 640px.

- `.deck-slot { flex: 1 1 12rem }` becomes an explicit two-column grid on narrow screens, so slots
  never shrink below a tappable size.
- The collection list scrolls independently of the page.
- The filter controls wrap sensibly.
- The rules screen's prose is checked for overflow.

**Done when** the deck can be fully edited at 360px wide with no horizontal scrolling.

### M8 — Headless layout gate

Only if §5 is decided in favour of a headless browser. Without it, every "does it fit" claim in this
document stays an assertion by the author.

- Playwright (devDependency only — the shipped bundle stays dependency-free) over a device matrix:
  320×568, 360×640, 375×667, 390×844, 414×896, 768×1024, 844×390 landscape.
- Assertions per size: board fully inside the viewport, `scrollWidth <= clientWidth`, no
  interactive target under 44px, board height ≥ some agreed floor.
- Runs in CI alongside the existing `verify` job.

**This also closes the standing DoD gap.** Every stage of this project has been verified in Node and
jsdom; nobody has watched the board draw on hardware. A headless browser is the cheapest way to stop
that gap from swallowing another four bugs.

### M9 — Documentation

- README's controls table gains a touch column, so the keyboard-only bindings stop being the only
  documented way to play.
- `PLAN.md` §7.4 gains the mobile deviation note.
- `STATUS.md` gets the session entry per stage.

---

## 4. What is deliberately out of scope

- **No offline / PWA install.** A service worker is its own project and adds a cache-invalidation
  surface. Not needed to make it playable.
- **No orientation lock.** See M6.
- **No new game features.** Nothing about the rules changes.
- **No native app.** The whole thing is a static bundle already; a wrapper adds nothing.
- **No iOS-specific gesture work** beyond what Pointer Events gives for free.

---

## 5. Open decisions

These need an answer before the stages that depend on them.

### 5.1 Do we adopt a headless browser?

**Recommendation: yes — Playwright, as a devDependency only.** It is the only thing in this plan
that makes "does it fit on a phone" a test rather than a claim, and it closes the project's longest
standing verification gap. Cost: a large install, and a CI image change.

Alternatives, in descending order of how much they buy:

|                                                             |                                                                          |
| ----------------------------------------------------------- | ------------------------------------------------------------------------ |
| Manual device testing checklist, run by hand before release | free, but nothing prevents regression and nothing runs in CI             |
| Playwright at one or two sizes only                         | a quarter of the install, catches gross overflow, misses the tight cases |

If the answer is no, then M0, M8 and the `visualViewport` work in M2 all need restating as manual
steps, and this plan should be re-read with that in mind.

### 5.2 Is drag-to-place worth it, or is tap-tap enough?

**Recommendation: yes, build it.** Two taps per move is fine at a desk and poor at a thumb, and the
board is the one surface where touch input differs from mouse input in kind rather than degree. But
it is the most expensive single item here and the most likely to produce touch bugs, so it is
separated into its own stage precisely so it can be dropped without losing M0–M4.

### 5.3 Should the mode/toolbar bar scroll horizontally, or collapse to an overflow menu?

The plan assumes horizontal scroll because it costs no JavaScript and keeps every control one tap
away. An overflow menu is tidier and scales better if controls are ever added. Horizontal scroll is
easy to add a menu to later; the reverse is not true.

---

## 6. Risks

| Risk                                                                          | Mitigation                                                                                                                     |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Pointer capture + `touch-action` interact badly and only fail on real devices | M5's state machine is pure; the gesture wiring is thin. Needs real-device testing regardless — this is where M8 earns its cost |
| CSS-owned sizing regresses desktop                                            | M1 keeps one coordinate system; the existing desktop layout is asserted in M8's matrix at desktop sizes                        |
| `dvh` / safe-area support varies                                              | both have fallbacks declared first; `100vh` and plain `padding` degrade predictably                                            |
| The `260`-removal makes the desktop board larger than people expect           | it is the _correct_ size; measure it in M0 and decide with a number rather than a hunch                                        |
| Scope creep — "while we're in the CSS"                                        | the nine stages are separable commits. Stop at any of them                                                                     |

---

## 7. Definition of done

- At 360×640 portrait the whole board is visible without scrolling, and no page scrolls sideways.
- No interactive target is under 44×44px on any screen.
- A complete match can be played on a phone using touch alone: select a card, place it, resolve a
  battle, collect a card, start a new match.
- Rotating mid-match keeps the board fully playable.
- Pinch-zoom still works over the board.
- Desktop is unchanged, asserted at desktop sizes in the device matrix.
- `npm run verify` is green, and the device matrix runs in CI.
