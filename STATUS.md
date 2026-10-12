# STATUS — Tetra Master Clone

> **Working log.** `PLAN.md` is the spec; this file is the live state.
> A fresh session should be able to continue from these two files alone.
>
> **Last updated:** 2026-10-12 · **Session count:** 35 · **Current stage:** `MOBILE.md` complete — M0–M10 all done

---

## How to resume

1. Read `PLAN.md` §1 (rules) and §6 (stage plan) — the code must match them.
2. Read `PLAN.md` §9 (test strategy & coverage) — the gates you must pass.
3. Read **Current Focus** and **Next Actions** below.
4. Read **Decisions** and **Open Questions** — do not re-litigate settled questions.
5. Skim the last 2–3 entries in **Session Log** for context that isn't in the plan.
6. Check `git status` and `git log --oneline -10` to see if work is uncommitted.
7. Do the Next Actions. Update this file **in the same commit** as the code.

**Commands**

| Command               | Purpose                                                    |
| --------------------- | ---------------------------------------------------------- |
| `npm run dev`         | Vite dev server, http://localhost:8080, HMR                |
| `npm test`            | Unit tests (Vitest). Fast inner loop; commit gate.         |
| `npm run typecheck`   | `tsc --noEmit`, strict                                     |
| `npm run lint`        | ESLint + typescript-eslint, incl. architecture rules       |
| `npm run coverage`    | Vitest with v8 coverage against the §9.2 thresholds        |
| `npm run rules:audit` | Fails if any §1 rule paragraph has no tagged test          |
| `npm run balance`     | Opponent strength and tournament-counter checks            |
| `npm run perf`        | Frame and decision budgets, animator queue bound           |
| `npm run viewport`    | Measure 11 devices × 3 screens, write `MOBILE-baseline.md` |
| `npm run layout`      | The same, asserted — the gate. Needs Chromium              |
| `npm run touch`       | Real touch gestures through a browser (21 checks)          |
| `npm run build`       | Production `dist/`                                         |
| `npm run verify`      | Everything, in order — the full gate                       |

**Browser gates need `npx playwright install chromium` first.** CI runs
`--with-deps`; without the shared libraries Chromium will not launch and the gate reports an error
instead of a layout failure.

**Commit gate:** `typecheck` + `lint` + `test` green. No skipped tests, no `it.skip` to go green.

---

## Stage Progress

| Stage | Name                                  | Status  | DoD met | Notes                              |
| ----- | ------------------------------------- | ------- | ------- | ---------------------------------- |
| 0     | Scaffold                              | ✅ Done | ✅      | toolchain green; `verify` exit 0   |
| 1     | Grid geometry & stats                 | ✅ Done | ✅      | 72 tests; §1.2 + §1.3 traced       |
| 2     | Card catalog                          | ✅ Done | ✅      | 103 tests; 100 figures             |
| 3     | Resolution engine (takedown + combos) | ✅ Done | ✅      | 144 tests; §1.4/§1.5/§1.7 traced   |
| 4     | Battle math + multi-battle chains     | ✅ Done | ✅      | 163 tests; §1.6 traced             |
| 5     | Match state machine                   | ✅ Done | ✅      | 201 tests; §1.1 traced             |
| 6     | Rendering                             | ✅ Done | ✅      | 248 tests; board on screen         |
| 7     | Playable match UI                     | ✅ Done | ✅      | mouse + keyboard match             |
| 8     | Opponent AI                           | ✅ Done | ✅      | 10 NPCs; beats random by 12-18     |
| 9     | Progression, collection, save         | ✅ Done | ✅      | 468 tests; **all §1 traced**       |
| 10    | Modes & polish                        | ✅ Done | ✅      | 3 modes, rules screen, audio, a11y |
| 11    | Hardening & docs                      | ✅ Done | ✅      | README, CI, layout gate            |

### Mobile stages (`MOBILE.md`)

| Stage | Name                             | Status | DoD met | Notes                                            |
| ----- | -------------------------------- | ------ | ------- | ------------------------------------------------ |
| M0    | Measure before changing anything | ✅     | ✅      | Playwright, 11-device harness, report-only       |
| M1    | CSS owns the board's size        | ✅     | ✅      | `MIN_VIEWPORT` and `260` deleted                 |
| M2    | Viewport & document work         | ✅     | ✅      | overlap detection; a `96vw` overflow fixed       |
| M3    | Narrow-screen layout             | ✅     | ✅      | every portrait phone from 320px fits             |
| M4    | Toolbar → Settings disclosure    | ✅     | ✅      | §5.4 settled by arithmetic                       |
| M5    | 44px touch targets + hygiene     | ✅     | ✅      | floor applied at desktop too; probe checks style |
| M6    | Drag to place                    | ✅     | ✅      | pure reducer; tap-tap provably untouched         |
| M7    | Landscape                        | ✅     | ✅      | board + tray side by side                        |
| M7a   | The panels the grid never placed | ✅     | ✅      | found from a screenshot; guard added             |
| M8    | Collection & rules on a phone    | ✅     | ✅      | harness now opens all three screens              |
| M9    | Layout gate green, in CI         | ✅     | ✅      | 33 measurements; fails on unmeasured screens     |
| M10   | Documentation                    | ✅     | ✅      | touch column, §7.4b deviation note               |

Legend: ⬜ not started · 🟡 in progress · ✅ done · ⛔ blocked · 🔒 waiting on earlier stage

### Gate status (last run 2026-10-12 — all green)

| Gate                  | Result                                                                      |
| --------------------- | --------------------------------------------------------------------------- |
| `npm run typecheck`   | ✅ pass                                                                     |
| `npm run lint`        | ✅ pass — architecture guards verified to actually fire                     |
| `npm test`            | ✅ **787 tests** across the node and jsdom projects                         |
| `npm run coverage`    | ✅ pass — 90.9% stmts / 83.1% branch / 92.0% funcs / 92.5% lines            |
| `npm run rules:audit` | ✅ pass — **9 traced · 0 pending · 0 untested**                             |
| `npm run simulate`    | ✅ pass — all invariants held across 10,000 matches                         |
| `npm run balance`     | ✅ pass — opening player wins 41.9%; counter better in 100% of 120 decks    |
| `npm run perf`        | ✅ pass — animator frame p95 0.0004ms / 4ms; `ai.decide` p95 0.0323ms / 8ms |
| `npm run layout`      | ✅ pass — 11 viewports × 3 screens, **33 measurements**, 3 noted limits     |
| `npm run build`       | ✅ pass — `dist/` produced                                                  |

`npm run touch` (21 checks, real touch through CDP) is run deliberately rather than on every commit;
it needs a browser and a built bundle, and `npm run verify` already ends with `npm run layout`.

---

## Current Focus

**`PLAN.md` §6 and `MOBILE.md` are both complete.** `npm run verify` is green from a clean clone, and
the last stage of it is a real browser asserting the layout on eleven device sizes across all three
screens.

**Measured:** 787 tests · 9 traced / 0 pending / 0 untested · 10,000-match invariant sweep holds ·
every AI beats random decisively · the Master Tournament counter has a 12.2-point mean advantage and
is better in **100%** of 120 decks · the opening player wins 41.9% of decided matches · perfect games
~17.7% · animator frame p95 **0.0004ms** against a 4ms budget · AI decision p95 **0.0323ms** against
8ms · animator queue depth **18** against a limit of 64 · layout gate green across 33 measurements.

**Three limitations the gate reports and does not fail**, each carried in `tools/layoutGate.ts` with
its arithmetic:

- The **hand tray is below the fold on every desktop size** (560px board + 398px chrome in a 720px
  window). Pre-existing; `PLAN.md` §7 keeps desktop unchanged. Making the board height-aware there is
  a real fix and a separate decision.
- **Board squares are 36px at 812×320**, under the 44px floor. Closing the gap needs the navigation
  buttons in the settings menu or the hint row gone.
- **320×568 portrait is 6px too tall**, on the oldest device in the matrix and below this project's
  own 360×640 target.

## Next Actions

Nothing is required. If the project continues, in rough order of value:

- [ ] **Play it on a real phone.** The standing DoD gap, and now the only one. Everything above was
      verified in Node, jsdom and a desktop Chromium emulating a phone; nobody has held this on glass.
      The drag gesture in particular is the one thing emulated touch is least like a finger.
- [ ] **Make the board height-aware on desktop**, so the hand tray is above the fold on a 720px window.
      Tracked as a known limitation by the layout gate rather than fixed, because `PLAN.md` §7 keeps
      desktop unchanged and that is a separate decision.
- [ ] **Fix the copy.** The status line says "Click a square to play" on a phone, and the hint block
      below the tray is keyboard help shown on devices with no keyboard. Both surfaced during the
      mobile stages; neither is a layout fault, so the layout gate cannot see them.
- [ ] **Give `H` a touch route**, or accept that asking what a square would do is unavailable on a
      phone. It was deliberately left off the touch list in M10 — a square that reported on tap would
      fire on every tap — but _deliberate_ is not the same as _finished_.
- [ ] Optional: FF9's per-match card _sale_ economy, which is the main progression loop still missing
- [ ] Optional: an opponent roster from the real game rather than the project-authored set
- [ ] Optional: replay/export of a finished match from its event log — §3.2 already keeps the log

## Blocked On

Nothing.

Nothing. Stage 11 depends only on Stages 1–10.

Nothing. Stage 10 depends only on Stages 1–9.

## Lessons worth keeping

### From Stage 11

- **A documented key did nothing, and nothing noticed.** `KEY_BINDINGS` listed eight keys; the
  handler in `main.ts` implemented seven. `Q` was advertised on the page and did nothing, and it took
  until the README was being rewritten to surface. A documented binding was just a string in an array,
  so there was nothing to fail. The list and the handler are now one thing in `src/input/keys.ts`, each
  entry names an action, and a test asserts both directions of the agreement.
- **The performance requirement is now a gate, not a number.** `PLAN.md` asked for a board render
  under 4ms a frame. There was nothing measuring it. `tools/perf.ts` now gates on **p95** rather than
  the median — a frame that is slow one time in twenty is exactly the one a player feels — and it
  measures the animator's frame work and the AI's decision, deliberately _not_ drawing, because timing
  a canvas stub would report the stub's speed and look like a measurement.
- **The animator queue needed a getter to be checkable.** "It does not grow without bound" is not a
  claim anyone can verify, so `Animator.queueDepth` now exists and the bound is asserted over whole
  matches — a synthetic burst cannot catch a queue that only runs away on a rare cascade.

### From Stage 10

- **A mutation that never applied is worse than no mutation.** Prettier had reformatted the line I
  was patching, so my "short player deck is not topped up" mutation was a silent no-op and the test
  suite came back green. I nearly recorded that test as worthless when in fact it was fine. **Confirm
  the mutation changed the file before believing a result.** Every other mutation in the batch did
  land, so the habit is worth more than the individual check.
- **The first measurement of the counter-deck said 1.5 points of advantage, and 60%.** That was
  real, and it was also an artefact: I had given the counter a five-card pool to choose from, while
  the mode draws from the player's whole collection. With a realistic collection it is **12.2 points,
  and better in 100% of 120 decks**. A benchmark built on an unrealistic input is not a weak
  benchmark, it is a wrong one.
- **The rules screen is tied to `PLAN.md` by a test.** It asserts the rendered section ids are
  exactly the §1 headings parsed out of the plan. Add a rule to the spec and the screen's test fails
  until it is written up. Documentation that can silently fall behind the implementation is worse
  than none, because it is confidently wrong.

### From Stage 9

- **The "append-only log for replay" could not actually be replayed.** `place`, `turn` and
  `game-over` were returned by the reducer but never written to `state.history`, because the
  resolution layer appended its own events and nothing else did. §1.8 needs to know which cards were
  used and how many battles each won, and that lives only in the log. `applyAction` is now the single
  place history is written — but an illegal action still returns the _identical_ state object, so
  "nothing happened" stays detectable by identity.
- **Two mutations survived my first attempt at testing battle credit.** Crediting the loser instead
  of the winner, and ignoring defensive wins entirely, both passed — because every test happened to
  run on matches where the player only ever attacked. Those rules are now stated on synthetic
  histories built from a board I control, which is the only way to test a case real play rarely
  produces.
- **A migrated save could leave the game unplayable.** A v1 save holding one card loaded perfectly
  fine and then handed the engine a one-card deck. The starter grant now tops a short collection up
  rather than only filling an empty one.

### From Stage 8

- **My balance harness was wrong twice before the AI was.** First it confined the AI to the `player`
  seat, which loses ~39% of matches; then it reported `win / decided` straight from the outcome, so
  a strong AI playing the `ai` seat registered as _losing_. Both times the AI looked mediocre and I
  nearly "fixed" a healthy evaluation. Instrument first, then judge.
- **The AI had a rule error, not a tuning error.** Its risk term counted enemy arrows already aimed
  at a square — but §1.4 says only the just-placed card attacks, so those arrows can never do
  anything. The AI was fleeing a threat that does not exist, and the penalty outweighed a capture,
  so it played a passive game and lost to random. Correcting the _model_ fixed it; the reweighting I
  tried first had done nothing.

## Note on the busy guard — now live

`MatchController.dispatch()` refuses actions while the board is animating. As of Stage 8 that guard
is genuinely reachable: the opponent drives `submitExternal()` without holding a selected card, and
`main.ts` also gates it behind `thinking` so the AI takes exactly one decision per turn rather than
a burst of them as the animation settles. The guard stays.

## Balance Note for Stage 8

A side observation from that stage's sweeps, recorded so it is not rediscovered later:

- Matched decks, both sides playing the same policy, give a near-even split (39.9% / 38.5%), so
  **turn order carries no positional bias**. Good.
- **Clustering cards raises the perfect-game rate roughly 1.7x** (10.0% vs 5.9% for a corner-greedy
  policy). This is a genuine strategic property — dense adjacency maximises combo cascades — and
  matches the community advice to avoid bunching up. Not a bug, and `balance.ts` checks the AI does
  not fall into it.

## Decisions

Settled. Do not revisit without a strong reason; if you do, log it here with the new date.

| Date       | Decision                                                                                                | Rationale                                                                                                                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-10-10 | **TypeScript + Vite** (switched from vanilla ES modules)                                                | Type safety is the main defence for a rules engine this branch-heavy; Vite gives HMR and a real production build                                                                                                         |
| 2026-10-10 | `strict` + `noUncheckedIndexedAccess`, `any` banned                                                     | The grid is `Cell[]` indexed 0–15; the flag forces honest handling of out-of-range and undefined                                                                                                                         |
| 2026-10-10 | **Vitest**, replacing `node:test`                                                                       | Shares Vite's transform pipeline, one config for tests and coverage, native ESM                                                                                                                                          |
| 2026-10-10 | Two Vitest projects: `node` env for core/ai, `jsdom` for ui                                             | Keeps the DOM-free guarantee of `core`/`ai` mechanically enforced                                                                                                                                                        |
| 2026-10-10 | Coverage is three signals, not one number: rule traceability + gated coverage % + simulation invariants | Line coverage can't tell you a rule is inverted; traceability is the real bar (`PLAN.md` §9)                                                                                                                             |
| 2026-10-10 | Tests tagged `[§1.6]`-style; `rules:audit` fails CI if a §1 paragraph is untested                       | Makes "is this rule covered?" a build failure instead of a review comment                                                                                                                                                |
| 2026-10-10 | `src/core`/`src/ai` coverage ≥ 95% lines / 90% branches; UI/render ≥ 60%                                | Floors to catch new untested code; not the definition of done                                                                                                                                                            |
| 2026-10-10 | Zero **runtime** dependencies; devDependencies expected                                                 | Nothing ships to the browser from `node_modules`                                                                                                                                                                         |
| 2026-10-10 | All randomness via injectable seeded RNG; no `Math.random()` in `core`/`ai`                             | Battle outcomes are ~random by design; determinism is what makes §1 testable                                                                                                                                             |
| 2026-10-10 | `src/core/` and `src/ai/` must be DOM-free                                                              | Lets the rules engine run headless for the 10k-match verification                                                                                                                                                        |
| 2026-10-10 | Engine as a pure reducer returning an event log; renderer consumes events                               | Testable rules, animatable presentation, no coupling                                                                                                                                                                     |
| 2026-10-10 | Rules sourced from Trifthen's GameFAQs doc (2000/2001), cross-checked vs. xvw.lol and Caves of Narshe   | The three sources agree; the original in-game rules are undocumentable                                                                                                                                                   |
| 2026-10-10 | Show exact stats and win probability in the UI                                                          | Deliberate deviation from the original, which hid this information — see `PLAN.md` §7.4                                                                                                                                  |
| 2026-10-10 | Card art and audio are 100% procedural                                                                  | No copyrighted FF9 assets may enter the repo                                                                                                                                                                             |
| 2026-10-10 | Include a player-facing rules screen                                                                    | The original shipped none, which is the game's single most-cited flaw                                                                                                                                                    |
| 2026-10-10 | **All 8 open questions resolved to their defaults**                                                     | User sign-off, 2026-10-10. Defaults are recorded per-question below                                                                                                                                                      |
| 2026-10-10 | `rules:audit` tracks **PENDING** rules by stage instead of failing on every untested rule               | An always-red gate gets ignored. Implementing a rule means deleting its `PENDING` entry, which is what makes the test mandatory. Verified: removing an entry without a test makes the tool exit 1                        |
| 2026-10-10 | `src/core` coverage enforced **per file** (95/90/95), not just in aggregate                             | Subsumes the plan's "five hardest files" clause without special-casing filenames                                                                                                                                         |
| 2026-10-10 | Node 26 runs `.ts` directly; no `tsx` dependency                                                        | `node tools/rules-audit.ts` works natively under type stripping                                                                                                                                                          |
| 2026-10-10 | **A third layer, `src/game/`**, above `core` and `data`, holding everything that outlives a match       | `progression` needs the figure catalog for stat caps and `data/` already imports `core/`, so the plan's placement in `core/` would have made the graph cyclic. Order is now core → data → game → ui. See `PLAN.md` §7.4a |
| 2026-10-10 | `applyAction` is the **single writer of `state.history`**                                               | The resolution layer used to append its own events, which silently left `place`/`turn`/`game-over` out of a log `PLAN.md` §3.2 promises is replayable. An illegal action still returns the identical state object        |
| 2026-10-10 | A new save is seeded with a 12-card starter collection, and a _short_ collection is topped up           | Without it a fresh install cannot start, and a migrated v1 save can load fine and still leave the engine with fewer than five cards                                                                                      |

