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
0.61, and the floor overrides it to 0.75 — so the board renders **420×420 CSS px on every device
measured**, overflowing 50px off each side of a 320px screen. The comment above it states the intent:

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

### The verification gap that made all of this risky

jsdom has no layout engine. `getBoundingClientRect()` returns zeros, so **no unit test can say
whether the board fits on a phone** — which is why stage M0 exists, and why every "estimated" figure
above has since been replaced with a measurement. This project
has now had four real bugs in a row that headless tests could not see — sound fired at the end of the
match, hotseat unwired, the computer playing hotseat's second seat, and an entire animation system
that had never rendered a frame. A plan for mobile layout that verifies nothing is a plan for four
more.

**This is why §5.1 was decided the way it was.** The headless browser is not a convenience for this
work; it is the thing that makes any of it checkable.

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
4. **One breakpoint, not a cascade of them.** The narrow layout swaps the toolbar for a menu
   wholesale rather than progressively hiding things. Two behaviours, one switch, easy to reason
   about and easy to assert.
5. **No new runtime dependencies.** Everything here is CSS, Pointer Events, and code we already have.
   Playwright is a devDependency and ships in nothing.
6. **Every stage is independently shippable and leaves `npm run verify` green.**

---

## 3. Stages

Each stage is a separate commit. M0 and M1 come first because every sizing decision downstream depends
on the numbers they produce.

### M0 — Headless harness and baseline — **done**

Build the thing that tells us the truth, so the rest of this document stops being arithmetic.

- **Playwright added as a devDependency** (§5.1), Chromium downloaded.
- `src/ui/layoutProbe.ts` — the measurement, living in the app so the tool and the on-page overlay
  share one implementation rather than two copies of the same arithmetic.
- `tools/viewport.ts`, behind a new `npm run viewport` script, serving `dist/` and running a nine-size
  matrix.
- A `?debug=layout` overlay, for a person holding the actual device — the notch, the home indicator
  and the URL bar are three things no desktop browser reproduces faithfully.
- Output committed as `MOBILE-baseline.md`, byte-identical across runs.

**Three things the harness got wrong first, all caught by reading its own output rather than by a
test** — worth recording because each one made the tool _under-report_:

1. **It measured a page that had not finished rendering.** The toolbar and hand tray are built by
   JavaScript; a report taken at `load` found 2 controls where there are 13. Fixed with a
   `MutationObserver`, so the report stays current as the page changes.
2. **It counted checkboxes instead of the labels around them.** A bare `<input type=checkbox>` is
   ~13px, and flagging it would have made both preference toggles a permanent false positive in the
   M9 gate. The probe now measures the owning `<label>`, which is what a thumb actually aims at.
3. **`isMobile: true` hid the very overflow it was installed to find.** With mobile emulation on,
   Chromium honours `width=device-width` and then _expands the layout viewport to absorb overflowing
   content_: asked for 320px it reported 370, and the 50px it absorbed never appeared in the
   measurement. Dropped in favour of `hasTouch` alone, which keeps touch events real.

**Still report-only — no assertions, no CI gate.** The layout does not fit, so a gate would be red on
arrival and every later stage would be red for the wrong reason. The gate is M9.

**Done.** Baseline exists, is reproducible, and has corrected this document twice.

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
- Delete `MIN_VIEWPORT` and the `260`. The floor stops being a desktop constant and becomes whatever
  CSS says the board is.
- While here: the backing store is currently `BOARD_SIZE * dpr` regardless of display size, so a
  560-unit board at `dpr = 3` allocates 1680² pixels to draw into ~360 CSS px of screen. Size it to
  the measured rect instead. Not a visible fix; a memory one.
- Tests: the sizing arithmetic over the device matrix, in Node.

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

The toolbar's height is what costs the board its space, but the toolbar is M4's problem. This stage
is everything else.

- `.hand` becomes a single horizontally-scrolling row with `scroll-snap-align` on the cards. Five
  cards at ~76px fit 375px without scrolling; below that they scroll rather than wrap, because
  vertical space is the scarce resource and wrapping costs two rows.
- The first width-based media query in the project, and the first `@media (max-width: …)` used for
  layout rather than for hiding things.
- Hide `.mode-note` and `.keys` by width as well as by height.
- Tighten the flex `gap` and the `h1` at narrow widths.

**Done when** the hand tray occupies one row at 360px and the board is larger than it would be
without this stage, measured by the M0 harness.

### M4 — Toolbar overflow menu

On narrow screens the toolbar swaps from an inline bar to a single **Settings** button that opens a
stacked panel (§5.3). Desktop is untouched — the inline bar stays exactly as it is above the
breakpoint.

