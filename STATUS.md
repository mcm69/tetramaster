# STATUS — Tetra Master Clone

> **Working log.** `PLAN.md` is the spec; this file is the live state.
> A fresh session should be able to continue from these two files alone.
>
> **Last updated:** 2026-10-10 · **Session count:** 11 · **Current stage:** 9 — ready to start

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

| Command               | Purpose                                              |
| --------------------- | ---------------------------------------------------- |
| `npm run dev`         | Vite dev server, http://localhost:8080, HMR          |
| `npm test`            | Unit tests (Vitest). Fast inner loop; commit gate.   |
| `npm run typecheck`   | `tsc --noEmit`, strict                               |
| `npm run lint`        | ESLint + typescript-eslint, incl. architecture rules |
| `npm run coverage`    | Vitest with v8 coverage against the §9.2 thresholds  |
| `npm run rules:audit` | Fails if any §1 rule paragraph has no tagged test    |
| `npm run build`       | Production `dist/`                                   |
| `npm run verify`      | Everything, in order — the full gate                 |

**Commit gate:** `typecheck` + `lint` + `test` green. No skipped tests, no `it.skip` to go green.

---

## Stage Progress

| Stage | Name                                  | Status         | DoD met | Notes                            |
| ----- | ------------------------------------- | -------------- | ------- | -------------------------------- |
| 0     | Scaffold                              | ✅ Done        | ✅      | toolchain green; `verify` exit 0 |
| 1     | Grid geometry & stats                 | ✅ Done        | ✅      | 72 tests; §1.2 + §1.3 traced     |
| 2     | Card catalog                          | ✅ Done        | ✅      | 103 tests; 100 figures           |
| 3     | Resolution engine (takedown + combos) | ✅ Done        | ✅      | 144 tests; §1.4/§1.5/§1.7 traced |
| 4     | Battle math + multi-battle chains     | ✅ Done        | ✅      | 163 tests; §1.6 traced           |
| 5     | Match state machine                   | ✅ Done        | ✅      | 201 tests; §1.1 traced           |
| 6     | Rendering                             | ✅ Done        | ✅      | 248 tests; board on screen       |
| 7     | Playable match UI                     | ⬜ Not started | ☐       | **next up** — first playable     |
| 8     | Opponent AI                           | 🔒 Blocked     | ☐       |                                  |
| 9     | Progression, collection, save         | 🔒 Blocked     | ☐       |                                  |
| 10    | Modes & polish                        | 🔒 Blocked     | ☐       |                                  |
| 11    | Hardening & docs                      | 🔒 Blocked     | ☐       | `verify --strict` green here     |

Legend: ⬜ not started · 🟡 in progress · ✅ done · ⛔ blocked · 🔒 waiting on earlier stage

### Gate status (last run 2026-10-10 — all green)

| Gate                  | Result                                                         |
| --------------------- | -------------------------------------------------------------- |
| `npm run typecheck`   | ✅ pass                                                        |
| `npm run lint`        | ✅ pass — architecture guards verified to actually fire        |
| `npm test`            | ✅ 18 tests / 2 files — both node and jsdom projects exercised |
| `npm run coverage`    | ✅ pass — `src/core/rng.ts` at 100/100/100/100                 |
| `npm run rules:audit` | ✅ pass — 0 traced · 9 pending · 0 untested                    |
| `npm run build`       | ✅ pass — `dist/` produced                                     |
| `npm run dev`         | ✅ verified serving + TS transform over HTTP                   |

---

## Current Focus

**Stage 9 — Progression, collection, save. Stages 0–8 are complete, and the game is finished as a game.**

You now play a full match against an opponent. It scores every legal placement by free captures,
battle odds weighted by probability, combo reach, corner value, exposure and quarantine, across ten
distinct personalities in three difficulty tiers. It beats a random-move baseline by 12–18 points
and it is still very much beatable.

