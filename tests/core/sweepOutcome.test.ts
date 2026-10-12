/**
 * A match the player loses *completely* (MOBILE.md follow-up).
 *
 * Reported from play: a 0–10 board produced "Perfect game — you take everything" and "Every one of
 * their cards is yours. You may take all five", over a panel with nothing to take.
 *
 * `Outcome` is `'win' | 'loss' | 'draw' | 'perfect'` and `perfect` carries no direction. `finishMatch`
 * set it when *either* side owned every card, on the reasonable-sounding ground that a sweep is a
 * sweep — and everything downstream read it as a player win. So the defect was not only the text:
 * `recordOutcome` counted a lost match as a **win** and a **perfect**, and `profile.ts` recorded
 * `won: true`. In a 60-match sample this mislabelled **11 matches**.
 *
 * §1.1 settles the direction: "**Perfect Game** (capture all 5 enemy cards) → take all 5 enemy cards."
 * It is the player's achievement. An opponent sweeping the board is a loss, and an unremarkable one.
 *
 * The matches here are played out for real, with a deliberately awful player policy — its emptiest
 * card, placed next to an enemy — because that is how a sweep actually happens and it exercises the
 * cascade rather than a hand-built board.
 */

import { describe, expect, it } from 'vitest';
import {
  createMatch,
  applyAction,
  score,
  legalCells,
  type MatchOptions,
} from '../../src/core/match.ts';
import { createRng } from '../../src/core/rng.ts';
import { rollInstance } from '../../src/core/card.ts';
import { figuresOfTier } from '../../src/data/cards.ts';
import { HAND_SIZE, CELLS } from '../../src/core/constants.ts';
import { recordOutcome } from '../../src/game/save.ts';
import type { Card, Cell, GameState, Owner, Tier } from '../../src/core/types.ts';

const TIERS: readonly Tier[] = [1, 2, 3, 4, 5];

function deck(rngSeed: number, tier: Tier): Card[] {
  const pool = figuresOfTier(tier);
  const rng = createRng(rngSeed);
  return Array.from({ length: HAND_SIZE }, () => {
    const figure = pool[rng.int(pool.length)];
    if (!figure) throw new Error(`no figure in tier ${tier}`);
    return rollInstance(figure, rng);
  });
}

function neighbours(cell: Cell): readonly Cell[] {
  const row = Math.floor(cell / 4);
  const col = cell % 4;
  const out: Cell[] = [];
  for (const [dr, dc] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ] as const) {
    const r = row + dr;
    const c = col + dc;
    if (r >= 0 && r < CELLS / 4 && c >= 0 && c < CELLS / 4) out.push((r * 4 + c) as Cell);
  }
  return out;
}

function countArrows(mask: number): number {
  let n = 0;
  for (let bit = 0; bit < 8; bit++) if ((mask & (1 << bit)) !== 0) n++;
  return n;
}

/** Plays a whole match: the AI takes the card with the most arrows, the player the fewest. */
function playOut(seed: number): GameState {
  const options: MatchOptions = {
    seed,
    playerDeck: deck(seed * 2 + 1, TIERS[seed % TIERS.length] as Tier),
    aiDeck: deck(seed * 2 + 2, TIERS[(seed + 2) % TIERS.length] as Tier),
  };
  let state = createMatch(options);
  let guard = 0;
  while (state.result === null && guard++ < 500) {
    if (state.phase === 'chooseBattle') {
      const cell = state.pendingBattles[0];
      if (cell === undefined) throw new Error('chooseBattle with nothing pending');
      state = applyAction(state, { t: 'chooseBattle', cell }).state;
      continue;
    }
    const owner: Owner = state.turn;
    let cardIndex = 0;
    let best = -Infinity;
    state.players[owner].hand.forEach((card, index) => {
      const value = owner === 'player' ? -countArrows(card.arrows) : countArrows(card.arrows);
      if (value > best) {
        best = value;
        cardIndex = index;
      }
    });
    const legal = legalCells(state);
    let cell = legal[0];
    if (owner === 'player' && cell !== undefined) {
      const nextToEnemy = legal.find((c) =>
        neighbours(c).some((n) => state.board[n]?.owner === 'ai'),
      );
      if (nextToEnemy !== undefined) cell = nextToEnemy;
    }
    if (cell === undefined) throw new Error('place with nowhere to go');
    state = applyAction(state, { t: 'place', cell, cardIndex }).state;
  }
  return state;
}

