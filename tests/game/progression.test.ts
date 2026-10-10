/**
 * Progression (PLAN.md §1.8).
 *
 * The two rules that are easy to implement subtly wrongly:
 *
 * - **Stat growth ignores caps.** A roll that lands on a maxed stat is lost forever, with no
 *   reroll. An implementation that retries until it finds room looks reasonable and is wrong: it
 *   makes growth converge instead of stalling, which is the opposite of what §1.8 describes.
 * - **Evolution is one roll per battle won, not one per match, and never jumps P → A.**
 */

import { describe, expect, it } from 'vitest';
import {
  P_TO_X_ODDS,
  X_TO_A_ODDS,
  acquireCard,
  applyProgression,
  capsFor,
  describeChange,
  growStat,
  isFullyGrown,
  rollEvolution,
} from '../../src/game/progression.ts';
import { createRng } from '../../src/core/rng.ts';
import { FIGURES, figureById } from '../../src/data/cards.ts';
import type { CardChange, CardType, OwnedCard } from '../../src/core/types.ts';

function card(overrides: Partial<OwnedCard> = {}): OwnedCard {
  return {
    uid: 1,
    figureId: 0,
    arrows: 0b0000_0001,
    atk: 5,
    pdef: 5,
    mdef: 5,
    type: 'P',
    ...overrides,
  };
}

/** Sum of the three stats — growth adds exactly one to this, whichever stat it lands on. */
function power(card: OwnedCard): number {
  return card.atk + card.pdef + card.mdef;
}

/** A card whose every stat is already at its ceiling. */
function maxedCard(overrides: Partial<OwnedCard> = {}): OwnedCard {
  const caps = capsFor(card(overrides));
  return card({ atk: caps.atk, pdef: caps.pdef, mdef: caps.mdef, ...overrides });
}

