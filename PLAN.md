# TETRA MASTER — HTML5 Clone

A faithful, browser-based reimplementation of the Tetra Master card game from _Final Fantasy IX_ (PS1, 2000).

This file is the **specification**. It contains the rule set, the architecture, and the stage plan.
For live progress, see `STATUS.md`.

---

## 0. Project Charter

**Goal:** A playable, rules-accurate Tetra Master that runs in any modern browser.
TypeScript + Vite: `npm install && npm run dev` to play, `npm run build` to ship a static `dist/`.
Canvas 2D for the board, strict types for the rules engine.

**Non-goals:**

- Reproducing FF9's art, audio, or UI. All card art is **original and procedural** (see §7.5).
- Shipping copyrighted assets. No ripped sprites, no ripped audio, no ripped card scans.
- A full FF9 story mode. We build the _card game_, not the RPG.

**Design priorities, in order:**

1. **Rules fidelity.** The battle math, combo rules, and progression must match the researched
   original rules (see §1). This is the whole point. The type system enforces it: card types,
   event kinds, and reducer actions are discriminated unions, so a new card type or a missing
   `case` in the resolution cascade is a **compile error**, not a runtime surprise.
2. **Legible UI.** The original hid critical information (exact stats, win odds). Our clone shows
   win probability on hover and a rules screen — a deliberate, documented improvement.
3. **Playable feel.** Fast turn cycle, no dead clicks, informative feedback.
4. Authenticity of presentation.

---

## 1. Rule Specification (normative)

Derived from Trifthen's GameFAQs research doc (Nov 2000, updated Jun 2001), cross-checked against
`xvw.lol/en/articles/tetra-master.html` and the Caves of Narshe FF9 Tetra Master guide.
**Treat this section as the source of truth. If the code disagrees with §1, the code is wrong.**

### 1.1 Match setup

- Board is a **4x4 grid**, 16 cells.
- At match start, **0 to 6 cells are blocked** at random (blocked = grey, unplayable, breaks adjacency).
  - Because `16 - 6 = 10` free cells and there are exactly 10 cards (5 per player), every legal
    blocking count leaves exactly enough room. Always feasible.
- Both players select **5 cards** from their collection before the match.
- A **coin flip** decides who plays first.
- Players then **alternate placing one card** into any empty, unblocked cell.
- Match ends after all 10 cards are placed. **Most owned cards wins** (5 placed + any captured).
- **Perfect Game** (capture all 5 enemy cards) → take all 5 enemy cards.
- Normal win → take any **one** enemy card that you currently own.
- Draw → optional rematch.

### 1.2 Card anatomy

A card instance has:

| Field      | Range                    | Notes                                                                                       |
| ---------- | ------------------------ | ------------------------------------------------------------------------------------------- |
| `figureId` | 100 possible             | Which artwork/name. Defines _unique_ status for collector points.                           |
| `arrows`   | 8-bit mask, 0–255        | One bit per compass+diagonal direction. 0 and 256 are both legal (zero arrows, all arrows). |
| `atk`      | 0–15 (hex digit)         | Offensive power index.                                                                      |
| `type`     | `P` \| `M` \| `X` \| `A` | Combat type.                                                                                |
| `pdef`     | 0–15 (hex digit)         | Physical defense index.                                                                     |
| `mdef`     | 0–15 (hex digit)         | Magical defense index.                                                                      |
| `caps`     | `{atk, pdef, mdef}`      | Per-figure maximum stat indices. Fixed per figure.                                          |

Displayed as a 4-character code, e.g. `7P23`, laid out as **[atk][type][pdef][mdef]**.

### 1.3 Stat digits are intervals, not numbers

A stat digit `n` (hex) represents an **interval** of concrete values:

```
min = n * 16
max = min + 15
```

Full table:

| Digit | Interval | Digit | Interval |
| ----- | -------- | ----- | -------- |
| `0`   | 0–15     | `8`   | 128–143  |
| `1`   | 16–31    | `9`   | 144–159  |
| `2`   | 32–47    | `A`   | 160–175  |
| `3`   | 48–63    | `B`   | 176–191  |
| `4`   | 64–79    | `C`   | 192–207  |
| `5`   | 80–95    | `D`   | 208–223  |
| `6`   | 96–111   | `E`   | 224–239  |
| `7`   | 112–127  | `F`   | 240–255  |

### 1.4 Placement: only the placed card attacks

A card that has just been placed is **offensive**. It resolves all of its arrows once.
Every card already on the board is **defensive** and cannot initiate anything on its own.
An already-placed card whose arrow points at the newly placed card does **nothing**.

This single rule causes most player confusion in the original. It is non-negotiable.

### 1.5 Capture resolution

For each arrow of the placed card `A` pointing at an adjacent cell containing an **opponent-owned** card `D`:

- **`D` has no arrow pointing back** → **Arrow Takedown.** `D` flips to `A`'s owner. No dice.
- **`D` has an arrow pointing back** → **Card Battle** (see §1.6).

Arrows pointing at empty cells, blocked cells, blocked-space edges, or your own cards do nothing.

**Crucially:** if `A` points at an opponent card and _also_ points at one that points back, takedowns and
battles are resolved as one combined chain, in this order per §1.7.

### 1.6 Card battle

1. Pick the relevant attacker stat and defender stat (§1.6.1).
2. Draw each side's **base value** uniformly from its interval (§1.3).
3. Draw a **roll** for each side: an integer uniformly in `[0, base]`.
4. **actual = base − roll** (never negative).
5. Higher `actual` wins. The loser flips to the winner's owner.

Step 3 is why a strong card loses to a weak one, and why rolling _high_ is _bad_. The player sees
base values and final actuals only if we choose to display them (§7.4).