/** Seeds known to end 0:10 under this policy. Found by playing seeds 1..60. */
const SWEEP_SEEDS = [6, 17, 19, 20, 21, 50, 52] as const;

describe('losing every card', () => {
  it('calls an opponent sweep a loss, not a perfect game', () => {
    for (const seed of SWEEP_SEEDS) {
      const state = playOut(seed);
      const final = score(state);
      // If the policy ever stops producing a sweep these assertions stop running, and the invariant
      // test below still covers the bug on whatever the policy does produce.
      if (final.player > 0) continue;
      expect(final.player, `seed ${seed} should be a sweep`).toBe(0);
      expect(final.ai, `seed ${seed} should be a sweep`).toBe(HAND_SIZE * 2);
      expect(state.result?.outcome, `seed ${seed}`).toBe('loss');
    }
  });

  it('never awards a perfect game to a player who does not own the board', () => {
    // The invariant, checked on every match the policy plays rather than on a hand-picked seed.
    for (let seed = 1; seed <= 60; seed++) {
      const state = playOut(seed);
      const final = score(state);
      const outcome = state.result?.outcome;
      expect(
        outcome === 'perfect' && final.player !== 10,
        `seed ${seed}: outcome ${outcome} on a ${final.player}:${final.ai} board`,
      ).toBe(false);
      // Biconditionals, not "if the outcome is X then the board must be Y".
      //
      // The first version was written the obvious way round and **mutating the draw branch away
      // left all four tests passing** — disabling it turns a level board into a `loss`, so
      // `if (outcome === 'draw')` simply never ran. A test conditional on the code's own answer is
      // the same trap as a test that passes for the wrong reason, and it is the third time in this
      // project that one has hidden behind another.
      //
      // Asserting the equivalence catches both directions at once: the classification cannot be too
      // generous or too stingy.
      expect(
        outcome === 'win' || outcome === 'perfect',
        `seed ${seed}: a ${final.player}:${final.ai} board was called ${outcome}`,
      ).toBe(final.player > final.ai);
      // The draw guard was added after mutating that branch away and finding the *whole suite*
      // passed — 5-5 was being recorded as a loss, one line from the bug above and entirely
      // unguarded.
      expect(
        outcome === 'draw',
        `seed ${seed}: a ${final.player}:${final.ai} board was called ${outcome}`,
      ).toBe(final.player === final.ai);
    }
  });

  it('offers nothing to claim when the player lost', () => {
    for (const seed of SWEEP_SEEDS) {
      const state = playOut(seed);
      if (score(state).player > 0) continue;
      expect(state.result?.claimable, `seed ${seed}`).toEqual([]);
      expect(state.result?.taken, `seed ${seed}`).toEqual([]);
    }
  });

  it('records a sweep in the save as a loss, not a win or a perfect', () => {
    // The part that was quietly wrong for every player, and far less visible than the panel text.
    const before = { matches: 40, wins: 20, losses: 18, draws: 2, perfects: 1 };
    const after = recordOutcome(before, 'loss');
    expect(after.wins).toBe(20);
    expect(after.losses).toBe(19);
    expect(after.perfects).toBe(1);

    const won = recordOutcome(before, 'win');
    expect(won.wins).toBe(21);
    expect(won.perfects).toBe(1);

    const perfect = recordOutcome(before, 'perfect');
    expect(perfect.wins).toBe(21);
    expect(perfect.perfects).toBe(2);
  });
});
