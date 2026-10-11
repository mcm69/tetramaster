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

### M2 — Viewport and document — **done, after a screenshot proved it wrong**

> **The first version of this stage was wrong and was committed as working.** S25 claimed every
> portrait size fitted. It did not: the board painted across the toolbar, the status line and the hand
> tray, and two of the five hand cards were clipped away. Both the screenshot and the measurement were
> wrong in the same direction, for related reasons, and neither is a lesson about CSS.

**What shipped wrong, and why the harness did not see it**

- `main.ts` used to size the document; it now makes `body` the single scroller and gives the board a
  `flex: 1 1 auto; min-height: 0` slot "so the board takes what the chrome leaves". The slot shrank to
  164px, `max-height: 100%` did not clamp against a flex-shrunk grid area, the canvas kept its
  width-derived 361px size, and **it painted over everything below it**.
- The probe measured `documentElement.scrollHeight`. With `body` as the scroller that says nothing
  about what is inside it, so a page 205px too tall reported as fitting.
- Every probe measurement was _containment_ — is this element inside the viewport. All of them were
  true. Nothing asked whether two things were painted on top of each other.

**Fixed**

- The board does **not** shrink. `flex: 0 0 auto`, and **no `max-height`** on the canvas: the obvious
  way to stop it running off a short screen silently does nothing, and leaving it in the stylesheet
  would re-arm the same trap. A board too small to read is worse than a page that scrolls.
- The probe watches for **overlap**, not just containment — including the canvas itself rather than
  only its wrapper, because what escaped was a child overrunning its own parent, which no sibling
  comparison can see. Nested pairs are excluded, or the canvas and its slot would be a permanent
  false positive.
- The probe reads the **body's** scroll metrics.
- `justify-content: safe center`, not `center`: with plain centring, content taller than the body is
  laid out starting above the top edge, where no scrolling reaches it. The board measured at y = −41px.
- `.toolbar-bar` and `.collection-panel` were `min(64rem, 96vw)` — the _viewport_, not the element's
  content box, which is 32px narrower because of the body's padding. 16px of silent overflow, clipped
  away by the new `overflow-x: clip`.
- The hand tray is one row of five equal columns at **every** size, and the arrow-directions text is
  dropped below 130px of card width — via a **container query**, because the card's width is a
  different question from the screen's (an iPad gives each card 147px, a desktop 171px, a 320px phone
  57px). That text was 75px of a 236px tray.

**Measured now (M0 harness, re-run):** no overlapping regions and no sideways overflow at any of the
nine sizes. Every portrait phone from 375px up has the board and the hand tray on screen together.

**What is still not right, and which stage owns it:**

|                           |                          |                                                                                |
| ------------------------- | ------------------------ | ------------------------------------------------------------------------------ |
| 320×568, 360×640, 375×667 | hand tray below the fold | **M4** — the toolbar is ~300px there and is the whole of the remaining problem |
| 844×390 landscape         | board and tray both cut  | M7                                                                             |
| iPad, laptop, desktop     | hand tray below the fold | the page scrolls, as it always did; M3 and M4 shorten it                       |
| every size                | 8 controls under 44px    | M5                                                                             |

### M3 — Narrow-screen layout — **done**

Measured first, then spent. At 375×667 with the tray on one row and the settings collapsed, the page
was **97px too tall**. The cuts, with what each cost and why it is safe to cut:

|                                                        | saved             | why it is safe                                                                                                             |
| ------------------------------------------------------ | ----------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `h1` hidden below 48rem                                | 38px with its gap | a phone tab already says "Tetra Master" and carries the icon                                                               |
| `.mode-note` hidden by width as well as height         | 32px              | it is the mode's blurb, which is on the button's `title`, in its accessible name, and in the results at the end of a match |
| gaps 12px → 8px                                        | 28px              | nothing to lose                                                                                                            |
| body padding 16px → 10px, safe areas kept              | 12px              | the board was asking for the room                                                                                          |
| `.hint:empty { display: none }`                        | 27px              | **it was empty.** An empty paragraph still holds a line box, and it was doing that on every screen including desktop       |
| "Master Tournament" → "Tournament" below 30rem         | —                 | 146px → 100px, which is what lets the mode bar share a row with the Settings button                                        |
| Settings button → a gear glyph below 30rem             | 45px at 360       | `\FE0E` forces text presentation so it does not arrive as a colour emoji                                                   |
| the arrow sprite 56px → 34px on a card under 96px wide | 22px              | the same arrows, and the tray is on one row so all five cards stay visible                                                 |

**Every portrait device in the matrix now fits**, 320×568 upwards, and the board is _larger_ than it
was before any of this: 300px at 320 wide, 370px at 390.

