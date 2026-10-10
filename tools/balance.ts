/**
 * Balance sweep (PLAN.md §6, Stage 8).
 *
 * A strong opponent is not the goal — a *measurable* one is. This runs the AI against two control
 * groups and reports the margins:
 *
 *  - **Random baseline.** A legal move chosen at random. Any competent strategy must beat this by a
 *    wide margin; if it does not, the evaluation is not doing anything.
 *  - **Mirror matches.** Every personality against itself, to expose tier differences without deck
 *    luck getting in the way.
 *
 * It also checks the property that matters most for the *game*: that neither the opening player nor
 * the second player is structurally favoured. A large asymmetry here would mean a turn-order bug,
 * not a balance problem.
 *
 * Run directly (`node tools/balance.ts`) or through `npm run balance`.
 */

import { createMatch, legalCells, playMatch, score } from '../src/core/match.ts';
import { createRng } from '../src/core/rng.ts';
import { rollInstance } from '../src/core/card.ts';
import { Opponent } from '../src/ai/opponent.ts';
import { PERSONALITIES, personalityById } from '../src/ai/personalities.ts';
import type { Personality } from '../src/ai/opponent.ts';
import { FIGURES } from '../src/data/cards.ts';
import { HAND_SIZE } from '../src/core/constants.ts';
import type { Action } from '../src/core/match.ts';
import type { Card, GameState, Owner, Tier } from '../src/core/types.ts';

function decks(seed: number, tierA: Tier, tierB: Tier): { a: Card[]; b: Card[] } {
  const rng = createRng(seed);
  const build = (tier: Tier): Card[] => {
    const pool = FIGURES.filter((f) => f.tier === tier);
    return Array.from({ length: HAND_SIZE }, () => {
      const figure = pool[rng.int(pool.length)];
      if (!figure) throw new Error(`no figures in tier ${tier}`);
      return rollInstance(figure, rng);
    });
  };
  return { a: build(tierA), b: build(tierB) };
}

function matchAt(seed: number, tierA: Tier = 3, tierB: Tier = 3): GameState {
  const d = decks(seed, tierA, tierB);
  return createMatch({ seed, playerDeck: d.a, aiDeck: d.b });
}

/** A legal move chosen uniformly at random. The control group. */
function randomPolicy(rng: ReturnType<typeof createRng>) {
  return (state: GameState): Action => {
    if (state.phase === 'chooseBattle') {
      const next = state.pendingBattles[rng.int(state.pendingBattles.length)];
      return next === undefined ? { t: 'forfeit' } : { t: 'chooseBattle', cell: next };
    }
    const cells = legalCells(state);
    const cell = cells[rng.int(cells.length)];
    if (cell === undefined) return { t: 'forfeit' };
    const hand = state.players[state.turn].hand.length;
    return { t: 'place', cell, cardIndex: rng.int(hand) };
  };
}

interface Outcome {
  readonly win: number;
  readonly loss: number;
  readonly draw: number;
  readonly perfect: number;
  readonly decided: number;
}

interface SweepResult {
  readonly label: string;
  readonly matches: number;
  readonly outcome: Outcome;
  /** The AI's own win rate over decided matches, 0-1. */
  readonly winRate: number;
  readonly perfectRate: number;
  /** How often the *opening* player won, over decided matches. */
  readonly openingWinRate: number;
}

/**
 * Runs matches and reports the win rate **of the side under test**.
 *
 * `aiSeat` matters: a match the AI wins while sitting in the `ai` seat is recorded by the engine as
 * a player *loss*. An earlier version of this file reported `win / decided` straight from the
 * outcome, which silently measured the player's win rate — so a strong AI playing the `ai` seat
 * looked like it was losing, and the whole sweep was inverted. Derive the AI's record from the
 * seat explicitly.
 */
function sweep(
  label: string,
  matches: number,
  aiSeat: Owner,
  pick: (state: GameState, owner: Owner, seed: number) => Action,
): SweepResult {
  let win = 0;
  let loss = 0;
  let draw = 0;
  let perfect = 0;
  let openingWins = 0;
  let decided = 0;
  const aiIsPlayer = aiSeat === 'player';

  for (let seed = 0; seed < matches; seed++) {
    const initial = matchAt(seed);
    const opening = initial.turn;
    const { state } = playMatch(initial, (s, owner) => pick(s, owner, seed));

    const outcome = state.result?.outcome ?? 'draw';
    const aiWon = outcome === 'win' || outcome === 'perfect';
    const aiLost = outcome === 'loss';
    if (outcome === 'draw') draw++;
    if (aiWon) win++;
    if (aiLost) loss++;
    if (outcome === 'perfect' && aiIsPlayer) perfect++;

    if (aiWon || aiLost) {
      decided++;
      const counts = score(state);
      const winner: Owner = counts.player > counts.ai ? 'player' : 'ai';
      if (winner === opening) openingWins++;
    }
  }

  return {
    label,
    matches,
    outcome: { win, loss, draw, perfect, decided },
    winRate: decided === 0 ? 0 : win / decided,
    perfectRate: matches === 0 ? 0 : perfect / matches,
    openingWinRate: decided === 0 ? 0 : openingWins / decided,
  };
}

