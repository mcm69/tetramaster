import { describe, expect, it } from 'vitest';
import {
  FIGURES,
  FIGURES_BY_ID,
  describeFigure,
  distinctArrowMasks,
  figureById,
  figuresOfFamily,
  figuresOfTier,
} from '../../src/data/cards';
import {
  FULL_MASK,
  FIGURE_SIGNATURES,
  parsePattern,
  patternForFigure,
  signaturePatterns,
  tierPatterns,
  toPattern,
} from '../../src/data/arrowSets';
import { isMaxed, rollDeck, rollInstance, statCode } from '../../src/core/card';
import { createRng } from '../../src/core/rng';
import { arrowCount } from '../../src/core/direction';
import { ALL_ARROWS, STAT_MAX, STAT_MIN } from '../../src/core/constants';
import type { CardFigure, Tier } from '../../src/core/types';

const ALL_TIERS: readonly Tier[] = [1, 2, 3, 4, 5];

describe('catalog shape', () => {
  it('[§1.2] defines exactly 100 figures', () => {
    expect(FIGURES).toHaveLength(100);
    expect(FIGURES_BY_ID.size).toBe(100);
  });

  it('[§1.2] ids are 0-99 and match their index', () => {
    FIGURES.forEach((figure, index) => {
      expect(figure.id).toBe(index);
    });
  });

  it('[§1.2] names are unique', () => {
    const names = new Set(FIGURES.map((f) => f.name));
    expect(names.size).toBe(100);
    for (const figure of FIGURES) expect(figure.name.trim()).not.toBe('');
  });

  it('[§1.2] every stat cap is a valid hex digit', () => {
    for (const figure of FIGURES) {
      for (const key of ['atk', 'pdef', 'mdef'] as const) {
        const cap = figure.caps[key];
        expect(cap, `${figure.name}.${key}`).toBeGreaterThanOrEqual(STAT_MIN);
        expect(cap, `${figure.name}.${key}`).toBeLessThanOrEqual(STAT_MAX);
        expect(Number.isInteger(cap)).toBe(true);
      }
    }
  });

  it('[§1.2] every base stat is within [0, cap] so a roll can never exceed the ceiling', () => {
    for (const figure of FIGURES) {
      for (const key of ['atk', 'pdef', 'mdef'] as const) {
        expect(figure.base[key], `${figure.name}.${key}`).toBeGreaterThanOrEqual(STAT_MIN);
        expect(figure.base[key], `${figure.name}.${key}`).toBeLessThanOrEqual(figure.caps[key]);
      }
    }
  });

  it('[§1.2] every arrow mask is a legal 8-bit value', () => {
    for (const figure of FIGURES) {
      expect(figure.arrows, figure.name).toBeGreaterThanOrEqual(0);
      expect(figure.arrows, figure.name).toBeLessThanOrEqual(ALL_ARROWS);
      expect(Number.isInteger(figure.arrows)).toBe(true);
    }
  });

  it('every base type is one of the four legal types', () => {
    for (const figure of FIGURES) {
      expect(['P', 'M', 'X', 'A']).toContain(figure.baseType);
    }
  });

  it('lookups by id resolve, and unknown ids throw rather than return undefined', () => {
    expect(figureById(0).name).toBe(FIGURES[0]?.name);
    expect(figureById(99).name).toBe(FIGURES[99]?.name);
    expect(() => figureById(100)).toThrow(/unknown figureId/);
    expect(() => figureById(-1)).toThrow(RangeError);
  });

  it('filters by tier and by family', () => {
    for (const tier of ALL_TIERS) {
      const tierFigures = figuresOfTier(tier);
      expect(tierFigures.length).toBeGreaterThan(0);
      for (const figure of tierFigures) expect(figure.tier).toBe(tier);
    }
    expect(figuresOfTier(1).length + figuresOfTier(2).length).toBeLessThan(100);
    const beasts = figuresOfFamily('beast');
    expect(beasts.length).toBeGreaterThan(0);
    for (const figure of beasts) expect(figure.family).toBe('beast');
  });

  it('describes a figure without throwing', () => {
    for (const figure of FIGURES) {
      const line = describeFigure(figure);
      expect(line).toContain(figure.name);
      expect(line).toContain(String(figure.tier));
    }
  });
});