describe('stat growth (§1.8)', () => {
  it('[§1.8] adds one point to a stat below its cap', () => {
    const target = card({ atk: 0, pdef: 0, mdef: 0 });
    const rng = createRng(1);
    for (let i = 0; i < 200; i++) {
      const growth = growStat(target, rng);
      if (!growth.wasted) {
        expect(growth.to).toBe(growth.from + 1);
        return;
      }
    }
    throw new Error('never rolled an uncapped stat');
  });

  it('[§1.8] wastes the point when the chosen stat is already capped, and never rerolls', () => {
    // All three stats maxed: every roll must be wasted. This is the assertion that fails if
    // someone "helpfully" retries until it finds a stat with room.
    const target = maxedCard();
    const rng = createRng(7);
    for (let i = 0; i < 500; i++) {
      const growth = growStat(target, rng);
      expect(growth.wasted).toBe(true);
      expect(growth.to).toBe(growth.from);
    }
  });

  it('[§1.8] wastes exactly when it must, never otherwise', () => {
    const caps = capsFor(card());
    // Only atk is maxed, so exactly a third of rolls should be wasted.
    const target = card({ atk: caps.atk, pdef: 0, mdef: 0 });
    const rng = createRng(11);
    let wasted = 0;
    const trials = 30000;
    for (let i = 0; i < trials; i++) {
      if (growStat(target, rng).wasted) wasted++;
    }
    // Binomial sd is ~0.3% here, so 1% is comfortably outside noise.
    expect(wasted / trials).toBeGreaterThan(0.32);
    expect(wasted / trials).toBeLessThan(0.35);
  });

  it('[§1.8] chooses each of the three stats uniformly', () => {
    const counts = { atk: 0, pdef: 0, mdef: 0 };
    const rng = createRng(3);
    for (let i = 0; i < 30000; i++) counts[growStat(card(), rng).stat]++;
    for (const key of ['atk', 'pdef', 'mdef'] as const) {
      expect(counts[key] / 30000).toBeGreaterThan(0.32);
      expect(counts[key] / 30000).toBeLessThan(0.35);
    }
  });

  it('[§1.8] only grows cards when the match was won', () => {
    const collection = [card({ uid: 1, atk: 0, pdef: 0, mdef: 0 })];
    const wins = new Map<number, number>();
    for (const won of [true, false]) {
      // A fresh seed each time, so the won and lost runs roll the same stat and differ only in
      // whether the +1 is applied at all.
      const result = applyProgression(
        collection,
        { won, usedUids: [1], battleWins: wins },
        createRng(5),
      );
      expect(power(result.collection[0]!), `won=${won}`).toBe(won ? 1 : 0);
    }
  });

  it('grows only the cards that were used', () => {
    const collection = [
      card({ uid: 1, atk: 0, pdef: 0, mdef: 0 }),
      card({ uid: 2, atk: 0, pdef: 0, mdef: 0 }),
    ];
    const result = applyProgression(
      collection,
      { won: true, usedUids: [1], battleWins: new Map() },
      createRng(2),
    );
    expect(power(result.collection[0]!)).toBe(power(collection[0]!) + 1);
    expect(power(result.collection[1]!)).toBe(power(collection[1]!));
  });

  it('never mutates the input collection', () => {
    const original = card({ uid: 1, atk: 0, pdef: 0, mdef: 0 });
    const collection = [original];
    applyProgression(collection, { won: true, usedUids: [1], battleWins: new Map() }, createRng(4));
    expect(power(original)).toBe(0);
    expect(collection[0]).toBe(original);
  });

  it('reports wasted rolls in its result', () => {
    const collection = [maxedCard({ uid: 1 })];
    const result = applyProgression(
      collection,
      { won: true, usedUids: [1], battleWins: new Map() },
      createRng(9),
    );
    expect(result.wasted).toBe(1);
    expect(result.changes[0]!.wasted).toBe(true);
  });

  it('ignores uids that are not in the collection', () => {
    const collection = [card({ uid: 1 })];
    const result = applyProgression(
      collection,
      { won: true, usedUids: [1, 99], battleWins: new Map([[99, 3]]) },
      createRng(6),
    );
    expect(result.collection).toHaveLength(1);
    expect(result.changes).toHaveLength(1);
  });
});

describe('type evolution (§1.8)', () => {
  it('[§1.8] turns P and M into X about once in 32', () => {
    const rng = createRng(21);
    let evolved = 0;
    const trials = 100000;
    for (let i = 0; i < trials; i++) if (rollEvolution('P', rng) === 'X') evolved++;
    expect(evolved / trials).toBeGreaterThan(1 / P_TO_X_ODDS - 0.005);
    expect(evolved / trials).toBeLessThan(1 / P_TO_X_ODDS + 0.005);
  });

  it('[§1.8] turns X into A about once in 256', () => {
    const rng = createRng(22);
    let evolved = 0;
    const trials = 200000;
    for (let i = 0; i < trials; i++) if (rollEvolution('X', rng) === 'A') evolved++;
    expect(evolved / trials).toBeGreaterThan(1 / X_TO_A_ODDS - 0.004);
    expect(evolved / trials).toBeLessThan(1 / X_TO_A_ODDS + 0.004);
  });

  it('is far rarer for X → A than for P → X', () => {
    // The two rates must not be transposed; 32 and 256 differ by 8x and that is the design.
    expect(X_TO_A_ODDS).toBe(P_TO_X_ODDS * 8);
  });

  it('[§1.8] never jumps straight from P or M to A', () => {
    const rng = createRng(23);
    const seen = new Set<CardType>();
    for (let i = 0; i < 100000; i++) {
      const result = rollEvolution('P', rng);
      if (result !== null) seen.add(result);
    }
    expect([...seen]).toEqual(['X']);
  });

  it('never evolves a card that is already A', () => {
    const rng = createRng(24);
    for (let i = 0; i < 1000; i++) expect(rollEvolution('A', rng)).toBeNull();
  });

  it('[§1.8] rolls once per battle won, so a swept card gets several chances', () => {
    // Give enough battles that evolution is essentially certain, then confirm the type moved.
    let evolved = false;
    for (let seed = 0; seed < 200 && !evolved; seed++) {
      const result = applyProgression(
        [card({ uid: 1, type: 'P' })],
        { won: false, usedUids: [], battleWins: new Map([[1, 40]]) },
        createRng(seed),
      );
      if (result.collection[0]!.type !== 'P') evolved = true;
    }
    expect(evolved).toBe(true);
  });

  it('[§1.8] evolves on a battle win even when the match was lost', () => {
    // §1.8 makes the two independent: growth needs a win, evolution does not.
    let evolved = false;
    for (let seed = 0; seed < 400 && !evolved; seed++) {
      const result = applyProgression(
        [card({ uid: 1, type: 'P' })],
        { won: false, usedUids: [], battleWins: new Map([[1, 25]]) },
        createRng(seed),
      );
      if (result.collection[0]!.type !== 'P') evolved = true;
    }
    expect(evolved).toBe(true);
  });

  it('leaves the type alone when no battle was won', () => {
    const result = applyProgression(
      [card({ uid: 1, type: 'P' })],
      { won: true, usedUids: [1], battleWins: new Map([[1, 0]]) },
      createRng(8),
    );
    expect(result.collection[0]!.type).toBe('P');
  });
});

