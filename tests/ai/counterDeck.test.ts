/**
 * The Master Tournament counter-deck (PLAN.md §6, Stage 10; Q8).
 *
 * The claim worth testing is that this is genuinely a *counter* and not just a second deck. So most
 * of these tests compare the built deck against a random or naive alternative from the same
 * collection — a deck that scores well in absolute terms but no better than the challenger has not
 * answered the question the mode asks.
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COUNTER_WEIGHTS,
  IDEAL_ARROWS,
  counterAdvantage,
  counterDeck,
  expectedBase,
  reasonFor,
  scoreAgainst,
} from '../../src/ai/counterDeck.ts';
import { rollInstance } from '../../src/core/card.ts';
import { createRng } from '../../src/core/rng.ts';
import { resolveStats, winProbability } from '../../src/core/battle.ts';
import { FIGURES } from '../../src/data/cards.ts';
import type { Card, OwnedCard } from '../../src/core/types.ts';

let uid = 0;
function owned(card: Card): OwnedCard {
  uid += 1;
  return { ...card, uid };
}

/** A collection of `count` random cards from the catalog. */
function collection(count: number, seed = 1): OwnedCard[] {
  const rng = createRng(seed);
  return Array.from({ length: count }, () => {
    const figure = FIGURES[rng.int(FIGURES.length)];
    if (figure === undefined) throw new Error('empty catalog');
    return owned(rollInstance(figure, rng));
  });
}

function meanWinRate(deck: readonly Card[], against: readonly Card[]): number {
  if (deck.length === 0) return 0;
  return deck.reduce((sum, card) => sum + scoreAgainst(card, against).winRate, 0) / deck.length;
}

describe('scoring a card against a deck', () => {
  it('uses the midpoint of each stat band, not the index', () => {
    // §1.3: index n is the interval [16n, 16n+15], so the mean is 16n + 7.5.
    expect(expectedBase(0)).toBeCloseTo(7.5, 5);
    expect(expectedBase(4)).toBeCloseTo(71.5, 5);
    expect(expectedBase(15)).toBeCloseTo(247.5, 5);
  });

  it('reports a mean win probability between zero and one', () => {
    const challenger = collection(5, 3);
    for (const card of collection(20, 4)) {
      const score = scoreAgainst(card, challenger);
      expect(score.winRate).toBeGreaterThan(0);
      expect(score.winRate).toBeLessThan(1);
    }
  });

  it('is exactly the mean of the per-card probabilities', () => {
    const challenger = collection(4, 5);
    const card = collection(1, 6)[0] as Card;
    const expected =
      challenger.reduce((sum, foe) => {
        const pick = resolveStats(card, foe);
        return sum + winProbability(expectedBase(pick.atkIndex), expectedBase(pick.defIndex));
      }, 0) / challenger.length;
    expect(scoreAgainst(card, challenger).winRate).toBeCloseTo(expected, 10);
  });

  it('assumes an even match against an empty deck rather than dividing by zero', () => {
    const card = collection(1, 7)[0] as Card;
    expect(scoreAgainst(card, []).winRate).toBe(0.5);
  });

  it('rewards a high floor, because an A attacker reads your lowest stat', () => {
    const challenger = collection(5, 8);
    const lopsided: Card = { figureId: 0, arrows: 0, atk: 12, type: 'P', pdef: 1, mdef: 1 };
    const balanced: Card = { figureId: 0, arrows: 0, atk: 6, type: 'P', pdef: 6, mdef: 6 };
    // With the win term switched off, the floor is all that is left, and it must decide.
    const weights = { win: 0, floor: 1, arrows: 0 };
    expect(scoreAgainst(balanced, challenger, weights).score).toBeGreaterThan(
      scoreAgainst(lopsided, challenger, weights).score,
    );
    // And the default weighting is meant to let a genuinely better attacker win anyway: a counter
    // deck that avoids every strong card would not counter anything.
    expect(scoreAgainst(lopsided, challenger).score).toBeGreaterThan(
      scoreAgainst(balanced, challenger).score,
    );
  });

  it('reports the floor it is scoring on', () => {
    const card: Card = { figureId: 0, arrows: 0, atk: 9, type: 'P', pdef: 7, mdef: 2 };
    expect(scoreAgainst(card, []).floor).toBe(2);
    expect(scoreAgainst(card, []).arrows).toBe(0);
  });

  it('prefers a sane arrow count over every arrow pointing everywhere', () => {
    const challenger = collection(5, 9);
    const reach: Card = { figureId: 0, arrows: 0b0011_1110, atk: 6, type: 'P', pdef: 6, mdef: 6 };
    const exposed: Card = { figureId: 0, arrows: 0xff, atk: 6, type: 'P', pdef: 6, mdef: 6 };
    expect(scoreAgainst(reach, challenger).score).toBeGreaterThan(
      scoreAgainst(exposed, challenger).score,
    );
  });
});

