/**
 * Arrow patterns for the catalog (PLAN.md §6, Stage 2).
 *
 * Masks are written as 8-character binary strings in the canonical direction order
 * **N, NE, E, SE, S, SW, W, NW**, so `'11111000'` is a card with arrows pointing north through
 * south-east. Reading them as binary makes the intent checkable by eye against §1.2's "8-bit mask".
 *
 * ~30 figures have hand-authored "signature" patterns chosen to be tactically distinct — a
 * corner-friendly three-arrow card, an all-directions card, a one-direction card. Their masks are
 * guaranteed unique (asserted in tests). The rest take a tier-appropriate pattern, which naturally
 * repeats across figures: real decks contain multiple copies of the same arrow arrangement, and
 * the collector's unique-pattern bonus (§1.9) depends on repeats being possible.
 */

import type { Tier } from '../core/types.ts';

/** How many fallback patterns each tier offers. Also the modulus used to pick one. */
const PATTERNS_PER_TIER = 5;

/**
 * Parses an 8-character binary string (in direction order N, NE, E, SE, S, SW, W, NW) into a
 * mask. Position `i` of the string is direction `i`, which is bit `i` of the mask.
 */
export function parsePattern(bits: string): number {
  if (!/^[01]{8}$/.test(bits)) {
    throw new RangeError(`arrow pattern must be 8 binary digits, got "${bits}"`);
  }
  let mask = 0;
  for (let i = 0; i < bits.length; i++) {
    if (bits.charAt(i) === '1') mask |= 1 << i;
  }
  return mask;
}

/** Renders a mask back to its 8-character form, for debugging and tests. */
export function toPattern(mask: number): string {
  let bits = '';
  for (let i = 0; i < 8; i++) bits += (mask >> i) & 1 ? '1' : '0';
  return bits;
}

const SIGNATURE_BITS: Readonly<Record<string, string>> = {
  // Corner and edge specialists: few arrows, all pointing inward.
  Goblin: '11111000',
  Sahagin: '11110100',
  Dodo: '00011000',
  Chocobo: '00111000',
  Chick: '00001110',
  // Utility and blockers: dense but directional.
  Moogle: '01111000',
  Tonberry: '00000111',
  Slime: '00001100',
  Ochu: '11001111',
  Malboro: '00111100',
  Golem: '11100111',
  Mimic: '00001111',
  Wraith: '01010101',
  Djinn: '00110011',
  // Mid-game all-rounders.
  Behemoth: '01111110',
  Chimera: '11111100',
  Draco: '01110110',
  Griffin: '01110111',
  Manticore: '11011100',
  Sphinx: '10110101',
  // Late-game: almost everything, pointing almost everywhere.
  Alexander: '11111110',
  Bahamut: '11101111',
  Titan: '11011111',
  Arc: '01111111',
  Phoenix: '00111111',
  Kraken: '11110000',
  // Threat cards that punish careless placement.
  Lich: '01101110',
  Vampire: '11000110',
  Medusa: '00110110',
  Hydra: '11101110',
  Minotaur: '11011000',
};

/** Hand-authored arrow masks keyed by figure name. Values are numeric 8-bit masks. */
export const FIGURE_SIGNATURES: Readonly<Record<string, number>> = Object.freeze(
  Object.fromEntries(
    Object.entries(SIGNATURE_BITS).map(([name, bits]) => [name, parsePattern(bits)]),
  ),
);

/** A tier's five fallback patterns, indexed by slot rather than position. */
type PatternSlots = readonly [number, number, number, number, number];

const TIER_BITS: Record<Tier, readonly [string, string, string, string, string]> = {
  1: ['00110000', '00011000', '00111000', '00001100', '00101000'],
  2: ['00111100', '00011110', '00111110', '00001111', '00111011'],
  3: ['01111110', '00111111', '11100111', '01101110', '11111000'],
  4: ['11111110', '01111111', '11110111', '11101111', '10111111'],
  5: ['11111111', '11111011', '11101111', '10111111', '11111101'],
};

/** Pre-parsed fallback patterns for a tier, sparsest arrows first. */
const TIER_PATTERNS: Record<Tier, PatternSlots> = Object.freeze(
  Object.fromEntries(
    Object.entries(TIER_BITS).map(([tier, list]) => [tier, list.map(parsePattern)]),
  ) as unknown as Record<Tier, PatternSlots>,
);

/**
 * The fallback patterns for a tier. Low tiers get sparse, awkward masks; high tiers get dense
 * ones, which is what makes a tier-5 card a genuine reward and not just bigger numbers.
 */
export function tierPatterns(tier: Tier): PatternSlots {
  return TIER_PATTERNS[tier];
}

/**
 * Picks a fallback pattern for a figure deterministically from its id, so the catalog is stable
 * across loads without needing an RNG or stored state.
 */
export function patternForFigure(tier: Tier, id: number): number {
  const slot = (id % PATTERNS_PER_TIER) as 0 | 1 | 2 | 3 | 4;
  return TIER_PATTERNS[tier][slot];
}

/** Every pattern string in the signature table, for tests and the debug screen. */
export function signaturePatterns(): Readonly<Record<string, string>> {
  return SIGNATURE_BITS;
}

/** The mask with all eight arrows set — the strongest possible card for combos (§1.7). */
export const FULL_MASK = 0b1111_1111;
