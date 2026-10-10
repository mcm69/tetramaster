/**
 * The battle maths, verified statistically rather than by example (PLAN.md §1.6).
 *
 * `battle.test.ts` in Stage 1 pinned `winProbability` against brute force. This file closes the
 * loop: it runs the *real* `rollBattle` many times and checks the empirical win rate matches the
 * probability the UI would have shown. If the implementation and the formula ever disagree, a
 * Monte Carlo run is what notices — a handful of hand-written cases would not.
 */

import { describe, expect, it } from 'vitest';
import {
  previewOdds,
  resolveStats,
  rollBattle,
  rngResolver,
  winProbability,
} from '../../src/core/battle';
import { createRng } from '../../src/core/rng';
import type { Rng } from '../../src/core/rng';
import { cardFromStats, statInterval } from '../../src/core/card';
import type { BattleOutcome, Card, CardType } from '../../src/core/types';

/**
 * The analytically expected win rate for a stat-index pair: the mean of `winProbability` over every
 * combination of bases the two intervals can produce. Bases are redrawn every battle, so the
 * overall rate is this average, not any single value.
 */
function expectedWinRate(atkIndex: number, defIndex: number): number {
  const atk = statInterval(atkIndex);
  const def = statInterval(defIndex);
  let total = 0;
  for (let a = atk.min; a <= atk.max; a++) {
    for (let d = def.min; d <= def.max; d++) total += winProbability(a, d);
  }
  return total / ((atk.max - atk.min + 1) * (def.max - def.min + 1));
}

function card(atk: number, type: CardType, pdef: number, mdef: number): Card {
  return cardFromStats(0, { atk, type, pdef, mdef }, 0);
}

/** Runs `trials` battles and reports the empirical attacker win rate. */
function empirical(attacker: Card, defender: Card, trials: number, seed = 20261010): number {
  const rng = createRng(seed);
  let wins = 0;
  for (let i = 0; i < trials; i++) {
    if (rollBattle(attacker, defender, rng).attackerWins) wins++;
  }
  return wins / trials;
}

const CARD_TYPES: readonly CardType[] = ['P', 'M', 'X', 'A'];

