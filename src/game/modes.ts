/**
 * The three ways to play (PLAN.md §6, Stage 10).
 *
 * Tetra Master ships with more than one mode, and the modes differ in exactly two things: **which
 * seats are played by the computer**, and **how each side's deck is built**. Rather than teach the
 * controller and the app about three special cases, everything mode-specific lives here and the rest
 * of the app asks "who plays this seat?" and "what deck do they get?".
 *
 * That matters more than it looks. The hotseat mode has to drive the *same* `MatchController` the
 * single-player game uses, with no card of engine logic aware that two people are sharing a board —
 * the engine already supports it, because `Owner` is just `'player' | 'ai'` and both are just seats.
 */

import { counterDeck } from '../ai/counterDeck.ts';
import { figuresOfTier } from '../data/cards.ts';
import { rollInstance } from '../core/card.ts';
import { createRng, type Rng } from '../core/rng.ts';
import { DECK_SIZE } from '../core/constants.ts';
import type { CounterDeck } from '../ai/counterDeck.ts';
import type { Card, OwnedCard, Owner, Tier } from '../core/types.ts';

export type ModeId = 'match' | 'tournament' | 'hotseat';

export interface Mode {
  readonly id: ModeId;
  readonly name: string;
  /** Shown on the mode bar. */
  readonly blurb: string;
  /**
   * Which seats the computer plays. Hotseat has none — both seats are people at one keyboard, which
   * is exactly how the original does it.
   */
  readonly aiSeats: readonly Owner[];
  /** Opponents are picked from a list in `match` and `tournament`, and skipped in `hotseat`. */
  readonly selectableOpponent: boolean;
  /** The player must own a collection of at least this many cards to enter. */
  readonly requiresCollection: number;
}

export const MODES: Readonly<Record<ModeId, Mode>> = {
  match: {
    id: 'match',
    name: 'Match',
    blurb: 'Play a named opponent over one board.',
    aiSeats: ['ai'],
    selectableOpponent: true,
    requiresCollection: DECK_SIZE,
  },
  tournament: {
    id: 'tournament',
    name: 'Master Tournament',
    blurb: 'Your saved deck against one built to counter it.',
    aiSeats: ['ai'],
    selectableOpponent: false,
    requiresCollection: DECK_SIZE,
  },
  hotseat: {
    id: 'hotseat',
    name: 'Hotseat',
    blurb: 'Two players, one board, alternating.',
    aiSeats: [],
    selectableOpponent: false,
    requiresCollection: DECK_SIZE,
  },
};

export const MODE_ORDER: readonly ModeId[] = ['match', 'tournament', 'hotseat'];

/** Turn order. A mode's human seats are reported in this order. */
export const SEAT_ORDER: readonly Owner[] = ['player', 'ai'];

export function modeById(id: ModeId): Mode {
  return MODES[id];
}

/** True when the computer is playing `owner` in this mode. */
export function isAiSeat(mode: Mode, owner: Owner): boolean {
  return mode.aiSeats.includes(owner);
}

/** True when `owner` is played by a person sitting at this keyboard. */
export function isHumanSeat(mode: Mode, owner: Owner): boolean {
  return !isAiSeat(mode, owner);
}

/**
 * Every seat a person is sitting at in this mode, in turn order.
 *
 * This is what `MatchController` needs, and it was never passed. `isHumanSeat` sat here tested and
 * correct and called from nowhere, which is the same shape as `Animator.flash`: right, and not
 * connected to anything. The default in the controller is `['player']`, so every game against the
 * computer worked by luck and **hotseat was unplayable** — the second seat's turn was always refused.
 */
export function humanSeatsFor(mode: Mode): readonly Owner[] {
  return SEAT_ORDER.filter((owner) => isHumanSeat(mode, owner));
}

/** Why a mode cannot be entered yet, or null when it can. */
export function blockedReason(mode: Mode, collectionSize: number): string | null {
  if (collectionSize < mode.requiresCollection) {
    return `${mode.name} needs at least ${mode.requiresCollection} cards in your collection — you have ${collectionSize}.`;
  }
  return null;
}

export interface DeckPlan {
  readonly playerDeck: readonly Card[];
  readonly aiDeck: readonly Card[];
  /** Present in tournament mode only: the reasoning behind the computer's deck. */
  readonly counter: CounterDeck | null;
  /** Set when a deck could not be built as intended. */
  readonly warning: string | null;
}

/**
 * A deck drawn from the catalog, for a seat the player has no cards for.
 *
 * Hotseat is the case that matters: the second player is a person who has their own collection, but
 * the app has no way to ask which. Rather than guess, hotseat gives both seats the saved deck
 * mirrored — it is a fair, self-consistent board, and §1.1 wants a fair coin flip regardless.
 */
function catalogDeck(tier: Tier, count: number, rng: Rng): Card[] {
  const pool = figuresOfTier(tier);
  return Array.from({ length: count }, () => {
    const figure = pool[rng.int(pool.length)];
    if (figure === undefined) throw new Error(`no figure in tier ${tier}`);
    return rollInstance(figure, rng);
  });
}

/**
 * Builds both decks for a mode.
 *
 * Pure given its arguments: the RNG is injected and advanced locally, so building a tournament deck
 * can never shift the battle rolls of the match it is about to start. That separation is the same
 * one the opponent obeys (§5.2), and it is tested.
 */
export function planDecks(
  mode: Mode,
  playerCards: readonly OwnedCard[],
  collection: readonly OwnedCard[],
  seed: number,
  counterCount: number = DECK_SIZE,
): DeckPlan {
  const rng = createRng(seed);
  const saved: Card[] = playerCards.slice(0, DECK_SIZE).map(toCard);

  // The engine refuses anything but a full hand, so a short collection is topped up rather than
  // passed through — otherwise `createMatch` throws and the game will not start at all.
  const playerDeck =
    saved.length === DECK_SIZE
      ? saved
      : [...saved, ...catalogDeck(2, DECK_SIZE - saved.length, rng)];

  if (saved.length === 0) {
    return {
      playerDeck,
      aiDeck: catalogDeck(3, DECK_SIZE, rng),
      counter: null,
      warning: 'No saved deck — both sides drew from the catalog instead.',
    };
  }

  if (mode.id === 'tournament') {
    // The counter-deck is drawn from the player's own collection (Q8). If the collection cannot
    // supply one, fall back to the catalog rather than refusing to start.
    const counter = counterDeck(playerDeck, collection, counterCount);
    const short = counter.short;
    const aiDeck =
      counter.cards.length === DECK_SIZE
        ? counter.cards
        : [...counter.cards, ...catalogDeck(4, DECK_SIZE - counter.cards.length, rng)];
    return {
      playerDeck,
      aiDeck,
      counter,
      warning: short
        ? `Only ${counter.cards.length} cards available to counter with — the rest came from the catalog.`
        : null,
    };
  }

  // Match and hotseat both draw the opponent's deck from the catalog, so a new opponent is a
  // different fight rather than a rematch with the same five cards.
  const aiDeck = catalogDeck(3, DECK_SIZE, rng);
  return { playerDeck, aiDeck, counter: null, warning: null };
}

/** The engine's view of an owned card. */
export function toCard(card: OwnedCard): Card {
  return {
    figureId: card.figureId,
    arrows: card.arrows,
    atk: card.atk,
    type: card.type,
    pdef: card.pdef,
    mdef: card.mdef,
  };
}
