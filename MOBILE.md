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

### M5 — Touch targets and touch hygiene — **done**

**44px, at every width.** Stage M0 found **eight controls under it on every device, desktop
included** — the mode buttons at 33.6px, the opponent `<select>` at 27px, both preference toggles at
19.2px, the two bottom buttons at 40.5px. The floor is applied everywhere rather than only on
phones, because a 19px checkbox is not a desktop design choice; it is a small target that happens to
have a mouse beside it. The checkboxes are labelled and the label toggles them, so the **label** is
the target and the label gets the height — padding a 13px `<input>` helps nobody.

**Touch policy, and the one place the plan changed.**

- `canvas { touch-action: manipulation }`, not `none`. The old value also forbade pinch-zoom over the
  main play area, which is an accessibility cost for a player who may need to magnify the board.
  `manipulation` still removes the 300ms double-tap delay and still allows panning.
- `.hand-card`, `.picker-option`, `.claim-card { touch-action: none }`. M6's drag starts on a hand
  card, and a gesture that scrolled the page halfway across the board would be worse than a lost
  pinch. This is the deliberate trade.
- `user-select: none` and `-webkit-touch-callout: none` on the controls; **`text` restored on the
  rules and collection screens**, which are prose and which a player may want to copy a card name out
  of.
- `-webkit-tap-highlight-color: transparent` with a real `:active` background, so a tap is felt rather
  than flashed blue.

**What it cost, and where the money came from.** 44px targets put 320×568 **77px over** — the toolbar
wrapped to two rows because the mode bar, the gear button and their gaps came to 302px in a 300px
column. The gap gave 4px; the tray's own padding and line gap gave 13; body padding and gaps gave the
last 6. **320×568 is now 6px over, which is 1% of the screen on the oldest device in the matrix, below
this plan's own stated 360×640 target.** Everything from 360px up fits with the full floor applied.

**The probe learned to check behaviour, not only size.** None of stage M5's second half is visible in
a measurement of sizes, so none of it would ever have been checked. `touch-action`, `user-select` and
the target floor are now read back as computed style and flagged — and the first attempt at adding
them **silently did not apply** (an eighth `python` replace that matched nothing), which is how four
of five mutations passed before anyone noticed.