describe('catalog balance', () => {
  it('caps rise with tier on average, so a tier-5 card is genuinely stronger', () => {
    const average = (tier: Tier): number => {
      const figures = figuresOfTier(tier);
      const total = figures.reduce((sum, f) => sum + f.caps.atk + f.caps.pdef + f.caps.mdef, 0);
      return total / (figures.length * 3);
    };
    const averages = ALL_TIERS.map(average);
    for (let i = 1; i < averages.length; i++) {
      expect(averages[i]!, `${ALL_TIERS[i]} vs ${ALL_TIERS[i - 1]}`).toBeGreaterThan(
        averages[i - 1]!,
      );
    }
    expect(averages[0]!).toBeLessThan(8);
    expect(averages[4]!).toBeGreaterThan(13);
  });

  it('only late tiers can reach F on every stat', () => {
    const allF = FIGURES.filter(
      (f) => f.caps.atk === 15 && f.caps.pdef === 15 && f.caps.mdef === 15,
    );
    for (const figure of allF) expect(figure.tier).toBeGreaterThanOrEqual(4);
    expect(allF.length).toBeGreaterThan(0);
  });

  it('higher tiers have more arrows on average', () => {
    const averageArrows = (tier: Tier): number => {
      const figures = figuresOfTier(tier);
      return figures.reduce((sum, f) => sum + arrowCount(f.arrows), 0) / figures.length;
    };
    expect(averageArrows(5)).toBeGreaterThan(averageArrows(1));
    expect(averageArrows(4)).toBeGreaterThan(averageArrows(2));
  });

  it('keeps a healthy spread of arrow patterns, since collector points reward uniqueness', () => {
    // 256 patterns exist; the catalog uses a meaningful subset without saturating.
    const distinct = distinctArrowMasks();
    expect(distinct.length).toBeGreaterThanOrEqual(20);
    expect(distinct.length).toBeLessThan(256);
  });
});

describe('arrow sets', () => {
  it('[§1.2] signature masks are unique, so no two signature figures share a pattern', () => {
    const masks = Object.values(FIGURE_SIGNATURES);
    expect(masks.length).toBeGreaterThanOrEqual(25);
    expect(new Set(masks).size).toBe(masks.length);
  });

  it('[§1.2] every signature name resolves to a real figure', () => {
    const names = new Set(FIGURES.map((f) => f.name));
    for (const name of Object.keys(FIGURE_SIGNATURES)) {
      expect(names.has(name), `signature "${name}" has no figure`).toBe(true);
    }
  });

  it('toPattern round-trips every mask in the catalog', () => {
    for (const figure of FIGURES) {
      expect(toPattern(figure.arrows), figure.name).toMatch(/^[01]{8}$/);
      expect(figure.arrows).toBe(maskOf(toPattern(figure.arrows)));
    }
  });

  it("patternForFigure is deterministic and cycles through a tier's slots", () => {
    for (const tier of ALL_TIERS) {
      const patterns = tierPatterns(tier);
      for (const id of [0, 1, 2, 3, 4, 5, 99]) {
        expect(patternForFigure(tier, id)).toBe(patterns[id % 5]);
        expect(patternForFigure(tier, id)).toBe(patternForFigure(tier, id));
      }
    }
  });

  it('tier patterns are non-empty, unique within a tier, and grow with tier', () => {
    for (const tier of ALL_TIERS) {
      const patterns = tierPatterns(tier);
      expect(patterns.length).toBeGreaterThan(0);
      expect(new Set(patterns).size).toBe(patterns.length);
      const widths = patterns.map(arrowCount);
      expect(Math.max(...widths)).toBeGreaterThanOrEqual(Math.min(...widths));
    }
    const width = (tier: Tier): number => Math.max(...tierPatterns(tier).map(arrowCount));
    expect(width(5)).toBeGreaterThan(width(1));
  });

  it('exposes the all-directions mask, which is 255', () => {
    expect(FULL_MASK).toBe(0b1111_1111);
    expect(arrowCount(FULL_MASK)).toBe(8);
  });

  it('parsePattern rejects anything that is not 8 binary digits', () => {
    expect(() => parsePattern('')).toThrow(RangeError);
    expect(() => parsePattern('1111')).toThrow(/8 binary digits/);
    expect(() => parsePattern('111111111')).toThrow(/8 binary digits/);
    expect(() => parsePattern('1111111x')).toThrow(/8 binary digits/);
    expect(() => parsePattern('1111 111')).toThrow(/8 binary digits/);
  });

  it('parsePattern maps the leftmost character to direction N', () => {
    expect(parsePattern('10000000')).toBe(0b0000_0001);
    expect(parsePattern('00000001')).toBe(0b1000_0000);
    expect(parsePattern('00000000')).toBe(0);
    expect(parsePattern('11111111')).toBe(255);
    expect(arrowCount(parsePattern('11111000'))).toBe(5);
  });

  it('signaturePatterns exposes the authored strings for inspection', () => {
    const patterns = signaturePatterns();
    for (const bits of Object.values(patterns)) expect(bits).toMatch(/^[01]{8}$/);
  });

  function maskOf(bits: string): number {
    let mask = 0;
    for (const [i, bit] of Array.from(bits).entries()) {
      if (bit === '1') mask |= 1 << i;
    }
    return mask;
  }
});

