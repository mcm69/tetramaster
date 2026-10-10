/**
 * Collector level (PLAN.md §1.9).
 *
 * Points come from the *collection*, not the win/loss record — you level up by completing the
 * catalogue, not by grinding matches. Each card is worth up to 17:
 *
 * - `+10` if its **figure** is owned exactly once
 * - `+5` if its **arrow pattern** is owned exactly once
 * - `+1` if its type is `X`, `+2` if `A`
 *
 * The first two are **two independent global deduplication passes**. This is the one genuinely
 * subtle rule in §1.9 and it is easy to get backwards: uniqueness is not evaluated per card in one
 * pass. Duplicates are struck off globally, then whatever survives is scored. So two cards sharing a
 * figure award `+10` to *neither* of them, and the arrow-pattern pass then runs over the whole
 * collection as if the figure pass had not happened. A card can therefore score 10 and not 5, or 5
 * and not 10, and duplicates are worth exactly nothing — which is the entire point, since it is
 * what makes collecting a full unique set the hard way to the top.
 *
 * 100 unique cards at 17 each is `1700`. `Master` at `1698` is the real ceiling, and the only way to
 * `>= 1700` is to complete the game — at which point the original superimposes
 * `Would you like to discard?` over the level display, a famous bug that PLAN.md §1.9 asks us to
 * reproduce rather than fix.
 */

import type { OwnedCard } from '../core/types.ts';

/** `10 + 5 + 2` — the most a single card can contribute. */
export const MAX_PER_CARD = 17;

/** `17 × 100` figures in the catalogue. */
export const MAX_POINTS = MAX_PER_CARD * 100;

/** Points at which the original's discard prompt appears. */
export const GLITCH_AT = MAX_POINTS;

/** The superimposed string, reproduced verbatim from §1.9. */
export const GLITCH_TEXT = 'Would you like to discard?';

/** The full threshold table, ascending (PLAN.md §1.9). */
export const LEVELS: readonly { readonly at: number; readonly title: string }[] = [
  { at: 0, title: 'Beginner' },
  { at: 300, title: 'Novice' },
  { at: 400, title: 'Player' },
  { at: 500, title: 'Senior' },
  { at: 600, title: 'Fan' },
  { at: 700, title: 'Leader' },
  { at: 800, title: 'Coach' },
  { at: 900, title: 'Advisor' },
  { at: 1000, title: 'Director' },
  { at: 1100, title: 'Dealer' },
  { at: 1200, title: 'Trader' },
  { at: 1250, title: 'Commander' },
  { at: 1300, title: 'Doctor' },
  { at: 1320, title: 'Professor' },
  { at: 1330, title: 'Veteran' },
  { at: 1340, title: 'Freak' },
  { at: 1350, title: 'Champion' },
  { at: 1360, title: 'Analyst' },
  { at: 1370, title: 'General' },
  { at: 1380, title: 'Expert' },
  { at: 1390, title: 'Shark' },
  { at: 1400, title: 'Specialist' },
  { at: 1450, title: 'Elder' },
  { at: 1475, title: 'Dominator' },
  { at: 1500, title: 'Maestro' },
  { at: 1550, title: 'King' },
  { at: 1600, title: 'Wizard' },
  { at: 1650, title: 'Authority' },
  { at: 1680, title: 'Emperor' },
  { at: 1690, title: 'Pro' },
  { at: 1698, title: 'Master' },
];

/** What a single card contributes, kept for the collection screen's breakdown. */
export interface CardScore {
  readonly uid: number;
  readonly figureId: number;
  readonly figureUnique: boolean;
  readonly patternUnique: boolean;
  readonly typeBonus: number;
  readonly points: number;
}

/** Counts occurrences of each key across the collection. */
function occurrenceCounts(
  cards: readonly OwnedCard[],
  key: (card: OwnedCard) => number,
): Map<number, number> {
  const counts = new Map<number, number>();
  for (const card of cards) {
    const k = key(card);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

export interface CollectorScore {
  readonly points: number;
  readonly level: string;
  /** Points needed for the next title, or `null` at the top of the table. */
  readonly nextAt: number | null;
  readonly nextTitle: string | null;
  /** Cards held. */
  readonly size: number;
  /** Points still obtainable from the cards already held — i.e. what duplicates are costing. */
  readonly reachable: number;
  /** True once the catalogue is complete enough to trigger the original's discard prompt. */
  readonly glitch: boolean;
  /** What the level line should actually read. The glitch text wins when it fires. */
  readonly display: string;
  readonly cards: readonly CardScore[];
}

/**
 * Scores a collection.
 *
 * `reachable` is the one number that explains the design to a player: it is the points the
 * collection would be worth if every duplicate were removed. Watching `points` climb far more slowly
 * than `reachable` is what teaches that duplicates are worthless.
 */
export function scoreCollection(cards: readonly OwnedCard[]): CollectorScore {
  // Pass 1: figure uniqueness. Pass 2: arrow-pattern uniqueness. Independent of each other.
  const figureCounts = occurrenceCounts(cards, (card) => card.figureId);
  const patternCounts = occurrenceCounts(cards, (card) => card.arrows);

  const scored: CardScore[] = cards.map((card) => {
    const figureUnique = figureCounts.get(card.figureId) === 1;
    const patternUnique = patternCounts.get(card.arrows) === 1;
    const typeBonus = card.type === 'A' ? 2 : card.type === 'X' ? 1 : 0;
    return {
      uid: card.uid,
      figureId: card.figureId,
      figureUnique,
      patternUnique,
      typeBonus,
      points: (figureUnique ? 10 : 0) + (patternUnique ? 5 : 0) + typeBonus,
    };
  });

  const points = scored.reduce((sum, s) => sum + s.points, 0);
  // What the collection would be worth if every duplicate were deduped. Seeing `points` climb far
  // slower than `reachable` is what teaches a player that duplicates are worth nothing at all.
  const typeTotal = scored.reduce((sum, s) => sum + s.typeBonus, 0);
  const reachable = Math.min(
    MAX_POINTS,
    figureCounts.size * 10 + patternCounts.size * 5 + typeTotal,
  );

  const { level, nextAt, nextTitle } = levelFor(points);
  const glitch = points >= GLITCH_AT;

  return {
    points,
    level,
    nextAt,
    nextTitle,
    size: cards.length,
    reachable,
    glitch,
    display: glitch ? GLITCH_TEXT : level,
    cards: scored,
  };
}

/** Resolves points to a title and the next threshold up. */
export function levelFor(points: number): {
  level: string;
  nextAt: number | null;
  nextTitle: string | null;
} {
  let current = LEVELS[0] as { at: number; title: string };
  let next: { at: number; title: string } | undefined;
  for (const entry of LEVELS) {
    if (entry.at <= points) {
      current = entry;
    } else {
      next = entry;
      break;
    }
  }
  return { level: current.title, nextAt: next?.at ?? null, nextTitle: next?.title ?? null };
}

/**
 * The largest score any collection of `size` cards could hold, ignoring which cards they are.
 * Used by the collection screen to show how much of the maximum is still attainable.
 */
export function maxForSize(size: number): number {
  return Math.min(size, 100) * MAX_PER_CARD;
}