describe('rollBattle (§1.6)', () => {
  it('[§1.6] draws each base from within its stat index interval', () => {
    const rng = createRng(11);
    const attacker = card(15, 'P', 0, 0);
    const defender = card(0, 'P', 15, 0);
    for (let i = 0; i < 5000; i++) {
      const result = rollBattle(attacker, defender, rng);
      const atk = statInterval(15);
      const def = statInterval(15); // P attacker hits the defender's pdef, also index 15
      expect(result.atkBase).toBeGreaterThanOrEqual(atk.min);
      expect(result.atkBase).toBeLessThanOrEqual(atk.max);
      expect(result.defBase).toBeGreaterThanOrEqual(def.min);
      expect(result.defBase).toBeLessThanOrEqual(def.max);
    }
  });

  it('[§1.6] actual equals base minus roll, and is never negative', () => {
    const rng = createRng(12);
    const a = card(8, 'M', 0, 0);
    const d = card(0, 'M', 0, 8);
    for (let i = 0; i < 5000; i++) {
      const r = rollBattle(a, d, rng);
      expect(r.atkActual).toBe(r.atkBase - r.atkRoll);
      expect(r.defActual).toBe(r.defBase - r.defRoll);
      expect(r.atkActual).toBeGreaterThanOrEqual(0);
      expect(r.defActual).toBeGreaterThanOrEqual(0);
      expect(r.atkRoll).toBeGreaterThanOrEqual(0);
      expect(r.atkRoll).toBeLessThanOrEqual(r.atkBase);
      expect(r.defRoll).toBeGreaterThanOrEqual(0);
      expect(r.defRoll).toBeLessThanOrEqual(r.defBase);
      // actual is uniform on [0, base], so it can never exceed it
      expect(r.atkActual).toBeLessThanOrEqual(r.atkBase);
      expect(r.defActual).toBeLessThanOrEqual(r.defBase);
    }
  });

  it('[§1.6] ties go to the defender', () => {
    // Equal *relevant* stats: a P attacker uses its atk against the defender's pdef, so both
    // cards must share an index there. Because the bases are redrawn every battle, they only tie
    // outright when both land on the same value — about 1 battle in 16 — so the defender's edge is
    // small: the exact expected rate is 0.4959, and crucially it is *below* 0.5.
    const a = card(7, 'P', 7, 7);
    const d = card(7, 'P', 7, 7);
    expect(resolveStats(a, d)).toMatchObject({ atkIndex: 7, defIndex: 7 });
    expect(expectedWinRate(7, 7)).toBeCloseTo(0.4959, 3);
    const rate = empirical(a, d, 60_000);
    expect(rate).toBeLessThan(0.5);
    expect(Math.abs(rate - expectedWinRate(7, 7))).toBeLessThan(0.02);
  });

  it('[§1.6] a forced exact tie is awarded to the defender', () => {
    // A scripted RNG that returns 0 for the base draws and for the rolls pins both actuals to 0,
    // which is the only way to observe the tie rule directly rather than statistically.
    const tie: Rng = {
      state: 0,
      next: () => 0,
      int: () => 0,
      range: () => 0,
      pick: <T>(items: readonly T[]): T => items[0] as T,
      shuffle: <T>(items: readonly T[]): T[] => items.slice(),
    };
    const result = rollBattle(card(0, 'P', 0, 0), card(0, 'P', 0, 0), tie);
    expect(result.atkActual).toBe(0);
    expect(result.defActual).toBe(0);
    expect(result.attackerWins).toBe(false);
  });

  it('[§1.6] with identical fixed bases the defender wins ties 0.46875 of the time', () => {
    // The fixed-base version of the tie rule, where both bases are pinned to the same value.
    // 120/256 = 0.46875, i.e. the 6.25% tie share goes entirely to the defender.
    expect(winProbability(15, 15)).toBeCloseTo(0.46875, 6);
  });

  it('[§1.6] is deterministic for a given seed', () => {
    const a = card(9, 'X', 4, 4);
    const d = card(5, 'A', 6, 6);
    const first = (() => {
      const rng = createRng(4242);
      return Array.from({ length: 50 }, () => rollBattle(a, d, rng));
    })();
    const second = (() => {
      const rng = createRng(4242);
      return Array.from({ length: 50 }, () => rollBattle(a, d, rng));
    })();
    expect(first).toEqual(second);
  });

  it('[§1.6] the reported probability matches the bases actually drawn', () => {
    const rng = createRng(77);
    const a = card(10, 'P', 0, 0);
    const d = card(0, 'P', 0, 0);
    for (let i = 0; i < 2000; i++) {
      const r = rollBattle(a, d, rng);
      expect(r.probability).toBeCloseTo(winProbability(r.atkBase, r.defBase), 12);
    }
  });

  it('[§1.6] the probability is computed before the rolls, so it is never the outcome', () => {
    // A 100% or 0% probability would betray a probability computed after rolling.
    const rng = createRng(5);
    const a = card(15, 'A', 0, 0);
    const d = card(0, 'P', 0, 0);
    for (let i = 0; i < 1000; i++) {
      const r = rollBattle(a, d, rng);
      expect(r.probability).toBeGreaterThan(0);
      expect(r.probability).toBeLessThan(1);
    }
  });
});

