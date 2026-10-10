# STATUS — Tetra Master Clone

> **Working log.** `PLAN.md` is the spec; this file is the live state.
> A fresh session should be able to continue from these two files alone.
>
> **Last updated:** 2026-10-10 · **Session count:** 5 · **Current stage:** 3 — ready to start

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
| 3     | Resolution engine (takedown + combos) | ⬜ Not started | ☐       | **next up** — highest value      |
| 4     | Battle math + multi-battle chains     | 🔒 Blocked     | ☐       |                                  |
| 5     | Match state machine                   | 🔒 Blocked     | ☐       |                                  |
| 6     | Rendering                             | 🔒 Blocked     | ☐       |                                  |
| 7     | Playable match UI                     | 🔒 Blocked     | ☐       |                                  |
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

**Stage 3 — Resolution engine. Stages 0–2 are complete and every gate is green.**

The foundation is done: grid geometry with verified no-wrap adjacency, card anatomy, hex→interval
mapping, the type table, the corrected probability formula, and 100 playable figures. No match logic
exists yet — nothing consumes the catalog.

**Read before Stage 3:** `PLAN.md` §1.4, §1.5, §1.7, and the pseudocode in §5.3. This is the stage
where players most often get the rules wrong, and where a subtle inversion would be invisible in
aggregate statistics.

## Next Actions

- [ ] `tests/fixtures.ts` — builders for named board scenarios. Each fixture's _expected_ result is
      written out inline, derived by hand from the rules rather than from the code
- [ ] `src/core/resolution.ts` — implement `resolvePlacement()` per §5.3 exactly. Battle branch
      stubbed to always-lose until Stage 4
- [ ] `tests/core/resolution.test.ts` — no-arrow placement, single takedown, multi-arrow takedown,
      takedown into a blocked cell, blocked-cell adjacency, **no second-degree combo**, arrows
      pointing off-grid, and combo firing only after a battle
- [ ] Tag tests `[§1.4]` and `[§1.5]`, remove `1.4` and `1.5` from `PENDING` in
      `tools/rules-audit.ts`
- [ ] `resolution.ts` must meet 95% lines / 90% branches per file
- [ ] Update this file and commit as `stage(3): ...` (§7.2)

## Blocked On

Nothing. Stage 2 depends only on Stage 1.

## Next Stage Preview

Stage 3 is the **resolution engine** — arrow takedown and the combo cascade (§1.4, §1.5). It is
the highest-value stage in the plan: the rules players most often get wrong. The battle branch is
stubbed to always-lose until Stage 4, and `tests/fixtures.ts` will hold hand-built named boards
("two pending battles where winning the first combos the second") with the expected cell list
written out inline.

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