## Open Questions

**None.** All eight were resolved to their stated defaults on 2026-10-10. If a rule turns out
wrong during implementation, change `PLAN.md` §1 and log it here — don't silently diverge.

| #   | Question                            | Resolution                                                             |
| --- | ----------------------------------- | ---------------------------------------------------------------------- |
| Q1  | Battle tie (both actuals equal)     | **Defender wins** — defender has initiative. Implement in Stage 4      |
| Q2  | Stat growth: win-only or any match? | **Win only**, per §1.8. Stage 9                                        |
| Q3  | Blocked-cell count distribution     | **Uniform 0–6**. Stage 5                                               |
| Q4  | Blocked cells shared or per-player? | **Shared** (one symmetric board). Stage 5                              |
| Q5  | Coin flip revealed when?            | **Before the match starts, shown in the UI**. Stage 5                  |
| Q6  | Card acquisition stat roll range    | **Full interval per §1.3** (`[16n, 16n+15]`, n ≤ cap). Stage 2         |
| Q7  | Combos capturing your own cards     | **Skip silently** — no event, no flip. Stage 3                         |
| Q8  | Master Tournament counter-deck      | **Weighted counter-deck** drawn from the player's collection. Stage 10 |

## Deviations from Plan

1. **Coverage waiver — `src/main.ts` excluded from coverage** (`vite.config.ts`).
   The plan listed a 50% threshold for it; it sits at 0% because nothing imports it, which would
   have kept `npm run coverage` red for every stage. Its real behaviour is "does the game boot",
   which is covered instead by `tests/ui/boot.test.ts` (jsdom) plus `npm run build` and manual
   play. Noted per `PLAN.md` §9.2, which requires waivers to be recorded here.
2. **Core coverage is per-file, not aggregate.** `PLAN.md` §9.2 asked for 95/90 aggregate on
   `src/core/**` plus a 95/90 individual floor on five named files. Enforcing per-file across
   `src/core/**` is strictly stronger and needs no filename list to maintain.
3. **`rules:audit` gained the `PENDING` manifest and a `--strict` flag** (not in the original §9.2
   text, which described a simpler all-or-nothing check). Rationale and verification above.
4. **Vitest project config lives in `vite.config.ts`** via `test.projects`. The plan's file layout
   listed a separate `vitest.workspace.ts`; the workspace file is deprecated in Vitest 5 and two
   config files invite drift, so the Vitest block is colocated with the Vite config.
5. **`GameState` omits the persistent card collection.** `PLAN.md` §3.1 sketched an `owned` array on
   each player; the collection is global meta state (Stage 9), and keeping it out of match state
   makes a match cheap to serialise and saves independently. `PlayerState` carries only `deck` and
   `hand`.
6. **`isValidStatIndex` returns `boolean`, not `index is StatIndex`.** `StatIndex` is an alias for
   `number`, so the type predicate narrowed the negative branch to `never` and made the error
   message untypeable. A no-op predicate buys nothing and costs clarity.
7. **`Family` gained a `'dragon'` member** in Stage 2, for the late-game figures. The plan listed
   the union without enumerating it; the catalog chose the members.
8. **Stage 9's modules live in `src/game/`, not `src/core/`.** `progression.ts`, `collector.ts` and
   `save.ts` moved out, plus two new files (`report.ts`, `profile.ts`). See `PLAN.md` §7.4a for the
   dependency argument. `DECK_SIZE` moved to `src/core/constants.ts` because both layers need it.
9. **The `place` event gained a `cardIndex` field** in Stage 9. Without it the log cannot say _which_
   card was played, which §1.8 growth depends on. It indexes the hand as it was at that moment, not a
   deck position, because the hand shrinks as cards are played.

## Corrections to the Plan

Found while implementing, fixed in `PLAN.md` in the same commit:

1. **The win-probability formula was wrong.** The plan asserted `P(win) = (a+1)/(a+b+2)`, carried
   over from a community write-up that describes it as an approximation. It ignores ties, which the
   Q1 resolution gives to the defender: it predicts `P(0,0) = 0.5` where the attacker actually loses
   every time, and is off by up to 50 percentage points. Replaced with the exact count of
   favourable `(A, D)` pairs and pinned by a brute-force enumeration test. See `PLAN.md` §1.6.
2. **The grid edge count was wrong.** The plan said 48 on-grid adjacencies; the correct figure for a
   4×4 board with eight directions is **84 directed (42 undirected)**, plus 44 off-grid steps.
   Corrected in `PLAN.md` §6 and here.
3. **The event log did not contain the whole match.** `PLAN.md` §3.2 describes `history` as an
   append-only log for replay, but `place`, `turn` and `game-over` were only ever returned from
   `applyAction`, never written to state — so nothing could be replayed. Fixed in Stage 9 by making
   `applyAction` the one writer. The plan's description was right; the code was not.
4. **`prefers-reduced-motion` was implemented but never read.** The `Animator` had taken a
   `reduceMotion` option since Stage 6 and nothing ever passed it, so the accessibility requirement
   existed in the API and nowhere else. Stage 10 wires it to a live watch, not a one-time read, since
   the setting can change while the page is open.

## Known Issues

None. No known failures, flakes, or performance problems.

---

## Session Log

Append-only. Newest at the **bottom**. Keep each entry short — details belong in the code and tests.

### Template

```
### S<n> — YYYY-MM-DD — <one-line outcome>
**Stage:** <n> (<name>) · **Status:** ⬜→🟡→✅
**Did:** <what actually landed, with file paths>
**Decisions:** <anything settled here that isn't already in Decisions — or "none">
**Learned:** <non-obvious facts, gotchas, corrections to assumptions>
**Next:** <what the next session should do first>
**Files touched:** <key paths, especially ones a human should review>
```

---

### S1 — 2026-10-10 — Research complete, plan written, empty repo

**Stage:** 0 (Scaffold) · **Status:** ⬜ Not started
**Did:** Confirmed the repo was empty (no code, no config, only `.git`). Researched the real FF9
Tetra Master rules from three independent sources and wrote them up normatively in `PLAN.md` §1,
covering: 4x4 board with 0–6 random blocked cells; hex-interval stats; the four card types and how
each selects attacker/defender stats; the two-roll battle math (`actual = base − roll`, with
`P(win) = (a+1)/(a+b+2)`); arrow takedown vs. card battle; the combo rules (battle-only, no
recursion, no second degree); multi-battle chains and player-chosen order; stat growth on win with
deliberately wasted rolls; type evolution at 1/32 and 1/256 per battle won; collector-level scoring
with the 1700-point "Would you like to discard?" glitch. Wrote an 11-stage plan with a DoD per
stage, a three-layer architecture, full file layout, module contracts, and the resolution-cascade
pseudocode. Wrote this log.
**Decisions:** none beyond those already listed — all eight open questions left open deliberately,
each with a default and the stage that needs it.
**Learned:**

- The original game documents almost none of its rules; §1 here is reverse-engineered and is the
  project's contract. Code that disagrees with §1 is a bug.
- Battle outcomes are dominated by two independent uniform rolls, so even a `FAFF` card loses
  battles. Any AI or UI that assumes "higher stat wins" will be wrong.
- Combos only trigger from a **battle**, never from a plain arrow takedown. This is the rule most
  likely to be implemented wrong.
- Once the placed card loses its battle, the chain ends — it does not keep attacking.
- Card stat indices are set **when the card is acquired**, not defined by the figure.
  **Next:** Execute Stage 0 exactly as listed in **Next Actions**.
  **Files touched:** `PLAN.md`, `STATUS.md`

---

### S2 — 2026-10-10 — Switched to TypeScript + Vite; added a real coverage policy

**Stage:** 0 (Scaffold) · **Status:** ⬜ Not started (planning only)
**Did:** Reworked `PLAN.md` for a TS/Vite stack. Replaced the "no build step, vanilla ES modules,
zero deps" constraints with a toolchain section (TS 5 strict + `noUncheckedIndexedAccess`, Vite,
Vitest with `@vitest/coverage-v8`, ESLint + Prettier, zero **runtime** deps). Rewrote `GameState` and
the event log as TypeScript **discriminated unions** (`CardType`, `Phase`, `GameEvent` on `t`), so a
missing case in the resolution cascade or the animator is now a compile error. Converted the file
layout to `.ts`, added `tsconfig.json`, `vite.config.ts`, `eslint.config.js`, and split tests into
`node`/`jsdom` projects. Gave §3.1/§3.2/§5 proper type signatures. Reworked Stage 0 and every stage
that referenced tooling, and added per-stage coverage gates to the DoDs.
**Added §9 "Test Strategy & Coverage"** — the answer to "does the plan specify coverage?" It did not,
previously; it only listed which tests to write. Now coverage is three independent signals:
(1) **rule traceability**, the primary metric — tests are tagged `[§1.6]` and `npm run rules:audit`
fails CI if any §1 paragraph has no test, so adding a rule without a test is a build failure;
(2) **gated line/branch/function coverage** per directory — `core` ≥ 95/90/95, `ai` ≥ 85/80/85,
`data` 100%, `ui`+`render` ≥ 60%, global ≥ 85/80/85, plus a 95/90 floor on the five files holding the
hardest rules; (3) **behavioural invariants** asserted across 10,000 headless matches. Also specified
test types (unit, fixture, property, Monte Carlo, component, static/architecture, and what we
deliberately do _not_ test — pixels, audio, animation timing), and the `verify` gate order.
Resolved all 8 open questions to their defaults per user sign-off; `PLAN.md` §8 and the STATUS tables
now record resolutions rather than deferred defaults.
**Decisions:** TS+Vite over vanilla ESM; Vitest over `node:test`; three-signal coverage policy;
`rules:audit` as a CI gate; all eight questions resolved to defaults.
**Learned:**

- The motivating question revealed a genuine gap: the original plan named tests per stage but set no
  thresholds and had no mechanism to prove a _rule_ was covered. Coverage percentage alone would
  have let an inverted combo cascade pass — an engine can execute every branch and assert nothing.
- TS discriminated unions are unusually well-suited to this project, because the failure mode is
  "forgot a rule branch," which is exactly what exhaustive-switch checking prevents.
- `noUncheckedIndexedAccess` is worth its noise here specifically because the grid is indexed 0–15
  and off-grid edges are where §1.4 bugs would live.
  **Next:** Execute Stage 0 — toolchain config, then `src/core/rng.ts` and `tools/rules-audit.ts`
  (stub early, so §1 stays traceable from the first test onward).
  **Files touched:** `PLAN.md`, `STATUS.md`

---

### S3 — 2026-10-10 — Stage 0 complete: toolchain, RNG, and a gate that actually bites

**Stage:** 0 (Scaffold) · **Status:** ⬜ → ✅
**Did:** Bootstrapped the project. `package.json` with the eight scripts; `tsconfig.json` (strict,
`noUncheckedIndexedAccess`, `erasableSyntaxOnly`, `verbatimModuleSyntax`); `vite.config.ts` with two
Vitest projects and the §9.2 coverage thresholds; `eslint.config.js` with three architecture
guards; Prettier; `index.html` + `src/main.ts` mounting a DPR-aware canvas; `README.md`.
Implemented `src/core/rng.ts` (Mulberry32 with a readable/writable `state`, so a match can be saved
mid-battle) and 18 tests across `tests/core/rng.test.ts` and `tests/ui/boot.test.ts`. Wrote
`tools/rules-audit.ts`, the rule-traceability gate.
**Verified, not assumed:** every gate was actually run — `verify` exits 0; typecheck, lint, 18
tests, coverage, `rules:audit`, `build`, and the dev server (fetched `/` and a transformed `.ts`
module over HTTP). Probed the ESLint guards with deliberate violations to confirm they fire rather
than silently no-op: `Math.random` in `src/core`, and an import from `src/render` into `src/core`,
both error. Probed `rules:audit` the same way by deleting a `PENDING` entry without adding a test —
it correctly exits 1.
**Decisions:** `rules:audit` gained a `PENDING` manifest (rule → stage) and a `--strict` flag; core
coverage enforced per file; `main.ts` waived from coverage; `tsx` dropped since Node 26 strips types
natively. All recorded in Decisions and Deviations.
**Learned:**

- **I nearly shipped a lying gate.** I had tagged the RNG tests `[§1.1]`/`[§1.3]`/`[§1.6]` because the
  RNG feeds those rules — and the audit promptly reported 3/9 rules as traced when none of those
  rules exist yet. That is exactly the false confidence the gate exists to prevent, introduced
  through the gate itself. Retagged them `[rng]`; the honest number at Stage 0 is **0 traced,
  9 pending, 0 untested**.
- An always-red `verify` for eight straight stages would train everyone to ignore the gate, so
  `PENDING` makes unimplemented rules visible without making them failures — and implementing a
  rule is what makes its test mandatory, so the gate tightens as work lands rather than weakening.
- Installed majors were newer than the plan assumed (Vitest 5, Vite 8, TS 6, ESLint 10) and three
  documented options no longer exist: `coverage.all` was removed, `baseUrl` is deprecated in TS 6,
  and `vitest.workspace.ts` is superseded by `test.projects`. Reading the installed type definitions
  beat trusting the plan.
- Vitest's text reporter hides 100%-covered files in project mode; `coverage-final.json` was needed
  to confirm `rng.ts` was genuinely at 100% rather than silently missing from the report.
  **Next:** Stage 1 — `types.ts`, `constants.ts`, `direction.ts`, `card.ts`, and the first two rule
  modules (`battle.ts` stat resolution only). Delete `1.2` and `1.3` from `PENDING` as the tagged
  tests land; that deletion is the entire enforcement mechanism.
  **Files touched:** `package.json`, `tsconfig.json`, `vite.config.ts`, `eslint.config.js`,
  `.prettierrc`, `.prettierignore`, `.gitignore`, `index.html`, `src/main.ts`, `src/core/rng.ts`,
  `tests/setup.ts`, `tests/core/rng.test.ts`, `tests/ui/boot.test.ts`, `tools/rules-audit.ts`,
  `README.md`, `STATUS.md`

> **Committed.** Stage 0 landed as `stage(0): scaffold toolchain, seeded RNG, rules audit gate`.
> Per `PLAN.md` §7.2, every stage ends with a commit — a met DoD with uncommitted work is not a
> finished stage.

---

### S4 — 2026-10-10 — Stage 1 complete; two plan errors caught and fixed

**Stage:** 1 (Grid geometry & stats) · **Status:** ⬜ → ✅
**Did:** Added `src/core/types.ts` (the `Cell` union, `CardType`, `Phase`, and `GameEvent` as an
exhaustive discriminated union), `constants.ts`, `direction.ts`, `card.ts`, and `battle.ts` with
`resolveStats()` / `baseValue()` / `previewOdds()`. Wrote `tests/core/direction.test.ts`,
`card.test.ts`, and `battle.test.ts` — 71 new tests, 72 total. Removed `1.2` and `1.3` from the
`PENDING` manifest, so `rules:audit` now reports **2 traced · 7 pending · 0 untested**.
`src/core/**` is at 100% on every metric.
**Verified, not assumed:** mutation-tested both load-bearing modules. Injecting the classic 1-D
modulo wrap into `neighbor()` fails the 128-case hand-derived table and the no-wrap assertions;
injecting the old wrong probability formula fails the brute-force enumeration. Stripping the
`[§1.3]` tags makes `rules:audit` exit 1, confirming the gate still bites now that the rule is live.
**Decisions:** `GameState` drops the sketched `owned` collection (global meta state, Stage 9);
`isValidStatIndex` returns a plain `boolean`; stat ties break toward the earlier key in
[atk, pdef, mdef], which affects only the displayed label, never the value.
**Learned:**

- **The plan's win-probability formula was wrong.** I had written `P(win) = (a+1)/(a+b+2)` from a
  community source that itself calls it an approximation. Checking it against brute force before
  coding showed it is wrong by up to 50 points: it ignores ties, so it predicts `P(0,0) = 0.5` when
  the attacker loses every such battle, and `P(15,15) = 0.5` when the tie rule makes it 0.46875.
  The exact form counts favourable `(A, D)` pairs: `m = min(a,b)`, `P = ((m+1)a - m(m+1)/2) / ((a+1)(b+1))`.
  Fixed in `PLAN.md` §1.6 with a warning against reinstating the old one. **This is exactly what the
  §1.6 Monte Carlo test planned for Stage 4 would have caught later — it cost nothing to catch it
  now, by checking the arithmetic before writing the module.**
- **The plan's grid edge count was also wrong**: 48 on-grid adjacencies claimed, actual is 84
  directed / 42 undirected, verified as 4 corners × 3 + 8 edges × 5 + 4 interior × 8.