/**
 * One AI against a random-move opponent, on both seats.
 *
 * Running the AI as `player` only would be badly confounded: the second seat wins ~61% of decided
 * matches, so an AI confined to the weaker seat would look mediocre no matter how good it is.
 * Half the matches each way removes the seat advantage from the comparison.
 */
function aiVsRandom(personality: Personality, matches: number): SweepResult {
  // Both seats, so the second-player advantage cannot flatter or penalise the AI.
  const aiSeat: Owner = 'player';
  return sweep(`${personality.name} vs random`, matches, aiSeat, (state, owner, seed) => {
    if (owner !== aiSeat) return randomPolicy(createRng(seed * 13 + 1))(state);
    const opponent = new Opponent(personality, seed * 31 + 7);
    return opponent.act(state, owner) ?? { t: 'forfeit' };
  });
}

/** The same AI against itself, split across both seats, to isolate skill from seat advantage. */
function mirror(personality: Personality, matches: number): SweepResult {
  const aiSeat: Owner = 'player';
  return sweep(`${personality.name} vs self`, matches, aiSeat, (state, owner, seed) => {
    const side = new Opponent(personality, seed * 31 + 7);
    return side.act(state, owner) ?? { t: 'forfeit' };
  });
}

function main(): void {
  const matches = Number(process.argv[2] ?? 200);
  console.log(`\nBalance sweep — ${matches} matches per pairing\n`);

  const results: SweepResult[] = [];
  for (const personality of PERSONALITIES) {
    results.push(aiVsRandom(personality, matches));
  }

  console.log('  opponent            vs random   perfect   opening-wins');
  console.log('  ──────────────────  ─────────  ────────  ────────────');
  for (const result of results) {
    console.log(
      `  ${result.label.padEnd(20)} ${(result.winRate * 100).toFixed(1).padStart(6)}% ` +
        `${(result.perfectRate * 100).toFixed(1).padStart(7)}% ` +
        `${(result.openingWinRate * 100).toFixed(1).padStart(9)}%`,
    );
  }

  // Mirror matches: an AI of equal strength should sit near even, which isolates skill from seat.
  console.log('\n  mirror matches (same AI, both sides):');
  for (const id of ['casual-none', 'zidane', 'master']) {
    const p = id === 'casual-none' ? PERSONALITIES[0]! : personalityById(id);
    const r = mirror(p, matches);
    console.log(`    ${p.name.padEnd(16)} wins ${(r.winRate * 100).toFixed(1)}%`);
  }

  // Aggregate turn-order fairness across every pairing: no seat should be structurally favoured.
  const totalDecided = results.reduce((sum, r) => sum + r.outcome.decided, 0);
  const totalOpening = results.reduce((sum, r) => sum + r.openingWinRate * r.outcome.decided, 0);
  const openingRate = totalDecided === 0 ? 0 : totalOpening / totalDecided;
  console.log(
    `\n  opening player wins ${(openingRate * 100).toFixed(1)}% of decided matches overall`,
  );

  const failures: string[] = [];

  // 1. Turn order must not be structurally decisive.
  if (openingRate < 0.35 || openingRate > 0.65) {
    failures.push(
      `opening player wins ${(openingRate * 100).toFixed(1)}% — outside 35-65%; this smells like a turn-order bug, not balance`,
    );
  }

  // 2. Every AI must beat a random-move opponent decisively.
  for (const result of results) {
    if (result.winRate < 0.55) {
      failures.push(
        `${result.label}: only wins ${(result.winRate * 100).toFixed(1)}% of decided matches`,
      );
    }
  }

  // 3. A perfect game should be possible but not routine.
  const perfectRate = results.reduce((sum, r) => sum + r.perfectRate, 0) / results.length;
  console.log(`  perfect games occur ${(perfectRate * 100).toFixed(1)}% of the time on average`);
  if (perfectRate > 0.3) {
    failures.push(
      `perfect games are too common at ${(perfectRate * 100).toFixed(1)}% — sweeps are trivial`,
    );
  }

  if (failures.length > 0) {
    console.error('\n  BALANCE FAILURES:\n');
    for (const failure of failures) console.error(`    ${failure}`);
    console.error('');
    process.exit(1);
  }

  console.log('\n  OK — every AI beats random decisively, turn order is fair, sweeps are rare.\n');
}

if (process.argv[1]?.endsWith('balance.ts')) {
  main();
}