describe('rollInstance (§1.2 acquisition rolls)', () => {
  it('[§1.2] rolls stats inside [base, caps] for all 100 figures', () => {
    const rng = createRng(20261010);
    for (const figure of FIGURES) {
      for (let i = 0; i < 20; i++) {
        const card = rollInstance(figure, rng);
        for (const key of ['atk', 'pdef', 'mdef'] as const) {
          expect(card[key], `${figure.name}.${key}`).toBeGreaterThanOrEqual(figure.base[key]);
          expect(card[key], `${figure.name}.${key}`).toBeLessThanOrEqual(figure.caps[key]);
        }
      }
    }
  });

  it('[§1.2] never exceeds the figure caps over many rolls', () => {
    const rng = createRng(99);
    for (const figure of FIGURES) {
      for (let i = 0; i < 200; i++) {
        const card = rollInstance(figure, rng);
        expect(card.atk).toBeLessThanOrEqual(figure.caps.atk);
        expect(card.pdef).toBeLessThanOrEqual(figure.caps.pdef);
        expect(card.mdef).toBeLessThanOrEqual(figure.caps.mdef);
      }
    }
  });

  it('[§1.2] inherits the figure id, arrow pattern and base type', () => {
    const rng = createRng(7);
    for (const figure of FIGURES) {
      const card = rollInstance(figure, rng);
      expect(card.figureId).toBe(figure.id);
      expect(card.arrows).toBe(figure.arrows);
      expect(card.type).toBe(figure.baseType);
    }
  });

  it('[§1.2] the same seed reproduces the same roll, so saves stay valid', () => {
    const a = createRng(4242);
    const b = createRng(4242);
    for (const figure of FIGURES) {
      expect(statCode(rollInstance(figure, a))).toBe(statCode(rollInstance(figure, b)));
    }
  });

  it('[§1.2] different instances of one figure genuinely differ', () => {
    // The whole reason the original lets players reload to reroll: stats are rolled per copy.
    const figure = figureById(0);
    const rng = createRng(1);
    const codes = new Set(rollDeck(figure, 100, rng).map(statCode));
    expect(codes.size).toBeGreaterThan(1);
  });

  it('rolls eventually reach the ceiling for a card with real headroom', () => {
    const figure = figuresOfTier(5)[0] as CardFigure;
    const rng = createRng(31337);
    const cards = rollDeck(figure, 500, rng);
    expect(cards.some((card) => card.atk === figure.caps.atk)).toBe(true);
  });

  it('isMaxed detects a card sitting at every ceiling', () => {
    const figure = figuresOfTier(3)[0] as CardFigure;
    const rng = createRng(5);
    const cards = rollDeck(figure, 2000, rng);
    expect(cards.some((card) => isMaxed(card, figure.caps))).toBe(true);
    expect(cards.every((card) => !isMaxed(card, figure.caps) || card.atk === figure.caps.atk)).toBe(
      true,
    );
  });

  it('rollDeck returns the requested count', () => {
    const rng = createRng(2);
    expect(rollDeck(figureById(3), 7, rng)).toHaveLength(7);
  });
});