- **Three of my own test expectations were wrong before the code was ever run** — I asserted
  `neighbor(15, N)` was off-grid (cell 15 is on the bottom row, so N is on-grid → 11), and that
  cells 0 and 5 were non-adjacent (5 is exactly cell 0's SE neighbour). The hand-derived adjacency
  table caught both, which is the argument for writing expectations from the layout instead of from
  the implementation.
- `StatIndex` being an alias for `number` makes any `x is StatIndex` type predicate a no-op that
  narrows the negative branch to `never`; it turned an error-message template into a type error.
- The `never` exhaustiveness guard in `resolveStats` is unreachable by construction, which cost
  enough coverage to fail the 95/90 per-file gate. Rather than suppress it with a coverage-ignore
  comment, I tested it through a deliberately corrupt card — a hand-edited or mis-migrated save is a
  real way to reach it, and throwing beats silently comparing the wrong stats.
  **Next:** Stage 2 — the 100-figure catalog in `src/data/`, with `rollInstance()` since stats are
  rolled on acquisition. Note `src/data/**` is gated at 100% coverage, so a single import-and-assert
  test must cover the catalog.
  **Files touched:** `src/core/types.ts`, `constants.ts`, `direction.ts`, `card.ts`, `battle.ts`,
  `tests/core/direction.test.ts`, `card.test.ts`, `battle.test.ts`, `tools/rules-audit.ts`,
  `PLAN.md` (probability formula, edge count, §1.6.2 ties), `STATUS.md`

---

### S5 — 2026-10-10 — Stage 2 complete: 100 playable figures

**Stage:** 2 (Card catalog) · **Status:** ⬜ → ✅
**Did:** `src/data/cards.ts` (100 figures as a compact typed table, expanded into `CardFigure`
objects) and `src/data/arrowSets.ts` (31 hand-authored signature patterns plus five tier-graded
fallback patterns). Added `CardFigure`/`Family`/`Tier` to `core/types.ts` and `rollInstance()` /
`rollDeck()` / `isMaxed()` to `core/card.ts`. Wrote `tests/core/data.test.ts` — 31 tests, 103 total.
`src/data/**` is at **100%** on every metric, as its gate demands.
**Verified, not assumed:** mutation-tested the catalog guards. Making `Goblin`'s signature pattern
collide with `Tonberry`'s fails the uniqueness test. Inspected the built catalog: caps and arrow
density both climb monotonically across tiers (t1 avg caps 5.8 / 2.5 arrows → t5 avg caps 14.2 /
7.2 arrows), 41 of 256 arrow masks are in use, and **Goblin's caps came out `7/9/4`, matching the
researched original exactly** — a useful independent confirmation that the cap ranges are sane.
**Decisions:** figure names are a themed set written for this project, **not** the canonical FF9
card list, which has not been sourced from a reliable reference. Swapping in a sourced list is a
data-only change since `FIGURE_TABLE` is the single source of names. Documented at the top of the
data file. `Family` gained a `'dragon'` member. `base` stats derive from tier via `BASE_SPAN`.
**Learned:**

- **The 100% data gate earned its keep immediately**: it failed on two branches that were genuinely
  dead. `pattern()` had an `ORDER[index] !== undefined` check that could never be false, and
  `cards.ts` had a `?? 0` fallback for an array index that is always in range. Rather than add
  coverage-ignore comments or relax the gate, I removed the dead code — the parser now walks bits by
  index (position `i` _is_ direction `i`, so the lookup was never needed) and tier patterns are a
  5-slot tuple with a literal-union index. **A threshold that fails immediately is better than one
  that never fails**, because it points at real dead code rather than accumulating quietly.
- Writing the arrow patterns as 8-character binary strings (`'11111000'`) rather than numeric masks
  made them reviewable by eye against §1.2's "8-bit mask", and made the collision above a typo I
  could spot rather than a decimal to compare.
- `parsePattern` is now exported and its validation branch tested, rather than left unreachable
  behind a private helper — a parser that rejects malformed input should have that input tested.
  **Next:** Stage 3 — the resolution engine (§1.4, §1.5, §1.7). The highest-value stage in the plan,
  and the one where a subtle inversion would be invisible in aggregate statistics. Fixtures must
  carry hand-derived expected results, not results captured from the implementation.
  **Files touched:** `src/data/cards.ts`, `src/data/arrowSets.ts`, `src/core/types.ts`,
  `src/core/card.ts`, `tests/core/data.test.ts`, `STATUS.md`

---

### S6 — 2026-10-10 — Stage 3 complete: the placement cascade, and one real engine bug

**Stage:** 3 (Resolution engine) · **Status:** ⬜ → ✅
**Did:** `src/core/resolution.ts` implements §5.3 — initial scan, battle queue, combo cascade,
chain-termination. `BattleResolver` is a seam in `core/types.ts` so the cascade's shape is testable
without the RNG. `tests/fixtures.ts` provides board vocabulary and deterministic stub resolvers;
`tests/core/resolution.test.ts` holds 41 tests. **144 total**, 5 rules traced, 0 untested.
**Found and fixed one real engine bug.** When the placed card _loses_ a battle, its arrows fire a
combo — but I was computing those targets against the **old** owner, so the combo flipped cards the
winner already owned instead of cards the loser owned. A losing placement therefore gave its own
cards back instead of sweeping the opponent's. Caught by the Q7 and "combo onto cards we own"
tests. This is the single most consequential bug in the stage and it was invisible until the
combination was exercised.
**Verified by mutation:** duplicate combo targets → 3 failures; takedown firing combos (the classic
§1.7 mistake) → 2 failures; chain continuing after a loss → 1 failure; re-introducing the real bug
→ 3 failures. The suite catches every one.
**Learned:**

- **Eleven of my twelve initial failures were my own geometry, not the engine's.** I wrote comments
  asserting adjacencies that do not exist — "cell 6's S arrow reaches 11" when it reaches 10, "5's S
  reaches 10" when it reaches 9. I verified every coordinate against a generated adjacency table
  before fixing them. Hand-writing fixtures from a mental picture of the board is error-prone;
  cross-checking against the real table is not.
- **Three separate tests silently encoded a rule I had backwards.** My "losing the first battle
  stops the chain" test initially asserted that a card we captured mid-cascade stayed ours — when
  in fact the enemy's combo from the card that captured it takes it straight back. Same for the
  Q7 skip case and the eight-arrow sweep. Each was a case where I had the _outcome_ right but the
  _reason_ wrong, and writing the reasoning into the comment is what exposed it.
- **The per-file coverage gate found four dead branches**, and each pointed at a real simplification
  rather than needing a test: an unreachable `!other` guard, a `directionFrom` null return that
  could never fire, and — most usefully — the re-scan's takedown `else`, which I proved unreachable
  (every surviving neighbour of the placed card must point back, since the initial scan took the
  rest). Removing it also let `pointsBack` take a `Target` carrying its own direction, deleting a
  whole coordinate-lookup table. **The gate paid for itself twice over.**
- I nearly shipped a nonsense `pointsBack` (calling `directionFrom(cell, cell)` and returning
  `false ? false : false`) while fixing a type error. Typecheck caught it immediately, but it is a
  reminder that the fast path through a type error is where nonsense gets committed.
  **Next:** Stage 4 — `rollBattle()` and the real RNG-backed resolver, closing the §1.6 gap. The
  Monte Carlo test (100k battles per type pair within 2% of `winProbability()`) is the piece that
  pins the maths statistically rather than by example.
  **Files touched:** `src/core/resolution.ts`, `src/core/types.ts` (BattleResolver/BattleOutcome),
  `tests/fixtures.ts`, `tests/core/resolution.test.ts`, `STATUS.md`

---

### S7 — 2026-10-10 — Stage 4 complete: real battles, and what Monte Carlo cannot see

**Stage:** 4 (Battle math + multi-battle chains) · **Status:** ⬜ → ✅
**Did:** `rollBattle()` in `battle.ts` implements §1.6 — two bases drawn from their stat intervals,
then two independent rolls, `actual = base − roll`, ties to the defender. `resolvePlacement()` now
takes `{rng}` and binds the resolver itself, so the engine draws real battles with no call-site
changes. `tests/core/rollBattle.test.ts` is the Monte Carlo suite: all 16 attacker/defender type
pairings and nine stat gaps at 30k trials each, comparing the empirical rate against the _analytic
mean_ of `winProbability` over the base intervals. **163 tests total, 6 rules traced, 0 untested.**
**Verified by mutation:** ties awarded to the attacker → 3 failures; probability scaled → 1 failure;
`actual = roll` instead of `base − roll` → **only 1 failure**.
**Learned:**

- **The mutation that broke `actual = base − roll` was caught by exactly one test — and it was not
  the Monte Carlo.** `roll` and `base − roll` are _both_ uniform on `[0, base]`, so the win-rate
  _distribution_ is identical either way; every statistical test sailed straight through a broken
  implementation. Only the explicit `expect(r.atkActual).toBe(r.atkBase - r.atkRoll)` assertion
  noticed. **Monte Carlo verifies the distribution, not the mechanism.** That is the sharpest
  argument yet for keeping both kinds of test rather than reaching for whichever is convenient.
- My own test expectations were wrong twice, in the same way: I built `card(15,'P',0,0)` expecting
  it to attack a strong defence, but a `P` attacker uses its own `atk` against the defender's
  `pdef`, so the 15 had to go in `pdef`. Caught both times by computing the analytic value
  independently before touching the assertion.
- **Identical cards give 0.4959, not 0.46875.** The 0.46875 figure is the _fixed-base_ case; with
  bases redrawn every battle the two sides only tie outright about 1 round in 16, so the
  defender's edge is small but still real. Both numbers are now asserted separately, with the test
  explaining which is which — a reader who conflated them would conclude the rules were wrong.
- Forcing an exact tie needs a scripted RNG returning zeros; there is no other way to observe the
  tie rule directly rather than statistically, so `Rng` being a plain interface paid off.
- The Monte Carlo suite runs ~1.5M battles in about 300ms, so it stays in the default `npm test`
  rather than being gated behind a slow script. Full suite: 484ms.
  **Next:** Stage 5 — the match state machine. First stage where a whole match runs headless, which
  unlocks the 1,000-match invariant simulation and the 10-card invariant that justifies `MAX_BLOCKED = 6`.
  **Files touched:** `src/core/battle.ts` (rollBattle, rngResolver), `src/core/resolution.ts` (rng
  option), `tests/core/rollBattle.test.ts` (new, 15 tests), `tests/core/resolution.test.ts`
  (composition tests), `tools/rules-audit.ts` (1.6 claimed), `STATUS.md`

---

### S8 — 2026-10-10 — Stage 5 complete: whole matches run headless

**Stage:** 5 (Match state machine) · **Status:** ⬜ → ✅
**Did:** `src/core/match.ts` — `createMatch` (blocked cells, coin flip, deal), a pure
`applyAction` reducer, turn flow, scoring, and win/draw/perfect detection. Split
`resolvePlacement` into `beginPlacement` + `continuePlacement` so the engine can park the match in
`phase: 'chooseBattle'` and let the caller choose battle order (§1.7, §5.4) without ever blocking.
`tools/verify.ts` runs the invariant sweep; `tests/core/verify.test.ts` runs a smaller batch inside
every `npm test`. **201 tests, 7 rules traced, 2 pending, 0 untested.**
**Verified by mutation** — each caught immediately: ending the match only when the board is full
(716 violations), blocking up to 7 cells (60), and not alternating turns (1400).
**Learned:**

- **A refactor regression I nearly shipped.** Splitting the cascade made `resolvePlacement` return
  the battle-chain events _without_ the initial scan's takedown events. Three Stage 3 tests failed —
  including the corner sweep — which is precisely what those tests were written to protect. The
  hand-derived expectations earned their keep a second time.
- **Two real engine bugs in the same file.** `finishMatch` originally required `16 − blocked`
  placements to end a match, but only ten cards exist, so **no match ever ended**. And `claimable`
  was computed for whoever won, which meant a _loss_ offered the player a card to take. Both were
  caught the moment the verifier could run a match end to end — they were invisible while nothing
  orchestrated play.
- **`node tools/verify.ts` could not import our own modules.** Bare Node needs explicit extensions;
  Vite does not. Rather than run the verifier through a bundler, I converted all 67 relative
  imports in `src/`, `tools/` and `tests/` to carry `.ts` and enabled `allowImportingTsExtensions`.
  The same sources now run under both, which is what makes the headless verifier trustworthy rather
  than a separate copy of the logic.
- A confound nearly produced a false alarm: a first sweep showed the AI winning ~74% and I started
  investigating turn order before noticing the AI had been dealt **tier-2 cards against tier-1**.
  Re-run with matched decks, the split is 39.9/38.5 — no positional bias. Worth remembering that a
  surprising balance number is usually a broken test fixture, not a broken rule.
- Clustered placement produces ~1.7x the perfect-game rate of corner-greedy play. Recorded under
  **Balance Note for Stage 8** so the AI does not walk into it.
  **Next:** Stage 6 — rendering. Everything it needs exists: `GameEvent` is an exhaustive union and a
  full match already yields a complete ordered log of it.
  **Files touched:** `src/core/match.ts` (new), `src/core/types.ts` (`placedCount`, `pendingCell`,
  `MatchResult.claimable`), `src/core/resolution.ts` (split), `tools/verify.ts` (new),
  `tests/core/match.test.ts` (new), `tests/core/verify.test.ts` (new), `tests/fixtures.ts`,
  `tsconfig.json`, all relative imports, `tools/rules-audit.ts`, `package.json`, `STATUS.md`

---

### S9 — 2026-10-10 — Stage 6 complete: the board is on screen

**Stage:** 6 (Rendering) · **Status:** ⬜ → ✅
**Did:** `render/theme.ts` (all colour/size/type tokens in one place), `sprites.ts` (procedural
card art seeded by figure id, cached offscreen), `arrowSprite.ts` (8-direction arrows),
`cardView.ts`, `boardView.ts`, `animator.ts` (single rAF loop consuming `GameEvent[]`), and
`input/pointer.ts`. `main.ts` now plays a **scripted match** through the real engine and animates
it — the Stage 6 DoD ("a headless-driven match animates correctly"). **248 tests.**
**Learned:**

- **A real animation bug, caught by the convergence test.** `push()` queued every event, but
  cell-less events (`turn`, `game-over`) fell through to `cell: 0` with a `null` target — so each
  turn-passing event **erased whatever sat in cell 0**. Playing a card in the corner made it
  vanish one beat later. The test that caught it asserts the display board _converges on the true
  board_, which is the property that actually matters; a test that merely checked "the queue
  emptied" would have passed happily. Mutation-tested by reinstating the exact defect: 2 failures.
- **My first mutation attempt was a false negative.** I "broke" `push` to route cell-less events
  through `event.cell`, but `undefined` is not `0`, so the bug didn't reproduce and the suite passed.
  Only when I injected the _faithful_ defect did it fail. A mutation test that doesn't fail proves
  nothing about the mutation — worth remembering before trusting a green result from one.
- **`src/input/pointer.ts` sat at 0% coverage** and dragged the global branch gate under 80%. The
  fix was 15 real tests, not a threshold change: hit-testing, click-to-action, and keyboard cursor
  movement are pure functions that deserve them anyway, and Stage 7 needs exactly this surface.
- Two of my input tests encoded **wrong premises**: I assumed cell 6 was empty in seed 2 (it was
  blocked) and that a match can fill the board (it cannot — ten cards, at least ten free cells).
  Fixed by testing movement on a deliberately unblocked board and building a synthetic full board
  for the null case, with a comment explaining why it is synthetic.
- Ownership is encoded as **colour plus shape** (square pip vs hexagon) from the start, not retrofitted
  later — the shape channel is asserted via observable path construction, not just a constant.
- jsdom has no canvas backend, so both UI test files now share one recording context stub
  (`tests/ui/canvasStub.ts`) that counts draw calls. Pixels stay unasserted by design (§9.4).
  **Next:** Stage 7 — the last stage before the game is genuinely playable. Replace the scripted
  driver with a controller: hand tray, click-to-play, keyboard parity, and the battle-order chooser.
  **Files touched:** `src/render/{theme,sprites,arrowSprite,cardView,boardView,animator}.ts`,
  `src/input/pointer.ts`, `src/main.ts`, `tests/ui/{render,canvasStub,boot}.test.ts`,
  `tests/core/input.test.ts`, `STATUS.md`

---

### S10 — 2026-10-10 — Stage 7 complete: the game is playable

**Stage:** 7 (Playable match UI) · **Status:** ⬜ → ✅
**Did:** `ui/app.ts` — `MatchController`, deliberately DOM-free so it can be driven entirely from a
test. `ui/components/picker.ts` — the battle-order chooser (§1.7), listing each contested card with
its odds and the defender's arrow count, because the loser's arrows drive the combo and a heavily
armed defender is worse than its numbers suggest. `ui/components/hand.ts` — hand tray with stat
codes, arrow counts, and warnings ("no arrows — cannot take anything"), plus the results panel.
`main.ts` rewired: click-to-play, pointer hover, full keyboard parity, one rAF loop. **283 tests.**
**DoD met and machine-checked:** a whole match completes by mouse alone and again by keyboard alone,
as two tests — not as a claim someone has to verify by hand.
**Learned:**

- **A bug that would have made the keyboard unplayable, and only the DoD test found it.**
  `moveHover` guarded with `if (!from)`, but **cell 0 is falsy**, so the cursor returned null
  whenever cell 0 was legal — which is most boards. Keyboard navigation was simply dead. Fixed with
  an explicit `=== undefined` check and a comment saying why.
- **My two DoD tests proved nothing, and mutation testing is the only reason I know.** Making Enter
  play somewhere other than the cursor passed all 34 tests: the cursor happened to sit on
  `legal[0]`, which is exactly where the mutation also played. Rewritten to target a cell that is
  _not_ the first legal one — now it fails, along with a new "click and Enter agree" equivalence test.
- **A guard that could not be tested because it was unreachable.** `playAt`'s busy check can never
  fire through the UI, because `selectCard` refuses first and a placement clears the selection. I
  moved it to `dispatch()` — the single choke point every input path goes through — and rewrote the
  test to assert the _behaviour_ (no card is ever placed mid-animation) rather than that line. The
  guard stays as defence-in-depth for Stage 8's AI, which will dispatch without holding a card, and
  that decision is recorded above rather than left as a mystery.
- `statusText` said "0 cards point back" in a state the engine cannot produce. Rather than delete the
  branch, it now says "Resolving the fight" — cheap robustness for a UI string.
  **Next:** Stage 8 — the opponent AI, which is what turns this from a solo puzzle into a game.
  **Files touched:** `src/ui/app.ts` (new), `src/ui/components/{picker,hand}.ts` (new),
  `src/main.ts`, `index.html`, `tests/ui/{controller,boot}.test.ts`, `STATUS.md`

---

### S11 — 2026-10-10 — Stage 8 complete: the opponent plays

**Stage:** 8 (Opponent AI) · **Status:** ⬜ → ✅
**Did:** `ai/evaluate.ts` (position scoring), `ai/moves.ts` (move enumeration), `ai/opponent.ts`
(choice + difficulty + an `Opponent` handle with its own RNG), `ai/personalities.ts` (10 NPCs), and
`tools/balance.ts` (sweep with a random-move control group). Wired into `main.ts` via a new
`MatchController.submitExternal()` seam. **309 tests.**
**Learned:**

- **I broke the boot path and almost shipped it.** `main.ts` called `newController(seed)` before
  `const opponent` was initialised — a temporal dead zone crash, so the page would not have started
  at all. The boot test caught it immediately. It passed on the previous stage because there was no
  opponent to declare.
- **The AI had a _rule_ error, not a tuning error.** Its risk term counted enemy arrows already
  aimed at a square, which per §1.4 can never do anything — only a just-placed card attacks. The AI
  was fleeing a threat that does not exist, and that penalty (21) outweighed a capture (10), so it
  played a passive, capture-free game and lost to a random opponent that simply bumped into people.
  Reweighting alone did nothing; replacing the risk model with _playable neighbours_ (where the
  enemy could actually place next turn) fixed it. **A heuristic that encodes an impossible threat is
  worse than no heuristic, because it looks principled.**
- **My measurement was wrong twice, and both times the AI looked bad for the wrong reason.** The
  harness first confined the AI to the `player` seat, which loses ~39% of matches; then it reported
  `win / decided` straight from the match outcome, so a strong AI in the `ai` seat registered as
  _losing_. I was one tuning pass away from "fixing" a perfectly healthy evaluation. Measuring the
  AI's actual behaviour — 1766 captures to random's 1110, winning 57%/71% by seat — showed it was
  already strong before I touched anything. **Instrument first, then judge.**
- The anti-cheating property is mutation-tested: injecting a real cheat (drawing from the match RNG
  to decide) fails `does not advance the match RNG`. An earlier attempt at the same mutation passed,
  because `rngState > -1` is always true — a mutation that does not actually cheat proves nothing.
- The "sharp beats casual" test compared against a tolerance band, which a noisy opponent could
  satisfy by landing on any of several near-equal moves. Rewritten to compare against the exact
  argmax, which is what volatility actually controls.
- Measured for the record: every AI beats random by 12–18 points, the opening player wins 40.6% of
  decided matches (a real second-player advantage, authentic to the original), and perfect games
  occur ~17.6% of the time.
  **Next:** Stage 9 — progression, collection and save. The last stage that claims new rules: §1.8 and
  §1.9, after which `rules:audit` reports every paragraph traced.
  **Files touched:** `src/ai/{evaluate,moves,opponent,personalities}.ts` (new), `tools/balance.ts`
  (new), `tests/ai/opponent.test.ts` (new), `src/ui/app.ts` (submitExternal), `src/main.ts`,
  `STATUS.md`

---

### S12 — 2026-10-10 — Stage 9 complete: every rule in §1 is now traced

**Stage:** 9 (Progression, collection, save) · **Status:** ⬜ → ✅
**Did:** `src/game/{progression,collector,save,report,profile}.ts` (new layer), `src/ui/components/{collection,deckEditor}.ts`,
the collection screen wired into `main.ts` and `index.html`, and `src/game/**` added to the test and coverage config.
`PENDING` in `tools/rules-audit.ts` is now **empty**. **468 tests.**

**Learned:**

- **The "append-only log for replay" could not be replayed.** `place`, `turn` and `game-over` were
  returned by the reducer but never written to `state.history` — `resolution.ts` appended its own
  events and nothing else appended anything else. §1.8 needs to know which cards were used and how
  many battles each won, and that information exists nowhere else. `PLAN.md` §3.2 described the log
  correctly all along; the code did not implement it. Fixed by making `applyAction` the single
  writer, while an illegal action still returns the _identical_ state object so "nothing happened"
  stays detectable by identity. Adding `cardIndex` to the `place` event was also needed: the log
  could not say _which_ card was played, because the hand shrinks and the index is not a deck slot.
- **Two mutations survived my first attempt at testing §1.8 battle credit.** Crediting the loser
  instead of the winner passed; ignoring defensive wins entirely passed. Every test happened to run
  on matches where the player only ever attacked, so neither error was observable. The rules are now
  stated on synthetic histories built from a board the test controls — the only way to exercise a
  case real play rarely produces. §1.8 credits _any_ battle won, so a defender that holds its ground
  earns exactly what an attacker earns; getting that backwards would quietly reward turtling.
- **A migrated save could leave the game unplayable.** A v1 save containing one card parsed cleanly,
  and then `Profile.matchDeck()` handed the engine a one-card deck. The starter grant now tops a
  _short_ collection up, not just an empty one. Found by a test I wrote for a different reason.
- **Two temporal dead zones in `main.ts`, in two consecutive stages.** Stage 8 built the controller
  before the opponent was declared; Stage 9 reset `settled` from `newController`, which runs during
  initialisation, before `settled` was declared. Same failure mode twice, in the one file with no
  import-time safety net. State a module's initialisation depends on **before** the call that
  depends on it.
- **`defaultStorage()` handed back a fresh in-memory store on every call.** Every write was silently
  discarded. The memoisation is now the fix, and the test that caught it is named for the symptom a
  player would see — "saving does nothing" — rather than for the implementation.
- Nine further mutations confirmed the rules are really pinned: rerolling a capped stat, both
  evolution rates transposed, `P → A` skipping the `X` step, the §1.9 dedup fused into one pass
  instead of two, the glitch threshold off by two, migration disabled, and a uid collision surviving
  a load.
- Measured: 1/32 and 1/256 verified over 100k and 200k trials; the `Master` title at 1698 and the
  glitch at 1700 are two points apart and both are pinned.

**Next:** Stage 10 — modes and polish. Tournament ladder, screens, progression roll-off animation.
`rules:audit` now reports **9 traced · 0 pending · 0 untested** for the first time.
**Files touched:** `src/game/*` (new), `src/ui/components/{collection,deckEditor}.ts` (new),
`src/core/{types,match,constants}.ts`, `src/main.ts`, `index.html`, `vite.config.ts`,
`eslint.config.js`, `tests/game/*` (new), `tests/ui/collection.test.ts` (new),
`tools/rules-audit.ts`, `PLAN.md`, `STATUS.md`

---

### S13 — 2026-10-10 — Stage 10 complete: three modes, a rules screen, sound and access

**Stage:** 10 (Modes & polish) · **Status:** ⬜ → ✅
**Did:** `src/ai/counterDeck.ts`, `src/game/modes.ts`, `src/audio/synth.ts`,
`src/ui/screens/{rules,rulesView}.ts`, `src/ui/accessibility.ts`, `src/ui/components/toolbar.ts`, plus
`main.ts`, `index.html`, and a v3 save with `settings`. **655 tests**, up from 468.

**Learned:**

- **A mutation that never applied is worse than no mutation.** Prettier had reformatted the line I
  was patching, so "short player deck is not topped up" was a silent no-op and the suite came back
  green. I nearly wrote the test off as worthless; it was fine, and the mutation was the broken
  thing. I now assert the file actually changed before believing a mutation result.
- **The first measurement of the counter-deck said 1.5 points of advantage, 60% of decks.** Real,
  and an artefact: I had given the counter a five-card pool while the mode draws from the whole
  collection. With a realistic collection it is **12.2 points, better in 100% of 120 decks**. The
  benchmark was wrong, not the feature.
- **The rules screen is pinned to `PLAN.md` by a test.** It asserts its section ids are exactly the §1
  headings parsed out of the plan, so adding a rule without writing it up fails the build.
- **`prefers-reduced-motion` had been in the API since Stage 6 and read by nothing.** The
  requirement existed in a constructor option and nowhere else; it is now a live watch rather than a
  one-time read, because the OS setting can change while the page is open.
- **`defaultStorage()`-style silence again, in a new place.** `planDecks` handed back whatever the
  player had saved, so a collection of three produced a three-card deck and `createMatch` threw —
  the game would not start. Both sides now top up. Found by the test I wrote for an unrelated reason.
- The counter-deck deliberately scores with the _exact_ `winProbability` rather than a heuristic, so
  there is no second copy of the battle maths to drift. Nine mutations confirm it: greedy inverted,
  band midpoints replaced by raw indices, hotseat handed to the computer, the counter bypassed, the
  top-up removed, audio defaulting to on, a v2 save migrating to sound already enabled, a losing
  battle playing the winning cue, and audio playing while switched off.
- Not done and stated rather than implied: the DoD asked for "no console errors in a full session",
  and that was checked headlessly (`tests/game/session.test.ts` drives all three modes, ten
  personalities and sixty matches) plus `tests/ui/boot.test.ts`, not in a real browser.

**Next:** Stage 11 — README, CI workflow, performance pass, `verify --strict`.
**Files touched:** `src/ai/counterDeck.ts`, `src/game/{modes,save,profile}.ts`, `src/audio/synth.ts`,
`src/ui/screens/*`, `src/ui/accessibility.ts`, `src/ui/components/toolbar.ts`, `src/main.ts`,
`index.html`, `vite.config.ts`, `tests/{ai/counterDeck,game/modes,game/session,audio/synth,ui/rules,ui/toolbar,ui/collection,ui/boot}.test.ts`,
`tools/balance.ts`, `PLAN.md`, `STATUS.md`

---

### S38 — 2026-10-12 — Published: upstream remote, Pages workflow, and the one line that made it work

**Status:** `upstream` = `git@github.com:mcm69/tetramaster.git`. Two workflows: `verify` (the gate)
and `pages` (the delivery).

**The non-obvious part was `base: './'`.** `vite.config.ts` had no `base`, so Vite emitted
`/assets/index-*.js` — correct at a domain root, **broken at a project page's subpath**. This is not a
cosmetic difference:

| build          | loaded from `mcm69.github.io/tetramaster/`                           |
| -------------- | -------------------------------------------------------------------- |
| default `base` | script 404s, the hand tray never renders, **the app does not boot**  |
| `base: './'`   | no failed requests, board 560×560, five hand cards, zero page errors |

Checked by serving `dist/` under a prefix with Playwright rather than assumed, and then confirmed by
putting the old `base` back and watching the same check fail.

**The Pages workflow deploys on `push` to main only, not on `pull_request`.** A Pages job firing on
pull requests publishes unreviewed code to the live site, and a fork's pull request has neither the
Pages permission nor the artifact access — so it would either overwrite production or fail on a
branch nobody was going to look at. `verify.yml` still runs on pull requests; that is where review
belongs. Its concurrency group does **not** cancel in progress, the opposite of `verify.yml`, because
a half-finished deploy leaves a broken site.

**The deploy does not re-run the gate.** `npm run build` is `tsc --noEmit && vite build`, so a deploy
cannot ship a bundle that does not typecheck, and the layout gate lives in `verify.yml`. The two
workflows run in parallel, so nothing waits on anything.

**One thing I cannot do from here:** Pages must be enabled on the repository with **Settings → Pages
→ Source: GitHub Actions**. That is a repo setting, not a file, so the workflow will fail until it is
set. Flagged rather than left to be discovered by a red run.

**Files touched:** `vite.config.ts`, `.github/workflows/pages.yml`, `README.md`, `STATUS.md`

---

### S37 — 2026-10-12 — "You win" over a 0–10 board, and the save counted it

**Reported from play:** losing every card showed **"Perfect game — you take everything"** and **"Every
one of their cards is yours. You may take all five"**, over a panel with nothing to take.

(The reported score was 0:9. The score of a total loss is **0:10** — ten cards are always placed — so
this is the same thing, and reproducing it found exactly that.)

**The cause.** `Outcome` is `'win' | 'loss' | 'draw' | 'perfect'` and `perfect` carries **no
direction**. `finishMatch` set it when _either_ side owned every card, on the reasonable-sounding
ground that a sweep is a sweep — and everything downstream read `'perfect'` as a player win:

- the results panel congratulated you and offered five cards, with `claimable` empty;
- `recordOutcome` counted a **lost match as a win** and incremented **`perfects`**;
- `profile.ts` recorded `won: true`.

**So this was not only a wrong sentence.** In a 60-match sample it mislabelled **11 matches** as
perfect wins for a player who owned nothing. That is the user's save file.

**The fix is one line.** §1.1 settles the direction: "**Perfect Game** (capture all 5 enemy cards) →
take all 5 enemy cards." It is the player's achievement. `counts.player === total` alone.

**Reproduced before fixing, not after.** A deliberately awful player policy — its emptiest card,
placed next to an enemy — reaches 0:10 on seven seeds in the first sixty, deterministically. That is
how a sweep actually happens, so the test plays it through the cascade rather than hand-building a
board and hoping it still means the same thing after the next engine change.

**Learned:**

- **A test conditional on the code's own answer proves nothing.** The invariant was written the
  obvious way round — `if (outcome === 'draw') expect(level)`. Mutating the draw branch away turned a
  level board into a loss, so the condition was **never true and the assertion never ran**: all four
  tests passed with the branch deleted. Rewritten as biconditionals — a win _iff_ ahead, a draw _iff_
  level — which catch both directions. **Third time in this project** a test has hidden behind
  another test passing.
- **That mutation found a second, unguarded bug one line away.** Disabling the draw branch makes 5-5
  a **loss**, and **the entire 787-test suite passed**. A draw was being recorded as a loss and
  nothing noticed. It was never the bug I was sent to fix; it was found by asking whether a mutation
  that mattered was caught, and noticing that it was not.
- **When the user's report was a detail I could check, I checked it rather than matching their
  words.** "0:9" is not a score this game can produce at the end of a match. Confirming that is how
  the reproduction found the right scenario; assuming their digits and searching for a 0:9 would have
  found nothing and looked like a fix that did not work.

**Verified by mutation, four of four.** The original `|| counts.ai === total` restored; win and loss
swapped; the draw branch disabled; `perfect` no longer counting as a win in the save.

**Still slightly wrong, and left alone deliberately:** on a total loss the body reads "They take one of
the cards they captured" when they took all five. Fixing it means the panel needs the final score,
which `MatchResult` does not carry — more than this bug warrants, and recorded rather than done.

**Files touched:** `src/core/match.ts`, `tests/core/sweepOutcome.test.ts`, `STATUS.md`

---

### S36 — 2026-10-12 — M10: documentation, and most of what it documents was wrong

**Status:** `MOBILE.md` complete — M0–M10 all done. 787 tests, `verify` exit 0.

**Done.** The README's controls table gained a **Touch** column, so the keyboard bindings stop being
the only documented way to play. `PLAN.md` §7.4b carries the mobile deviations, in the same
"documented rather than silently shipped" place as the deviations from the original game. The new
browser commands are in both command tables.

**Learned:**

- **The README claimed things the gate had not earned.** It said "the keyboard does everything the
  mouse does" — true, and the reason the table read as keyboard-only. And STATUS.md's front matter
  said **18 tests**, **0 traced · 9 pending**, **610 tests** and **stage 11 not started**, all of
  which had been false for twenty-odd commits. A working log nobody has updated is worse than none:
  it is a resume instruction that resumes you into the wrong place.
- **A documentation stage is an accuracy stage, so I checked my own claims against the tools.** Every
  number in the gate table came from that run's output, not from memory. One was wrong on the first
  pass — I had written "90.9% lines" where the column is statements, and lines is 92.5% — which is
  what happens when a number is copied from a table without reading the header.
- **The first sentence I wrote for the controls table contradicted the paragraph under it.** "Every
  action has a touch route" and then, three lines down, "two of them do not". Changed to say what is
  true: nothing is keyboard-only, and two of the ten are _touch_-only-missing, with the reason.
- **I checked the two claims most likely to be false and left them in if they held.** The 44px floor
  really is met on every screen at every viewport in the matrix (zero non-zero entries in
  `MOBILE-baseline.md`), and `npm run touch` really is 21 checks. Neither was taken on trust.
- **The Next Actions list had the real remaining work in it and I sharpened it.** "Play it in a real
  browser" is now three specific things: a real phone, the desktop hand tray, and the "Click a square
  to play" copy on a phone with no keyboard. All three were surfaced by the mobile stages and all three
  are still unfixed, deliberately or otherwise.

**The plan is finished. What is not fixed is listed, not buried:** a real phone has never held this;
the hand tray needs a scroll on a 720px desktop window; the status line says "click" on a phone; and
board squares are 36px on a 320px-tall viewport with a keyboard open. Three of the four are named in
`KNOWN_LIMITATIONS` and reported by the gate on every run.

**Files touched:** `README.md`, `PLAN.md`, `STATUS.md`

---

### S35 — 2026-10-12 — M9: the gate, and the day it wasn't running

**Status:** mobile stage M9 complete. **787 tests** (+19). Gate green: 11 viewports x 3 screens.

**Done.** `npm run layout` measures, writes the baseline and exits non-zero on a broken rule. It is
the last step of `npm run verify`; CI installs Chromium first. The rules live in `tools/layoutGate.ts`
as a pure function of measurements, which is what lets all four assertions be tested without a
browser — a gate whose rules can only be checked by running a browser is a gate nobody checks the
rules of.

**The board floor is derived, not chosen.** `METRICS.cellSize` is 115px in a 520px board, so 199 is the
size at which a square reaches the same 44px minimum every other target holds. A board can be fully
visible, overflow-free and small-target-free while being too small to play, and that number exists
for exactly that case. **It fired on the gate's first real run.**

**Learned:**

- **Five of my first six mutations "passed" — the gate was not running.** `tools/viewport.ts` serves
  `dist/`, and invoking it directly does not rebuild, so it measured a bundle that had never been
  built from the mutations. `npm run viewport` and `npm run layout` build first, which is why this
  only ever happens when you invoke the script directly — which is exactly when you are debugging it.
  **This is the fifth time in this project that measuring a stale artefact read as "no problems".**
  `refuseStaleBuild()` now exits 1 when `dist/` is older than `src/`, and it fired on the next run.
  The lesson is not "remember to rebuild"; it is that a tool which reads a build artefact must check
  the artefact is current, because _my_ memory is not part of its contract.
- **A gate that passes on a missing measurement is not a gate.** Renaming a button the harness clicks
  now produces **33 failures**, not zero. "Not checked" is not "nothing wrong", and the difference is
  one function.
- **Three limitations are reported rather than fixed, each with its arithmetic.** The hand tray is
  below the fold on every desktop size (560px board + 398px chrome > 720px window) — pre-existing, and
  §7 keeps desktop unchanged. Board squares are 36px at 812×320; closing that needs the navigation
  buttons in the settings menu or the hint row gone, both declined before. The floor drops to 160
  **only** below 544px tall, so a further 5% shrink still fails. **Reported, not hidden** — and the
  desktop note says in its own words that it is a measurement, not a statement that desktop is good.
- **A refactor broke a test that had been passing, which is the test working.** Moving the viewport
  from a note's `detail` into its `screen` label left one assertion checking the wrong field. The test
  caught it; I would not have.
- **One test I wrote was weak and I replaced it rather than keeping it.** "fails when a screen could
  not be measured" asserted that an empty result was empty — a test that could not fail. It now
  asserts three specific failures.

**Verified by mutation, six of six.** Mode button leaving the 44px floor (33 failures); collection
panel sized `100vw` (18); landscape `aspect-ratio` backstop removed (an overlap); board max-width cut
to 120px (the floor); landscape board budget removed (the floor); a button the harness needs renamed
(33 — the missing-measurement rule).

**Next:** M10, documentation — and then this plan is finished.
**Files touched:** `tools/layoutGate.ts`, `tools/viewport.ts`, `tests/core/layoutGate.test.ts`,
`package.json`, `.github/workflows/verify.yml`, `MOBILE.md`, `MOBILE-baseline.md`, `STATUS.md`

---

### S34 — 2026-10-12 — M8: the screens nobody had opened, and a harness that opens them

**Status:** mobile stage M8 complete. **768 tests** (unchanged). Harness now measures 11 viewports ×
3 screens.

**Done.** The plan's done-when — the deck fully editable at 360px with no horizontal scrolling — was
**already true** and is now measured rather than assumed. Two things were not.

**The 44px floor had missed this screen entirely.** M5 wrote it against the board's controls and nobody
went looking for the others: `.deck-clear` 26px, the search box 33px, every filter `<select>` 27px.
All at every width, as M5 decided for the rest.

**The deck editor was one slot per row** — `flex: 1 1 12rem` against a 272px column at 320px — so five
slots were **1450px of scrolling before the card list players came for**. Now an explicit two-column
grid, as the plan says, which is also the answer to why: 12rem was chosen when the screen was never
narrower than 640px, and it silently became a one-column layout the moment it was.

**Learned:**

- **A guard you can write is worth more than a guard you have.** `overflow: hidden` on the stat code
  looked like clipping and was not: as a flex item in a column its width is its fit-content size, and
  `overflow` only clips what has already been given a width. The two-column grid then pushed the
  panel 9px past the viewport at every width — the exact bug the `96vw` comment four hundred lines
  earlier warns about, in a different declaration. Found by measuring after the change, not by reading
  the change.
- **The harness measured one screen for the entire project.** The two it never opened are the two
  nobody had looked at. It now presses the same button a player presses, waits for the screen it
  asked for rather than a fixed delay, and reports each separately — 33 sections in the baseline.
- **Faults must be asked only of what they are about.** "Board not fully visible" is a _true_ statement
  about a board nobody is looking at when the collection screen is open. Board checks go to the board;
  overflow, target size, overlaps and selectability go to every screen and are labelled with it.
  Vertical overflow is not asked of collection or rules **because those screens are meant to scroll** —
  demanding they fit would be demanding they not exist.
- **The probe was returning a zero-size board for a hidden one**, which every downstream check reads
  as "too small". It now returns null, and reports which screen it measured.
- **One mutation survives and it should.** Removing the two-column grid is not a defect; it is the
  shorter layout this stage rejected on purpose. The gate catches overflow, small targets and overlaps.
  It does not catch taste, and inventing a threshold for "too tall to be nice" would be worse than
  saying so.
- **Three of the plan's four bullets were already satisfied** — the list scrolled independently, the
  filters wrapped, the rules prose did not overflow. Recorded as already true rather than credited as
  new work, because a plan read as a to-do list is a plan read as fiction.

**Verified by mutation, six of six** (the sixth being the taste one above, deliberately uncaught).

**Next:** M9, the gate goes green and joins CI.
**Files touched:** `index.html`, `src/ui/layoutProbe.ts`, `tools/viewport.ts`, `MOBILE.md`,
`MOBILE-baseline.md`, `STATUS.md`

---

### S33 — 2026-10-12 — M7a: the bug the screenshot found, and the guard for the whole class

**Status:** post-M7 fix, found from a screenshot. **768 tests** (+1).

**The bug.** The end-of-match panel rendered _above_ the board in landscape and crushed it to 6px
tall. Stage M7 made the body a grid and placed seven of its fourteen children; the other seven were
auto-placed into the cell nobody named.

**Three children were unplaced and all three were broken:** `#picker`/`#results` above the board,
`#collection`/`#rules` squeezed into the board's column at 270px wide and 38px too tall, and `#hint`
— the "explain this square" line — floating in an implicit row. The user's question was whether the
panel could go somewhere other than above the board. It should not have been there at all.

**The fixes.** Results and the battle picker take the whole second column, over the tray rather than
the board, spanning it rather than taking a row of their own so the board does not jump when a match
ends. The tray hides behind them with `visibility` rather than `display`, for the same reason.
Collection and rules take the whole grid, because they replace the board. The hint gets its own
reserved row — hiding it would be the exact trade this project keeps refusing — and **reserved**
rather than collapsed, because an `auto` row that grows shrinks the `1fr` row and moves the board
under the player's finger. A fixed 17px costs the board 6% and never moves.

**The guard.** `tests/ui/stylesheetClasses.test.ts` asserts every direct child of `<body>` has a place
in the landscape grid or is removed from it. Four mutations, all caught: each of the three above
unplaced again, and a new `<div id="toast">` added with nothing styling it.

**Learned:**

- **Why nothing caught it is worth more than the bug.** The viewport harness measures a fresh page,
  where all three elements are `hidden`; the touch tool never finishes a match. Both screens are
  reachable only by playing a whole game. **A layout can pass every check in the project and still be
  wrong for the person actually playing it**, and the honest fix is a check that enumerates the
  elements rather than another check that happens to look at the common ones.
- **The first version of that check was wrong in the most embarrassing direction: it matched every tag
  on the page** and reported the two `rematch` buttons _inside_ the navigation toolbar as unplaced
  body children. It now tracks nesting depth. A test failing about elements it was never meant to be
  looking at is worse than no test — it teaches you to ignore it.
- **Stopping at the first `@media` boundary produced four more false positives**, because `.mode-note`
  and `.keys` are hidden by a `max-height: 760px` block, not the landscape one. The check now runs to
  the end of the stylesheet. Both mistakes were found by reading the _failure output_ rather than the
  code, which is the argument for reading it.
- **Writing the guard found a third bug I had not been asked about.** The hint line. Screenshot,
  reproduce, fix the thing you were asked about — and the next screenshot has something else in it.

**Next:** M8, collection and rules on a narrow screen.
**Files touched:** `index.html`, `tests/ui/stylesheetClasses.test.ts`, `MOBILE.md`,
`MOBILE-baseline.md`, `STATUS.md`

---

### S32 — 2026-10-11 — M7: landscape, and a constant I could not argue my way out of

**Status:** mobile stage M7 complete. **767 tests** (unchanged). `npm run touch`: 20 checks.

**Done.** Board and hand tray side by side in landscape; everything else stacks in the second column
so it costs the board nothing. **844×390, 667×375 and 812×320 all fit.** 844×390 was 643px too tall.

**Orientation is not locked, as the plan recommended — and no `orientationchange` listener was added.**
M2 already argued that the canvas `ResizeObserver` covers rotation, the URL bar, a font and a zoom
without guessing which is worth listening for. That held up under measurement rather than assumption:
rotation mid-match and back is now tested, including that a drag still places across the change.

**Learned:**

- **A `calc` constant survived an argument against it.** M1 deleted hand-measured constants. The
  no-constant alternative was tried first and **does not work**: a percentage `max-height` is treated
  as `none` while a grid column's intrinsic width is resolved, so the column took the canvas's
  unconstrained 560px and the board never shrank. What makes the constant safe is not that it is
  right — it is that it can only be wrong in one direction, that the arithmetic is written out, and
  that an `aspect-ratio` backstop makes the board follow its _row_ rather than its column.
- **A first guess at the constant was wrong by 16px in the dangerous direction.** 142px of chrome
  over-estimated the budget, the column came out wider than the row, and the board overlapped its
  neighbour. Under-estimating is free; over-estimating is not. That asymmetry is now the rule.
- **"Fits" is not "playable".** With the settings panel left open in landscape the board still fit —
  at 149px, with 33px cells. Every check passed. The check that matters is `display / 520 × 115 >= 44`.
- **The settings menu collapsed on width alone.** 844px says "desktop", so the panel rendered inline
  and took 156 of 390 pixels. Height is the scarce axis in landscape. **The JavaScript and the CSS
  now carry the same media condition**, because one owns `hidden` and `aria-expanded` and the other
  owns how the panel is arranged — when they disagree, the panel is a disclosure that is not laid out
  like one.
- **Two mutations survived every viewport in the matrix and only appeared at 812×320**, where the
  board overruns its row and paints over the status line. Both the `aspect-ratio` backstop and the
  slot's stretch were load-bearing; neither was observable at 390 or 375. **That size is now in the
  matrix for that reason**, and the harness's overlap detector caught both.
- **Two reasonable layout attempts, both wrong.** Stretching the tray filled its column and produced
  five cards a third of the screen tall with a void inside each; centring it reads as three things on
  purpose. And `min-content` for the board column sized it to 100px and the board to 28px, because a
  replaced element with an `aspect-ratio` has almost no min-content width.

**Verified by mutation, six of six.** Budget ignoring the chrome; `aspect-ratio` removed; slot not
stretching; menu left open on short viewports; column made `1fr`; the whole landscape block removed.

**Next:** M8, collection and rules on a narrow screen.
**Files touched:** `index.html`, `src/main.ts`, `tools/viewport.ts`, `tools/touchDrag.ts`,
`MOBILE.md`, `MOBILE-baseline.md`, `STATUS.md`

---

### S31 — 2026-10-11 — M6: drag to place, and a touch harness that can disagree with me

**Status:** mobile stage M6 complete. **767 tests** (+19). `npm run touch`: 13 checks.

**Done.** Drag places a card. Tap-tap is untouched — a gesture that never travels emits `none` and
leaves selection to the click handler that already existed. The rules live in `src/input/drag.ts`,
pure, no DOM, no engine, 19 tests in ~130ms.

**Decisions the plan did not settle:**

- **Three phases, not two.** `armed` before `dragging`, and `armed` shows **no ghost**. A ghost that
  appears and vanishes under a resting thumb reads as a glitch.
- **Selection lands on `select`, not `arm`.** An armed finger has not yet distinguished itself from a
  tap, and toggling the card the player is about to drag off the board would leave the drag holding a
  card that is no longer selected.
- **Client pixels, not board pixels.** The board draws at about 0.66 scale on a 390px phone, so
  measuring the 10px threshold in board units would lower it by a third on exactly the devices this
  stage exists for.
- **Capture at drag start, not on `pointerdown`.** `setPointerCapture` retargets the follow-up `click`
  to the capturing element, which breaks the tap path outright.

**`tools/touchDrag.ts` — 13 checks, driven by CDP.** Genuine touch input, not events synthesised by
`page.evaluate`: the latter only proves the handler agrees with itself. Reads the tray, not internals.

**Learned:**

- **I built a guard against a thing that cannot happen.** The wiring swallowed one canvas click after
  a drag, on the theory that a stray click would place a second card. Mutating the guard away changed
  _nothing_. Chrome emits no click at all once a touch passes the slop threshold. The guard was
  insuring against nothing, so it is deleted and replaced by a check — and that check has a
  companion, that a tap _does_ emit a click, or "a drag emits no click" would also be satisfied by a
  recorder that never fires.
- **A test tool that does not typecheck breaks the build, and a broken build leaves `dist/` stale.**
  `tools/` is typechecked at full strictness. My first version had implicit `any`s, `tsc` failed,
  `vite build` never ran, and three rounds of touch testing measured code that was not in the bundle.
  **This is the same failure as the reverted-mutation one from M0, wearing a different hat: I read
  "no output" as "no bug" when it meant "nothing was tested".**
- **Fixed sleeps are the wrong tool and were wrong twice.** A placement starts an animation; sampling
  250ms later reads the _old_ tray and reports a failure that is not there. Every wait is now on the
  thing being asserted. The second time, the deeper mistake was **letting one section inherit the
  previous section's board** — placing ends the player's turn, so section 4 spent its first seconds
  waiting for the AI. Each section now reloads.
- **One mutation survives, and I could have hidden it.** `setHover(drag.cell)` — the highlight
  following the finger — is not caught by anything. The only untested link is that one assignment in
  `main.ts`; what the hover _is_ is exhaustively unit-tested. A pixel test would have to
  reverse-engineer the cell origin to find a corner the ghost does not cover, and I decided a brittle
  test was worse than an admitted gap. Recorded in MOBILE.md rather than papered over.

**Verified by mutation**, eight of nine caught. Reducer: threshold 0, boundary `<`→`<=`, release
ignoring legality, `deselect`→`none`, `hypot`→axis-wise, a tap placing. Wiring: legality not
re-checked at drop time, capture never released.

**Next:** M7, orientation.
**Files touched:** `src/input/drag.ts`, `src/main.ts`, `tests/core/drag.test.ts`,
`tools/touchDrag.ts`, `package.json`, `MOBILE.md`, `STATUS.md`

---

### S30 — 2026-10-11 — The Settings button dropping a row, and a guard for the whole bug class

**Status:** post-M5 fix. **748 tests** (+3).

**The bug the user spotted in a screenshot.** Opening the menu pushed the Settings button _down_ onto
a second row. It should not have moved — it belongs beside the mode buttons whether the panel is open
or shut. `toolbar.ts` created the container with `className = 'settings-host'`; `renderMenu` overwrote
it one line later with `'settings-menu'`; and the stylesheet's `display: contents` rule was written
against `.settings-host`. **The rule matched nothing at all.** Without it the container is an ordinary
flex item, the panel's `width: 100%` sizes the container rather than the bar, and the container wraps
to a second row. The button was present, enabled and correctly labelled the whole time — which is why
nothing failed.

**Why no existing check caught it.** jsdom has no layout, and the Playwright harness asks the
questions a harness can ask: does it fit, does it overlap, is the target big enough. This was none of
those. Verified the fix by measurement rather than by eye: trigger and mode bar now both at y=8,
toolbar 44px collapsed, and the full viewport matrix unchanged.

**The guard.** `tests/ui/stylesheetClasses.test.ts` — every class the stylesheet names must be a class
something renders, checked statically. 77 classes, zero false positives after two corrections to the
parser. The specific rule is pinned separately, because the general check would also pass if the
wrapper were renamed consistently and `display: contents` dropped from both: the same symptom, a
different bug.

**Four mutations, all caught:** the caller setting `settings-host` again; `renderMenu` renaming its
class and leaving the rule behind; the only source of `is-dead` removed; the `display: contents` rule
deleted outright.

**Learned:**

- **A fifth mutation passed for a reason worth keeping.** Renaming `hand-arrows` to `hand-arrows-x`
  was not caught, because the check matches substrings. That is not a hole — substring matching is
  what lets it see `hand-arrows${cond ? ' is-dead' : ''}`, which no single line holds whole — but it
  means **an equivalent mutant under this check is not evidence the check is weak**, and the first
  mutation I reached for proved nothing.
- **`flatMap` flattens arrays and leaves strings whole.** The first version of the helper recursed and
  returned `string`, so each level handed its parent file _contents_ where paths were expected, and
  the next `readFileSync` failed opening a 300KB "filename" — `ENAMETOOLONG`. Cost about twenty
  minutes to localise because the stack pointed at recursion rather than at the wrong return type.
  Two steps, paths then contents, keeps the type honest at every level.
- **Comments in CSS are not comments to a regex.** `MOBILE.md` and `main.ts` in prose parse as classes
  `md` and `ts`. Stripping comments first is not tidiness, it is the difference between the check
  running at all.

**Next:** M6, drag-to-place.
**Files touched:** `index.html`, `src/ui/components/toolbar.ts`,
`tests/ui/stylesheetClasses.test.ts`, `MOBILE-baseline.md`, `STATUS.md`

---

### S29 — 2026-10-11 — M5: 44px everywhere, and the probe learned to check behaviour

**Status:** mobile stage M5 complete. **745 tests** (unchanged — nothing here is unit-testable).

**Done.** A 44px floor on the mode buttons, the Settings button, the opponent `<select>`, both
preference toggles and the two bottom buttons — **at every width, not just phones.** M0 found eight
controls under 44px on every device _including desktop_: a 19.2px checkbox label is not a desktop
design choice, it is a small target that happens to have a mouse beside it. The checkboxes are
labelled and the label toggles them, so the label is the target and the label gets the height.

**Touch policy.** `canvas { touch-action: manipulation }` instead of `none`, because `none` also
forbids pinch-zoom over the play area — an accessibility cost this stage exists to remove. Hand cards
keep `none`, because M6's drag starts there and a gesture that scrolled the page halfway across the
board would be worse. `user-select: none` on controls, **`text` restored on the rules and collection
screens**, because those are prose.

**What it cost.** 44px targets put 320×568 **77px over** — the toolbar wrapped to two rows, because
the mode bar, the gear button and their gaps came to 302px in a 300px column. Two pixels over, and it
cost 56px of height. The gap gave 4px, the tray's own padding 13, body padding and gaps the last 6.
**320×568 is now 6px over: 1% of the screen, on the oldest device in the matrix, below this plan's own
360×640 target.** Everything from 360px up fits with the full floor applied.

**Learned:**

- **The probe only measured sizes, so half of this stage was invisible to it.** `touch-action`,
  `user-select` and the target floor are now read back as computed style and flagged. Verified by
  computed style directly first — I would otherwise have been asserting CSS I had never seen applied.
- **An eighth silent replace, and it hid four passing mutations.** The edit adding the verdict checks
  matched nothing and reported nothing. The first mutation run then showed "fits" for a board with
  `touch-action: none`, which should have been impossible — and was, once the checks were actually in
  the file. **Every multi-line replace now asserts its anchor before writing.** This one bit twice:
  the code did not land, and then the test of the code did not land.
- **Measuring at the edge is a budget, and this stage spent most of it.** Before M5 the 320px device
  had ~23px of slack. A 44px floor on six controls costs far more than that, so it had to come out of
  the toolbar wrapping first — which came down to **two pixels** in a gap.

**Verified by mutation**, all caught: the 44px floor removed (six controls under 44px), the board back
to `touch-action: none`, the hand cards allowed to pan, the rules screen left unselectable, and
`user-select` removed from the controls.

**Next:** M6, drag-to-place. The hand cards already carry `touch-action: none` for it.
**Files touched:** `index.html`, `src/ui/layoutProbe.ts`, `tools/viewport.ts`, `MOBILE.md`,
`MOBILE-baseline.md`, `STATUS.md`

---

### S28 — 2026-10-11 — M3: every portrait phone fits, and the board got bigger

**Status:** mobile stage M3 complete. **745 tests** (up from 743).

**Measured first, then spent.** At 375×667 the page was **97px too tall**. The cuts, with a reason
each is safe, are tabulated at the top of M3 in `MOBILE.md`. The cheapest was not in the plan: an
empty `.hint` was holding a line box, 19px plus its gap, on every screen including desktop — 27px on
a phone spent saying nothing.

**Every portrait device in the matrix now fits**, 320×568 upwards, and the board is **larger** than
before any of this: 300px at 320 wide, 370px at 390.

**The harness was missing a verdict it should have had.** Every one of these changes initially passed
the mutation check, because the harness asked "are the board and the hand on screen" and there is
headroom below the hand. "Fits" is a different claim. `pageOverflowPx` is now measured and flagged —
which is the criterion M2 promised in the first place and had never encoded. Four of the six changes
are caught by it.

**Two are still not, and the reason is worth writing down rather than hiding.** Reverting the arrow
sprite (22px) or the body padding (12px) individually still fits at 320px, which has ~23px of slack.
**Measuring at a boundary only catches changes larger than the boundary's headroom.** So the _policy_
— which card width shrinks the sprite — was pulled out as a pure `previewSizeFor(widthPx)` and pinned
in Node, the only level that can hold it.

**Learned:**

- **A seventh silent replace.** The anchor was a comment sitting _before_ an `@media`, matched as if
  it were inside the braces. Nothing applied, nothing errored, and I read the unchanged numbers as
  "the cuts weren't enough" — they had never run. Every multi-line replace now asserts its anchor.
- **`npm run viewport` builds; `npm run verify` does not.** After reverting a mutation I served a
  `dist/` that still contained it and spent a while debugging a `matchMedia` that was working fine.
  A stale build is indistinguishable from a live bug.
- **A first pass cannot measure the thing it is about to create.** The arrow sprite asked its card for
  a width while the card was still being built, so every card measured zero and every sprite stayed
  full size — on exactly the screens the change was for. A detached element measures nothing; that is
  the normal state of a component under construction.

**Verified by mutation**, all caught: empty hint restored (52px over at 320), title kept (33px),
Settings label kept (44px), gaps back to 12px (14px), sprite policy always full size, sprite threshold
moved so nothing shrinks. The last two are caught by `tests/ui/hand.test.ts` rather than the harness,
for the reason above.

**Next:** M5, touch targets — six controls are still under 44px, on phones and desktop alike.
**Files touched:** `index.html`, `src/ui/components/hand.ts`, `src/ui/layoutProbe.ts`,
`tools/viewport.ts`, `tests/ui/hand.test.ts` (new), `MOBILE.md`, `MOBILE-baseline.md`, `STATUS.md`

---

### S27 — 2026-10-11 — M4: the settings disclosure, and §5.4 settled by arithmetic

**Status:** mobile stage M4 complete. **743 tests** (up from 729).

**Did:** `src/ui/components/menu.ts`. The toolbar collapses behind one Settings button below 48rem;
above it the panel is simply part of the bar and the trigger is hidden, so the markup is the same shape
either way. `main.ts` decides with `matchMedia` through a new `matchQuery` wrapper in
`accessibility.ts`, because jsdom has no `matchMedia` and a second hand-rolled guard would be a second
place to get it wrong.

**Measured:** the toolbar was **141px at 320px and 104px from 360 to 560**. It is now **79px at 320
and 34px from 375 up**.

**§5.4, settled by the numbers rather than by taste.** The plan left open whether the preference
toggles belong in the menu, against `toolbar.ts`'s written principle that audio and motion must not be
buried in a submenu. Leaving them inline saves nothing below 768px: the mode bar and the opponent
`<select>` already fill two rows and the two 19px checkboxes take a third. **The row they occupy is
the row the panel would have freed.** They go in, and what survives of the principle is a marker on
the trigger — a dot and an explanatory `title` when a preference is off its default, so the state is
visible without opening anything. The button's word stays "Settings" so the bar does not reflow.

**Learned:**

- **It is a disclosure, not a menu, and the plan's word was wrong.** The panel holds a `<select>` and
  two checkboxes. `role="menu"` promises arrow-key roving focus and an item-per-command model, which
  is a lie assistive technology would act on. `aria-expanded` + `aria-controls` is what this actually
  is, and it is less code.
- **The outside-click listener has to be torn down, and the test for that is easy to write wrong.** The
  first version of the teardown test attached the listener to a `host` the test had **never rendered
  anything into** — `host` was empty, an optional-chained dispatch did nothing, and the test passed
  against a component that was never in the document. Sixth time this shape has bitten in this project.
  The assertion now fails if the panel is not on screen first.
- **A cast can fabricate a value the type says is impossible.** `needsAttention` briefly returned
  `undefined` and I rewrote the source to defend against it. The real cause was my own test casting
  `{ reduceMotion: null } as Settings`, which has no `audio` — an object `Settings` cannot be. The
  source was right and the test was lying. Tests now build settings through a helper that fills the
  rest in.
- **`matchMedia` does not exist in jsdom**, and the codebase already had a safe wrapper for the
  reduced-motion query. Reaching for a second one would have been the second place to get it wrong, so
  the existing guard was generalised instead.
- **A `python` replace that matches nothing is silent, and it happened again.** Two of my media
  blocks never landed because the anchor — an emptied-out `@media (max-width: 40rem)` left behind by
  an earlier edit — no longer contained what I was matching. Caught by grepping for the rules I had
  just "added" and finding two `@media` blocks where there should have been four. **Confirm the
  selector you targeted still exists before replacing against it.**

**Verified by mutation**, seven and all caught: `aria-expanded` hardcoded, the panel never hidden,
inside-clicks closing it, the teardown not removing its listener, Escape not restoring focus, the
marker always on, and the marker computed but never applied to the button. Forcing `isNarrow()` false
is caught by the harness instead: the toolbar returns to 104px and eight undersized controls reappear.

**Next:** M3 — the `h1`, the mode note and the flex gaps. They are the whole of what still keeps the
hand tray below the fold at 320-375px, and it is the last thing between this and a phone that fits.
**Files touched:** `src/ui/components/menu.ts` (new), `src/ui/components/toolbar.ts`, `src/main.ts`,
`src/ui/accessibility.ts`, `index.html`, `tests/ui/menu.test.ts` (new), `tests/ui/toolbar.test.ts`,
`MOBILE.md`, `MOBILE-baseline.md`, `STATUS.md`

---

### S26 — 2026-10-11 — M2 revisited: the first version shipped broken, and the harness said so

**Reported:** a screenshot of an iPhone 14 Pro showing the board painted across the toolbar, the
status line and the hand tray, with two of the five hand cards missing.

**Status:** mobile stage M2, corrected. **729 tests** (unchanged — see below).

**Answer to the question asked — "are the next stages taking care of this?" — no, and that was the
right thing to push back on.** Overlapping elements is not something M3 or M4 addresses; it was a bug
I introduced two commits ago and shipped as working.

**Three bugs, and every measurement I had was wrong in the same direction.**

- The board slot was `flex: 1 1 auto; min-height: 0`, so it could shrink. `max-height: 100%` on the
  canvas does **not** clamp against a flex-shrunk grid area — the percentage never resolves — so the
  canvas kept its 361px width-derived size inside a 164px slot and painted over everything below it.
- The probe read `documentElement.scrollHeight`. Once `body` became the scroller that number says
  nothing about the content, so a page 205px too tall was reported as fitting.
- The narrow hand-card rules sat _before_ the shared rule setting `min-width: 7.5rem`. A media query
  adds no specificity, so the later rule won: five 120px cards in a 361px tray, two of them clipped
  away by `overflow-x: clip` with no scrollbar to explain it.

**Learned:**

- **Containment is not collision.** Every probe measurement asked "is this element inside the
  viewport" and every one was true, while the page was visibly broken. The probe now checks overlap
  too — and watches the **canvas**, not only its wrapper, because what escaped was a child overrunning
  its own parent, which no sibling comparison can see. The first version of that check flagged the
  canvas and its slot as an overlap, since the canvas genuinely is inside the slot; nested pairs are
  now excluded.
- **A screenshot is a measurement tool, and I built an instrument instead of using one.** The harness
  was careful, thorough, reproducible and wrong. It is still the right instrument — it now catches the
  regression, verified by re-introducing it — but it answered a narrower question than the one the page
  was failing.
- **A media query adds no specificity.** Twice now, on two different rules, a narrow-screen override
  placed next to the thing it styled was beaten by a base rule further down the file. Both times it
  was silent. All narrow rules now live together at the end, and the hand rules were moved to sit
  after the shared block they have to override.
- **`safe center` is not `center`.** With plain centring, content taller than the body is laid out
  starting above the top edge, where no amount of scrolling can reach it. The board measured at
  **y = −41px**. One keyword.
- **`96vw` is the viewport, not the element.** `.toolbar-bar` and `.collection-panel` were
  `min(64rem, 96vw)` inside a body with 32px of padding, so both were 16px too wide on every device.
  The new `overflow-x: clip` turned that from visible to invisible, which is worse until you know to
  look for it.
- **`container-type` costs you the content width.** Querying the _card_ rather than the screen is the
  right question, but inline-size containment means the card reports no intrinsic width, so the tray
  shrink-wrapped around it and collapsed to 154px — 24px per card. It needs `width: 100%`.
- **I retracted a claim in writing rather than quietly editing it.** S25 said every portrait size fitted
  and that M1's regression was resolved with nothing traded away. Both were true only of a measurement
  that was itself broken. MOBILE.md now carries the retraction at the top of M2.

**Still M2's shape, not fixed here:** 320-375px hands are below the fold because the toolbar is ~300px
there, which is M4. Landscape is M7. Eight controls are under 44px on every device, which is M5.

**Verified by mutation:** re-introducing the two-part cause (a shrinking slot plus `max-height: 100%`)
makes the harness report `board canvas / controls`, `/ status`, `/ hand` and `/ mode note` with their
intersection areas. The fixed build reports none.
**Files touched:** `index.html`, `src/ui/layoutProbe.ts`, `tools/viewport.ts`, `MOBILE.md`,
`MOBILE-baseline.md`, `STATUS.md`

---

### S25 — 2026-10-11 — M2: everything fits, and M1's regression is gone

**Status:** mobile stage M2 complete. **729 tests** (up from 728).

**Did:** `viewport-fit=cover`, `100dvh` with a `100vh` fallback, safe-area insets in the body padding,
`overflow-x: clip`, and the canvas moved into a `flex: 1 1 auto; min-height: 0` slot with
`max-width: min(100%, 560px)` / `max-height: 100%` and **no** `width` or `height` — leaving both
`auto` is what lets the two constraints clamp together and keep the board square. `ResizeObserver`
replaces the `window.resize` listener.

**Measured, before → after:**

|                                      | before             | after                           |
| ------------------------------------ | ------------------ | ------------------------------- |
| page height, every portrait phone    | 209–486px too tall | **fits**                        |
| page height at 1280×720              | 284px too tall     | **fits, exactly 720**           |
| board and hand tray visible together | never              | **every size except landscape** |
| hand tray on a 320px phone           | 481.8px tall       | **161.5px**                     |
| board at 1280×720                    | 560×560            | **560×560, unchanged**          |

M1's regression is resolved and **nothing is traded away** — desktop kept its full-size board,
because with the tray on one row there is room for it.

**Learned:**

- **The stage order in the plan was wrong, and only measurement could say so.** The plan put the hand
  tray in M3. M0's numbers showed it was 444px tall on a 390x844 phone — 46% of everything that was
  not the board — because five cards at `min-width: 7.5rem` (120px, not the ~76px I estimated) wrap
  into three rows. No viewport work fixes a tray that wraps, so it came forward into M2 and M3 is
  now the rest of the chrome.
- **`min-height` is not `height`, and the difference is the whole feature.** The first attempt kept
  `min-height: 100dvh` and the board still would not shrink: a _minimum_ lets the body grow to its
  content, and then the flex slot has no overflow to distribute. Constraining the body is what makes
  the slot do anything.
- **`max-width` and `max-height` only preserve a square when both dimensions are `auto`.** Setting
  either one lets the other clamp independently and the board goes rectangular. Worth writing down
  because the fix — removing a declaration — looks like no change at all.
- **Two of the four changes here are invisible to the test suite.** Reverting the body height, or the
  hand tray, leaves all 729 tests green; only `npm run viewport` catches them. That is MOBILE.md §6's
  "no layout gate until M9" arriving again, now with two named examples rather than a warning.
- **A fixture can drift while every test passes.** `index.html` gained `.board-slot` and the
  hand-written `page()` fixtures did not. The boot test's own comment says it can only catch a
  missing element "if the fixture really does mirror the page" — which was true as a claim and false
  as a fact. Both halves are now checked: a test walks every `id` in `index.html` and asserts the
  fixture has it. Writing that test caught a bug in the test itself on its first run.
- **I took a mutation backup after mutating**, then restored the broken file and spent a cycle
  wondering why the baseline was red. The lesson is boring and cost four minutes: back up first,
  mutate second, and confirm the restore with `git diff` before believing anything downstream.

**Two deviations from the plan, both recorded in MOBILE.md:** `ResizeObserver` instead of
`visualViewport` (the plan assumed JavaScript would still own the size; now that CSS does,
`ResizeObserver` is both sufficient and more precise), and the hand tray pulled forward from M3.

**Next:** M3 — the rest of the chrome (hiding the mode note and key legend by width, tightening gaps).
Then M4, the toolbar overflow menu, which is the next thing standing between this and a board that
could be larger on a phone.
**Files touched:** `index.html`, `src/main.ts`, `src/ui/layoutProbe.ts`, `tools/viewport.ts`,
`tests/ui/boot.test.ts`, `tests/ui/hotseat.test.ts`, `MOBILE.md`, `MOBILE-baseline.md`, `STATUS.md`

---

### S24 — 2026-10-11 — M1: the board sizes itself, and the two guesses are gone

**Status:** mobile stage M1 complete. **728 tests** (up from 714).

**Did:** `src/ui/sizing.ts` — a pure `boardSizing({boardPx, displayPx, devicePixelRatio,
maxDisplayPx})`. `fitCanvas` no longer decides anything; CSS gives the canvas `width: min(100%, 560px)`
with a square aspect ratio, and `main.ts` reads the rect and works out the backing store and the
transform. **`MIN_VIEWPORT` and the hardcoded `260` are deleted.**

**Measured before and after, from the M0 harness:**

- Board at 320×568: **420×420 at x=-50 -> 288×288 at x=16**. Fifty pixels off-screen on _each_ side,
  now on neither.
- Board at 414×896: 420×382 -> 382×382. At 768 and above: 560 everywhere, desktop unchanged.
- **Sideways overflow: gone at every one of the nine sizes.**
- **The board is now fully visible on every phone in portrait**, which it was not on any of them.

**Learned:**

- **I introduced a regression and wrote it into the next stage's acceptance criteria rather than
  glossing it.** Removing the height cap without yet replacing it let the desktop board grow from 460
  to its natural 560, pushing the hand tray further below the fold: the 1280×720 page went from 184px
  to 284px taller than the screen. Nothing that worked stopped working — M0 established that the page
  was _already_ 184px too tall — but it is a regression and it belongs to M2. M2's "done when" now
  says so, with a number to check against.
- **A fix nothing can test is a fix that will rot.** The other consequence of M1 — `min-width: 0` on
  `.opponent-select`, without which a 320px screen scrolls sideways — is verified _only_ by
  `npm run viewport`, which is report-only until M9. No unit test can see a CSS overflow. That is
  MOBILE.md §6's "nine stages with no layout gate" risk arriving early and concrete, and it is the
  strongest argument for finishing M9 sooner rather than later.
- **`min-width: 0` is the whole trick, and it is not obvious.** Capping the control with `max-width`
  did nothing: the percentage resolved against a shrink-to-fit parent, so `min(18rem, 100%)` was
  still 288px. A flex child only shrinks below the intrinsic width of its content when its
  `min-width` is zero. Found by measuring, after the first attempt looked correct.
- **Two tests are not the same as one test.** "Rises with the space it is given" failed on the very
  first input — because a canvas measuring zero is _unmeasured_, not very small, and answers
  differently on purpose. Rather than start the loop at 1 and move on, the discontinuity is now
  pinned by its own test, because it is a rule someone will otherwise "fix".
- **The boot test was asserting the bug.** It checked the board was never below 420px — the exact
  floor M1 exists to delete. Rewritten to assert the new arrangement (JavaScript does not size the
  board; an unmeasurable canvas is left untouched). Counting `setTransform` calls would not have
  worked: the hand tray's arrow previews call it five times.

**Verified by mutation**, seven and all caught: the `maxDisplayPx` clamp removed, `cssScale` pinned to
1, the backing store reverted to `boardPx * dpr`, the unmeasurable fallback removed, the `dpr`
sanitisation removed, both `RangeError` guards removed, and `fitCanvas` no longer bailing on an
unmeasurable canvas.

**Next:** M2, which owns the regression above — the viewport and document work (`dvh`, safe areas,
`overflow-x: clip`, and the flex slot that gives the board a height to fit into).
**Files touched:** `src/ui/sizing.ts` (new), `src/main.ts`, `index.html`, `tests/ui/sizing.test.ts`
(new), `tests/ui/boot.test.ts`, `MOBILE.md`, `MOBILE-baseline.md`, `STATUS.md`

---

### S23 — 2026-10-11 — M0: a headless browser, and what the page actually measures

**Status:** mobile stage M0 complete. **No product code changed** — the probe is inert without a query
parameter. 714 tests unchanged. Plan: `MOBILE.md`.

**Did:** installed Playwright as a devDependency, added `src/ui/layoutProbe.ts` (the measurement, in
the app, so the tool and the on-device overlay share one implementation), `tools/viewport.ts` behind
`npm run viewport`, a `?debug=layout` overlay, and `MOBILE-baseline.md` — byte-identical across runs.

**Measured, and worse than estimated:**

- **The board is 420x420 on every device measured.** Confirmed the `MIN_VIEWPORT` floor. On a 320px
  screen it is centred at x=-50, so 50px is off-screen on _each_ side.
- **The chrome is 1117px on a 320x568 phone — three times the ~390px this plan estimated.** The page
  is **969px taller than the screen**.
- **The page also overflows on a 1280x720 laptop**, by 184px, putting the hand tray below the fold.
  The layout has never fitted; it has fitted well enough that nobody noticed, because a mouse scrolls
  without ceremony.
- **Eight controls are under 44px on every device, desktop included.** Mode buttons 33.6px, the
  opponent `<select>` 27px, both preference toggles 19.2px, the two bottom buttons 40.5px. This is a
  pre-existing accessibility problem that mobile merely makes unforgivable; M5 fixes both.

**Learned:**

- **The harness was wrong three times, and each time it _under-reported_.** None of the three was
  caught by a test — they were caught by reading its own output, which is the whole argument for
  having the thing print something a person reads.
  1. It measured a page that had not finished rendering: the toolbar and hand are built by
     JavaScript, and a report taken at `load` found 2 controls where there are 13. Fixed with a
     `MutationObserver`, which also keeps the on-device overlay live.
  2. It counted bare `<input type=checkbox>` elements at ~13px instead of the `<label>` around them.
     Tapping the label toggles it, so the label is the target — and counting the input would have
     made both preference toggles a permanent false positive in the M9 gate.
  3. **`isMobile: true` hid the very overflow the tool was installed to find.** Chromium honours
     `width=device-width` and then _expands the layout viewport to absorb overflowing content_:
     asked for 320px it reported 370, and the 50px it absorbed never appeared in the measurement.
     Dropped for `hasTouch` alone.
- **A number I estimated being three times wrong is the strongest argument yet for having built the
  measuring instrument before acting on the arithmetic.** Every "chrome is about 390px" in the plan
  was mine, and every one of them was wrong.
- **Report-only was the right call, twice over.** The layout does not fit, so an assertion would have
  been red on arrival; and a gate that is red for a reason nobody is currently working on is how a
  gate gets ignored.

**Next:** M1, the sizing core — `cssScale` derived from a measured rect, with `MIN_VIEWPORT` and the
`260` both deleted. M0's numbers say the chrome, not the board's own sizing, is what costs the space,
so M1 should be read as removing a guess rather than changing a size.

**Files touched:** `src/ui/layoutProbe.ts` (new), `tools/viewport.ts` (new), `src/main.ts`,
`package.json`, `package-lock.json`, `MOBILE.md`, `MOBILE-baseline.md` (new), `STATUS.md`

---

### S22 — 2026-10-11 — mobile: a plan, not code

**Status:** planning only. **No code changed.** Design written to `MOBILE.md`.

**Asked:** make the game playable on mobile. Scoped as "phone as a first-class target, desktop becomes
the special case", targeting 360×640 portrait.

**What the investigation found.** The blocking defect is not a missing media query — it is
`MIN_VIEWPORT = {1280, 720}` in `fitCanvas`, which floors the board at 420×420 CSS px on _every_
device. On a 375px phone that overflows. The comment says it is deliberate ("below 1280x720 the page
scrolls rather than the board becoming illegible"), which is right for a desktop and wrong for a
phone. Two more sizing defects sit beside it: a hardcoded `260` standing in for the height of the
chrome, and `window.innerHeight`, which is the layout viewport rather than the visible one.

The other finding is the one that constrains the whole plan: **jsdom has no layout engine**, so no
unit test can say whether the board fits on a phone. Every sizing claim available today is
arithmetic. That is the same gap that let four real bugs through in a row — sound firing at the end
of the match, hotseat unwired, the computer playing hotseat's second seat, and an animation system
that had never rendered a single frame.

**The plan** is nine separable stages, each its own commit, each leaving `npm run verify` green:
measure (M0), sizing core (M1), viewport and document (M2), narrow-screen layout (M3), touch targets
and hygiene (M4), drag-to-place (M5), orientation (M6), collection and rules (M7), headless layout
gate (M8), docs (M9).

The load-bearing idea is in §2: **the browser lays out, JavaScript observes.** The current design has
JS compute a pixel size and hand it to CSS, which is the only reason `260` and `MIN_VIEWPORT` exist.
Inverting it deletes both constants and leaves a pure function over numbers we control.

**Open decisions** were resolved after the plan was written: **§5.1 adopt Playwright** (devDependency
only) so "does it fit on a phone" becomes a test rather than a claim; **§5.2 build drag-to-place**,
kept in its own stage so it can be dropped without losing the rest; **§5.3 an overflow menu** for the
narrow toolbar, chosen over horizontal scroll because a stacked panel is what a phone is good at and
because it sidesteps the "what fits at every width" arithmetic entirely.

Deciding §5.1 changed the shape of the plan rather than just confirming it. Playwright means M0 is
**report-only** — a gate would fail immediately on today's layout and leave every later stage red for
the wrong reason — so the layout gate lands at M9 and the ten stages renumbered around it. It also
means the overlap between modes/sound/settling and the desktop layout is now measured rather than
asserted, and it closes the longest standing verification gap in this project.

**One sub-decision is still open (§5.4): what goes in the overflow menu.** It is a question about a
value, not a layout. `toolbar.ts` opens with a written principle — audio and motion must not be
buried in a submenu, "the people who need them are exactly the people least likely to find one" — and
a menu is a submenu. The recommendation is to take the option M0's measurement supports rather than
guess now, and to update that header comment either way, so the rationale and the code cannot
silently disagree.

**Next:** M0. It needs a device or a headless browser to produce its baseline, and the §5.4 answer
falls out of it.
**Files touched:** `MOBILE.md` (new), `STATUS.md`

### S21 — 2026-10-11 — the match was silent, and then it all arrived at once

**Reported:** "it appears that all sounds are played at once at the end of the game." **Correct.**

**Status:** post-completion fix, plus two latent bugs found while fixing it. **713 tests** (up from
695).

## The sound bug

`playEvents` had exactly one call site in the whole program, and it was the end of the match:

```
settleIfFinished() → playEvents(controller.state.history, result.outcome)
```

`history` is the log of the _whole_ match. Measured over 20 greedy matches: **~40 events, ~21 cues**,
all fired in one burst at the final result — about **1.45 seconds** of beeping, in order, long after
the cards they belonged to had landed. During the match itself: nothing at all.

`cuesFor` was right throughout, and `tests/audio/synth.test.ts` covers it well — one cue per event,
the right cue per event, the right ending, silence for imperceptible events. Thirteen tests, all on
the mapping. **Nothing tested when the cues were played.** The right thing, wired to the wrong moment,
is indistinguishable from the right thing to a test suite that only asks "which sounds".

**Fix:** sound fires per action, from `MatchController.dispatch` via an `onAction` hook, timed against
the animation that action just queued. `Animator` now exposes the schedule it actually built
(`lastSchedule`, and `schedule()` which `push` is built on, so there is one implementation), and
`planAction` in `src/audio/schedule.ts` turns events + schedule into `{cue, delayMs}`. A battle is now
heard while its numbers are rolling.

## Two latent bugs, both in hotseat

Found while wiring the fix, both invisible because they are in the seam between the engine and the app:

- **`humanSeats` was never passed.** `MatchController` refused to act for a seat nobody is sitting at
  (S18). `main.ts` was never told. The default is `['player']`, so games against the computer worked
  **by luck**, and **hotseat was unplayable** — the second seat's every turn was refused.
  `isHumanSeat` had sat in `src/game/modes.ts`, correct, tested, and called from nowhere in `src/`.
  The same shape as `Animator.flash`.
- **`stepOpponent` hardcoded the computer to the `'ai'` seat.** In hotseat the second seat _is_ `'ai'`
  and a person is sitting at it, so the computer played that player's turns by itself, the moment the
  board stopped animating. It now asks the mode which seat, if any, the computer holds.

So hotseat had two faults pointing the same way: unwired, it could not be played; wired naively, the
computer played half of it.

**Learned:**

- **The second hotseat bug was only findable by fixing the first.** Restoring the second seat's
  _ability_ to be played immediately exposed that something else was playing it. A bug can hide a bug.
- **An S18 edit had silently no-op'd.** The `humanSeats` wiring was written, reported as done, and
  never applied — a `python` string replace that matched nothing, with no error. `grep -rn humanSeats
src/` would have caught it in one second. **Verify a multi-file edit landed, every time**; a
  replacement that matches nothing is silent, and a script that exits 0 is not evidence.
- **A tested function is not a wired function.** `isHumanSeat` passed its tests for the whole life of
  the bug. The gap was always the call site, and the call site is only observable by booting the app.
  `tests/ui/hotseat.test.ts` does exactly that: boots `main.ts` in hotseat mode and plays the second
  seat with real clicks. A mutation putting a literal `['player']` back in `main.ts` left every other
  test green.
- **A whole-log function called one event at a time keeps its whole-log behaviour.** `planAction`
  passed the outcome to `cuesFor` for every event, which triggers `cuesFor`'s "the log did not
  announce a result, so announce it now" fallback — per event. A five-event log came out as
  `loss, battle, loss, loss, combo, loss, loss`. The argument now means "only if this event is the
  ending".
- **A read-after-write on shared mutable state is a footgun with no test around it.** The hook originally
  read `animator.lastSchedule` after the fact; a mutation that queued anything in between desynchronised
  sound from picture and nothing failed. The hook now _receives_ the schedule.
- **Counting draw calls cannot tell "it is quieter now".** The stub's call total grows every frame
  whether or not anything happened. The announcer is the witness — `main.ts` rewrites it from the turn
  and the board, and `seatLabels` already says "Player 1" / "Player 2" in hotseat.
- **"The turn changed" is not "a card was played".** A contested placement leaves the turn with the
  attacker (§1.7), so the first `placeSomewhere` helper reported a perfectly good move as a failure. It
  now compares the whole announcement.

**Verified by mutation.** Caught: per-action sound removed (3), hotseat wiring reverted (1),
`stepOpponent` seat hardcoded again (2), cues fired instantly (1), outcome leaking into every event
(3), `playTimeline` ignoring its offsets (1). One survivor that is _not_ a bug: dropping
`playTimeline`'s own `isEnabled` check, because `play` has one too — the outer check only avoids
scheduling timers that would do nothing.

**Next:** three user-reported bugs in a row have now all been "wired wrong, tested right". The
standing recommendation is unchanged and stronger: the browser is the only place this class of defect
surfaces.
**Files touched:** `src/audio/schedule.ts` (new), `src/audio/synth.ts`, `src/render/animator.ts`,
`src/ui/app.ts`, `src/game/modes.ts`, `src/main.ts`, `tests/ui/soundTiming.test.ts` (new),
`tests/ui/hotseat.test.ts` (new), `tests/audio/synth.test.ts`, `STATUS.md`

---

### S20 — 2026-10-11 — no animation had ever been seen

**Asked:** "do we have any animations for the turn/battle?" **Answered:** no — and then, on checking,
no animation at all had ever rendered. Not the battle, not the turn, not the placement.

**Status:** feature + latent defect fix. **695 tests** (up from 674).

## The big one: the clock was already past the end

`Animator.push` ended with `this.clock = cursor`, where `cursor` was the _end_ of the schedule it had
just queued. `tick` applies an animation once wall time passes its scheduled end — so every animation
was complete before the first frame was drawn. A card placement logged `opacity 1, scale 1` and a
settled display board on the very next read, and `idle` after a single 1ms tick.

```
immediately after push -> idle: false   frame opacity 1  scale 1  card null? false
after tick(1)         -> idle: true
```

Every existing test still passed, because they all asserted **convergence** — that the display ends up
matching the truth. Convergence holds trivially when everything is applied at once. The assertion
that was missing is the one that matters for an animation: _it has not converged yet, and looks
different part way through_. That is now the first test in the file, and it is deliberately blunt.

`clock` is now wall time and `push` does not touch it; the schedule starts after whatever is already
queued so two quick actions still play in order.

## The battle, which was unreachable twice over

Even with a working clock there was nothing to see. `push` queued per event only when the event had a
`cell` field, and `battle` / `battle-roll` name `attacker` and `defender` — a fight is two cards. So
every battle event was dropped, making `kindFor`'s `'battle'` branch, `frameAt`'s `case 'battle'`, and
`CardFrame.flash` unreachable code. `flash` was additionally read by nothing anywhere: computed every
frame by the one component that made it, and drawn by none. That is now the whole battle.

**The count runs down.** `atkActual = atkBase - atkRoll` (§1.6) — the attacker subtracts its roll, so a
bigger ATK is a liability. I wrote the test assuming it counted up and the implementation corrected
me, which is the right way round, but it is worth writing down: the dramatic beat is a number falling
from the card's printed stat to what it actually rolled.

**Turn handovers** now get a halo behind the seat that gained the turn. Deliberately _not_ queued: it
is decorative, and putting it in `queue` would let a slow frame cost somebody a move.

**`totalDuration` was lying.** It counted `turn` and `winner` events, which occupy no screen time — it
reported 864ms for a fight that occupied 240. Nothing used it, so nothing caught it. It is exported,
so it can be pinned, and now is.

**Learned:**

- **Convergence is not animation.** Every animator test checked the end state, and the end state was
  always right. A system that does nothing and a system that animates are indistinguishable if you
  only assert where they finish. Mid-flight assertions are a different kind of test, and this codebase
  had none of them.
- **A component that computes a value nothing reads is a silent no-op.** `flash` was the clearest
  example I have seen: correct maths, sensible name, a comment about tinting cards, and no reader.
  Worth treating as a review question on sight — "who draws this?"
- **Two of my own new tests passed for the wrong reason**, in the exact shape of the bug I was fixing:
  - "the board renders differently mid-fight than after it" is satisfied by _any_ difference. A
    mutation that computed the roll perfectly and never drew it **survived**. Fixed by asserting the
    counting number and the odds line appear as `fillText` on the canvas.
  - "the glow is on the correct side" counted `arc` calls, and both sides draw exactly one arc. The
    mutation that moved the glow to the centre **survived**. Fixed by recording arc geometry — the
    same reason `canvasStub` records text x/y/align.
- **Two rules, one cause.** `cellsFor` now asks "which cells does this event touch", which is a
  question about the data. The old question was "does this event have the one field I happened to
  check", which is a question about my assumptions.
- Animator queue depth over 200 matches went from 8 to 18 (budget 64) — animations now occupy real
  time, so they stack. Frame p95 is 0.0005ms against a 4ms budget.

**Verified by mutation**, all caught: clock advanced to end of schedule (6), battle events dropped
again (3), roll computed but never exposed (2), board never draws the overlay (1), overlay draws
nothing (5), glow never drawn (2), glow on the wrong side (1), turn glow never recorded (3).

**Next:** this is the first change here that only _adds_. Everything before it was repair. Playing it
in a browser is now worth more than anything else on the list, because for the first time there is
something new to see and no test can tell whether it looks right.
**Files touched:** `src/render/animator.ts`, `src/render/cardView.ts`, `src/render/boardView.ts`,
`src/main.ts`, `tests/ui/battleMotion.test.ts` (new), `tests/ui/canvasStub.ts`, `STATUS.md`

---

### S19 — 2026-10-11 — a control on screen that could not be clicked

**Reported:** "after the AI move they don't select the card to fight, and that shows on the UI for the
player to do (and doesn't work)". Follow-up to S18, and the second half of the same defect.

**Status:** post-completion fix. **674 tests** (up from 672).

**The bug:** the latch in `OpponentGate` released "when the turn changes hands". A contested placement
does not hand the turn over — §1.7 gives the attacker the choice of battle order, so `state.turn` is
still the computer's while it owes a decision. The latch stayed shut, the computer was never asked
again, and the match hung on a battle order only the computer could fill in. The interface then put
that order in front of the player, who — correctly, for the first time in this project's history — was
not allowed to act on it. So: a highlighted card, a "choose a battle" label, and a click that did
nothing.

**Did:**

- `OpponentGate` now latches against **the exact state object the decision was made on**. Any action
  produces a new state, so a new state re-arms it; the same state next frame does not. That covers
  cascades, follow-up battle orders and ordinary turns without enumerating them, and still prevents a
  burst of decisions while the animation settles — the state object is identical across frames until
  an action lands. The release on "not our turn" is kept, not because it makes a normal turn work but
  so a stale latch cannot survive into a new match.
- `turnLabel` names the seat choosing a battle order ("Player 2 chooses the battle") instead of the
  bare "choose a battle", which read as an instruction to whoever was looking at the screen.

**Learned:**

- **I had already seen this bug and talked myself out of it.** While fixing S18 the match-running
  driver deadlocked, and I concluded the _driver_ was at fault for doing two actions in one frame. It
  was not. The driver reproduced a real deadlock, and my correction — "not how the app runs" — was
  wrong. I then shipped a fix built on that misreading, and the user found it in a browser. **A
  deadlock is a fact about the system, not a defect in the thing that observed it.** When a harness
  hangs, the first question should be which of the two is wrong, and the answer should not default to
  the harness.
- **The narrower the rule, the narrower the bug.** "Until the turn changes hands" sounded like a safe
  generalisation of "until it has acted". It was not: it assumed every step of a turn is one action,
  and §1.7 makes a turn up to three (place, choose order, resolve). Latching on **state identity** is
  weaker as a statement and stronger as a rule, because it does not need to know what a turn is made
  of.
- **A UI label is part of the contract.** The label did not cause the hang, but it converted a silent
  deadlock into an instruction to act — and pointing at a decision that belongs to someone else is a
  bug even when the underlying flow is otherwise correct. Two of the three bugs in this pair were
  invisible _only_ because the label said "choose a battle" rather than "Player 2 chooses".
- **The controller's new seat guard is what made this visible.** Before it, the player could have
  filled in the computer's battle order, so the hang would have been "the game played itself". Fixing
  bug one exposed bug two, because the workaround had been covering it.

**Verified by mutation**, all caught: latch reverted to the turn-based rule (3 failures, the reported
bug), no latch at all (1), gate ignores pending battle orders (4), bare `choose a battle` label (1).
The driver now reports a stall explicitly rather than spinning 5000 frames, so a deadlock fails with
the seed that produced it.

**Next:** the standing note from S18 applies twice over now. Three bugs in two days, all in the seam
between the engine and the loop that draws it, none of them typos. Play it in a browser; the gate is
the thing to watch.
**Files touched:** `src/ui/turn.ts`, `src/render/boardView.ts`, `tests/ui/opponentTurn.test.ts`,
`tests/ui/scoreBar.test.ts`, `STATUS.md`

---

### S18 — 2026-10-11 — the opponent moved once per match, and then you played for it

**Reported:** "I start a match vs AI, I make the first move, it makes its first one, I make the
second move, and then _I_ am in control of the opponent's second move, instead of the AI making it."

**Status:** post-completion fix. **672 tests** (up from 655).

**Did:** two independent bugs, one hiding the other.

- **The opponent stopped moving after its first card.** The latch that stops it deciding once per turn
  — `thinking` in `main.ts` — was set when it acted and cleared _only_ by `newController`. So the AI
  placed exactly one card and then stood still for the rest of the match.
- **The controller had no idea whose turn it was.** `playAt`, `selectCard` and `chooseBattle` never
  asked. So once the opponent had stopped, a click during its turn placed _its_ card — which is why
  the match kept appearing to work while one person quietly played both sides.

The latch moved out of the render loop into `src/ui/turn.ts` (`OpponentGate`), because the render loop
was the one place no test could reach. Its rule is now stated in full at the top of the file: do
nothing while animating; **release** when the turn is not ours or the match is over; otherwise act
once and latch. The release is the part that was missing, and it is why this is a class rather than a
boolean — a flag you can only clear from one place is a flag you will forget to clear.

`MatchController` gained `humanSeats` (default `['player']`) and an `acceptsLocalInput` getter.
Hotseat passes both seats, because there the opponent genuinely is a person at the same keyboard.

**Learned:**

- **Two bugs, and the second is why the first was survivable.** Neither alone is fatal: the latch bug
  just freezes the opponent, and the missing turn check is inert while the opponent is moving. It is
  the _combination_ that produces "the game works but I play both sides". Fixing either one alone
  would have hidden the other rather than removed it.
- **The existing tests encoded the bug as an assumption.** The controller tests drove one loop to play
  a whole match, which means the single "player" moves for both sides. They passed because they never
  asked who was allowed to. They now say so — via an explicit `bothSeats()` helper — and the seat rule
  has its own tests. When a fix breaks many tests at once, the tests are making a claim about the
  product, and that claim deserves to be read before it is overwritten.
- **Neither guard is independently pinned, and that is correct.** Removing the `selectCard` guard alone
  changes nothing observable, because `playAt` still refuses; removing `playAt`'s alone changes
  nothing, because nothing can be selected. They are redundant defence-in-depth, like the existing
  `busy` guard in `dispatch`. The test pins the pair — and a mutation removing _both_ fails, which is
  the faithful form of this bug.
- **A test that passes for the wrong reason is worse than no test.** My first attempt at "the player
  cannot act on the opponent's turn" passed under every single-guard mutation, because the controller
  was still animating from the preceding placement: every assertion was being satisfied by the `busy`
  guard instead. It only started biting once the test settled the animation first. The mutation is
  what told me; the assertions all looked fine.
- **The test driver has to look like the real loop, or it finds bugs that are not there.** My first
  match-running driver called the gate only on the computer's frames. The gate releases when it
  _observes_ the turn change hands, so that driver deadlocked — which read as a gate bug. `main.ts`
  calls `stepOpponent()` on every frame regardless. Making the driver match meant both the test and the
  comment could say why the shape matters.
- **Fourth time the same class of mistake, in one file.** `newController` touches the latch, and
  `newController` runs during initialisation — so the latch had to be declared with the other state,
  400 lines above its use. `tsc` did not catch it. (Three previous instances: `settled`, and twice on
  `modeId`/`deckSlots`.) **A `const`/`let` that an initialiser reads must be declared above it**, and
  the compiler will not tell you.
- **Verification, not belief.** Four mutations, all caught: release removed (the reported bug — 4
  failures), latch removed (3), both controller guards removed (1), `acceptsLocalInput` always true
  (3). Each was applied, the file diff confirmed, the suite re-run, and the file restored.

**Next:** play it in a real browser. This is the second reported bug that lived in code no test
touched (`main.ts`'s loop), and it is the second time the cause was an untested _assumption_ rather
than a typo. Worth considering a standing rule: anything that decides _when_ something happens belongs
in a module with tests, not in the render loop that draws it.
**Files touched:** `src/ui/turn.ts` (new), `src/ui/app.ts`, `src/main.ts`,
`tests/ui/opponentTurn.test.ts` (new), `tests/ui/controller.test.ts`, `STATUS.md`

---

### S17 — 2026-10-11 — the cursor is a rook: rings, skipping and wrap-around

**Status:** post-completion fix, replacing S16's model wholesale. **655 tests** (down from 660 — the
file is simpler).

**The change.** My first fix made the cursor walk like a chess king under a four-rule cascade: straight
ahead, then a forward diagonal, then a slide along the axis. It worked, and it was over-engineered:
the rules needed _explaining_, which is the sign of a rule that should be _discovered_. The user's
version is better and simpler:

> each row and each column is a **ring**; a direction key advances along that ring to the next playable
> square, wrapping at the edges and stepping over blocked cells.

On the reported board — `left from (0,0) wraps to (0,2); left again skips the blocked (0,1) and
returns to (0,0); down from (0,2) skips the blocked (1,2) and lands on (2,2)` — that is exactly what it
does. The implementation went from 190 lines to 122, and dropped four concepts (candidate ranking,
alignment scoring, the trap check, the mirror-diagonal tie-break) in favour of one loop.

**Measured over all 2,096,128 presses:**

|                                | first fix | rook rings |
| ------------------------------ | --------- | ---------- |
| dead presses                   | 15.2%     | **12.5%**  |
| moves leaving the pressed line | 0         | **0**      |
| walking into a trap            | 0         | **0**      |

The 12.5% that do nothing are rows and columns with _every_ square blocked — genuinely nowhere to go.
Rings also remove a whole class of problem rather than shrinking it: a square with no playable
neighbour is no longer a trap, because you arrive along its row or column instead of stepping in from
next door, and movement is reversible because a ring is a cycle.

**Learned:**

- **Simpler is not a downgrade, and I would not have found it on my own.** I had already declared the
  cascade "four rules, in order" and written a paragraph defending it. The user's proposal had none of
  the machinery and did strictly more. The lesson is not "ask for simpler" — it is that a rule which
  needs a paragraph of justification is usually a sign the problem was framed wrong.
- **The exhaustive tests survived the rewrite unchanged in spirit and caught all three mutations**: no
  wrap-around, not skipping blocked cells, and drifting sideways off the pressed line. Rewriting the
  _implementation_ did not mean rewriting the _guarantees_, which is what made the change cheap to
  verify.
- Two consequences worth _knowing_ rather than discovering: pressing a direction at an edge wraps
  instead of stopping, and there are no diagonals, so the square diagonally across from you takes two
  presses. Both are the user's explicit trade, and both are now the first thing the module's header
  comment says.

**Next:** nothing required.
**Files touched:** `src/ui/cursor.ts` (rewritten), `tests/ui/cursor.test.ts` (rewritten), `STATUS.md`

---

### S16 — 2026-10-11 — the keyboard cursor could get stuck, and could walk into traps

**Status:** post-completion fix. **655 tests**, up from 636.

**Fixed.** Arrow keys moved the cursor by searching the **whole board** for the legal cell nearest the
clamped target, and breaking ties by board order. That had two failure modes:

- **It returned the cursor's own cell.** With cell 3 blocked, Right from cell 2 did nothing: cells 2, 6
  and 7 all sit at Manhattan distance 1 from the blocked target and cell 2 has the lowest index.
  Measured over every board, cell and direction — **2,097,088 presses — 46.5% of key presses were
  dead**, and the cursor teleported more than one square on 106,496 of them.
- **It could walk into a trap.** Movement is one-way per press, so `candidates` is the only door into
  a square. On a board with 0, 1, 2, 6 and 7 blocked, pressing Left from cell 3 stepped into cell 0,
  which has no playable neighbour at all — and the cursor could never move again.

Movement now follows four rules, each asking for _more_ progress along the pressed axis than the last:
straight ahead, then a forward diagonal, then a slide along the row or column over whatever is in the
way, then stay put. A square with no playable neighbour is never entered unless the cursor is already
stuck in one. Ties between mirror diagonals go to the more constrained square, so a corner walled in
on two sides is entered rather than passed by.

**Measured:** dead presses 46.5% → 15.2%, of which **zero** are avoidable; jumps longer than one square
106,496 → **0**; sideways moves **0**; walking into a trap **0**.

**Learned:**

- **The exhaustive test is what found three of these bugs, including two I introduced while fixing
  the first.** Restricting movement to adjacent squares made a walled-in corner unreachable; adding
  the slide then wrapped rows (`cellAt(1, 4)` is cell 8, a real square in the next row, and it sailed
  through a bounds check that re-derived its own row from the wrapped index); and the original
  Manhattan search put the cursor into a square it could never leave. Each was found by checking
  every board rather than the one in the bug report.
- **I set an invariant I could not satisfy, and rather than weaken it I asked what it was for.** "Every
  playable square is reachable from every other" is false: blocking 1, 2, 4 and 5 leaves cells 0 and
  1 playable with each other as their only playable neighbour, and no direction-preserving movement
  can cross into them. The mouse still reaches them. The guarantees that _are_ achievable — no traps,
  no one-way doors except the escape out of a walled-in square — are the ones now asserted.
- **A test that times out is a test nobody runs.** The one-way-door check passed alone and failed the
  full suite on the default 5s timeout. It now uses a smaller board sample, which is sound because the
  rules only depend on adjacency, and an explicit 60s budget, which is honest about what it costs.

**Next:** nothing required.
**Files touched:** `src/ui/cursor.ts` (new), `src/ui/app.ts`, `tests/ui/cursor.test.ts` (new),
`STATUS.md`

---

### S15 — 2026-10-10 — bugfixes: overlapping score text, and arrows you could not see

**Status:** post-completion fixes. **655 tests**, up from 610.

**Fixed:**

1. **The score bar drew three labels on top of each other.** `drawScoreBar` put the two card counts
   at `mid ± 10` and the turn label centred on `mid`, all at the same `y`. The counts ran straight
   through the middle label — and the overlap grew with the counts, so it was worst exactly when the
   score was worth reading. Now left / centre / right across the full width, which cannot collide.
   The turn label also said `player to play`, leaking the internal `Owner` id; it now says
   `Player 1 to play`.
2. **The hand only said "N arrows".** The count without the direction is the one thing you need to
   decide where to play a card, so choosing a square was a guess until you saw the board. Every card
   in the hand, every deck slot and every collection card now carries a small canvas drawn by the
   same `drawArrows` the board uses, plus the directions in words (`points N, E, SW`) for the tooltip
   and the accessible name. A preview and the card it represents cannot drift apart.
3. **Closing the collection dropped an empty panel above the board.** `showCollection` set
   `rulesEl.hidden = showingRules` — which _reveals_ the rules panel when the rules are not showing.
   Two panels each poking the other's flag is the whole cause, so this is now one `showScreen(next)`
   with a `Screen` union, and mutual exclusion is structural rather than remembered.
4. **`.sr-only` was not clipped.** `clip: rect(0 0 0 0)` is invalid CSS — `rect()` requires commas —
   so the declaration was dropped and the live region relied on `overflow: hidden` alone. Now
   `rect(0, 0, 0, 0)` plus `clip-path: inset(50%)`.
5. **The announcer said "You's turn."** A possessive built from a seat name. It now reads
   `Player 1's turn` / `Player 2's turn` in both single-player and hotseat.

**Learned:**

- **The arrow fix passed its first mutation test.** Removing the preview and the directions from the
  hand tray again left the entire suite green — 163 tests, nothing. There was simply no assertion
  that a card showed its arrows. `tests/ui/arrowPreview.test.ts` now covers all three surfaces, and
  the mutation fails eight tests.
- **Counting draw calls would never have caught the overlap.** The score bar still made exactly three
  `fillText` calls when it was broken. The bug was in their _positions_, so the canvas stub now
  records every `fillText` with x, y, alignment and font, and `tests/ui/scoreBar.test.ts` computes
  the horizontal span of each label and asserts no two overlap — at every reachable score, in both
  phases.
- **I deleted a block of `main.ts` by accident** while collapsing the panel flags, and took four
  commits' worth of recovery from `git show HEAD:src/main.ts`. Worth knowing that the file was in
  git and clean at the time, which is the only reason it was a five-second fix rather than an
  afternoon.

**Next:** nothing required. Both reported bugs are fixed and mutation-tested.
**Files touched:** `src/render/boardView.ts`, `src/render/arrowPreview.ts` (new),
`src/ui/components/{hand,deckEditor,collection}.ts`, `src/main.ts`, `index.html`,
`tests/ui/{scoreBar,arrowPreview}.test.ts` (new), `tests/ui/canvasStub.ts`, `README.md`, `STATUS.md`

---

### S14 — 2026-10-10 — Stage 11 complete: the project is done

**Stage:** 11 (Hardening & docs) · **Status:** ⬜ → ✅ · **All 11 stages complete.**
**Did:** `tools/perf.ts` (a real performance gate), `.github/workflows/verify.yml`, a rewritten
`README.md`, and `src/input/keys.ts` merging the documented key bindings with the handler.
**655 tests**, up from 583.

**Learned:**

- **A documented key did nothing, and nothing noticed.** `KEY_BINDINGS` listed eight keys and the
  handler in `main.ts` implemented seven — `Q` was advertised on the page and did nothing. It surfaced
  only because rewriting the README meant checking every claim in it. **A documented binding was just a
  string in an array, so there was nothing to fail.** The list and the handler are now one thing in
  `src/input/keys.ts`, each entry names an action, and `tests/core/keys.test.ts` asserts the agreement
  in both directions. Three mutations confirm it bites: a phantom binding, an action the handler does
  not implement, and a documented action the handler silently ignores.
- **"Under 4ms a frame" was a requirement nobody was measuring.** `tools/perf.ts` now gates on **p95**
  rather than the median, because a frame that is slow one time in twenty is the one a player feels.
  It deliberately does _not_ time drawing: a canvas stub in Node would report the stub's speed, which
  is worse than no number because it looks like a measurement. Measured: animator frame p95 0.0008ms
  against a 4ms budget, AI decision p95 0.036ms against 8ms.
- **"The animator queue stays bounded" needed a getter to be checkable at all.** `Animator.queueDepth`
  now exists, and the bound is asserted over whole matches rather than a synthetic burst — a queue that
  only runs away on a rare cascade is invisible to a burst. It reached depth 8 against a limit of 64.
- `npm run verify` grew two gates: `balance` and `perf`. It is now typecheck → lint → tests → coverage
  → rules audit → 10k simulation → balance → performance, with `build` in CI.
- **Clean-clone verified.** Cloned to an empty directory, `npm ci`, `npm run verify` — exit 0. The
  git history is 11 commits, one per stage, each subject saying what the stage produced.

**Still true, and worth repeating:** the one DoD item not checked for real is rendering. Every stage
was verified in Node and jsdom; nobody has yet watched the board draw on hardware.

**Next:** nothing required. `README.md` and `STATUS.md` carry the state.
**Files touched:** `tools/perf.ts` (new), `src/input/keys.ts` (new), `src/input/pointer.ts`,
`src/render/animator.ts`, `src/main.ts`, `tests/core/keys.test.ts` (new),
`tests/ui/perf.test.ts` (new), `.github/workflows/verify.yml` (new), `README.md`, `package.json`,
`PLAN.md`, `STATUS.md`