**Verified by mutation**, all caught: the 44px floor removed (six controls under 44px), the board
back to `touch-action: none` ("board blocks pinch-zoom"), the hand cards allowed to pan ("a drag
would scroll the page"), the rules screen left unselectable, and `user-select` removed from the
controls.

**A bug this stage's screenshots found, and the guard it produced.** Opening the menu pushed the
**Settings button down onto a second row**. `toolbar.ts` set `className = 'settings-host'` and
`renderMenu` overwrote it a line later with `'settings-menu'`, while the stylesheet's
`display: contents` rule was written against `.settings-host` — **so the rule matched nothing.** The
button was present, enabled and correctly labelled throughout, and no harness question covers it: jsdom
has no layout, and the probe asks whether things fit, overlap or are big enough. `tests/ui/
stylesheetClasses.test.ts` now checks statically that every class the stylesheet names is a class
something renders.

### M6 — Drag to place — **done**

**Tap-tap is untouched. Drag is added on top of it**, which is the whole design: a gesture that never
travels emits `none` and leaves selection to the click handler that already existed. Nothing in the
tap path changed.

**`src/input/drag.ts` is pure and needs no DOM and no engine** — 19 tests, ~130ms. Three phases, not
the plan's two:

- `armed` — finger down, hasn't moved 10px. **No ghost**, because a ghost that appears and vanishes
  under a resting thumb reads as a glitch.
- `dragging` — past the threshold. Ghost follows the finger; the legal-cell highlight does too.
- `idle`.

**Selection lands on `select`, not on `arm`.** An armed finger has not yet distinguished itself from
a tap, and toggling the card the player is about to drag off the board would leave the drag holding a
card that is no longer selected.

**Coordinates are client pixels, not board pixels.** The board is drawn scaled — about 0.66 on a
390px phone — so measuring the threshold in board units would quietly lower it by a third on exactly
the devices this stage exists for.

**Capture is taken when the drag _starts_, not on `pointerdown`.** `setPointerCapture` retargets the
follow-up `click` to the capturing element, which would break the tap path outright. A tap therefore
never has a capture, and never had a reason to.

**Where the plan was wrong.** The plan said `pointerup` "over anything else, or back over the hand,
cancels and deselects". True, and worth restating because it is a decision rather than a default:
picking a card up and putting it nowhere means you did not mean to play it.

**The ghost reuses `drawCardFace`**, as planned, and a hand card is given `owner: 'player'` for the
frame colour — it has no owner until placed, and drawing it in the opponent's colours would misstate
whose move it is. Off the board there is no ghost at all; the answer to "the finger is over the tray"
is not a card floating at the board's edge.

**`tools/touchDrag.ts` drives real touch through CDP** — 13 checks, `npm run touch`. Not in
`npm run verify`, which does not build. Pointless events written by `page.evaluate` would only prove
the handler agrees with itself, so this dispatches genuine touch and reads the tray. §9 should fold
it in.

**Verified by mutation.** Reducer: threshold to 0, threshold boundary `<`→`<=`, release ignoring
legality, `deselect`→`none`, `hypot`→axis-wise, a tap placing the card — six, all caught. Wiring:
legality not re-checked at drop time, capture never released — caught. **`setHover(drag.cell)` not
following the finger survives**, and the honest reason is that the only untested link is one
assignment in `main.ts`; the decision of what the hover _is_ is exhaustively unit-tested, and a pixel
test for the assignment would have to reverse-engineer the cell origin to find a corner the ghost
does not cover. Recorded rather than papered over.

**A guard I wrote and then deleted.** The first wiring swallowed one canvas click after a drag, on the
theory that a stray `click` would place a second card. Mutating the guard away changed nothing —
because Chrome emits **no click at all** once a touch passes the slop threshold. The guard was
insuring against nothing. It is gone, replaced by a check that a touch drag emits no click, with a
companion check that a tap _does_ emit one so the recorder cannot pass vacuously.

### M7 — Orientation — **done**

Board and tray side by side in landscape; everything else stacks in the second column so it costs the
board nothing. **844×390, 667×375 and 812×320 all fit with no scrolling**, which 844×390 did not
before — it was 643px too tall.

**Orientation is not locked, as the plan recommended.** Nothing listens for `orientationchange`; the
`ResizeObserver` on the canvas already covers rotation, the collapsing URL bar, a font arriving and a
zoom, without guessing which of those is worth listening for. That reasoning was written in stage M2
and it held up under measurement — rotating mid-match and back again was tested rather than assumed.

**Where this gives up M1's principle, and why.** Stage M1 deleted hand-measured constants because the
browser should lay out and JavaScript should observe. Landscape is where that runs out: a square
board has to be as tall as the space allows, and no CSS expression says "no taller than the viewport
minus your own chrome" other than `calc(100dvh - N)`. The alternative — let the grid column size
itself and put `max-height: 100%` on the canvas — **does not work, measured**: a percentage
`max-height` is treated as `none` while a column's intrinsic width is being resolved, so the column
took the canvas's unconstrained 560px and the board never shrank at all.

So there is a constant, and three things make it safe rather than hopeful:

1. **The arithmetic is written out**, so it can be checked rather than trusted.
2. **It must be an under-estimate.** 126px is the measured chrome; 120px is used. Too generous and
   the column is wider than the row and the board overlaps its neighbour — which is exactly what an
   earlier 142px did. Too mean and the board is simply the column's width, and the picture is fine.
3. **An `aspect-ratio` backstop** makes the board's width follow its _row_ rather than its column, so
   a wrong estimate or a wrapped toolbar shrinks the board instead of overrunning the status line.

**"Fits" is not "playable", and it took a third check to notice.** With the settings panel left open
in landscape — see below — the board still fitted, at 149px, giving 33px cells. Nothing failed. The
check that matters is `display / 520 × 115 >= 44`, because a board small enough to fit is still
useless if its squares are below the floor M5 set.

**The settings menu now collapses on short viewports as well as narrow ones.** A phone in landscape is
844px wide, so width alone said "desktop" and rendered the panel inline: the opponent `<select>` and
both preference toggles stacked under the mode buttons, 156px of the 390 available. **The JavaScript
and the CSS carry the same media condition**, because one of them owns `hidden` and `aria-expanded`
and the other owns how the panel is arranged; when they disagreed the panel would have been a
disclosure that was not laid out like one.

**Two layout attempts are recorded because both were reasonable.** Stretching the tray to fill its
column produced five cards a third of the screen tall, each with three lines of text at the top and a
void beneath — centring it instead reads as three things on purpose: modes, cards, navigation. And a
`min-content` column sized the board column to 100px and the board to 28px, because a replaced element
with an `aspect-ratio` has almost no min-content width.

**Verified by mutation, six of six.** The board budget ignoring the chrome; the `aspect-ratio`
backstop removed; the slot no longer stretching; the menu left open on short viewports; the column
made `1fr`; and the whole landscape block removed. **Two of them survived every other viewport in the
matrix** and only showed up at 812×320, where the board overruns its row and paints over the status
line. That size is now in the matrix for that reason. The playability check and the harness's overlap
detector each caught two.

### M7a — The bug this stage shipped with, found in a screenshot

**Reported from a screenshot, not by a check: the end-of-match panel rendered above the board and
crushed it to 6px tall.** Stage M7 turned the body into a grid and placed seven of its fourteen
children. The other seven were auto-placed, and grid's implicit rows put them in the one cell nobody
named.

Three body children were unplaced, and all three were broken:

- **`#picker` and `#results`** landed above the board. Now they take the whole second column, over
  the tray rather than the board — the tray is finished at that point and the panel is what the
  player came for. They span the column rather than taking a row of their own, so the board's height
  does not change the moment a match ends. The tray is hidden behind them with `visibility` rather
  than `display`, so it keeps its place and the board does not jump.
- **`#collection` and `#rules`** landed in the board's own column: 270px wide and 38px too tall. They
  replace the board entirely, so they now take the whole grid.
- **`#hint`** — what pressing H would say about the square under the cursor — was unplaced too. It
  gets a row of its own rather than being hidden: it is an explanation of the move, and dropping it
  on the screens with least room is the exact trade this project keeps refusing. The row is
  **reserved** rather than collapsed, because an `auto` row that grows would shrink the `1fr` row and
  move the board under the player's finger. A fixed 17px costs the board 6% and never moves.

**Why nothing caught it, and what now does.** The viewport harness measures a fresh page, where every
one of those elements is `hidden`. The touch tool never finishes a match. Both screens are reachable
only by playing a whole game — which is precisely how this was found, by a person looking at one.

`tests/ui/stylesheetClasses.test.ts` now asserts that **every direct child of `<body>` has a place in
the landscape grid, or is removed from it** — placed with `grid-area`/`grid-column`, or `display:
none`, or the `.sr-only` live region that `position: absolute` takes out of flow. **Four mutations,
all caught**: each of the three above unplaced again, and a brand-new `<div id="toast">` added to the
body with nothing styling it.

Two lessons from writing that check:

- **The first version matched every tag on the page** and reported the two `rematch` buttons _inside_
  the navigation toolbar as unplaced body children. A test failing about elements it was never meant
  to be looking at is worse than no test. It now tracks nesting depth and reads only direct children.
- **Stopping at the first `@media` boundary reported four more false positives**, because `.mode-note`
  and `.keys` are hidden by a `max-height: 760px` block rather than the landscape one. The check now
  runs to the end of the stylesheet.

### M8 — Collection and rules on a narrow screen — **done**

**No horizontal scrolling at 320, 360, 390 or 640** — the plan's done-when, and it turns out it was
already true. Everything else was not.

**The 44px floor had missed this screen entirely.** Stage M5 wrote it against the board's controls and
nobody went looking for the others: `.deck-clear` was **26px**, the search box 33px and every filter
`<select>` 27px. The floor is now on all of them, at every width, as M5 decided for the rest.

**The deck editor is an explicit two-column grid below 48rem.** It was `flex: 1 1 12rem` per slot, and
12rem is 192px — wider than the 272px left inside a 320px phone once two fit. So flex put **one slot
per row**, and each slot is a sprite, a name, a stat code, a list of scoring points and a button:
about 290px tall. Five of them was **1450px of scrolling before the card list**, which is the list
players came for. Two columns is the plan's instruction and it is also the right answer to _why_ this
happened: 12rem was chosen when the screen was never narrower than 640px, and it silently became a
one-column layout the moment it was.

**`.deck-code` needed `max-width`, not just `overflow: hidden`.** As a flex item in a column its width
is its fit-content size — 218px for "BM6A · points E, SE, S, SW, W, NW" — and `overflow` only clips
what has already been given a width. Without the cap, the two-column grid pushed the panel **9px past
the viewport at every width**: the exact bug the `96vw` comment in that same stylesheet warns about,
in a different declaration, four hundred lines later.

**What the plan asked for that turned out to be already true:** the collection list already scrolled
independently (`max-height: 45vh; overflow-y: auto`), the filters already wrapped, and the rules prose
had no overflow at any width. Said plainly rather than credited.

**The harness now opens all three screens.** For the whole project it measured one, and the two it
never opened are the two nobody had looked at. It presses the same button a player presses, waits for
the screen it asked for rather than a fixed delay, and reports each separately. **11 viewports × 3
screens = 33 sections** in `MOBILE-baseline.md`.

**Faults are asked only of what they are about.** "Board not fully visible" is a true statement about a
board nobody is looking at when the collection is open, so the board checks are asked only of the
board. Sideways overflow, undersized targets, overlapping regions and unselectable prose are asked of
every screen, and are labelled with the screen so a fault is actionable. Vertical overflow is _not_
asked of the collection or rules screens, because those are meant to scroll — demanding they fit
would be demanding they not exist.

The probe reports which screen it measured, and returns `null` for a hidden board and hand rather
than a zero-size box, because zero reads as "too small" to every check downstream.

**Verified by mutation, six of six.** `.deck-clear` losing the floor (caught); `.deck-code` losing
`max-width` (caught — the overflow this stage introduced); the panel sized `100vw` instead of `100%`
(caught); a deck slot given a `min-width` wider than its column (caught); the rules screen made
unselectable (caught on all three screens at once); and the two-column grid removed (**not caught** —
see below).

**One mutation survives, and it should.** Removing the two-column grid is not a defect; it is the
shorter layout this stage rejected on purpose. The gate catches overflow, small targets and
overlaps — it does not catch taste, and the honest thing is to say so rather than invent a threshold
for "too tall to be nice".

### M9 — The layout gate goes green and joins CI — **done**

`npm run layout` (or `npm run viewport -- --check`) measures, writes `MOBILE-baseline.md` and **exits
non-zero** on a broken rule. It is the last step of `npm run verify`, and CI installs Chromium first.
**787 tests**, 11 viewports × 3 screens = **33 measurements**.

**The rules live in `tools/layoutGate.ts`, as a pure function of measurements.** That is what lets
`tests/core/layoutGate.test.ts` check all four assertions — and the things that are deliberately not
asserted — without launching a browser. A gate whose rules can only be checked by running a browser is
a gate nobody checks the rules of, which is how "the gate exists" stays a claim long after it lands.

**The four assertions are the plan's, not mine.** Board inside the viewport; `scrollWidth <=
clientWidth`; no interactive target under 44px; board at least 199px tall. That last number is
**derived, not chosen**: `METRICS.cellSize` is 115px in a 520px board, so a board square is
`size / 520 * 115`, and 199 is the size at which a square reaches the same 44px minimum every other
target is held to. A board can be fully visible, free of overflow and free of small controls while
being too small to play, and that number exists for exactly that case.

**A gate that passes on a _missing_ measurement is not a gate.** `unmeasured()` fails when the harness
did not produce a report for one of the three screens. Renaming a button the harness clicks makes
**33 failures**, not zero — "not checked" is not "nothing wrong".

**Three limitations are reported and do not fail**, each labelled with its viewport so two notes about
two sizes are two lines a reader can tell apart:

- **The hand tray is below the fold on every desktop size.** A 560px board plus 398px of chrome is
  958px, so a 720px window cannot show both. It has always been this way, §7 says desktop is
  unchanged, and none of the four assertions cover it. **This is a measurement of a known limitation,
  not a statement that the desktop layout is verified good.** Making the board height-aware on
  desktop is a real fix and a separate decision; the arithmetic is in `KNOWN_LIMITATIONS`.
- **Board squares are 36px at 812×320**, under the 44px floor. Reaching 199 needs 35 more pixels, and
  the only places they exist are the navigation buttons (50, which means putting Collection and
  How-to-play in the settings menu — declined four times) or the hint row (18, which brings back the
  board jumping under the player's finger). The floor drops to 160 **for viewports under 544px tall
  and only those**, so a further 5% shrink still fails.

**The plan does not assert page height anywhere, deliberately.** The collection and rules screens
_must_ scroll; a game with a deck, a catalogue and 3000px of rules cannot be laid out to fit a phone,
and a rule demanding it would be demanding they not exist.

**CI:** `npx playwright install --with-deps chromium` before `verify`. `--with-deps` matters — without
the shared libraries Chromium fails to launch and the gate reports an error rather than a layout
failure, which is exactly the wrong thing to be loud about. The job timeout went 15 → 20 minutes for
the install plus 33 page loads; a gate that times out teaches people to re-run it, and a re-run that
passes teaches them the timeout was noise.

**Verified by mutation, six of six.** `.mode-button` leaving the 44px floor (33 failures); the
collection panel sized `100vw` (18); the landscape `aspect-ratio` backstop removed (an overlap);
the board's `max-width` cut to 120px (the floor); the landscape board budget removed (the floor);
and a button the harness needs renamed (33 — the missing-measurement rule).

**The mutation run found the gate was not running at all.** Five of the first six mutations "passed".
`tools/viewport.ts` serves `dist/`, and running it directly does not rebuild — so it measured a bundle
that had never been built from the mutations. `npm run viewport` and `npm run layout` build first,
which is why it only ever happens when the script is invoked directly, which is exactly when you are
debugging it. **`refuseStaleBuild()` now exits 1 when `dist/` is older than `src/`**, and it fired on
the very next run.

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
