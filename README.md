# Tetra Master

An HTML5/TypeScript clone of the **Tetra Master** card game from _Final Fantasy IX_ (PS1, 2000).

Two players each place five cards on a 4×4 grid. Arrows capture for free, stats battle, and the card
you _lose_ in a battle drags its neighbours down with it. The original shipped almost no instructions;
this version shows you the rules, your exact stats, and your odds before every fight.

Zero runtime dependencies. All card art is procedurally generated and all audio is synthesised — no
asset from the original game is present in this repository.

```bash
npm install
npm run dev      # http://localhost:8080
```

Requires Node 22+ (developed on Node 26).

## Playing it

Pick a mode from the bar at the top, then play the board.

| Mode                  | What it is                                                      |
| --------------------- | --------------------------------------------------------------- |
| **Match**             | One match against a named opponent, drawn from a roster of ten. |
| **Master Tournament** | Your saved deck against one built specifically to counter it.   |
| **Hotseat**           | Two players, one board, alternating. No computer involved.      |

Every card you hold shows its **arrow pattern** — the actual directions it points — because that is
the thing that decides where to play it. The board draws the same pattern, from the same code.

**Controls** — every action has a key, and all but one has a way to do it without one. The table used
to list bindings alone, which made a game that plays perfectly well on a phone look as though it
needed a keyboard.

| Action                                | Touch                                  | Mouse        | Key                      |
| ------------------------------------- | -------------------------------------- | ------------ | ------------------------ |
| Move the board cursor                 | The highlight follows your finger      | Move         | `W` `A` `S` `D` / arrows |
| Pick a card from your hand            | Tap it                                 | Click it     | `1` – `5`                |
| Play the selected card here           | Tap the square, or drop the card on it | Click it     | `Enter` / `Space`        |
| Choose the highlighted pending battle | Tap the card                           | Click it     | `Q`                      |
| Deselect                              | Drop the card away from the board      | Drop it away | `Esc`                    |
| Hint for this square                  | —                                      | —            | `H`                      |
| New match                             | **Play again** on the result           | Click it     | `N`                      |
| Next mode                             | The mode buttons                       | Click it     | `M`                      |
| Collection and deck editor            | **Collection (C)**                     | Click it     | `C`                      |
| How to play                           | **How to play (R)**                    | Click it     | `R`                      |

**`H` has no touch route, and that is deliberate.** It explains what playing a square would do, and
there is no gesture for "tell me something" — a square that reported on tap would fire on every tap.
So _asking what a square does_ is unavailable on a phone; that is a real gap and `STATUS.md` lists it.
The hint line itself still works without a key: it carries why a mode was refused, and what your cards
grew into after a match.

**"Move the board cursor" is not quite the same action by touch.** With a key it is a cursor you can
walk around and inspect. With a finger it is the highlight following wherever you drag, which is
enough to see what a square would do while choosing, and there is no way to idle the cursor on one
square without committing to something.

**Dragging is optional.** Tap a card, tap a square — that path is unchanged and fully supported.
Dragging is an addition for the case where reaching across the screen with two taps is awkward, and it
only begins after the finger has travelled 10px, so a tap with a shaky thumb is still a tap.

**On a phone.** The board sizes itself to the space available, and **every control is at least
44×44px** — asserted, not intended: the layout gate checks eleven device sizes from 320×568 up to a
1440×900 desktop, in portrait and in landscape, on all three screens. Turn the phone sideways and the
board and hand tray sit side by side, because vertical space is what a landscape phone does not have.
Orientation is not locked; rotating mid-match keeps the board where it was and the game playable.

Three things the gate reports rather than claims are perfect: the hand tray needs a scroll to reach on
a 720px-tall desktop window, board squares are 36px on a 320px-tall viewport with a keyboard open, and
a 320×568 phone is 6px too tall. `MOBILE.md` has the arithmetic for each.

## The rules in one screen

The full rules are in-game under **How to play** (`R`). The short version:

- Each player brings five cards. Ten are played in total, then the board is scored by count.
- **Only the card you just placed attacks.** Everything already on the board is holding its arrows up
  as a defence. An arrow already pointing at you is _not_ a threat — this is the single most
  commonly misunderstood rule in the game.
