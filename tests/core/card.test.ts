import { describe, expect, it } from 'vitest';
import {
  FULL_MASK,
  InvalidCardError,
  STAT_KEYS,
  allStats,
  cardArrows,
  cardArrowCount,
  cardFromStats,
  createCard,
  highestStat,
  isValidArrowMask,
  isValidStatIndex,
  lowestStat,
  maskFrom,
  stat,
  statCode,
  statInterval,
  statRange,
} from '../../src/core/card.ts';
import {
  ALL_ARROWS,
  ARROW_SLOTS,
  STAT_MAX,
  STAT_SPAN,
  STAT_VALUE_MAX,
} from '../../src/core/constants.ts';
import type { Card, CardType, StatIndex, StatKey } from '../../src/core/types.ts';

function card(atk: StatIndex, type: CardType, pdef: StatIndex, mdef: StatIndex, arrows = 0): Card {
  return cardFromStats(0, { atk, type, pdef, mdef }, arrows);
}

describe('card stat intervals', () => {
  // §1.3 is entirely about this mapping; if it is wrong, every battle is wrong.
  it('[§1.3] maps every hex digit 0-F to its documented interval', () => {
    const expected: ReadonlyArray<readonly [string, number, number]> = [
      ['0', 0, 15],
      ['1', 16, 31],
      ['2', 32, 47],
      ['3', 48, 63],
      ['4', 64, 79],
      ['5', 80, 95],
      ['6', 96, 111],
      ['7', 112, 127],
      ['8', 128, 143],
      ['9', 144, 159],
      ['A', 160, 175],
      ['B', 176, 191],
      ['C', 192, 207],
      ['D', 208, 223],
      ['E', 224, 239],
      ['F', 240, 255],
    ];
    expect(expected).toHaveLength(16);
    for (const [digit, min, max] of expected) {
      const index = parseInt(digit, 16);
      expect(statInterval(index), `digit ${digit}`).toEqual({ min, max });
    }
  });

  it('[§1.3] intervals are contiguous, non-overlapping and span 0-255', () => {
    for (let i = 0; i < STAT_MAX; i++) {
      const current = statInterval(i);
      const next = statInterval(i + 1);
      expect(current.max).toBeLessThan(next.min);
      expect(next.min).toBe(current.max + 1);
      expect(current.max - current.min + 1).toBe(STAT_SPAN);
    }
    expect(statInterval(0).min).toBe(0);
    expect(statInterval(STAT_MAX).max).toBe(STAT_VALUE_MAX);
    expect(STAT_VALUE_MAX).toBe(255);
  });

  it('[§1.3] statRange reads a card stat through the same mapping', () => {
    const subject = card(7, 'P', 2, 3);
    expect(statRange(subject, 'atk')).toEqual({ min: 112, max: 127 });
    expect(statRange(subject, 'pdef')).toEqual({ min: 32, max: 47 });
    expect(statRange(subject, 'mdef')).toEqual({ min: 48, max: 63 });
  });

  it('validates stat indices as a single hex digit', () => {
    expect(isValidStatIndex(0)).toBe(true);
    expect(isValidStatIndex(15)).toBe(true);
    expect(isValidStatIndex(16)).toBe(false);
    expect(isValidStatIndex(-1)).toBe(false);
    expect(isValidStatIndex(3.5)).toBe(false);
  });
});

