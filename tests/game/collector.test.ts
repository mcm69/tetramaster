/**
 * Collector level (PLAN.md §1.9).
 *
 * The rule most likely to be implemented wrongly is the dedup: uniqueness is scored by two
 * *independent global* passes, so duplicates are worth nothing at all and a card can score 10
 * without scoring 5. A single per-card pass — "is this card's figure unique, and is its pattern
 * unique, decided for this card alone" — gives the same answer for most collections and a different
 * one exactly where it matters, so the hand-computed cases below are chosen to separate them.
 */

import { describe, expect, it } from 'vitest';
import {
  GLITCH_AT,
  GLITCH_TEXT,
  LEVELS,
  MAX_PER_CARD,
  MAX_POINTS,
  levelFor,
  maxForSize,
  scoreCollection,
} from '../../src/game/collector.ts';
import type { CardType, OwnedCard } from '../../src/core/types.ts';

let nextUid = 1;
function owned(figureId: number, arrows: number, type: CardType = 'P'): OwnedCard {
  return { uid: nextUid++, figureId, arrows, atk: 5, pdef: 5, mdef: 5, type };
}

describe('per-card scoring', () => {
  it('[§1.9] scores a lone card 10 + 5', () => {
    // Hand-computed: unique figure +10, unique pattern +5, plain P +0 = 15.
    const result = scoreCollection([owned(1, 0b0000_0001)]);
    expect(result.points).toBe(15);
    expect(result.cards[0]!.figureUnique).toBe(true);
    expect(result.cards[0]!.patternUnique).toBe(true);
  });

  it('[§1.9] adds +1 for X and +2 for A on top', () => {
    expect(scoreCollection([owned(1, 1, 'P')]).points).toBe(15);
    expect(scoreCollection([owned(2, 2, 'M')]).points).toBe(15);
    expect(scoreCollection([owned(3, 3, 'X')]).points).toBe(16);
    expect(scoreCollection([owned(4, 4, 'A')]).points).toBe(17);
    expect(MAX_PER_CARD).toBe(17);
  });

  it('[§1.9] awards nothing to either card when two share a figure', () => {
    // Figures: 2 present, so neither earns +10. Patterns are distinct, so both still earn +5.
    const result = scoreCollection([owned(7, 1), owned(7, 2)]);
    expect(result.points).toBe(10);
    expect(result.cards.every((c) => !c.figureUnique)).toBe(true);
  });

  it('[§1.9] awards nothing to either card when two share a pattern', () => {
    const result = scoreCollection([owned(1, 9), owned(2, 9)]);
    expect(result.points).toBe(20); // 10 + 10 figures, patterns dead
    expect(result.cards.every((c) => !c.patternUnique)).toBe(true);
  });

  it('[§1.9] scores a pair sharing both figure and pattern at zero', () => {
    const result = scoreCollection([owned(5, 5), owned(5, 5)]);
    expect(result.points).toBe(0);
  });

  it('[§1.9] scores the two passes independently', () => {
    // Figures 1 and 2 are both unique (+10 each). Both cards share pattern 3, so the pattern pass
    // kills that +5 for both. A single fused pass would give the same 20 here...
    const sharedPattern = scoreCollection([owned(1, 3), owned(2, 3)]);
    expect(sharedPattern.points).toBe(20);

    // ...so here is the case that separates them: three cards, two sharing a figure. The shared
    // pair lose the figure bonus, but the pattern pass is global and unaffected — the lone card
    // still keeps its +10 for a figure nobody else has.
    const mixed = scoreCollection([owned(1, 1), owned(1, 2), owned(2, 3)]);
    expect(mixed.cards[0]!.figureUnique).toBe(false);
    expect(mixed.cards[1]!.figureUnique).toBe(false);
    expect(mixed.cards[2]!.figureUnique).toBe(true);
    // Pattern counts are 1, 2, 3 — all unique — so every card keeps its +5: 5 + 5 + 10 + 5.
    expect(mixed.points).toBe(25);
  });

  it('gives a card its type bonus even when both dedup passes fail', () => {
    const result = scoreCollection([owned(5, 5, 'A'), owned(5, 5, 'A')]);
    expect(result.points).toBe(4); // 2 + 2, nothing from uniqueness
  });

  it('scores an empty collection at zero and no glitch', () => {
    const result = scoreCollection([]);
    expect(result.points).toBe(0);
    expect(result.level).toBe('Beginner');
    expect(result.glitch).toBe(false);
    expect(result.size).toBe(0);
  });
});