describe('§1.6 Monte Carlo — the empirical rate matches the formula', () => {
  const TRIALS = 30_000;

  it('[§1.6] matches for all sixteen attacker/defender type pairings', () => {
    // Each attacker type against each defender type, at a mid-range stat spread.
    for (const attackerType of CARD_TYPES) {
      for (const defenderType of CARD_TYPES) {
        const attacker = card(10, attackerType, 6, 6);
        const defender = card(6, defenderType, 8, 4);
        const pick = resolveStats(attacker, defender);
        const expected = expectedWinRate(pick.atkIndex, pick.defIndex);
        const actual = empirical(attacker, defender, TRIALS);
        const error = Math.abs(actual - expected);
        expect(
          error,
          `${attackerType} vs ${defenderType}: expected ${expected.toFixed(4)}, got ${actual.toFixed(4)}`,
        ).toBeLessThan(0.02);
      }
    }
  });

  it('[§1.6] matches across a wide spread of stat gaps', () => {
    const gaps: ReadonlyArray<readonly [number, number]> = [
      [0, 0],
      [1, 15],
      [15, 1],
      [7, 7],
      [8, 8],
      [12, 3],
      [3, 12],
      [15, 15],
      [10, 5],
    ];
    for (const [atk, def] of gaps) {
      const attacker = card(atk, 'P', 0, 0);
      const defender = card(0, 'P', def, 0);
      const expected = expectedWinRate(atk, def);
      const actual = empirical(attacker, defender, TRIALS);
      expect(
        Math.abs(actual - expected),
        `atk ${atk} vs def ${def}: expected ${expected.toFixed(4)}, got ${actual.toFixed(4)}`,
      ).toBeLessThan(0.02);
    }
  });

  it('[§1.6] a much stronger card still loses sometimes — the rolls are real', () => {
    // Index 15 atk against index 0 pdef is about as lopsided as the game allows: the attacker
    // still loses 1.9% of the time. This is the property that makes the game what it is, and it
    // is why a hand-picked deck cannot guarantee anything.
    const attacker = card(15, 'P', 0, 0);
    const defender = card(0, 'P', 0, 0);
    expect(expectedWinRate(15, 0)).toBeCloseTo(0.9809, 3);
    const rate = empirical(attacker, defender, 40_000);
    expect(rate).toBeGreaterThan(0.96);
    expect(rate).toBeLessThan(1);
  });

  it('[§1.6] the weak card does occasionally win against the overwhelming one', () => {
    const attacker = card(0, 'P', 0, 0);
    const defender = card(0, 'P', 15, 0);
    const rate = empirical(attacker, defender, 40_000);
    expect(rate).toBeGreaterThan(0);
    expect(rate).toBeLessThan(0.03);
  });
});

describe('rngResolver', () => {
  it('produces the same outcomes as calling rollBattle directly', () => {
    const a = card(9, 'M', 4, 4);
    const d = card(4, 'M', 9, 9);
    const viaResolver = rngResolver(createRng(31337));
    const viaRoll = rngResolver(createRng(31337));
    const direct = createRng(31337);
    const resolverOutcomes = Array.from({ length: 25 }, () => viaResolver(a, d));
    const rollOutcomes = Array.from({ length: 25 }, () => viaRoll(a, d));
    const directOutcomes = Array.from({ length: 25 }, () => rollBattle(a, d, direct));
    expect(resolverOutcomes).toEqual(rollOutcomes);
    expect(resolverOutcomes).toEqual(directOutcomes);
  });

  it('advances the RNG it was given, so successive battles differ', () => {
    const rng = createRng(2);
    const resolve = rngResolver(rng);
    const a = card(9, 'P', 0, 0);
    const d = card(0, 'P', 0, 0);
    const outcomes: BattleOutcome[] = Array.from({ length: 40 }, () => resolve(a, d));
    expect(new Set(outcomes.map((o) => `${o.atkBase}/${o.defBase}`)).size).toBeGreaterThan(1);
  });
});

describe('previewOdds still tracks the real rolls', () => {
  it('a preview close to 0.5 is followed by a roughly even fight', () => {
    const attacker = card(7, 'P', 0, 0);
    const defender = card(0, 'P', 7, 0);
    const odds = previewOdds(attacker, defender);
    expect(odds.probability).toBeGreaterThan(0.4);
    expect(odds.probability).toBeLessThan(0.55);
    const actual = empirical(attacker, defender, 30_000);
    expect(Math.abs(actual - odds.probability)).toBeLessThan(0.05);
  });
});
