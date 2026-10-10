/**
 * Headless match verifier (PLAN.md §9.2, signal 3).
 *
 * Runs thousands of complete matches and asserts the invariants that hold for *every* one of them:
 *
 *  - exactly ten cards placed, no exceptions, no illegal placements
 *  - the final score always sums to ten
 *  - a perfect game implies one side owns the entire board
 *  - no card stat is ever NaN
 *  - no match deadlocks, and every match reaches a result
 *
 * Coverage percentage cannot tell you the game is coherent; this can. It is the check that catches
 * a rule change which is individually well-tested but collectively produces an unplayable game.
 *
 * Run directly (`node tools/verify.ts`) or through `npm run verify`.
 */

import { createRng } from '../src/core/rng.ts';
import { rollInstance } from '../src/core/card.ts';
import { createMatch, legalCells, playMatch, score } from '../src/core/match.ts';
import { figuresOfTier } from '../src/data/cards.ts';
import { HAND_SIZE } from '../src/core/constants.ts';
import type { Action, MatchOptions } from '../src/core/match.ts';
import type { Card, GameState, Owner, Tier } from '../src/core/types.ts';

const DECK_TIERS: readonly Tier[] = [1, 2, 3, 4, 5];

function deck(rngSeed: number, tier: Tier): Card[] {
  const pool = figuresOfTier(tier);
  const rng = createRng(rngSeed);
  return Array.from({ length: HAND_SIZE }, () => {
    const figure = pool[rng.int(pool.length)];
    // `int` is in range, so the cast is safe; guards against a malformed catalog anyway.
    if (!figure) throw new Error(`no figure in tier ${tier}`);
    return rollInstance(figure, rng);
  });
}

interface InvariantFailure {
  readonly seed: number;
  readonly invariant: string;
  readonly detail: string;
}

/** A deliberately naive policy: first legal cell, first card, first pending battle. */
function naive(state: GameState): Action {
  if (state.phase === 'chooseBattle') {
    const next = state.pendingBattles[0];
    return next === undefined ? { t: 'forfeit' } : { t: 'chooseBattle', cell: next };
  }
  const cells = legalCells(state);
  const cell = cells[0];
  if (cell === undefined) return { t: 'forfeit' };
  return { t: 'place', cell, cardIndex: 0 };
}

/** A policy that varies its cell choice, so the sweep explores more of the board. */
function varied(state: GameState, rng: ReturnType<typeof createRng>): Action {
  if (state.phase === 'chooseBattle') {
    const battles = state.pendingBattles;
    const pick = battles[rng.int(battles.length)];
    return pick === undefined ? { t: 'forfeit' } : { t: 'chooseBattle', cell: pick };
  }
  const cells = legalCells(state);
  const pick = cells[rng.int(cells.length)];
  return pick === undefined ? { t: 'forfeit' } : { t: 'place', cell: pick, cardIndex: 0 };
}

function checkInvariants(
  seed: number,
  state: GameState,
  events: ReadonlyArray<{ t: string }>,
): InvariantFailure[] {
  const failures: InvariantFailure[] = [];
  const total = HAND_SIZE * 2;

  if (state.placedCount !== total) {
    failures.push({ seed, invariant: 'ten cards placed', detail: `placed ${state.placedCount}` });
  }
  if (state.phase !== 'over') {
    failures.push({ seed, invariant: 'match reaches a result', detail: `phase is ${state.phase}` });
  }
  if (state.result === null) {
    failures.push({ seed, invariant: 'a result is recorded', detail: 'result is null' });
  }

  const counts = score(state);
  if (counts.player + counts.ai !== total) {
    failures.push({
      seed,
      invariant: 'score sums to ten',
      detail: `${counts.player} + ${counts.ai} = ${counts.player + counts.ai}`,
    });
  }

  const onBoard = state.board.filter((card) => card !== null);
  if (onBoard.length !== total) {
    failures.push({ seed, invariant: 'ten cards on the board', detail: `${onBoard.length}` });
  }
  for (const card of onBoard) {
    for (const key of ['atk', 'pdef', 'mdef'] as const) {
      if (!Number.isFinite(card[key])) {
        failures.push({ seed, invariant: 'stats are finite', detail: `${key} is ${card[key]}` });
      }
    }
  }

  if (state.result?.outcome === 'perfect') {
    const best = Math.max(counts.player, counts.ai);
    if (best !== total) {
      failures.push({
        seed,
        invariant: 'perfect means owning the whole board',
        detail: `best score ${best} of ${total}`,
      });
    }
  }

  const illegal = events.filter((e) => e.t === 'illegal').length;
  if (illegal > 0) {
    failures.push({ seed, invariant: 'no illegal placements', detail: `${illegal} illegal` });
  }

  const gameOvers = events.filter((e) => e.t === 'game-over').length;
  if (gameOvers !== 1) {
    failures.push({ seed, invariant: 'exactly one game-over', detail: `${gameOvers}` });
  }

  return failures;
}