- New `src/ui/components/menu.ts`, following the same shape as the other components: build from
  state, report through callbacks, no state of its own.
- It is a real menu, not a `<details>`: `aria-expanded` on the trigger, `role="menu"` on the panel,
  Escape closes and returns focus to the trigger, outside-tap closes, focus moves into the panel on
  open. All of that is unit-testable in jsdom without a browser.
- Narrow layout: mode buttons abbreviate (`Match` / `Tournament` / `Hotseat`) and stay inline, since
  they are primary navigation and a disabled one states its reason — which the toolbar module
  deliberately chose. The panel holds the opponent select, the collection progress, and — see §5.4 —
  the preference toggles.

**This stage changes a decision the codebase made in writing.** `src/ui/components/toolbar.ts` opens
with a stated principle:

> _"It does not hide settings behind a mode: audio and motion are accessibility and comfort
> settings, and the people who need them are exactly the people least likely to find a submenu."_

An overflow menu is a submenu. §5.4 records how far that principle is being bent, and M4 must update
that header comment rather than leave it contradicting the code. Overriding a written rationale
without recording it is how the next person puts it back.

**Done when** the panel opens, closes and navigates correctly by keyboard and by tap, and desktop
still renders the inline bar.

### M5 — Touch targets and touch hygiene

- Every interactive element gets `min-height: 44px` and `min-width: 44px` at narrow widths. Today
  `.hand-card` has `min-width: 7.5rem` and no height at all.
- `user-select: none` and `-webkit-touch-callout: none` on the play area; `user-select: text`
  restored on the rules and collection screens, which are prose and should be selectable.
- `-webkit-tap-highlight-color: transparent` plus a visible `:active` state, so a tap is felt rather
  than flashed blue.
- **`touch-action` policy.** `none` on the canvas currently blocks pinch-zoom over the play area.
  Change it to `manipulation`, which kills the 300ms double-tap delay and still permits pinch-zoom.
  During an M6 drag we suppress panning via pointer capture instead, which scopes the suppression to
  the gesture that needs it.

**Done when** the M0 harness reports no target under 44px, and pinch-zoom still works over the board.

### M6 — Drag to place

Tap-tap stays. Drag is added on top, because it is the gesture a thumb expects (§5.2).

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

### M7 — Orientation

- Portrait is primary and the layout M2–M5 describe is designed for it.
- Landscape: the board and the hand tray sit side by side, because vertical space is the binding
  constraint and a landscape phone has none to spare.
- Handle `orientationchange`; re-run the fit.
- Decide explicitly whether to lock orientation. **Recommendation: do not.** The browser already
  lets users rotate, and a lock that fights the user is worse than a layout that handles both.

**Done when** rotating mid-match keeps the board fully visible and playable, and nothing is lost.

### M8 — Collection and rules on a narrow screen

These are the screens players leave the board for, and neither has been looked at below 640px.

- `.deck-slot { flex: 1 1 12rem }` becomes an explicit two-column grid on narrow screens, so slots
  never shrink below a tappable size.
- The collection list scrolls independently of the page.
- The filter controls wrap sensibly.
- The rules screen's prose is checked for overflow.

**Done when** the deck can be fully edited at 360px wide with no horizontal scrolling.

### M9 — The layout gate goes green and joins CI

The harness from M0 becomes an assertion, which is when it stops being a measuring instrument and
starts being a gate.

- Assertions per device size: board fully inside the viewport, `scrollWidth <= clientWidth`, no
  interactive target under 44px, board height ≥ an agreed floor.
- Matrix: 320×568, 360×640, 375×667, 390×844, 414×896, 768×1024, 844×390 landscape, and two desktop
  sizes so the desktop layout cannot silently regress.
- Wired into `npm run verify` and the existing CI job. This is also where desktop gets asserted,
  which nothing currently does at the layout level.

**This closes the standing DoD gap.** Every stage of this project has been verified in Node and
jsdom; nobody has watched the board draw on hardware.

### M10 — Documentation

- README's controls table gains a touch column, so the keyboard-only bindings stop being the only
  documented way to play.
- `PLAN.md` §7.4 gains the mobile deviation note.
- `STATUS.md` gets a session entry per stage.

---

## 4. What is deliberately out of scope

- **No offline / PWA install.** A service worker is its own project and adds a cache-invalidation
  surface. Not needed to make it playable.
- **No orientation lock.** See M7.
- **No new game features.** Nothing about the rules changes.
- **No native app.** The whole thing is a static bundle already; a wrapper adds nothing.
- **No iOS-specific gesture work** beyond what Pointer Events gives for free.

