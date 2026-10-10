/**
 * Card construction and stat access (PLAN.md §1.2).
 *
 * A card's three stats are **indices**, not values: index `n` denotes the interval
 * [16n, 16n+15] (§1.3). Nothing here knows that rule's arithmetic — that lives in battle.ts.
 */

import { ARROW_SLOTS, STAT_MAX, STAT_MIN, STAT_SPAN } from './constants.ts';
import { arrowCount, arrowsOf } from './direction.ts';
import type { Rng } from './rng.ts';
import type {
  Card,
  CardFigure,
  CardType,
  Direction,
  StatCaps,
  StatIndex,
  StatKey,
} from './types.ts';

/** The three stats, in the order used to break ties for `A`-type cards. */
export const STAT_KEYS = ['atk', 'pdef', 'mdef'] as const satisfies readonly StatKey[];

export interface CardStats {
  readonly atk: StatIndex;
  readonly type: CardType;
  readonly pdef: StatIndex;
  readonly mdef: StatIndex;
}

/** A half-open stat range `[min, max]` in concrete values (§1.3). */
export interface StatInterval {
  readonly min: number;
  readonly max: number;
}

/**
 * The concrete interval a stat index stands for: `n` -> [16n, 16n+15] (§1.3).
 * This is the whole of §1.3's arithmetic; everything else in the game derives from it.
 */
export function statInterval(index: StatIndex): StatInterval {
  const min = index * STAT_SPAN;
  return { min, max: min + STAT_SPAN - 1 };
}

/**
 * True when `index` is a legal stat index (a single hex digit).
 *
 * Deliberately returns `boolean`, not `index is StatIndex`: `StatIndex` is an alias for `number`,
 * so such a predicate would narrow the negative branch to `never` and make error messages
 * untypeable. It would buy nothing and cost clarity.
 */
export function isValidStatIndex(index: number): boolean {
  return Number.isInteger(index) && index >= STAT_MIN && index <= STAT_MAX;
}

/** Reads one stat by key. */
export function stat(card: Card, key: StatKey): StatIndex {
  return card[key];
}

/** The stat interval for one of a card's stats. */
export function statRange(card: Card, key: StatKey): StatInterval {
  return statInterval(card[key]);
}

/** All three stats paired with their keys, in canonical order. */
export function allStats(card: Card): ReadonlyArray<{ key: StatKey; index: StatIndex }> {
  return STAT_KEYS.map((key) => ({ key, index: card[key] }));
}

/** The highest stat index on the card, and which stat it is. Ties break toward the earlier key. */
export function highestStat(card: Card): { key: StatKey; index: StatIndex } {
  let best = allStats(card)[0] as { key: StatKey; index: StatIndex };
  for (const entry of allStats(card)) {
    if (entry.index > best.index) best = entry;
  }
  return best;
}

/** The lowest stat index on the card, and which stat it is. Ties break toward the earlier key. */
export function lowestStat(card: Card): { key: StatKey; index: StatIndex } {
  let best = allStats(card)[0] as { key: StatKey; index: StatIndex };
  for (const entry of allStats(card)) {
    if (entry.index < best.index) best = entry;
  }
  return best;
}

/** The stat code shown on the card face, e.g. `7P23` (§1.2). */
export function statCode(card: Card): string {
  return `${card.atk.toString(16).toUpperCase()}${card.type}${card.pdef
    .toString(16)
    .toUpperCase()}${card.mdef.toString(16).toUpperCase()}`;
}

/** True when the arrow mask is a valid 8-bit value (§1.2: 0 and 255 are both legal). */
export function isValidArrowMask(mask: number): boolean {
  return Number.isInteger(mask) && mask >= 0 && mask <= 0xff;
}

export interface CreateCardOptions {
  readonly figureId: number;
  readonly arrows: number;
  readonly stats: CardStats;
}

export class InvalidCardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCardError';
  }
}

/**
 * Builds a card, rejecting anything the rules cannot represent. Failing loudly at construction
 * beats discovering a bad index deep inside a battle cascade.
 */
export function createCard(options: CreateCardOptions): Card {
  const { figureId, arrows, stats } = options;
  if (!isValidArrowMask(arrows)) {
    throw new InvalidCardError(`arrow mask ${arrows} is out of range 0-255`);
  }
  for (const key of STAT_KEYS) {
    if (!isValidStatIndex(stats[key])) {
      throw new InvalidCardError(`${key} index ${stats[key]} is not a hex digit 0-15`);
    }
  }
  return Object.freeze({
    figureId,
    arrows,
    atk: stats.atk,
    type: stats.type,
    pdef: stats.pdef,
    mdef: stats.mdef,
  });
}

/** Convenience builder for a card addressed by figure only, defaulting to a bare mask. */
export function cardFromStats(figureId: number, stats: CardStats, arrows = 0): Card {
  return createCard({ figureId, arrows, stats });
}

/** The directions this card's arrows point in. */
export function cardArrows(card: Card): Direction[] {
  return arrowsOf(card.arrows);
}

/** How many arrows this card carries. */
export function cardArrowCount(card: Card): number {
  return arrowCount(card.arrows);
}

/** Builds an arrow mask from a list of directions. */
export function maskFrom(arrowDirections: readonly Direction[]): number {
  let mask = 0;
  for (const dir of arrowDirections) mask |= 1 << dir;
  return mask;
}

/**
 * Rolls a fresh instance of a figure.
 *
 * Stats are drawn when the card is **acquired**, not looked up from the figure — faithful to the
 * original, and the reason players there reload saves to reroll. Each of the three indices is
 * drawn uniformly from `[base, caps]`, so a card can never exceed its figure's limits and can
 * never roll below its floor. Per Q6 the index may be anywhere in that range; the concrete value
 * inside the index's interval is drawn later, at battle time, by `baseValue()` (§1.3).
 *
 * The arrow pattern is fixed by the design and is not rolled.
 */
export function rollInstance(figure: CardFigure, rng: Rng): Card {
  const rolled: Record<StatKey, StatIndex> = {
    atk: rng.range(figure.base.atk, figure.caps.atk),
    pdef: rng.range(figure.base.pdef, figure.caps.pdef),
    mdef: rng.range(figure.base.mdef, figure.caps.mdef),
  };
  return createCard({
    figureId: figure.id,
    arrows: figure.arrows,
    stats: { atk: rolled.atk, type: figure.baseType, pdef: rolled.pdef, mdef: rolled.mdef },
  });
}

/** Rolls a whole deck of one figure — used by fixtures and by the debug screens. */
export function rollDeck(figure: CardFigure, count: number, rng: Rng): Card[] {
  return Array.from({ length: count }, () => rollInstance(figure, rng));
}

/** True when a card is at its figure's ceiling on every stat. */
export function isMaxed(card: Card, caps: StatCaps): boolean {
  return card.atk >= caps.atk && card.pdef >= caps.pdef && card.mdef >= caps.mdef;
}

/** A mask with every direction set (§1.2). */
export const FULL_MASK = (1 << ARROW_SLOTS) - 1;