export interface VerifyReport {
  readonly matches: number;
  readonly failures: InvariantFailure[];
  readonly outcomes: Record<string, number>;
  readonly firstPlayerWins: number;
  readonly durationMs: number;
}

/** Runs `matches` headless matches and checks every invariant on each one. */
export function verify(matches = 1000): VerifyReport {
  const started = Date.now();
  const failures: InvariantFailure[] = [];
  const outcomes: Record<string, number> = {};
  let firstPlayerWins = 0;

  for (let seed = 0; seed < matches; seed++) {
    const rng = createRng(seed * 7919 + 13);
    const options: MatchOptions = {
      seed,
      playerDeck: deck(seed * 2 + 1, DECK_TIERS[seed % DECK_TIERS.length] as Tier),
      aiDeck: deck(seed * 2 + 2, DECK_TIERS[(seed + 2) % DECK_TIERS.length] as Tier),
    };
    const initial = createMatch(options);
    const opening = initial.turn;
    const policy = seed % 2 === 0 ? naive : (s: GameState) => varied(s, rng);
    const { state, events } = playMatch(initial, policy);

    failures.push(...checkInvariants(seed, state, events));

    const outcome = state.result?.outcome ?? 'none';
    outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
    if (state.result && state.result.outcome !== 'draw') {
      const counts = score(state);
      const winner: Owner = counts.player > counts.ai ? 'player' : 'ai';
      if (winner === opening) firstPlayerWins++;
    }
  }

  return {
    matches,
    failures,
    outcomes,
    firstPlayerWins,
    durationMs: Date.now() - started,
  };
}

function main(): void {
  const count = Number(process.argv[2] ?? 1000);
  const report = verify(count);

  console.log(`\nHeadless verification — ${report.matches} matches in ${report.durationMs}ms\n`);
  console.log('  outcomes:');
  for (const [outcome, n] of Object.entries(report.outcomes).sort()) {
    const pct = ((n / report.matches) * 100).toFixed(1);
    console.log(`    ${outcome.padEnd(8)} ${String(n).padStart(6)}  ${pct}%`);
  }

  const decided = report.matches - (report.outcomes['draw'] ?? 0);
  if (decided > 0) {
    const rate = (report.firstPlayerWins / decided) * 100;
    console.log(`\n  opening player wins ${rate.toFixed(1)}% of decided matches`);
    // Not a gate — the AI does not exist yet — but a wildly lopsided number would mean a bug.
    if (rate > 70 || rate < 30) {
      console.log('  NOTE: the opening-player rate is extreme; check for a turn-order bug.');
    }
  }

  if (report.failures.length > 0) {
    console.error(`\n  FAILED — ${report.failures.length} invariant violation(s):\n`);
    for (const failure of report.failures.slice(0, 20)) {
      console.error(`    seed ${failure.seed}: ${failure.invariant} (${failure.detail})`);
    }
    if (report.failures.length > 20) {
      console.error(`    ... and ${report.failures.length - 20} more`);
    }
    process.exit(1);
  }

  console.log(`\n  OK — all invariants held across ${report.matches} matches.\n`);
}

// Only run when invoked directly, so importing this from a test does not execute the sweep.
if (process.argv[1]?.endsWith('verify.ts')) {
  main();
}
