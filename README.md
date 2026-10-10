# Tetra Master

An HTML5/TypeScript clone of the **Tetra Master** card game from _Final Fantasy IX_ (PS1, 2000).

Two players each place five cards on a 4×4 grid. Arrows capture, numbers battle, and the card you
lose in a battle drags its neighbours down with it. The original shipped almost no instructions;
this version shows you the rules, your exact stats, and your odds before every fight.

> **Status: Stage 0 of 11.** The toolchain, seeded RNG, and rules-traceability gate are in place.
> No game rules are implemented yet — see [`STATUS.md`](./STATUS.md) for where to continue and
> [`PLAN.md`](./PLAN.md) for the full specification.

## Running it

```bash
npm install
npm run dev      # http://localhost:8080
```

Requires Node 20+ (developed on Node 26).

## Commands

| Command               | Purpose                                                      |
| --------------------- | ------------------------------------------------------------ |
| `npm run dev`         | Vite dev server with HMR on port 8080                        |
| `npm run build`       | Typecheck, then production build to `dist/`                  |
| `npm test`            | Unit tests (Vitest) — the fast inner loop                    |
| `npm run typecheck`   | `tsc --noEmit`, strict                                       |
| `npm run lint`        | ESLint, including the architecture guards                    |
| `npm run coverage`    | Tests + v8 coverage against the thresholds in `PLAN.md` §9.2 |
| `npm run rules:audit` | Fails if an implemented rule has no tagged test              |
| `npm run verify`      | All of the above, in order                                   |

Commit gate: `typecheck` + `lint` + `test`. No skipped tests, no `it.skip` to go green.

## How this is tested

Coverage percentage is a weak signal — an engine can execute every branch and still implement a
rule backwards. So correctness is pinned three ways:

1. **Rule traceability (primary).** Every rule paragraph in `PLAN.md` §1 must be claimed by a test
   that names it: `it('[§1.7] no second-degree combo', ...)`. `npm run rules:audit` parses the §1
   headings out of `PLAN.md` and fails if an implemented rule has no tagged test. Rules not yet
   written are listed as `PENDING (Stage N)` in `tools/rules-audit.ts` — implementing a rule means
   deleting that entry, at which point its test is mandatory. `--strict` fails while any remain.
2. **Coverage floors** per directory (`src/core` ≥ 95% lines / 90% branches, enforced per file).
   These catch newly-untested code; they are not the definition of done.
3. **Invariants under simulation** — thousands of headless matches asserting the 10-card
   invariant, score totals, and a perfect-game precondition.

What is deliberately _not_ tested: pixel output, audio, animation timing, and game feel.

## Architecture

Three layers, dependencies pointing downward only.

```
src/ui/  src/render/  src/audio/    presentation — DOM, Canvas, WebAudio
     ↓
src/ai/                            opponent brain — pure functions over GameState
     ↓
src/core/                          rules engine — pure, deterministic, DOM-free
```

`src/core` and `src/ai` import nothing browser-specific, so they run under Vitest's Node
environment and inside the headless simulator with no DOM shim. Two ESLint guards enforce this,
plus one that bans `Math.random()` outside the seeded RNG.

The engine is a pure reducer — `applyAction(state, action) → { state, events }` — and the renderer
consumes the event log. That is what makes the rules testable without rendering anything.

## Extending it

- **Add a card figure:** append to `src/data/cards.ts` (name, stat caps, base type, tier).
- **Add an NPC:** append to `src/data/opponents.ts` and add a personality in
  `src/ai/personalities.ts`.
- **Change a rule:** edit `PLAN.md` §1 first, then the code, then add a `[§n.m]`-tagged test.
  `rules:audit` will hold you to it.

## Licensing & assets

All card art is **procedurally generated** from figure IDs and all audio is **synthesized** with
WebAudio. No artwork, sprites, sounds, or other assets are extracted from _Final Fantasy IX_.
This is an unofficial fan project; _Final Fantasy IX_ is © Square Enix.

Card rules were reverse-engineered from publicly documented sources, chiefly Trifthen's GameFAQs
research document (2000–2001), cross-checked against xvw.lol and the Caves of Narshe guides.
