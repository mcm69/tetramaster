/**
 * The Master Tournament counter-deck (PLAN.md §6, Stage 10; Q8).
 *
 * In the original this is the mode where a "Master" opponent builds a deck specifically to beat
 * yours. PLAN.md Q8 settled the open question: a **weighted** counter-deck, drawn from the player's
 * own collection.
 *
 * The weighting is not guesswork. §1.6 says a card's type alone picks both stats in a battle, so the
 * card that beats a given deck is whichever one has the best expected value against it — and that is
 * computable exactly, because `winProbability` already models the tie going to the defender (§1.6.2).
 * So the core term is simply the mean probability of winning when this card attacks each card in the
 * challenger's deck. No heuristic approximation of the battle rules, and no second place for the
 * maths to go stale.
 *
 * Two modifiers sit on top, both of which are about the game rather than the fight:
 *
 *  - **A high floor.** An `A` attacker reads your *lowest* stat, attack included, so the stat you are
 *    worst at is the one that will be tested. Cards with a high minimum survive that; lopsided cards
 *    are the first thing an `A` deck should be built to punish.
 *  - **A sane number of arrows.** Arrows take cards for free (§1.5), so a counter-deck wants reach —
 *    but a card with arrows on every side is exposed to every adjacent placement (§1.4), and the
 *    sweet spot is a handful, not all eight.
 */

import { resolveStats, winProbability } from '../core/battle.ts';
import { arrowCount } from '../core/direction.ts';
import type { Card, OwnedCard } from '../core/types.ts';

/**
 * The expected roll for a stat index, used in place of the card's actual rolled value.
 *
 * §1.3 says index `n` covers `[16n, 16n+15]`, so the mean is `16n + 7.5`. The opponent's cards have
 * concrete values, but this card has not been rolled yet at the point it is being picked.
 */
export function expectedBase(index: number): number {
  return index * 16 + 7.5;
}

/** Weights for the three terms. Exposed so a personality or a test can argue with them. */
export interface CounterWeights {
  /** Per unit of mean win probability (0–1). This term should dominate. */
  readonly win: number;
  /** Per point of the card's lowest stat. */
  readonly floor: number;
  /** How far the arrow count is from the ideal. */
  readonly arrows: number;
}

export const DEFAULT_COUNTER_WEIGHTS: CounterWeights = { win: 100, floor: 1.5, arrows: 1.2 };

/** The arrow count a counter-deck aims for: enough reach, not exposed on every side. */
export const IDEAL_ARROWS = 5;

export interface CounterScore {
  readonly score: number;
  /** Mean chance of winning when this card attacks the challenger's deck, 0–1. */
  readonly winRate: number;
  readonly floor: number;
  readonly arrows: number;
}

/**
 * Rates a card against a specific opposing deck.
 *
 * Averaged over every card in the deck rather than the best matchup: the counter-deck has to win a
 * whole match, not one lucky battle, and a card that peaks against one card and loses to the other
 * four is not a counter to anything.
 */
export function scoreAgainst(
  card: Card,
  opposing: readonly Card[],
  weights: CounterWeights = DEFAULT_COUNTER_WEIGHTS,
): CounterScore {
  const winRate =
    opposing.length === 0
      ? 0.5
      : opposing.reduce((sum, foe) => {
          const pick = resolveStats(card, foe);
          return sum + winProbability(expectedBase(pick.atkIndex), expectedBase(pick.defIndex));
        }, 0) / opposing.length;

  const floor = Math.min(card.atk, card.pdef, card.mdef);
  const arrows = arrowCount(card.arrows);

  return {
    score:
      winRate * weights.win +
      floor * weights.floor +
      (IDEAL_ARROWS - Math.abs(arrows - IDEAL_ARROWS)) * weights.arrows,
    winRate,
    floor,
    arrows,
  };
}

/** One card in the built deck, and why it was chosen. */
export interface CounterPick {
  readonly card: Card;
  readonly uid: number;
  readonly score: CounterScore;
  readonly reason: string;
}

export interface CounterDeck {
  readonly picks: readonly CounterPick[];
  readonly cards: readonly Card[];
  /** Plain-language summary, shown on the pre-match screen so the mode is legible. */
  readonly summary: string;
  /** True when there were not enough cards in the collection to build one. */
  readonly short: boolean;
}

/**
 * Builds a counter-deck from the player's own collection.
 *
 * Greedy rather than exhaustive: pick the best card, remove it, repeat. With five slots and a
 * collection of any reasonable size, a full search buys nothing — and a greedy result can be
 * explained card by card, which an optimal-but-opaque one cannot.
 */
export function counterDeck(
  challenger: readonly Card[],
  collection: readonly OwnedCard[],
  count: number,
  weights: CounterWeights = DEFAULT_COUNTER_WEIGHTS,
): CounterDeck {
  const remaining = [...collection];
  const picks: CounterPick[] = [];

  while (picks.length < count && remaining.length > 0) {
    let bestIndex = 0;
    let best = scoreAgainst(remaining[0] as OwnedCard, challenger, weights);
    for (let i = 1; i < remaining.length; i++) {
      const candidate = scoreAgainst(remaining[i] as OwnedCard, challenger, weights);
      if (candidate.score > best.score) {
        best = candidate;
        bestIndex = i;
      }
    }
    const [chosen] = remaining.splice(bestIndex, 1);
    if (chosen === undefined) break;
    picks.push({ card: chosen, uid: chosen.uid, score: best, reason: reasonFor(best) });
  }

  return {
    picks,
    cards: picks.map((pick) => pick.card),
    summary: summarise(picks),
    short: picks.length < count,
  };
}

/** A one-line explanation of why a card was taken. */
export function reasonFor(score: CounterScore): string {
  const percent = Math.round(score.winRate * 100);
  const parts = [`${percent}% average win rate`];
  if (score.floor >= 8) parts.push('no weak stat for an A to find');
  else if (score.floor <= 3) parts.push('brittle, but the maths works');
  if (score.arrows >= IDEAL_ARROWS - 1) parts.push('good reach');
  if (score.arrows <= 1) parts.push('slow to take anything');
  return parts.join(' · ');
}

function summarise(picks: readonly CounterPick[]): string {
  if (picks.length === 0) return 'No cards to counter with.';
  const best = picks.reduce((a, b) => (b.score.winRate > a.score.winRate ? b : a));
  return `Counter-deck built around ${Math.round(best.score.winRate * 100)}% average win rate.`;
}

/**
 * How much harder the counter-deck is than the deck it was built from.
 *
 * Used by `tools/balance.ts` to keep the mode honest: a counter-deck that is not measurably better
 * than the deck it counters is not a counter-deck, it is a second deck.
 */
export function counterAdvantage(challenger: readonly Card[], counter: CounterDeck): number {
  if (challenger.length === 0 || counter.cards.length === 0) return 0;
  const mean = (deck: readonly Card[]): number =>
    deck.reduce((sum, card) => sum + scoreAgainst(card, challenger).winRate, 0) / deck.length;
  return mean(counter.cards) - mean(challenger);
}