- An arrow into a card that does not point back **takes it for free**.
- An arrow into a card that points back is a **battle**. The attacker's _type alone_ picks both stats:
  `P` reads P-defence, `M` reads M-defence, `X` reads whichever defence is weaker, and `A` attacks with
  its highest stat against the opponent's lowest — attack included. Both sides roll inside their band
  and the higher total wins. **Ties go to the defender**, so two identical cards do not fight evenly.
- When a card loses, **its arrows fire too**, so a loser can take its own neighbours on the way down.
  Your own cards are skipped silently. If several cards fight you, you choose the order.
- After a match you **won**, each card you played gets +1 to one of its three stats, chosen at random.
  The choice ignores the caps, so a roll against a maxed stat is **lost** — faithful, and
  deliberately frustrating. Separately, winning any single battle rolls for a type change:
  `P`/`M` → `X` at 1 in 32, `X` → `A` at 1 in 256.
- **Collector level** comes from your collection, not your record: +10 per unique figure, +5 per unique
  arrow pattern, +1 for `X`, +2 for `A`. Duplicates are worth nothing. At 1700 points the original's
  famous `Would you like to discard?` glitch is reproduced.

A stat is a **band, not a number**: index `4` means 64–79, rolled at the moment of the battle. That is
why a strong card still loses, and why the exact odds are shown before every fight.

## How this is tested

Coverage percentage is a weak signal — an engine can execute every branch and still implement a rule
backwards. So correctness is pinned three ways, and `npm run verify` runs all of them:

1. **Rule traceability (primary).** Every rule paragraph in `PLAN.md` §1 must be claimed by a test that
   names it: `it('[§1.7] no second-degree combo', ...)`. `npm run rules:audit` parses the §1 headings
   out of `PLAN.md` and fails if any is untested. Currently **9 traced · 0 pending · 0 untested**.
2. **Coverage floors** per directory, enforced _per file_ (`src/core`, `src/game` ≥ 95% lines / 90%
   branches). These catch newly-untested code; they are not the definition of done.
3. **Invariants under simulation** — 10,000 headless matches asserting the ten-card invariant, score
   totals, exactly one game-over, no illegal placements, and the perfect-game precondition.

Plus three gates added late, all of which exist because a requirement nobody checks is a requirement
that quietly stops being true:

- **`npm run balance`** — every opponent must beat a random-move baseline by a real margin, turn order
  must not be structurally decisive, and the Master Tournament counter must actually be better against
  your deck than your own cards would be.
- **`npm run perf`** — the renderer's per-frame work and the AI's per-decision cost, gated on **p95**
  rather than the median, and the animator queue depth bounded over whole matches.
- **`npm run layout`** — a real browser, eleven device sizes and **all three screens** (board,
  collection, rules): the board inside the viewport, no sideways overflow, no interactive target under
  44px, and a board big enough for its squares to be tappable. The last of those is _derived_ from the
  44px figure rather than picked, and it fails if a screen cannot be measured at all — a gate that
  passes on a missing measurement is not a gate. Three known limitations are reported rather than
  hidden; `MOBILE.md` carries each with its arithmetic.

`npm run touch` is not in `verify` — it needs a browser and a built bundle, so it is run deliberately
rather than on every commit.

What is deliberately _not_ tested: pixel output, audio, animation timing, and game feel.

## Architecture

Four layers, dependencies pointing downward only.

```
src/ui/  src/render/  src/audio/  src/input/    presentation — DOM, Canvas, WebAudio
      ↓
src/game/                          everything that outlives a match: collection, deck, save, modes
      ↓
src/ai/                            opponent brain and the tournament counter — pure functions
      ↓
src/core/                          rules engine — pure, deterministic, DOM-free
```

`src/data/` sits between `core` and `game`: the card catalog is imported by both the engine's tests and
the progression rules, which is why `src/game/` exists at all — putting §1.8 in `core` would make the
dependency graph cyclic.

`src/core` and `src/ai` import nothing browser-specific, so they run under Vitest's Node environment and
inside the headless simulator with no DOM shim. ESLint guards enforce this, and another bans
`Math.random()` outside the seeded RNG.