Because each `actual` is uniform on `[0, base]` and ties go to the defender (§1.6.2, Q1), the
attacker's win probability is **exactly**:

```
m     = min(a, b)
P(win) = ((m + 1) * a  -  m * (m + 1) / 2)  /  ((a + 1) * (b + 1))
```

which counts the `(A, D)` pairs with `A > D` out of all `(a + 1)(b + 1)` pairs. Note the tie term:
two identical stat digits give `P = 0.46875`, not `0.5`, because the defender takes ties. Sanity
cases: `P(0, 0) = 0` (the attacker can never exceed), `P(15, 0) = 15/16`, `P(0, 15) = 0`.
We compute and display this, and a brute-force enumeration test pins it.

> ⚠️ The closed form `(a+1)/(a+b+2)` circulating in community write-ups — and in an earlier draft of
> this file — is **wrong**; it ignores ties and is off by up to 50 points (`P(0,0)` → 0.5 instead
> of 0). Do not reinstate it.

### 1.6.2 Ties

A battle where both `actual` values are equal is won by the **defender**. Resolved from Q1; the
research sources do not specify it, and the choice matters only for the displayed odds.

#### 1.6.1 Type table

| Type | Attacks with                               | Defends with                              |
| ---- | ------------------------------------------ | ----------------------------------------- |
| `P`  | `atk`                                      | `pdef`                                    |
| `M`  | `atk`                                      | `mdef`                                    |
| `X`  | `atk`                                      | **lower** of `pdef`/`mdef`                |
| `A`  | **highest** of its own `atk`/`pdef`/`mdef` | **lowest** of its own `atk`/`pdef`/`mdef` |

Examples: `7P23` attacks `2M12` → roughly `7` vs `1`.
`2A8F` attacks `1X2F` → attacker uses `F` (its mdef), defender's lowest is `1` (atk) → `F` vs `1`.
`FAFF` is the theoretical maximum card.

### 1.7 Combos and multiple battles

- Combos happen **only** as a result of a won battle. **Never** from a plain takedown.
- After a battle with winner `W` and loser `L`:
  1. `L` flips to `W`'s owner.
  2. **Combo from `L`:** every card `L`'s arrows point at flips to `W`'s owner, **with no battle**,
     even if those cards point back.
  3. **Arrows from `W`:** if `W` is the placed card `A`, then for its _other_ arrows:
     - opponent card that does **not** point back → flips (takedown);
     - opponent card that **does** point back → **another battle** ensues with `A` again as attacker.
  4. If `W` is the defender `D` (the placed card lost), the chain **ends**. No new battles.
- **Combos never recurse.** A card flipped by a combo does not fire its own arrows.
- If a pending battle's defender was already flipped by a combo, that battle **does not happen**.
- A player may choose the **order** of battles when several are pending.

The full resolution loop is specified as pseudocode in `src/core/resolution.ts` (§5.3).

### 1.8 Progression

**Stat growth** — after a **won match**, every card that was used gets **+1** to one of its three
stats, chosen uniformly at random. The choice ignores the caps, so a roll against a maxed stat is
**wasted**. This is faithful, and it is deliberately frustrating.

**Type evolution** — on winning **any single battle** (offense or defense):

- `P` or `M` → `X`: probability **1/32**
- `X` → `A`: probability **1/256**

Stat growth and type evolution are **independent**; a card can change type long before maxing stats.

### 1.9 Collector level

Points are computed from **the collection you own**, not from win/loss record.

Per card: `+10` if its **figure** is owned exactly once, `+5` if its **arrow pattern** is owned
exactly once by a card whose figure is also unique — implemented as two independent global
deduplication passes (figure set, pattern set), `+1` if type `X`, `+2` if type `A`.
Maximum `17 × 100 = 1700`; "Master" is `1698`.

Level thresholds (points → title): `0` Beginner, `300` Novice, `400` Player, `500` Senior,
`600` Fan, `700` Leader, `800` Coach, `900` Advisor, `1000` Director, `1100` Dealer, `1200` Trader,
`1250` Commander, `1300` Doctor, `1320` Professor, `1330` Veteran, `1340` Freak, `1350` Champion,
`1360` Analyst, `1370` General, `1380` Expert, `1390` Shark, `1400` Specialist, `1450` Elder,
`1475` Dominator, `1500` Maestro, `1550` King, `1600` Wizard, `1650` Authority, `1680` Emperor,
`1690` Pro, `1698` Master.

At `>= 1700` the game displays `Would you like to discard?` superimposed over the level display —
an intentional reproduction of the original's famous glitch. Full easter egg lives in `src/core/collector.ts`.

---

## 2. Constraints

### 2.1 Toolchain

- **TypeScript 5.x, `strict: true`.** No `any` in `src/**` (an explicit `unknown` + narrowing is
  required instead). `noUncheckedIndexedAccess: true` — the grid is `Cell[]` indexed 0–15, and that
  flag forces us to handle out-of-range and undefined honestly.