**Nothing persists.** Cards do not grow between matches, there is no collection to browse, and a
reload loses everything. Those are the last two missing rules: §1.8 (stat growth and type evolution)
and §1.9 (collector level).

## Next Actions

- [ ] `progression.ts` (§1.8) — after a **won** match, each used card gains +1 to one of its three
      stats, chosen at random, **wasting the roll if that stat is already capped**
- [ ] Type evolution: a card that **wins any battle** has a 1/32 chance P/M→X and 1/256 chance X→A
- [ ] `collector.ts` (§1.9) — +10 unique figure, +5 unique arrow pattern, +1 X, +2 A; the full
      threshold table, and the `>= 1700` "Would you like to discard?" glitch
- [ ] `save.ts` — versioned localStorage schema with a migration guard
- [ ] Tests: 1/32 and 1/256 rates over 100k trials; collector points against hand-computed cases;
      save round-trip and migration; cap-wasting asserted explicitly
- [ ] Collection and deck-editor screens
- [ ] Remove `1.8` and `1.9` from `PENDING` — this is the last stage that claims rules
- [ ] Update this file and commit as `stage(9): ...` (§7.2)

## Blocked On

Nothing. Stage 9 depends only on Stages 1–8.

## Two lessons from Stage 8 worth keeping

- **My balance harness was wrong twice before the AI was.** First it confined the AI to the `player`
  seat, which loses ~39% of matches; then it reported `win / decided` straight from the outcome, so
  a strong AI playing the `ai` seat registered as _losing_. Both times the AI looked mediocre and
  I nearly "fixed" a healthy evaluation. Instrument first, then judge.
- **The AI had a rule error, not a tuning error.** Its risk term counted enemy arrows already aimed
  at a square — but §1.4 says only the just-placed card attacks, so those arrows can never do
  anything. The AI was fleeing a threat that does not exist, and the penalty outweighed a capture,
  so it played a passive game and lost to random. Correcting the _model_ fixed it; the reweighting I
  tried first had done nothing.

## Blocked On

Nothing. Stage 8 depends only on Stages 1–7.

## Note on the busy guard

`MatchController.dispatch()` refuses actions while the board is animating. Through the UI this is
currently unreachable, because `selectCard` already refuses during an animation and a placement
clears the selection — the test pins the _behaviour_ (no second card is ever placed mid-animation),
not that specific line. The guard is kept deliberately as defence-in-depth at the single choke point,
because the AI in Stage 8 will dispatch without holding a selected card. Reassess once the AI lands.

## Blocked On

Nothing. Stage 7 depends only on Stages 1–6.

## Blocked On

Nothing. Stage 6 depends only on Stages 1–5.

## Balance Note for Stage 8

A side observation from this stage's sweeps, recorded so it is not rediscovered later:

- Matched decks, both sides playing the same policy, give a near-even split (39.9% / 38.5%), so
  **turn order carries no positional bias**. Good.
- **Clustering cards raises the perfect-game rate roughly 1.7x** (10.0% vs 5.9% for a corner-greedy
  policy). This is a genuine strategic property — dense adjacency maximises combo cascades — and
  matches the community advice to avoid bunching up. Not a bug, but Stage 8's `balance.ts` should
  check the AI does not fall into it.

## Blocked On

Nothing. Stage 5 depends only on Stages 1–4.

## Blocked On

Nothing. Stage 4 depends only on Stages 1–3.

## Blocked On

Nothing. Stage 2 depends only on Stage 1.

## Next Stage Preview

Stage 6 is **rendering** — the canvas board, procedural card art, arrow sprites, and the animator
that replays the event log. Everything it needs already exists: `GameEvent` is an exhaustive
discriminated union, and a full match produces a complete, ordered log of it. HMR is already
wired, so visual work will iterate quickly. Note that `src/render/**` is gated at only 60%
coverage (§9.2) — pixel output is deliberately not asserted (§9.4); smoke plus manual play.