**The harness got a verdict it was missing.** Every mutation in the table above initially passed,
because "the board and the hand are on screen" leaves headroom below the hand — and "fits" is a
different claim. `pageOverflowPx` is now measured and flagged, which is the criterion M2 promised in
the first place. Four of the six are caught by it.

**Two are not, and the reason is worth stating.** Reverting the arrow sprite (22px) or the body
padding (12px) individually still fits at 320px, because that device has ~23px of slack. Measuring at
a boundary only catches changes larger than the boundary's headroom. So the _policy_ — which card
width shrinks the sprite — was pulled out as a pure `previewSizeFor(widthPx)` and pinned in Node,
which is the only level that can hold it. Two mutations caught there: always full size, and the
threshold moved so nothing ever shrinks.

**Learned:**

- **A seventh silent `python` replace.** The anchor was a comment sitting _before_ an `@media`, and I
  matched it as if it were inside the braces. Nothing applied, nothing errored, and I read the
  unchanged viewport numbers as "the cuts weren't enough". They had never run. Every multi-line
  replace now asserts its anchor exists first.
- **`npm run viewport` builds; `npm run verify` does not.** After reverting a mutation I served a
  `dist/` that still contained it, and spent a while debugging a `matchMedia` that was working
  perfectly well. A stale build looks exactly like a live bug.
- **A first pass cannot measure the thing it is about to create.** The arrow sprite asked its own card
  for a width while the card was still being built, so every card measured zero and every sprite
  stayed full size — on exactly the narrow screens the change was for. A detached element measures
  nothing; that is the normal state of a component under construction, not an edge case.
- **An empty element still reserves a line.** `.hint` cost 19px plus its gap on every screen in the
  matrix, desktop included, while saying nothing. The cheapest 27px on the page, and it was not in
  the plan.

### M4 — Toolbar overflow menu — **done**

- New `src/ui/components/menu.ts`. On a wide screen the trigger is hidden and the panel is part of
  the bar, so the markup is the same shape either way; only whether it collapses changes.
- It is a **disclosure**, not a `role="menu"`. The panel holds a `<select>` and two checkboxes, which
  have their own focus behaviour and their own keys; promising arrow-key roving focus would be a lie
  assistive technology acts on. `aria-expanded` + `aria-controls`, Escape closes and returns focus to
  the trigger, a click outside closes, opening moves focus into the panel.
- `main.ts` decides whether it collapses with `matchMedia` — via a new `matchQuery` wrapper in
  `accessibility.ts`, because jsdom has no `matchMedia` and a second hand-rolled guard would be a
  second place to get it wrong. Absent means wide, which is the layout every existing test describes.
- Rotating across the breakpoint re-renders, or a phone left open keeps a panel no button can close.
- The outside-click listener is torn down on every re-render; `main.ts` re-renders the toolbar on
  every settings change and every match, so a leaked listener is a growing pile of them.
- "Master Tournament" becomes "Tournament" below 30rem — it was 146px alone, which is what pushed the
  mode bar onto a second row at 320px. The full name stays in `title` and the accessible name.

**Measured:** the toolbar was **141px at 320px and 104px from 360 to 560**. It is now **79px at 320
and 34px from 375 up**.

**§5.4 is resolved, by the measurement rather than by taste.** The plan left open whether the
preference toggles belong in the menu, against `toolbar.ts`'s written principle that audio and motion
must not be buried. Leaving them inline saves nothing below 768px: the mode bar and the opponent
select already fill two rows and the two 19px checkboxes simply take a third. **The row they occupy
is the row the panel would have freed.** So they go in, and the compromise that keeps most of the
principle is a marker on the trigger — when either preference is off its default the button carries a
dot and says so in its `title`, so a player who needs it set can see that it is without opening
anything. The button's word stays "Settings" either way so the bar does not reflow as they toggle.

**Verified by mutation**, seven and all caught: `aria-expanded` hardcoded, the panel never hidden,
inside-clicks closing the panel, the teardown not removing its listener, Escape not restoring focus,
the marker always on, and the marker computed but never put on the button. `isNarrow()` forced false
is caught by the harness — toolbar back to 104px, eight controls under 44px reappearing.

**Not done here:** 320-375px still scroll to reach the hand tray. What remains is the `h1`, the mode
note and the flex gaps — which is **M3**, and it is the next thing to do.

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

### 5.4 What goes in the menu — decided, by measurement

**Decided at stage M4: everything except the mode buttons.** The panel holds the opponent picker,
both preference toggles and the collection's progress; the three mode buttons stay inline, because a
disabled one states its reason and that is worth keeping visible. The trigger carries a marker when a
preference is off its default, which is what survives of `toolbar.ts`'s principle that they must not
be buried. The reasoning, with the numbers, is at the top of stage M4.

The decision it replaced, kept because the argument still holds:

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