---

## 5. Decisions taken

### 5.1 A headless browser: yes — Playwright, devDependency only

**Decided: yes.** It is the only thing in this plan that makes "does it fit on a phone" a test
rather than a claim, and it closes the project's longest standing verification gap. The shipped bundle
stays dependency-free; this is a dev tool like `vitest`.

Consequences, and they are real:

- M0 gains a large first install (browser binaries) and CI gains an image change.
- The layout gate cannot land before the layout works, so M0 is **report-only** and M9 is where
  assertions and CI arrive. Until M9 the harness is an instrument, and every stage in between is
  responsible for re-running it and updating `MOBILE-baseline.md`.
- Until M9, "the gate exists" is still a claim. Nine stages is a long time to have one.

### 5.2 Drag-to-place: yes, build it

**Decided: yes.** Two taps per move is fine at a desk and poor at a thumb, and the board is the one
surface where touch input differs from mouse input in kind rather than degree.

It remains its own stage precisely so it can be dropped without losing M0–M5 if it turns out to
produce more touch-only bugs than it is worth. The tap-tap path is untouched either way.

### 5.3 Narrow toolbar: an overflow menu

**Decided: overflow menu**, not horizontal scroll. Two reasons, and the second is the one that
moved it:

1. A stacked panel is what a phone is good at. Scrolling horizontally hides controls behind an
   affordance people under-use.
2. It sidesteps the arithmetic entirely. A scroller has to decide what fits at every width; a menu
   does not, because the panel is a vertical stack and the only question is what is in it.

The cost is real: a menu is a component with focus management, Escape, outside-tap and ARIA, and all
of that has to be right. That is M4.

### 5.4 What goes in the menu — still open

**This is the one sub-decision left, and it is a question about a value rather than about layout.**

`toolbar.ts` deliberately keeps audio and motion out of submenus, on the grounds that the people who
need those settings are the least likely to find one. Putting them in the overflow menu bends that.

The tension, plainly:

|                                                                 |                                                                                                                                                             |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Keep Sound and Reduce motion inline**                         | honours the existing rationale; costs ~170px of a 360px row, so the mode bar may wrap to a second row anyway                                                |
| **Put them in the menu**                                        | one fewer row and more board; buries accessibility settings one tap away, but behind a button that is always in the same place, never scrolled out of reach |
| **Put them in the menu, and mark the button when they are set** | one fewer row _and_ the state stays visible at a glance; more work than it sounds, and a small visual language of its own                                   |

**Recommendation: measure first.** M0's harness reports the real row count and chrome height on a
360px screen, which is the input to this decision. Take the option that the measurement supports; if
it shows the mode bar wrapping anyway, the toggles go in the menu with an indicator on the button.
Whichever is chosen, M4 updates the `toolbar.ts` header comment to match.

---

## 6. Risks

| Risk                                                                          | Mitigation                                                                                                                                                                      |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pointer capture + `touch-action` interact badly and only fail on real devices | M6's state machine is pure; the gesture wiring is thin. Needs real-device testing regardless — this is where Playwright earns its cost, though it cannot replace hands on glass |
| CSS-owned sizing regresses desktop                                            | M1 keeps one coordinate system; M9 asserts the desktop sizes in the same matrix                                                                                                 |
| `dvh` / safe-area support varies                                              | both have fallbacks declared first; `100vh` and plain `padding` degrade predictably                                                                                             |
| The `260`-removal makes the desktop board larger than people expect           | it is the _correct_ size; measure it in M0 and decide with a number rather than a hunch                                                                                         |
| Nine stages with no layout gate until M9                                      | M0's baseline is re-run after every stage and committed, so drift is visible even when nothing fails                                                                            |
| Playwright install friction puts the whole plan at risk                       | it is isolated to M0 and M9; M1–M8 do not depend on it, only M0's _baseline_ does                                                                                               |
| Scope creep — "while we're in the CSS"                                        | the ten stages are separable commits. Stop at any of them                                                                                                                       |

---

## 7. Definition of done

- At 360×640 portrait the whole board is visible without scrolling, and no page scrolls sideways.
- No interactive target is under 44×44px on any screen.
- The toolbar is a single Settings menu on narrow screens and the unchanged inline bar on desktop.
- A complete match can be played on a phone using touch alone: select a card, place it by drag or by
  tap, resolve a battle, collect a card, start a new match.
- Rotating mid-match keeps the board fully playable.
- Pinch-zoom still works over the board.
- Desktop is unchanged, asserted at desktop sizes in the device matrix.
- `npm run verify` is green, and the device matrix runs in CI.