describe('building the deck', () => {
  it('takes exactly the number of cards asked for', () => {
    const deck = counterDeck(collection(5, 10), collection(30, 11), 5);
    expect(deck.cards).toHaveLength(5);
    expect(deck.picks).toHaveLength(5);
  });

  it('never picks the same card twice', () => {
    const deck = counterDeck(collection(5, 12), collection(20, 13), 5);
    expect(new Set(deck.picks.map((p) => p.uid)).size).toBe(5);
  });

  it('beats the deck it was built against, on average', () => {
    // The mode exists to punish a deck; a counter that does not win more is not a counter.
    let better = 0;
    for (let seed = 0; seed < 25; seed++) {
      const challenger = collection(5, 100 + seed);
      const pool = collection(40, 500 + seed);
      const counter = counterDeck(challenger, pool, 5);
      if (counterAdvantage(challenger, counter) > 0) better++;
    }
    expect(better).toBeGreaterThan(20);
  });

  it('beats the same pool picked at random', () => {
    let better = 0;
    for (let seed = 0; seed < 25; seed++) {
      const challenger = collection(5, 200 + seed);
      const pool = collection(40, 900 + seed);
      const counter = counterDeck(challenger, pool, 5);
      const rng = createRng(seed);
      const randomFive = Array.from({ length: 5 }, () => {
        const card = pool[rng.int(pool.length)];
        if (card === undefined) throw new Error('empty pool');
        return card;
      });
      if (meanWinRate(counter.cards, challenger) > meanWinRate(randomFive, challenger)) better++;
    }
    expect(better).toBeGreaterThan(20);
  });

  it("prefers cards that answer the challenger's weak defence", () => {
    // A challenger with very low mdef is answered by M and X, which both read mdef.
    const softMagic: Card[] = [
      { figureId: 0, arrows: 0, atk: 8, type: 'P', pdef: 12, mdef: 0 },
      { figureId: 0, arrows: 0, atk: 8, type: 'P', pdef: 12, mdef: 0 },
    ];
    const pool: OwnedCard[] = [
      owned({ figureId: 0, arrows: 0b0011_1110, atk: 10, type: 'M', pdef: 8, mdef: 8 }),
      owned({ figureId: 0, arrows: 0b0011_1110, atk: 9, type: 'X', pdef: 9, mdef: 9 }),
      owned({ figureId: 0, arrows: 0b0000_0011, atk: 10, type: 'P', pdef: 8, mdef: 8 }),
    ];
    const deck = counterDeck(softMagic, pool, 2);
    const types = deck.cards.map((card) => card.type);
    // Both M and X read mdef; P does not, so it should not be what gets picked.
    expect(types).not.toContain('P');
  });

  it('reports that it came up short rather than returning a wrong-sized deck', () => {
    const deck = counterDeck(collection(5, 14), collection(3, 15), 5);
    expect(deck.cards).toHaveLength(3);
    expect(deck.short).toBe(true);
  });

  it('copes with an empty collection', () => {
    const deck = counterDeck(collection(5, 16), [], 5);
    expect(deck.cards).toHaveLength(0);
    expect(deck.short).toBe(true);
    expect(deck.summary).toMatch(/No cards/);
  });

  it('is deterministic', () => {
    const challenger = collection(5, 17);
    const pool = collection(20, 18);
    expect(counterDeck(challenger, pool, 5).picks.map((p) => p.uid)).toEqual(
      counterDeck(challenger, pool, 5).picks.map((p) => p.uid),
    );
  });

  it('does not mutate the collection it was given', () => {
    const pool = collection(10, 19);
    const before = pool.map((card) => card.uid);
    counterDeck(collection(5, 20), pool, 5);
    expect(pool.map((card) => card.uid)).toEqual(before);
  });

  it('explains each pick', () => {
    const deck = counterDeck(collection(5, 21), collection(20, 22), 5);
    for (const pick of deck.picks) {
      expect(pick.reason).toMatch(/% average win rate/);
      expect(pick.score.winRate).toBeGreaterThan(0);
    }
    expect(deck.summary).toMatch(/Counter-deck built/);
  });
});

describe('the weights', () => {
  it('can be argued with, and the win term dominates by default', () => {
    expect(DEFAULT_COUNTER_WEIGHTS.win).toBeGreaterThan(
      DEFAULT_COUNTER_WEIGHTS.floor + DEFAULT_COUNTER_WEIGHTS.arrows,
    );
  });

  it('shifts the picks when the win term is discounted', () => {
    const challenger = collection(5, 23);
    const pool = collection(30, 24);
    const byWins = counterDeck(challenger, pool, 5, { win: 100, floor: 1.5, arrows: 1.2 });
    const byBalance = counterDeck(challenger, pool, 5, { win: 1, floor: 20, arrows: 5 });
    expect(byWins.cards).not.toEqual(byBalance.cards);
  });

  it('names the arrow count it is aiming for', () => {
    expect(IDEAL_ARROWS).toBe(5);
    expect(reasonFor({ score: 0, winRate: 0.5, floor: 3, arrows: 0 })).toMatch(/slow/);
    expect(reasonFor({ score: 0, winRate: 0.5, floor: 10, arrows: 6 })).toMatch(/no weak stat/);
    expect(reasonFor({ score: 0, winRate: 0.5, floor: 5, arrows: 5 })).toMatch(/average win rate/);
  });
});