describe('acquisition', () => {
  it('[§1.8] rolls stats inside the figure range, inclusive', () => {
    const rng = createRng(31);
    for (const figure of FIGURES.slice(0, 40)) {
      for (let i = 0; i < 20; i++) {
        const owned = acquireCard(1, figure.id, rng);
        expect(owned.atk).toBeGreaterThanOrEqual(figure.base.atk);
        expect(owned.atk).toBeLessThanOrEqual(figure.caps.atk);
        expect(owned.pdef).toBeGreaterThanOrEqual(figure.base.pdef);
        expect(owned.pdef).toBeLessThanOrEqual(figure.caps.pdef);
        expect(owned.mdef).toBeGreaterThanOrEqual(figure.base.mdef);
        expect(owned.mdef).toBeLessThanOrEqual(figure.caps.mdef);
        expect(owned.type).toBe(figure.baseType);
        // A figure fixes its arrows exactly, as the artwork does in the original.
        expect(owned.arrows).toBe(figure.arrows);
      }
    }
  });

  it('gives every figure a figure with a non-empty stat range', () => {
    for (const figure of FIGURES) {
      expect(figure.caps.atk).toBeGreaterThanOrEqual(figure.base.atk);
      expect(figureById(figure.id).id).toBe(figure.id);
    }
  });

  it('knows when a card can grow no further', () => {
    expect(isFullyGrown(maxedCard())).toBe(true);
    expect(isFullyGrown(card())).toBe(false);
  });
});

describe('reporting', () => {
  it('describes a wasted roll honestly rather than hiding it', () => {
    const change: CardChange = {
      uid: 1,
      figureId: 0,
      stat: 'atk',
      from: 15,
      to: 15,
      wasted: true,
    };
    expect(describeChange(change)).toMatch(/already maxed/);
    expect(describeChange(change)).toMatch(/lost/);
  });

  it('mentions evolution when a card both grew and changed type', () => {
    const change: CardChange = {
      uid: 1,
      figureId: 0,
      stat: 'atk',
      from: 1,
      to: 2,
      wasted: false,
      evolvedTo: 'X',
    };
    expect(describeChange(change)).toMatch(/evolved to X/);
  });

  it('leaves evolution out when there was none', () => {
    const change: CardChange = { uid: 1, figureId: 0, stat: 'pdef', from: 1, to: 2, wasted: false };
    expect(describeChange(change)).not.toMatch(/evolved/);
  });
});
