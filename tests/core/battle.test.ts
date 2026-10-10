import { describe, expect, it } from 'vitest';
import { baseValue, previewOdds, resolveStats, winProbability } from '../../src/core/battle.ts';
import { cardFromStats } from '../../src/core/card.ts';
import { statInterval } from '../../src/core/card.ts';
import type { Card, CardType } from '../../src/core/types.ts';

function card(atk: number, type: CardType, pdef: number, mdef: number): Card {
  return cardFromStats(0, { atk, type, pdef, mdef }, 0);
}

/** Brute-force P(attacker wins) by enumerating every (actualA, actualD) pair (§1.6). */
function bruteForce(atkBase: number, defBase: number): number {
  let wins = 0;
  let total = 0;
  for (let a = 0; a <= atkBase; a++) {
    for (let d = 0; d <= defBase; d++) {
      total++;
      if (a > d) wins++; // ties go to the defender (§1.6.2)
    }
  }
  return wins / total;
}

const CARD_TYPES: readonly CardType[] = ['P', 'M', 'X', 'A'];

describe('resolveStats — the type table (§1.6.1)', () => {
  it('P attacks the defender physical defence', () => {
    const pick = resolveStats(card(7, 'P', 2, 3), card(2, 'M', 1, 2));
    expect(pick).toEqual({ atkKey: 'atk', defKey: 'pdef', atkIndex: 7, defIndex: 1 });
  });

  it('M attacks the defender magical defence', () => {
    const pick = resolveStats(card(2, 'M', 1, 2), card(7, 'P', 2, 3));
    expect(pick).toEqual({ atkKey: 'atk', defKey: 'mdef', atkIndex: 2, defIndex: 3 });
  });

  it('X attacks whichever of the two defences is weaker', () => {
    // 7X12 vs 2M32 -> targets the magical defence (2 < 3)
    expect(resolveStats(card(7, 'X', 1, 2), card(2, 'M', 3, 2))).toMatchObject({
      atkKey: 'atk',
      defKey: 'mdef',
      atkIndex: 7,
      defIndex: 2,
    });
    // ...and the physical one when it is the lower
    expect(resolveStats(card(7, 'X', 1, 2), card(2, 'M', 0, 9))).toMatchObject({
      defKey: 'pdef',
      defIndex: 0,
    });
  });

  it('X labels an even defence match as pdef; the value is identical either way', () => {
    expect(resolveStats(card(4, 'X', 0, 0), card(0, 'P', 6, 6))).toMatchObject({
      defKey: 'pdef',
      defIndex: 6,
    });
  });

  it('A attacks with its highest stat against the lowest of all three defender stats', () => {
    // 2A8F vs 1X2F -> uses mdef (F) against the defender's atk (1)
    const pick = resolveStats(card(2, 'A', 8, 15), card(1, 'X', 2, 15));
    expect(pick).toEqual({ atkKey: 'mdef', defKey: 'atk', atkIndex: 15, defIndex: 1 });
  });

  it('A can attack with a defence stat, not just its attack', () => {
    expect(resolveStats(card(1, 'A', 14, 3), card(9, 'M', 9, 9))).toMatchObject({
      atkKey: 'pdef',
      atkIndex: 14,
    });
    expect(resolveStats(card(1, 'A', 3, 14), card(9, 'M', 9, 9))).toMatchObject({
      atkKey: 'mdef',
      atkIndex: 14,
    });
  });

  it('consults only the attacker type, never the defender type', () => {
    // A P or M attacker picks by its own type; X and A pick by comparison. The defender's type
    // must not change the result, or the rules would be circular. Identical stats, four types.
    for (const attackerType of CARD_TYPES) {
      const results = CARD_TYPES.map((defenderType) =>
        resolveStats(card(5, attackerType, 4, 6), card(3, defenderType, 8, 2)),
      );
      for (const result of results) {
        expect(result, `${attackerType} attacker`).toEqual(results[0]);
      }
    }
  });

  it('FAFF — the theoretical maximum — attacks its best stat against the worst', () => {
    expect(resolveStats(card(15, 'A', 15, 15), card(0, 'A', 0, 0))).toEqual({
      atkKey: 'atk',
      defKey: 'atk',
      atkIndex: 15,
      defIndex: 0,
    });
  });

  it('fails loudly on a corrupt card type instead of returning a wrong stat pick', () => {
    // Unreachable while CardType has exactly four members — the switch is exhaustive by type.
    // It is reachable in practice if a hand-edited or mis-migrated save yields a bad type, and
    // throwing beats silently comparing the wrong stats.
    const corrupt = { ...card(5, 'P', 0, 0), type: 'Z' } as unknown as Card;
    expect(() => resolveStats(corrupt, card(0, 'P', 0, 0))).toThrow(/unreachable card type/);
  });
});