- **Vite** for dev server (HMR) and production build. Dev server on port 8080.
- **Vitest** for tests (native ESM, shares Vite's transform pipeline, no second config).
  `@vitest/coverage-v8` for coverage. Two Vitest projects: `node` env for `src/core` and `src/ai`,
  `jsdom` env for `src/ui`.
- **ESLint + typescript-eslint + Prettier.** `npm run lint` and `npm run typecheck` (a bare
  `tsc --noEmit`) both gate commits.
- **Zero runtime dependencies.** Dev-dependencies are fine and expected; nothing ships to the browser
  from `node_modules`.

### 2.2 Invariants that survive the switch

- **Determinism.** All randomness flows through an injectable seeded RNG (`src/core/rng.ts`). No
  `Math.random()` anywhere in `src/core/` or `src/ai/`. A seed reproduces a match exactly, which is
  what makes the rules testable at all.
- **The core is DOM-free.** `src/core/**` and `src/ai/**` must import nothing browser-specific, so
  they run under Vitest's `node` environment and inside `tools/verify.ts` without a DOM shim.
- **No copyrighted assets.** Procedural art and synthesized audio only.
- Type safety is **not** allowed to become an excuse to abstract the rules into indirection. If a
  type makes §1 harder to read, it is wrong. Readability of the rules code outranks type elegance.

### 2.3 What TypeScript buys us here specifically

The failure modes of this project are: forgetting a rule branch in the resolution cascade, and
mishandling the `A`-type "pick my highest stat / your lowest" rule. Both are caught statically:

- `CardType = 'P' | 'M' | 'X' | 'A'` — `resolveStats` is an exhaustive `switch` with a
  `never`-returning default, so a fifth type cannot exist without a compile error.
- `GameEvent` is a discriminated union on `t`. The animator's `switch` must handle every member.
- `GameState.phase` drives the UI's legal-action set via a narrowing switch, so "you can't pick a
  battle target when no battles are pending" is unrepresentable rather than a runtime guard.

---

## 3. Architecture

Three strict layers. Dependencies point downward only.

```
   src/ui/  src/render/  src/audio/      presentation — DOM, Canvas, WebAudio
        │
   src/ai/                            opponent brain — pure functions over GameState
        │
   src/core/                          rules engine — pure, deterministic, DOM-free
        │
   src/data/                          static catalog data (cards, levels, opponents)
```

`src/core` exposes a **reducer**: `applyAction(state, action) -> {state, events}`. The UI sends
actions and replays `events` as animations. This keeps the rules engine testable with zero rendering
and makes the animation system a pure consumer of an event log.

`events` are plain data (e.g. `{t:'battle', attacker:3, defender:7, atkBase:50, defBase:7, ...}`).
The renderer never mutates state; the AI never reads pixels.

### 3.1 State shape

Discriminated unions do the heavy lifting here — note `phase` and `GameEvent.t` below.

```ts
type Owner = 'player' | 'ai';
type CardType = 'P' | 'M' | 'X' | 'A';
type Phase = 'place' | 'chooseBattle' | 'over';
type Outcome = 'win' | 'loss' | 'draw' | 'perfect';

type Cell = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15;

interface BoardCard {
  readonly figureId: number;
  readonly arrows: number; // 8-bit mask
  readonly atk: number; // hex digit 0..15
  readonly type: CardType;
  readonly pdef: number;
  readonly mdef: number;
  owner: Owner; // mutated by the reducer only
}

interface GameState {
  readonly seed: number;
  rngState: number;
  board: ReadonlyArray<BoardCard | null>; // length 16, row-major
  blocked: ReadonlyArray<boolean>; // length 16
  players: Record<Owner, PlayerState>;
  turn: Owner;
  phase: Phase;
  pendingBattles: Cell[]; // populated only when phase === 'chooseBattle'
  history: GameEvent[]; // append-only
  result: MatchResult | null;
}
```

### 3.2 Event types

`GameEvent` is a discriminated union on `t`. The union is **exhaustive**: adding a member forces
every `switch (event.t)` in the animator and the log renderer to handle it, which is the compiler
enforcing §1.

```ts
type GameEvent =
  | { t: 'place'; cell: Cell; owner: Owner; figureId: number }
  | { t: 'takedown'; cell: Cell; owner: Owner; from: Cell }
  | { t: 'combo'; cell: Cell; owner: Owner; from: Cell }
  | { t: 'battle'; attacker: Cell; defender: Cell; atkIndex: number; defIndex: number }
  | {
      t: 'battle-roll';
      attacker: Cell;
      defender: Cell;
      atkBase: number;
      atkRoll: number;
      atkActual: number;
      defBase: number;
      defRoll: number;
      defActual: number;
      probability: number;
      attackerWins: boolean;
    }
  | { t: 'flip'; cell: Cell; from: Owner; to: Owner; reason: TakedownReason }
  | { t: 'evolve'; cell: Cell; from: CardType; to: CardType }
  | {
      t: 'stat-up';
      figureId: number;
      stat: 'atk' | 'pdef' | 'mdef';
      value: number;
      wasted: boolean;
    }
  | { t: 'turn'; owner: Owner }
  | { t: 'game-over'; result: MatchResult }
  | { t: 'hint'; text: string };
```

Every event carries the numbers needed for the renderer to animate the value rolling down
(base → roll → actual). This is what makes the battle feel like the original.

---

## 4. File Layout

```
tetramaster/
├── PLAN.md                  # this file — spec + stage plan
├── STATUS.md                # live working log (append-only session history)
├── README.md                # how to run, how to test, controls, architecture
├── index.html               # entry point, loads src/main.ts
├── package.json             # deps + scripts. no runtime deps
├── tsconfig.json            # strict, bundler moduleResolution, paths for @/
├── vite.config.ts           # dev server, build, vitest projects + coverage thresholds
├── vitest.workspace.ts      # node project (core/ai) + jsdom project (ui)
├── eslint.config.js
├── .prettierrc
├── .gitignore
├── src/
│   ├── main.ts              # boot: load save, wire screens, hand to app controller
│   ├── core/
│   │   ├── types.ts         # Card, BoardCard, GameState, GameEvent, Owner, Cell, CardType
│   │   ├── rng.ts           # mulberry32 PRNG: next(), int(n), range(a,b), pick(arr), shuffle
│   │   ├── constants.ts     # GRID=4, CELLS=16, MAX_BLOCKED=6, HAND_SIZE=5, DIRECTIONS
│   │   ├── direction.ts     # 8-direction table, index↔drow/dcol, neighbor(), delta()
│   │   ├── card.ts          # Card factory, arrow-mask helpers, stat accessors, rollInstance()
│   │   ├── battle.ts        # §1.6: type resolution, base draw, roll, win probability
│   │   ├── resolution.ts    # §1.5/§1.7: the placement cascade (the heart of the game)
│   │   ├── match.ts         # GameState factory + reducer (applyAction), turn flow
│   │   ├── progression.ts   # §1.8 stat growth + type evolution
│   │   ├── collector.ts     # §1.9 points + level lookup + 1700 glitch
│   │   └── save.ts          # localStorage serialize/deserialize + migration guard
│   ├── ai/
│   │   ├── evaluate.ts      # static position scoring (exposure, corners, quarantine)
│   │   ├── moves.ts         # enumerate (cell, card) pairs with predicted outcome
│   │   ├── opponent.ts      # pick move; difficulty tiers; Master Tournament counter-deck
│   │   └── personalities.ts # per-opponent stat bias + aggression weights
│   ├── data/
│   │   ├── cards.ts         # 100 figures: name, caps, base type, tier
│   │   ├── arrowSets.ts     # curated arrow masks for hand-authored figures
│   │   └── opponents.ts     # NPC roster, decks, dialogue
│   ├── render/
│   │   ├── theme.ts         # palette, fonts, spacing tokens
│   │   ├── sprites.ts       # procedural card art (canvas → offscreen cache)
│   │   ├── arrowSprite.ts   # draws an 8-direction arrow mask
│   │   ├── boardView.ts     # grid, cells, blocked styling, highlights, hover cursor
│   │   ├── cardView.ts      # card face: art, stat code, ownership tint, badges
│   │   ├── layers.ts        # card pile + score HUD
│   │   └── animator.ts      # event-log → tween queue; owns the single rAF loop
│   ├── ui/
│   │   ├── app.ts           # screen router
│   │   ├── screens/title.ts, deckSelect.ts, match.ts, collection.ts,
│   │   │          results.ts, rules.ts, opponents.ts
│   │   ├── components/cardView.ts   # DOM card component (menus/deck)
│   │   ├── components/picker.ts     # battle-target chooser modal
│   │   ├── components/tooltip.ts    # card inspector w/ exact stats + win %
│   │   └── toast.ts
│   ├── audio/
│   │   ├── synth.ts         # WebAudio blips: place, flip, battle tick, win/lose
│   │   └── music.ts         # optional ambient loop (toggleable, off by default)
│   └── input/
│       ├── pointer.ts       # canvas hit-testing → cell indices
│       └── keyboard.ts      # arrows/WASD cursor, Enter select, Esc cancel, H hint
├── tests/
│   ├── setup.ts
│   ├── fixtures.ts          # hand-built boards for deterministic scenarios
│   ├── core/                # node environment
│   │   ├── rng.test.ts
│   │   ├── direction.test.ts
│   │   ├── card.test.ts
│   │   ├── battle.test.ts       # §1.6 math, incl. probability table
│   │   ├── resolution.test.ts   # §1.7 cascades — highest-value tests in the repo
│   │   ├── match.test.ts        # turn flow, 10-card invariant, scoring
│   │   ├── progression.test.ts
│   │   └── collector.test.ts
│   ├── ai/
│   │   └── opponent.test.ts
│   └── ui/                  # jsdom environment
│       └── picker.test.ts
└── tools/
    ├── verify.ts            # runs tests + 10k-match headless simulation, prints invariants
    ├── balance.ts           # AI-vs-AI sweep to sanity-check the rules aren't degenerate
    └── rules-audit.ts       # greps test names for [§n.m] tags; fails if a rule has no test
```

### 4.1 Test naming and rule traceability

Every test name that verifies a rule carries a tag: `it('[§1.6] 7P23 vs 2M12 picks pdef 1')`.

`npm run rules:audit` (`tools/rules-audit.ts`) parses §1's section headings out of `PLAN.md`,
greps the test suite for each tag, and **exits non-zero listing any rule paragraph with no test**.
This is the project's real coverage metric — see §9.

---

## 5. Core Module Contracts

### 5.1 `rng.ts`

```ts
interface Rng {
  next(): number;
  int(n: number): number;
  range(a: number, b: number): number;
  pick<T>(xs: readonly T[]): T;
  shuffle<T>(xs: readonly T[]): T[];
  state: number;
}
function createRng(seed: number): Rng;
```

Mulberry32. `state` is a serializable field so a match can be saved and resumed mid-battle.

### 5.2 `battle.ts`

```ts
type StatKey = 'atk' | 'pdef' | 'mdef';

interface StatPick {
  atkIndex: number;
  defIndex: number;
  atkKey: StatKey;
  defKey: StatKey;
}

interface BattleRoll {
  readonly atkBase: number;
  readonly atkRoll: number;
  readonly atkActual: number;
  readonly defBase: number;
  readonly defRoll: number;
  readonly defActual: number;
  readonly attackerWins: boolean;
  readonly probability: number; // computed BEFORE the rolls, for the UI
}

function resolveStats(attacker: Card, defender: Card): StatPick;
function winProbability(atkBase: number, defBase: number): number;
function rollBattle(attacker: Card, defender: Card, rng: Rng): BattleRoll;
```

`rollBattle` is a **pure function of (attacker, defender, rng state)**. `probability` is computed
_before_ rolling so the UI can show the player their odds — the engine never peeks.

### 5.3 `resolution.ts`

```ts
function resolvePlacement(state: GameState, cell: Cell): { state: GameState; events: GameEvent[] };
```

Pseudocode — this is the algorithm to implement verbatim:

```
placed = board[cell]                       // just placed by `owner`
events = [ {t:'place'} ]
pending = []                                // cell indices requiring a battle
chainOwner = owner

for each arrow a of placed:
    n = neighbor(cell, a)
    if n invalid or board[n] is null or blocked or board[n].owner == owner: continue
    if board[n] has arrow pointing back at cell:  pending.push(n)
    else:                                         events.push({t:'takedown', cell:n}); flip(n)

while pending not empty:
    defCell = pending.shift()                     // player picks; AI scores
    if board[defCell] is null or board[defCell].owner == owner: continue   // flipped by combo
    r = rollBattle(placed, board[defCell], rng)
    events.push({t:'battle', ...r})
    if r.attackerWins:
        loser = board[defCell]
        events.push({t:'battle-result', winner:cell, loser:defCell})
        flip(defCell, owner)
        for each arrow b of loser:                 // combo from the loser — no battle
            m = neighbor(defCell, b)
            if board[m] and board[m].owner != owner:
                events.push({t:'combo', cell:m, from:defCell}); flip(m, owner)
        for each arrow c of placed:                // placed card keeps its other arrows live
            m = neighbor(cell, c)
            if board[m] and board[m].owner != owner:
                if board[m] points back at cell: pending.push(m)
                else: events.push({t:'takedown', cell:m}); flip(m, owner)
    else:
        events.push({t:'battle-result', winner:defCell, loser:cell})
        flip(cell, opponent)                       // the placed card itself is captured
        for each arrow d of placed:                // combo from the loser — no battle
            m = neighbor(cell, d)
            if board[m] and board[m].owner == opponent_of_owner:
                events.push({t:'combo', cell:m, from:cell}); flip(m, opponent)
        pending = []                               // chain ends
        break
```

Two invariants the tests must assert:

- **No recursion.** A combo flip never fires that card's arrows.
- **Battles only originate from the placed card.** Once the placed card is captured, the chain stops.

### 5.4 `match.ts`

```ts
type Action =
  | { t: 'place'; cell: Cell; cardIndex: number }
  | { t: 'chooseBattle'; cell: Cell }
  | { t: 'forfeit' };

function createMatch(opts: { seed: number; playerDeck: Card[]; aiDeck: Card[] }): GameState;
function applyAction(state: GameState, action: Action): { state: GameState; events: GameEvent[] };
```

`applyAction` is a pure reducer; it always returns a **new** state object. When the cascade would
need a player choice, it returns with `phase:'chooseBattle'` and `pendingBattles` populated — it
never blocks or prompts from inside the engine. An illegal action returns an `illegal` event rather
than throwing, so the UI can render a "you can't play there" nudge.

---

## 6. Stage Plan

Stages are ordered, each ends in a working demo. **Do not start stage N+1 before stage N's
Definition of Done is met and logged in `STATUS.md`.**

**Every stage ends with a git commit** (see §7.2 for the message format and checklist). Meeting a
DoD but leaving the work uncommitted means the stage is not done.

### Stage 0 — Scaffold

**Goal:** `npm test`, `npm run typecheck`, and `npm run dev` all run; the page loads with an
empty canvas and HMR.

- `package.json` (scripts `dev`/`build`/`preview`/`test`/`coverage`/`verify`/`lint`/`typecheck`/
  `rules:audit`), `tsconfig.json` (strict + `noUncheckedIndexedAccess`), `vite.config.ts` carrying
  both Vitest projects and the §9 coverage thresholds, `eslint.config.js`, `.prettierrc`, `.gitignore`
- `index.html`, `src/main.ts` (mounts a canvas, nothing else), `tests/setup.ts`
- `src/core/rng.ts` + `tests/core/rng.test.ts` — proves determinism and seeding
- `README.md` — run/test/controls stub

**DoD:** `npm test` and `npm run typecheck` green; `npm run dev` serves with HMR; `npm run build`
produces a working `dist/`; canvas paints a placeholder.

### Stage 1 — Grid geometry & stats

**Goal:** The 4x4 grid and the stat-interval math are correct and unit-tested.

- `src/core/types.ts`, `constants.ts`, `direction.ts` (8 directions, `neighbor()` wraps **nowhere** —
  grid edges are hard boundaries), `card.ts` (arrow masks, stat accessors), `battle.ts`
  (`resolveStats` and `winProbability` only; `rollBattle` arrives in Stage 4)
- Tests: neighbor table (16 cells × 8 dirs = 128 cases; 84 on-grid adjacencies, 44 off-grid, 0
  wraparound), hex→interval for all
  16 digits, `winProbability` against the closed form, type resolution for all 4×4 type pairs

**DoD:** `direction.test.ts` and the type-resolution tests green; interval table matches §1.3 exactly;
`src/core/**` coverage ≥ 95% lines / 90% branches.

### Stage 2 — Card catalog

**Goal:** 100 playable figures exist as data.

- `data/cards.ts`: `figureId → {name, caps:{atk,pdef,mdef}, baseType, tier, family}`
- `data/arrowSets.ts`: arrow masks, with ~30 hand-authored "signature" figures and the rest assigned
  from a seeded shuffle biased by tier (weak figures get sparse/awkward arrows, strong ones dense)
- `card.ts` gains `rollInstance(figure, rng)` — stats are **rolled on acquisition**, faithful to the
  original (which is why players save-scum)
- Test: every figure has caps ≥ base stats; arrow masks are unique per signature figure

**DoD:** catalog loads, all 100 figures roll valid instances, tests green.

### Stage 3 — Resolution engine (takedown + combos)

**Goal:** Non-battle placement resolution is correct. **This is the highest-value stage.**

- `resolution.ts` implementing §5.3 (battle branch stubbed to always-lose for now)
- `tests/fixtures.ts`: builders for named board scenarios
- `tests/core/resolution.test.ts` covering: no-arrow placement, single takedown, multi-arrow takedown,
  takedown into blocked cell, blocked-cell adjacency, no second-degree combo, arrows pointing off-grid

**DoD:** every fixture resolves to the exact cell list in the test's comment; combo non-recursion asserted;
`resolution.ts` ≥ 95% lines / 90% branches; `npm run rules:audit` green for §1.5.

### Stage 4 — Battle math + multi-battle chains

**Goal:** Full §1.6/§1.7 cascades work.

- Complete `rollBattle`; wire into `resolution.ts`
- Tests: all four attacker types × four defender types; `A`-type stat picking; win-probability
  matches a brute-force enumeration of the `(A, D)` pairs (§1.6); two-battle chain;
  combo-cancels-pending-battle;
  attacker-loses-then-captured; chain terminates when placed card is captured
- **Monte Carlo test:** 100k simulated battles per type pair, empirical win rate within 2% of
  `winProbability()`. This is what proves the closed form and the implementation agree.

**DoD:** every scenario in §1.7 has a passing test; `battle.ts` and `resolution.ts` ≥ 95% lines /
90% branches; deterministic given a fixed seed; `rules:audit` green for §1.6 and §1.7.

### Stage 5 — Match state machine

**Goal:** A full headless match runs end to end.

- `match.ts`: `createMatch`, `applyAction`, blocked-cell generation (0–6), coin flip, turn alternation,
  score tally, win/draw/perfect detection, capture-choice at match end
- `match.test.ts`: the 10-card invariant (every match places exactly 10 cards and never blocks out
  a legal placement); score always sums to 10; perfect ⇒ all 5 opponent cards offered
- `tools/verify.ts` skeleton: simulate N random matches, assert no exceptions, print outcome spread

**DoD:** 1000 headless matches complete without a single thrown error or invariant violation.

### Stage 6 — Rendering

**Goal:** The board is visible and interactive.

- `theme.ts`, `boardView.ts`, `cardView.ts`, `sprites.ts` (procedural card art: layered shapes seeded
  by `figureId` — geometric sigils, gradient frames, distinct hue per family; cached to offscreen canvas)
- `arrowSprite.ts` — crisp 8-direction arrows, ~60fps on a 4x4 grid
- `animator.ts` — the single `requestAnimationFrame` loop; consumes the event log; tween card slides,
  number rolldowns, flip animations. Its `switch` over `GameEvent.t` must be exhaustive — the
  compiler proves we handle every event kind
- `input/pointer.ts` hit-testing with hover cursor feedback

**DoD:** a headless-driven match animates correctly on screen; no state mutation from render code.

### Stage 7 — Playable match UI

**Goal:** A human can play a full match.

- Screen router (`ui/app.ts`), title screen, deck select (with card inspector), match screen
- Placement interaction: pick card → pick cell → animate resolution
- `components/picker.ts`: the **battle-target chooser** (§1.7 order choice) — must clearly present
  the odds of each candidate battle
- HUD: both piles, counts, turn indicator, blocked-cell legend
- Keyboard parity for every mouse action
- `tests/ui/picker.test.ts` (jsdom): chooser lists exactly the pending battles, shows each one's
  win probability, and dispatches the correct action

**DoD:** complete a match by mouse only, then again by keyboard only.

### Stage 8 — Opponent AI

**Goal:** A competent, non-cheating opponent.

- `evaluate.ts`: per-cell exposure score (count of unblocked edges that an enemy arrow could reach),
  corner/edge value, low-defense-side penalty, combo-chain potential, "quarantine" detection
- `moves.ts`: enumerate all (cell, card) pairs, predict outcomes with `rollBattle`'s probability
  (no peeking at future rolls)
- `opponent.ts`: weighted score + tiebreak randomness; 3 difficulty tiers
- `personalities.ts`: 6–10 NPCs with distinct biases and decks
- `tools/balance.ts`: AI-vs-AI sweep — assert first-player win rate is not degenerate (>60% either way)
- `tests/ai/opponent.test.ts`: the AI only ever returns cells that are empty, unblocked, and in-bounds
  for the current turn; a stubbed RNG reproduces the same move; it cannot be influenced by hidden state

**DoD:** AI picks legal moves only, is beatable, and never reads hidden state.

### Stage 9 — Progression, collection, save

**Goal:** The meta-game exists.

- `progression.ts` (§1.8), `collector.ts` (§1.9), `save.ts` (versioned localStorage schema)
- Collection screen: browse all owned cards, filter/sort, see caps and progress toward them
- Deck editor: build a saved deck, validate 5 cards, show collector level and next threshold
- Tests: stat growth respects caps and wastes rolls; 1/32 and 1/256 rates over 100k trials; collector
  points against hand-computed cases; `1700` glitch triggers; save round-trips through a mocked
  localStorage and a schema migration from a v0 save

**DoD:** win a match, reload the page, and the evolved cards and collection are intact.

### Stage 10 — Modes & polish

**Goal:** The game is finished-feeling.

- **Master Tournament** (an FF9 mode): challenge your own saved deck; the AI builds a counter-deck
  from your collection weighted against your deck's stats and arrows
- Local **hotseat** 2P (shared board, alternating input)
- **Rules screen** — a player-facing rendering of §1, since the original never explained itself
- Audio (`audio/synth.ts`): card place, flip, battle tick, victory/defeat. Toggle, off by default,
  respects `prefers-reduced-motion` for visuals
- Accessibility: full keyboard play, focus rings, ARIA live region for turn/result announcements,
  `prefers-reduced-motion` disables tweening, colorblind-safe ownership indicator
  (ownership is **shape + tint**, never tint alone)
- Responsive layout down to 1280×720; DPR-aware canvas

**DoD:** all three modes playable; audio and a11y toggles work; no console errors in a full session.

### Stage 11 — Hardening & docs

**Goal:** Shippable.

- `tools/verify.ts` full run: typecheck + lint + tests + coverage gates + rules audit + 10k-match
  simulation + invariant assertions + perf timing
- README: controls, rules summary, architecture, how to extend (adding a figure, adding an opponent)
- Performance pass: board render under 4ms/frame; animator queue bounded
- Final `git log` review for coherent history
- CI workflow running `npm run verify` on every push

**DoD:** `npm run verify` green from a clean clone; README accurate to the code; every §1 paragraph
has a passing test per `rules:audit`.

---

## 7. Conventions

### 7.1 Code style

- `strict` TypeScript. No `any`; prefer `unknown` + narrowing, or a precise union. `@typescript-eslint`
  bans `any` and non-null `!` assertions outside tests.
- 2-space indent, semicolons, single quotes (Prettier-enforced; don't hand-fight it).
- Pure functions wherever possible; mutation only in `match.ts`'s reducer and save/load.
- Comments explain **why**, not **what**. Domain terms use the §1 vocabulary exactly
  (takedown, battle, combo, arrow takedown, perfect game).
- No magic numbers in `src/core/**` — every constant from §1 goes in `constants.ts`.
- **Readability of the rules outranks type cleverness.** A `readonly` grid of branded `Cell`s is
  good; a generic conditional-type monstrosity around the resolution cascade is not.

### 7.2 Git

**A stage is not finished until it is committed.** Every stage ends with a commit, and that commit
is the stage's completion marker. Work left uncommitted is work the next session has to re-derive
from a diff instead of a log.

End-of-stage checklist, in order:

1. Run the stage's gate: `npm run verify` from Stage 3 onward; for Stages 0–2 see the note below
2. `npm run format:check` clean
3. Update `STATUS.md`: stage table, Gate status, Current Focus, Next Actions, Session Log entry
4. `git add` the stage's files and commit with the format below

**Commit format:** `stage(N): short imperative summary` — e.g. `stage(0): scaffold toolchain, seeded
RNG, rules audit gate`.

**Commit scope:** one stage per commit wherever possible. If a stage is genuinely too large to
review as one change, split it into 2–3 commits that each leave the tree green, and note the split
in the Session Log. Never mix a stage's code with an unrelated refactor.

**Invariants for every commit, without exception:**

- `npm run typecheck` and `npm test` are green.
- No failing or skipped tests, and no `it.skip` used to make a suite pass.
- `STATUS.md` is updated in the **same commit** as the code it describes — a commit that changes
  behaviour without updating the log is incomplete.

**Do not commit:** `node_modules/`, `dist/`, `coverage/` (all gitignored), secrets, or any asset
extracted from _Final Fantasy IX_ (see §7.5).

> **Note on early stages.** Stages 0–2 cannot satisfy `rules:audit --strict`, because the rules they
> implement do not exist yet — §9.2's `PENDING` manifest exists precisely for that window. Their gate
> is `typecheck` + `lint` + `test` + the stage's own DoD, and each stage's DoD line says which gates
> apply. From Stage 3 onward, `rules:audit` must report zero untested rules.

### 7.3 Naming

- Cells are addressed by **index 0–15** (row-major), typed as the `Cell` union. `neighbor(cell, dir)`
  is the only way to move between cells.
- Directions: `0..7` = N, NE, E, SE, S, SW, W, NW. Arrow bit `1 << dir`.
- Events are lowercase string literals on the `t` field; actions are `{t:'...', ...}` objects.

### 7.4 Deliberate deviations from the original (documented, intentional)

These improve the game and must be listed in the README, not silently shipped:

1. **Exact stats and win probability are visible** on card hover.
2. **A rules screen exists** — the original shipped none.
3. **Battle-target selection is always offered** when multiple battles are pending (the original let
   the machine choose in some paths); we let the player decide, per the documented rule.
4. **No save-scumming of card rolls is prevented** — acquisition rolls are shown before you accept.

### 7.5 Art & audio policy

- Card faces are **procedurally generated** from `figureId` — a seeded geometric sigil system with a
  shared frame and per-family palettes. No traced or extracted FF9 artwork, ever.
- Audio is **synthesized** with WebAudio oscillators/noise. No FF9 samples, ever.
- Card _names_ and the rules are facts about a game and are not protected expression in this context;
  everything expressive is original.

---

## 8. Open Questions — RESOLVED

All resolved to their defaults on 2026-10-10. If implementation reveals a rule is wrong, change
§1 **and** log the change in `STATUS.md` → Decisions. Do not let code silently diverge from spec.

| #   | Question                                                    | Resolution                                             | Implement in |
| --- | ----------------------------------------------------------- | ------------------------------------------------------ | ------------ |
| Q1  | Exact tie in a battle (both actuals equal)?                 | **Defender wins** (defender has initiative)            | 4            |
| Q2  | Does stat growth require a **win**, or any completed match? | **Win only** (per §1.8)                                | 9            |
| Q3  | Distribution of blocked-cell count                          | **Uniform 0–6**                                        | 5            |
| Q4  | Blocked cells symmetric or per-player?                      | **Symmetric** (one shared board)                       | 5            |
| Q5  | Coin flip revealed when?                                    | **Before the match starts, shown in the UI**           | 5            |
| Q6  | Card acquisition roll range                                 | **Full interval** `[16n, 16n+15]`, `n ≤ cap`           | 2            |
| Q7  | Combos capturing your own cards                             | **Skip silently** — no event, no flip                  | 3            |
| Q8  | Master Tournament counter-deck                              | **Weighted counter-deck** from the player's collection | 10           |

---

## 9. Test Strategy & Coverage

### 9.1 Why coverage percentage is the wrong headline number

Line coverage answers "was this line executed", not "is this rule implemented correctly". A rules
engine can hit 100% line coverage while the combo cascade is inverted, because the tests execute
every branch and assert nothing meaningful about the _result_. So we track **three independent
signals**, and a stage is not done unless all three hold.

### 9.2 The three signals

**(1) Rule traceability — the primary metric.**

Every rule paragraph in §1 must be covered by at least one test, and the test must _name_ the rule:

```ts
it('[§1.7] combo from loser captures targets without battle', ...)
it('[§1.7] no second-degree combo', ...)
it('[§1.6] A-type attacker uses its highest stat', ...)
```

`npm run rules:audit` parses the `### 1.x` headings out of `PLAN.md`, greps `tests/` for each
`[§1.x]` tag, and **exits non-zero listing every untested rule**. It runs in `verify` and in CI.
Adding a rule to §1 without adding a test is therefore a build failure, not a code review nit.

**(2) Line/branch/function coverage — the secondary metric, gated per directory.**

Configured in `vite.config.ts` via `@vitest/coverage-v8`. These are floors, not goals; they exist to
catch _newly untested_ code, not to define "finished".

| Path                         | Lines   | Branches | Functions | Why                                                              |
| ---------------------------- | ------- | -------- | --------- | ---------------------------------------------------------------- |
| `src/core/**`                | 95%     | 90%      | 95%       | The rules. Near-untolerable if uncovered.                        |
| `src/ai/**`                  | 85%     | 80%      | 85%       | Heuristics; some branches are tuning branches.                   |
| `src/data/**`                | 100%    | 100%     | 100%      | Pure data; a single import-and-assert test covers it.            |
| `src/ui/**`, `src/render/**` | 60%     | 50%      | 60%       | View code; verified by smoke + interaction tests and by playing. |
| **Global**                   | **85%** | **80%**  | **85%**   |                                                                  |

Individual files that hold §1's hardest rules must individually meet **95% lines / 90% branches**:
`core/battle.ts`, `core/resolution.ts`, `core/match.ts`, `core/progression.ts`, `core/collector.ts`.

Any coverage waiver must be written down in `STATUS.md` → **Deviations** with a reason. No silent
exclusions in the Vitest config except for generated or type-only files.

**(3) Behavioural invariants under simulation — the safety net.**

Coverage cannot tell you the game is _coherent_. `tools/verify.ts` runs 10,000 headless matches with
seeded RNG and asserts, on every single one:

- exactly 10 cards placed, no exceptions, no illegal placements
- final score sums to exactly 10
- a perfect game implies all 5 enemy cards were offered
- the RNG is the only source of randomness (asserted by static check in `rules:audit`/lint)
- no `NaN` leaks into any card stat

Monte Carlo tests additionally validate the battle math statistically (§9.3).

### 9.3 Test types we actually use

| Type                      | Where                                      | What it's for                                                                                                                                                                                   |
| ------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Unit**                  | `tests/core/*.test.ts`                     | Pure functions: hex intervals, `neighbor()`, `resolveStats()`, `winProbability()`, collector scoring. Exhaustive where cheap (all 16 digits, all 4×4 type pairs, all 128 cell×direction pairs). |
| **Fixture / scenario**    | `tests/fixtures.ts` + `resolution.test.ts` | Hand-built named boards ("two pending battles where winning the first combos the second") with the expected cell list written out in the test. This is where §1.7 lives.                        |
| **Property**              | `match.test.ts`                            | Invariants over random matches (10 cards, score sums, no throw). Runs 1,000 matches in CI.                                                                                                      |
| **Monte Carlo**           | `battle.test.ts`                           | 100k battles per type pair; empirical win rate within 2% of `winProbability()`. Pins §1.6 statistically.                                                                                        |
| **Component**             | `tests/ui/picker.test.ts` (jsdom)          | The battle-target chooser: lists exactly the pending battles, shows odds, dispatches the right action.                                                                                          |
| **Static / architecture** | `rules:audit.ts` + lint rules              | `core`/`ai` must not import from `ui`/`render`; no `Math.random()` outside `rng.ts`; `any` banned.                                                                                              |
| **Manual**                | Stage DoDs 6, 7, 10                        | Pixel output, animation feel, audio, accessibility. Stated explicitly as _not_ automated — see below.                                                                                           |

### 9.4 What we deliberately do not test

- **Pixel output** of canvas rendering. Comparing rasterised frames is brittle and low-value;
  the render layer is verified by smoke tests plus Stage 6/7 manual play.
- **Audio.** WebAudio output is not asserted; we test that nodes are created and scheduled, not
  what they sound like.
- **Animation timing.** The animator is tested for "emits the right sequence of frames for this
  event log", never for exact millisecond values.
- **Game feel and balance.** Measured by `tools/balance.ts` sweeps (win-rate sanity), not by asserts.

### 9.5 Gates

`npm run verify` runs, in order, and must be green:

1. `tsc --noEmit` (strict)
2. `eslint` (includes the architecture rules from §9.3)
3. `vitest run` (all tests)
4. `vitest run --coverage` against the §9.2 thresholds
5. `rules:audit` (rule traceability)
6. 10,000-match headless simulation with invariant assertions

`npm test` alone runs step 3 — the fast inner loop. Commit gate is steps 1–3.

---

## 10. Definition of Done (whole project)

- [ ] All 11 stages' DoD met and logged
- [ ] `npm run verify` green from a clean clone (typecheck, lint, tests, coverage, rules audit, 10k simulation)
- [ ] `rules:audit` reports **zero** untested §1 paragraphs
- [ ] Every coverage threshold in §9.2 met, with any waiver written down in `STATUS.md`
- [ ] A player who has never read §1 can win a match using only the in-game rules screen
- [ ] No copyrighted assets anywhere in the repo
- [ ] `README.md` accurate; `STATUS.md` current