describe('card anatomy', () => {
  it('[§1.2] renders the stat code as [atk][type][pdef][mdef] in hex', () => {
    expect(statCode(card(7, 'P', 2, 3))).toBe('7P23');
    expect(statCode(card(10, 'M', 11, 12))).toBe('AMBC');
    expect(statCode(card(15, 'A', 15, 15))).toBe('FAFF');
    expect(statCode(card(0, 'X', 0, 0))).toBe('0X00');
  });

  it('[§1.2] reads stats by key', () => {
    const subject = card(1, 'M', 2, 3);
    expect(stat(subject, 'atk')).toBe(1);
    expect(stat(subject, 'pdef')).toBe(2);
    expect(stat(subject, 'mdef')).toBe(3);
    expect(allStats(subject).map((s) => s.key)).toEqual(STAT_KEYS);
  });

  it('[§1.2] treats 0 and 255 as legal arrow masks', () => {
    expect(isValidArrowMask(0)).toBe(true);
    expect(isValidArrowMask(ALL_ARROWS)).toBe(true);
    expect(isValidArrowMask(256)).toBe(false);
    expect(isValidArrowMask(-1)).toBe(false);
    expect(isValidArrowMask(1.5)).toBe(false);
    expect(ALL_ARROWS).toBe(0b1111_1111);
    expect(ARROW_SLOTS).toBe(8);
    expect(FULL_MASK).toBe(0b1111_1111);
  });

  it("[§1.2] counts and lists a card's arrows", () => {
    expect(cardArrowCount(card(0, 'P', 0, 0, 0))).toBe(0);
    const directions = maskFrom([0, 2, 4, 6]); // the four cardinals
    expect(cardArrows(card(0, 'P', 0, 0, directions))).toEqual([0, 2, 4, 6]);
    expect(cardArrowCount(card(0, 'P', 0, 0, ALL_ARROWS))).toBe(8);
  });

  it('rejects cards the rules cannot represent', () => {
    expect(() => cardFromStats(0, { atk: 16, type: 'P', pdef: 0, mdef: 0 })).toThrow(
      InvalidCardError,
    );
    expect(() => cardFromStats(0, { atk: 0, type: 'P', pdef: -1, mdef: 0 })).toThrow(/pdef/);
    expect(() => cardFromStats(0, { atk: 0, type: 'P', pdef: 0, mdef: 0 }, 256)).toThrow(
      /arrow mask/,
    );
  });

  it('produces frozen cards so match state cannot be mutated behind the reducer', () => {
    const subject = card(1, 'P', 2, 3);
    expect(Object.isFrozen(subject)).toBe(true);
  });
});

describe('highest and lowest stat (A-type selection)', () => {
  it('finds the highest stat and which one it is', () => {
    expect(highestStat(card(2, 'A', 8, 15))).toEqual({ key: 'mdef', index: 15 });
    expect(highestStat(card(15, 'A', 1, 2))).toEqual({ key: 'atk', index: 15 });
    expect(highestStat(card(1, 'A', 9, 2))).toEqual({ key: 'pdef', index: 9 });
  });

  it('finds the lowest stat and which one it is', () => {
    expect(lowestStat(card(2, 'A', 8, 15))).toEqual({ key: 'atk', index: 2 });
    expect(lowestStat(card(9, 'A', 1, 7))).toEqual({ key: 'pdef', index: 1 });
    expect(lowestStat(card(9, 'A', 4, 3))).toEqual({ key: 'mdef', index: 3 });
  });

  it('breaks ties toward the earlier key, which never changes the value used', () => {
    // Equal indices mean any choice yields the same number, so only the label is affected.
    expect(highestStat(card(5, 'A', 5, 5))).toEqual({ key: 'atk', index: 5 });
    expect(lowestStat(card(5, 'A', 5, 5))).toEqual({ key: 'atk', index: 5 });
  });

  it('covers every ordering of three distinct stats', () => {
    const [a, b, c] = [3, 9, 6] as const;
    const perms: ReadonlyArray<readonly [StatKey, StatKey, StatKey]> = [
      ['atk', 'pdef', 'mdef'],
      ['atk', 'mdef', 'pdef'],
      ['pdef', 'atk', 'mdef'],
      ['pdef', 'mdef', 'atk'],
      ['mdef', 'atk', 'pdef'],
      ['mdef', 'pdef', 'atk'],
    ];
    const byKey = { atk: a, pdef: b, mdef: c };
    for (const [first, second, third] of perms) {
      // Construction puts byKey[first] into atk, byKey[second] into pdef, byKey[third] into mdef.
      const subject = card(byKey[first], 'A', byKey[second], byKey[third]);
      const assigned = { atk: byKey[first], pdef: byKey[second], mdef: byKey[third] };
      // Values are distinct (3, 9, 6), so the max is 9 and the min is 3 regardless of layout;
      // only the key naming that slot changes.
      const expectHighKey = (Object.keys(assigned) as StatKey[]).find((k) => assigned[k] === 9);
      const expectLowKey = (Object.keys(assigned) as StatKey[]).find((k) => assigned[k] === 3);
      expect(highestStat(subject)).toEqual({ key: expectHighKey, index: 9 });
      expect(lowestStat(subject)).toEqual({ key: expectLowKey, index: 3 });
    }
  });

  it('exposes the stat keys in canonical order', () => {
    expect([...STAT_KEYS]).toEqual(['atk', 'pdef', 'mdef']);
  });
});

describe('createCard', () => {
  it('freezes a card built through the validating factory', () => {
    const subject = createCard({
      figureId: 42,
      arrows: 0b0000_1111,
      stats: { atk: 1, type: 'P', pdef: 2, mdef: 3 },
    });
    expect(subject.figureId).toBe(42);
    expect(subject.arrows).toBe(0b0000_1111);
    expect(statCode(subject)).toBe('1P23');
    expect(Object.isFrozen(subject)).toBe(true);
  });
});