---

## Decisions

Settled. Do not revisit without a strong reason; if you do, log it here with the new date.

| Date       | Decision                                                                                                | Rationale                                                                                                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-10 | **TypeScript + Vite** (switched from vanilla ES modules)                                                | Type safety is the main defence for a rules engine this branch-heavy; Vite gives HMR and a real production build                                                                                  |
| 2026-10-10 | `strict` + `noUncheckedIndexedAccess`, `any` banned                                                     | The grid is `Cell[]` indexed 0–15; the flag forces honest handling of out-of-range and undefined                                                                                                  |
| 2026-10-10 | **Vitest**, replacing `node:test`                                                                       | Shares Vite's transform pipeline, one config for tests and coverage, native ESM                                                                                                                   |
| 2026-10-10 | Two Vitest projects: `node` env for core/ai, `jsdom` for ui                                             | Keeps the DOM-free guarantee of `core`/`ai` mechanically enforced                                                                                                                                 |
| 2026-10-10 | Coverage is three signals, not one number: rule traceability + gated coverage % + simulation invariants | Line coverage can't tell you a rule is inverted; traceability is the real bar (`PLAN.md` §9)                                                                                                      |
| 2026-10-10 | Tests tagged `[§1.6]`-style; `rules:audit` fails CI if a §1 paragraph is untested                       | Makes "is this rule covered?" a build failure instead of a review comment                                                                                                                         |
| 2026-10-10 | `src/core`/`src/ai` coverage ≥ 95% lines / 90% branches; UI/render ≥ 60%                                | Floors to catch new untested code; not the definition of done                                                                                                                                     |
| 2026-10-10 | Zero **runtime** dependencies; devDependencies expected                                                 | Nothing ships to the browser from `node_modules`                                                                                                                                                  |
| 2026-10-10 | All randomness via injectable seeded RNG; no `Math.random()` in `core`/`ai`                             | Battle outcomes are ~random by design; determinism is what makes §1 testable                                                                                                                      |
| 2026-10-10 | `src/core/` and `src/ai/` must be DOM-free                                                              | Lets the rules engine run headless for the 10k-match verification                                                                                                                                 |
| 2026-10-10 | Engine as a pure reducer returning an event log; renderer consumes events                               | Testable rules, animatable presentation, no coupling                                                                                                                                              |
| 2026-10-10 | Rules sourced from Trifthen's GameFAQs doc (2000/2001), cross-checked vs. xvw.lol and Caves of Narshe   | The three sources agree; the original in-game rules are undocumentable                                                                                                                            |
| 2026-10-10 | Show exact stats and win probability in the UI                                                          | Deliberate deviation from the original, which hid this information — see `PLAN.md` §7.4                                                                                                           |
| 2026-10-10 | Card art and audio are 100% procedural                                                                  | No copyrighted FF9 assets may enter the repo                                                                                                                                                      |
| 2026-10-10 | Include a player-facing rules screen                                                                    | The original shipped none, which is the game's single most-cited flaw                                                                                                                             |
| 2026-10-10 | **All 8 open questions resolved to their defaults**                                                     | User sign-off, 2026-10-10. Defaults are recorded per-question below                                                                                                                               |
| 2026-10-10 | `rules:audit` tracks **PENDING** rules by stage instead of failing on every untested rule               | An always-red gate gets ignored. Implementing a rule means deleting its `PENDING` entry, which is what makes the test mandatory. Verified: removing an entry without a test makes the tool exit 1 |
| 2026-10-10 | `src/core` coverage enforced **per file** (95/90/95), not just in aggregate                             | Subsumes the plan's "five hardest files" clause without special-casing filenames                                                                                                                  |
| 2026-10-10 | Node 26 runs `.ts` directly; no `tsx` dependency                                                        | `node tools/rules-audit.ts` works natively under type stripping                                                                                                                                   |

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