describe('baseValue (§1.3, §1.6 step 2)', () => {
  it('draws uniformly from the stat index interval and never outside it', () => {
    for (let index = 0; index <= 15; index++) {
      const { min, max } = statInterval(index);
      for (const roll of [0, 0.0001, 0.5, 0.9999, 0.9999999]) {
        const value = baseValue(index, () => roll);
        expect(value).toBeGreaterThanOrEqual(min);
        expect(value).toBeLessThanOrEqual(max);
        expect(Number.isInteger(value)).toBe(true);
      }
    }
  });

  it('hits both ends of the interval', () => {
    expect(baseValue(0, () => 0)).toBe(0);
    expect(baseValue(0, () => 0.999999)).toBe(15);
    expect(baseValue(15, () => 0)).toBe(240);
    expect(baseValue(15, () => 0.999999)).toBe(255);
  });

  it('spans the full 0-255 range across every index', () => {
    const values = new Set<number>();
    for (let index = 0; index <= 15; index++) {
      for (let i = 0; i <= 15; i++) {
        values.add(baseValue(index, () => (i + 0.5) / 16));
      }
    }
    expect(Math.min(...values)).toBe(0);
    expect(Math.max(...values)).toBe(255);
  });
});

describe('winProbability (§1.6)', () => {
  it('matches a brute-force enumeration for every reachable base pair', () => {
    for (let a = 0; a <= 255; a++) {
      for (let b = 0; b <= 255; b += 17) {
        expect(winProbability(a, b), `a=${a} b=${b}`).toBeCloseTo(bruteForce(a, b), 12);
      }
    }
  });

  it('matches brute force for small bases exhaustively, where the enumeration is cheap', () => {
    for (let a = 0; a <= 20; a++) {
      for (let b = 0; b <= 20; b++) {
        expect(winProbability(a, b), `a=${a} b=${b}`).toBeCloseTo(bruteForce(a, b), 12);
      }
    }
  });

  it('reproduces the researched 50 vs 7 example at ~91%', () => {
    // The community write-up quotes "about 92%" using an approximation that ignores ties; the
    // exact value for integer rolls is 372/408.
    expect(winProbability(50, 7)).toBeCloseTo(372 / 408, 12);
    expect(winProbability(50, 7) * 100).toBeGreaterThan(91);
    expect(winProbability(50, 7) * 100).toBeLessThan(91.5);
  });

  it('gives the defender ties, so identical bases are a coin-flip weighted against the attacker', () => {
    expect(winProbability(15, 15)).toBeCloseTo(0.46875, 12);
    expect(winProbability(0, 0)).toBe(0);
    expect(winProbability(100, 100)).toBeLessThan(0.5);
  });

  it('gives the attacker exactly 0 when it cannot possibly exceed the defender', () => {
    expect(winProbability(0, 15)).toBe(0);
    expect(winProbability(0, 255)).toBe(0);
    expect(winProbability(3, 9) * 100).toBeCloseTo(15, 10);
  });

  it('approaches certainty as the gap widens', () => {
    expect(winProbability(15, 0)).toBeCloseTo(15 / 16, 12);
    expect(winProbability(255, 0)).toBeGreaterThan(0.99);
    expect(winProbability(200, 10)).toBeGreaterThan(winProbability(50, 7));
  });

  it('is monotone in the attacker base and antitone in the defender base', () => {
    for (let b = 0; b <= 60; b += 10) {
      let previous = -1;
      for (let a = 0; a <= 120; a += 5) {
        const p = winProbability(a, b);
        expect(p).toBeGreaterThanOrEqual(previous);
        previous = p;
      }
    }
    for (let a = 0; a <= 120; a += 20) {
      let previous = 2;
      for (let b = 0; b <= 120; b += 5) {
        const p = winProbability(a, b);
        expect(p).toBeLessThanOrEqual(previous);
        previous = p;
      }
    }
  });

  it('always returns a probability in [0, 1]', () => {
    for (let a = 0; a <= 255; a += 5) {
      for (let b = 0; b <= 255; b += 5) {
        const p = winProbability(a, b);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('previewOdds', () => {
  it('estimates from the midpoint of each side interval', () => {
    const odds = previewOdds(card(7, 'P', 0, 0), card(0, 'P', 0, 0));
    // atk index 7 -> [112,127] midpoint 120; def index 0 -> [0,15] midpoint 8
    expect(odds.atkBase).toBe(120);
    expect(odds.defBase).toBe(8);
    expect(odds.probability).toBeCloseTo(winProbability(120, 8), 12);
  });

  it('reflects the type table rather than raw attack values', () => {
    // An X attacker is rated against the weaker defence, so it should beat what a naive
    // comparison of attack vs magic-defence would suggest.
    const x = previewOdds(card(9, 'X', 0, 0), card(0, 'P', 15, 0));
    expect(x.defBase).toBe(8); // the weak pdef, not the strong mdef
    expect(x.probability).toBeGreaterThan(0.9);
  });

  it('never reports certainty', () => {
    const odds = previewOdds(card(15, 'A', 0, 0), card(0, 'A', 0, 0));
    expect(odds.probability).toBeLessThanOrEqual(1);
    expect(Number.isFinite(odds.probability)).toBe(true);
  });
});
