import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/core/rng.ts';

describe('rng', () => {
  it('[rng] the same seed produces the same stream (determinism)', () => {
    const a = createRng(1234);
    const b = createRng(1234);
    const seqA = Array.from({ length: 100 }, () => a.next());
    const seqB = Array.from({ length: 100 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('different seeds diverge', () => {
    const a = Array.from({ length: 20 }, (_, i) => createRng(i).next());
    const unique = new Set(a);
    expect(unique.size).toBe(a.length);
  });

  it('next() stays within [0, 1)', () => {
    const rng = createRng(99);
    for (let i = 0; i < 10_000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('[rng] serialised state resumes an interrupted stream exactly', () => {
    const rng = createRng(7);
    for (let i = 0; i < 13; i++) rng.next();
    const snapshot = rng.state;

    const expected = Array.from({ length: 10 }, () => rng.next());

    // Simulate a save/load: restore only the state field onto a fresh generator.
    const restored = createRng(0);
    restored.state = snapshot;
    const actual = Array.from({ length: 10 }, () => restored.next());

    expect(actual).toEqual(expected);
  });

  it('state is an unsigned 32-bit integer', () => {
    const rng = createRng(-1);
    expect(rng.state).toBeGreaterThanOrEqual(0);
    expect(rng.state).toBeLessThanOrEqual(0xffffffff);
    for (let i = 0; i < 1000; i++) {
      rng.next();
      expect(Number.isInteger(rng.state)).toBe(true);
      expect(rng.state).toBeGreaterThanOrEqual(0);
    }
  });

  describe('int(n)', () => {
    it('stays within [0, n)', () => {
      const rng = createRng(42);
      for (const n of [1, 2, 7, 16, 256, 1000]) {
        for (let i = 0; i < 500; i++) {
          const v = rng.int(n);
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThan(n);
        }
      }
    });

    it('returns 0 for n <= 0 rather than throwing', () => {
      const rng = createRng(3);
      expect(rng.int(0)).toBe(0);
      expect(rng.int(-5)).toBe(0);
    });

    it('hits every value in a small range (no dead outputs)', () => {
      const rng = createRng(2026);
      const seen = new Set<number>();
      for (let i = 0; i < 2000; i++) seen.add(rng.int(16));
      expect(seen.size).toBe(16);
    });
  });

  describe('range(a, b)', () => {
    it('is inclusive at both ends', () => {
      const rng = createRng(555);
      const seen = new Set<number>();
      for (let i = 0; i < 2000; i++) seen.add(rng.range(3, 6));
      expect([...seen].sort((a, b) => a - b)).toEqual([3, 4, 5, 6]);
    });

    it('handles a single-point range and an inverted range', () => {
      const rng = createRng(8);
      expect(rng.range(4, 4)).toBe(4);
      expect(rng.range(9, 2)).toBe(9);
    });

    it('[rng] covers both ends of a stat interval like [0, 15]', () => {
      // Stat digits are intervals (§1.3); range() is how battle code will draw from them.
      const rng = createRng(31337);
      const seen = new Set<number>();
      for (let i = 0; i < 5000; i++) seen.add(rng.range(0, 15));
      expect(seen.size).toBe(16);
      expect(Math.min(...seen)).toBe(0);
      expect(Math.max(...seen)).toBe(15);
    });
  });

  describe('pick / shuffle', () => {
    it('picks only elements of the array', () => {
      const rng = createRng(17);
      const items = ['a', 'b', 'c'];
      for (let i = 0; i < 500; i++) expect(items).toContain(rng.pick(items));
    });

    it('throws on an empty array', () => {
      expect(() => createRng(1).pick([])).toThrow(RangeError);
    });

    it('shuffle is a permutation and does not mutate the input', () => {
      const rng = createRng(64);
      const input = [1, 2, 3, 4, 5, 6, 7, 8];
      const copy = input.slice();
      const out = rng.shuffle(input);
      expect(input).toEqual(copy);
      expect(out.slice().sort((a, b) => a - b)).toEqual(copy);
    });

    it('[rng] shuffling twice with one rng differs from shuffling once with two fresh rngs', () => {
      const a = createRng(5);
      const b = createRng(5);
      const c = createRng(5);
      expect(a.shuffle([1, 2, 3, 4, 5, 6, 7, 8])).toEqual(c.shuffle([1, 2, 3, 4, 5, 6, 7, 8]));
      expect(a.shuffle([1, 2, 3, 4, 5, 6, 7, 8])).not.toEqual(b.shuffle([1, 2, 3, 4, 5, 6, 7, 8]));
    });
  });

  it('[rng] is approximately uniform — the battle rolls depend on it', () => {
    const rng = createRng(20261010);
    const buckets = new Array<number>(10).fill(0);
    const trials = 100_000;
    for (let i = 0; i < trials; i++) {
      const bucket = rng.int(10);
      buckets[bucket] = (buckets[bucket] ?? 0) + 1;
    }
    for (const count of buckets) {
      // 10% of 100k is 10k; ±5% of expectation is a very loose but non-vacuous band.
      expect(count).toBeGreaterThan(trials / 10 / 1.05);
      expect(count).toBeLessThan((trials / 10) * 1.05);
    }
  });
});