The engine is a pure reducer — `applyAction(state, action) → { state, events }` — and the renderer
consumes the event log. That is what makes the rules testable without rendering anything, and what lets
§1.8 read a finished match back to work out which cards were used.

## Extending it

- **Add a card figure:** append to `FIGURE_TABLE` in `src/data/cards.ts` (name, stat range, caps, base
  type, tier, family) and give it an arrow mask in `src/data/arrowSets.ts`. `tests/core/data.test.ts`
  validates the catalog's shape.
- **Add an opponent:** append to `PERSONALITIES` in `src/ai/personalities.ts` with a weight vector.
  The weights are the whole personality — a greedy one raises `capture`, a patient one raises
  `quarantine` — so no new logic is needed. `tools/balance.ts` then measures the new opponent.
- **Add a mode:** append to `MODES` in `src/game/modes.ts`. A mode states only which seats the computer
  plays and how each deck is built; everything else is the same controller over the same engine, so no
  rule test becomes conditional on the mode.
- **Change a rule:** edit `PLAN.md` §1 first, then the code, then add a `[§n.m]`-tagged test.
  `rules:audit` will hold you to it, and the in-game rules screen has a test asserting its sections
  match the plan's headings, so the documentation cannot fall behind either.

## Commands

| Command               | Purpose                                                                      |
| --------------------- | ---------------------------------------------------------------------------- |
| `npm run dev`         | Vite dev server with HMR on port 8080                                        |
| `npm run build`       | Typecheck, then production build to `dist/`                                  |
| `npm test`            | Unit tests (Vitest) — the fast inner loop                                    |
| `npm run typecheck`   | `tsc --noEmit`, strict                                                       |
| `npm run lint`        | ESLint, including the architecture guards                                    |
| `npm run format`      | Prettier, in place. `format:check` is the CI form                            |
| `npm run coverage`    | Tests + v8 coverage against the thresholds in `PLAN.md` §9.2                 |
| `npm run rules:audit` | Fails if any §1 rule paragraph has no tagged test                            |
| `npm run simulate`    | 10,000 headless matches with invariant assertions                            |
| `npm run balance`     | Opponent strength and tournament-counter checks                              |
| `npm run perf`        | Frame and decision budgets, animator queue bound                             |
| `npm run viewport`    | Measure the layout on 11 devices × 3 screens, and write `MOBILE-baseline.md` |
| `npm run layout`      | The same measurements, asserted — **the gate**, exits non-zero               |
| `npm run touch`       | Drive real touch gestures through a browser (21 checks)                      |
| `npm run verify`      | All of the above, in order — the full gate                                   |

The last three need Playwright's Chromium: `npx playwright install chromium`. CI installs it with
`--with-deps` before the gate runs.

Commit gate: `typecheck` + `lint` + `test`. No skipped tests, no `it.skip` to go green.

## Deliberate differences from the original

Documented rather than silent:

1. **Exact stats and win probability are visible** on every card, before every fight. The original hid
   both, which made it feel arbitrary.
2. **There is a rules screen.** The original shipped none, which is its most-cited flaw.
3. **Battle-target selection is always offered** when several cards are contested. The original let the
   machine choose in some paths.
4. **A new save is seeded with a 12-card starter collection.** Without it a fresh install has an empty
   deck and cannot start. A collection that is _short_ rather than empty is topped up for the same
   reason.
5. **Card names are a project-authored set.** The figures, arrows, stats and rules follow the original;
   the names do not, to keep the catalog thematically coherent and clearly not lifted.
6. **The Master Tournament counter-deck is a weighted greedy pick** from your collection, scored with
   the exact battle maths rather than an approximation.

## Licensing & assets

All card art is **procedurally generated** from figure IDs and all audio is **synthesised** with
WebAudio. No artwork, sprites, sounds, or other assets are extracted from _Final Fantasy IX_. This is an
unofficial fan project; _Final Fantasy IX_ is © Square Enix.

Card rules were reverse-engineered from publicly documented sources, chiefly Trifthen's GameFAQs
research document (2000–2001), cross-checked against xvw.lol and the Caves of Narshe guides.
