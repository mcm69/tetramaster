/**
 * Seeded PRNG for the rules engine.
 *
 * Every random decision in Tetra Master flows through this: blocked cells, the coin flip, card
 * stat rolls, and the two battle rolls. Nothing else may produce randomness (PLAN.md §2.2), which
 * is what lets a seed reproduce a match exactly — and what makes the rules testable at all.
 *
 * Mulberry32: 32-bit state, fast, good enough statistical quality for card rolls, trivially
 * serialisable so a match can be saved and resumed mid-battle.
 */

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [0, n). Returns 0 when n <= 0. */
  int(n: number): number;
  /** Uniform integer in [a, b], inclusive at both ends. */
  range(a: number, b: number): number;
  /** Uniform element of a non-empty array. */
  pick<T>(items: readonly T[]): T;
  /** Fisher-Yates shuffle; returns a new array and leaves the input untouched. */
  shuffle<T>(items: readonly T[]): T[];
  /** Current internal state. Assign to resume a stream; read to serialise it. */
  state: number;
}

/**
 * Creates a PRNG. The returned `state` field is mutable and load-bearing: tests, saves and
 * battle replays all depend on being able to read and restore it.
 */
export function createRng(seed: number): Rng {
  // Normalise to an unsigned 32-bit integer so negative or float seeds behave predictably.
  const rng: Rng = {
    state: seed >>> 0,

    next(): number {
      // Mulberry32. `>>> 0` keeps every intermediate step in unsigned 32-bit range.
      this.state = (this.state + 0x6d2b79f5) >>> 0;
      let t = this.state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },

    int(n: number): number {
      if (n <= 0) return 0;
      return Math.floor(this.next() * n);
    },

    range(a: number, b: number): number {
      if (b < a) return a;
      return a + this.int(b - a + 1);
    },

    pick<T>(items: readonly T[]): T {
      if (items.length === 0) {
        throw new RangeError('rng.pick: cannot pick from an empty array');
      }
      // Non-null assertion: length is checked above; permitted in src/core only via a local guard.
      const index = this.int(items.length);
      return items[index] as T;
    },

    shuffle<T>(items: readonly T[]): T[] {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = this.int(i + 1);
        const a = out[i] as T;
        const b = out[j] as T;
        out[i] = b;
        out[j] = a;
      }
      return out;
    },
  };

  return rng;
}