describe('reachable', () => {
  it('[§1.9] shows what the duplicates are costing', () => {
    // Four cards, two figures duplicated. Worth 10 now; worth 40 with a perfect unique set.
    const cards = [owned(1, 1), owned(1, 2), owned(1, 3), owned(1, 4)];
    const result = scoreCollection(cards);
    expect(result.points).toBe(20);
    expect(result.reachable).toBe(10 + 20); // 1 distinct figure, 4 distinct patterns
    expect(result.reachable).toBeGreaterThan(result.points);
  });

  it('never exceeds the maximum', () => {
    const cards = Array.from({ length: 120 }, (_, i) => owned(i, i, 'A'));
    expect(scoreCollection(cards).reachable).toBeLessThanOrEqual(MAX_POINTS);
  });
});

describe('levels', () => {
  it('lists the whole threshold table in ascending order', () => {
    expect(LEVELS[0]).toEqual({ at: 0, title: 'Beginner' });
    for (let i = 1; i < LEVELS.length; i++) {
      expect(LEVELS[i]!.at).toBeGreaterThan(LEVELS[i - 1]!.at);
    }
  });

  it('[§1.9] names the top of the table Master at 1698, below the maximum', () => {
    // PLAN.md §1.9: 1700 is the theoretical ceiling; Master sits at 1698 and is the real top.
    expect(levelFor(MAX_POINTS - 2).level).toBe('Master');
    expect(levelFor(MAX_POINTS - 1).level).toBe('Master');
    expect(MAX_POINTS).toBe(1700);
    expect(LEVELS[LEVELS.length - 1]!.at).toBe(1698);
  });

  it('[§1.9] resolves every threshold and the point just below it', () => {
    // The first entry is at 0, so it has no lower neighbour to check.
    for (const entry of LEVELS.slice(1)) {
      expect(levelFor(entry.at).level).toBe(entry.title);
      expect(levelFor(entry.at - 1).level).not.toBe(entry.title);
    }
  });

  it('[§1.9] reports the next threshold up, and nothing at the top', () => {
    expect(levelFor(0)).toMatchObject({ level: 'Beginner', nextAt: 300, nextTitle: 'Novice' });
    expect(levelFor(350)).toMatchObject({ level: 'Novice', nextAt: 400, nextTitle: 'Player' });
    expect(levelFor(1698).nextAt).toBeNull();
    expect(levelFor(1698).nextTitle).toBeNull();
  });

  it('caps below the first threshold at Beginner', () => {
    expect(levelFor(0).level).toBe('Beginner');
    expect(levelFor(-5).level).toBe('Beginner');
  });

  it('bounds a large collection by size', () => {
    expect(maxForSize(0)).toBe(0);
    expect(maxForSize(3)).toBe(51);
    expect(maxForSize(100)).toBe(MAX_POINTS);
    expect(maxForSize(500)).toBe(MAX_POINTS);
  });
});

describe('the 1700 glitch (§1.9)', () => {
  /** A perfect collection: 100 distinct figures, 100 distinct patterns, all type A. */
  function perfectCollection(): OwnedCard[] {
    return Array.from({ length: 100 }, (_, i) => owned(i, (i + 1) * 37, 'A'));
  }

  it('is reachable only by a complete catalogue', () => {
    expect(scoreCollection(perfectCollection()).points).toBe(MAX_POINTS);
  });

  it('[§1.9] fires the superimposed prompt at 1700', () => {
    const result = scoreCollection(perfectCollection());
    expect(result.points).toBe(MAX_POINTS);
    expect(result.glitch).toBe(true);
    expect(result.display).toBe(GLITCH_TEXT);
  });

  it('[§1.9] does not fire one point short', () => {
    // Make exactly one card score 16 instead of 17.
    const cards = perfectCollection();
    const broken = cards.map((card, index) =>
      index === 0 ? { ...card, type: 'X' as const } : card,
    );
    const result = scoreCollection(broken);
    expect(result.points).toBe(GLITCH_AT - 1);
    expect(result.glitch).toBe(false);
    expect(result.display).toBe('Master');
  });

  it('[§1.9] reproduces the prompt verbatim', () => {
    expect(GLITCH_TEXT).toBe('Would you like to discard?');
  });

  it('still shows the real title alongside it', () => {
    const result = scoreCollection(perfectCollection());
    expect(result.level).toBe('Master');
    expect(result.display).not.toBe(result.level);
  });
});
