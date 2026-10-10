/**
 * The player's persistent profile: collection, deck, record and collector level.
 *
 * This is the seam between a match and everything that outlives one. It is deliberately a plain
 * module rather than a class buried in `main.ts`, so the whole of "what the player owns" can be
 * reasoned about — and tested — without a DOM or a canvas.
 */

import { scoreCollection, type CollectorScore } from './collector.ts';
import { acquireCard, applyProgression, type ProgressionResult } from './progression.ts';
import { analyseMatch, type MatchReport } from './report.ts';
import {
  addToCollection,
  defaultStorage,
  emptySave,
  loadSave,
  recordOutcome,
  withSettings,
  writeSave,
  type SaveData,
  type Settings,
  type StorageLike,
} from './save.ts';
import { DECK_SIZE } from '../core/constants.ts';
import type { ModeId } from './modes.ts';
import { createRng, type Rng } from '../core/rng.ts';
import { figuresOfTier } from '../data/cards.ts';
import type { Card, GameState, Outcome, OwnedCard, Tier } from '../core/types.ts';

/** How many cards a new player starts with. The original hands out a starter deck; so do we. */
export const STARTER_CARD_COUNT = 12;

export interface ProfileSnapshot {
  readonly save: SaveData;
  readonly collector: CollectorScore;
}

export class Profile {
  private data: SaveData;
  private readonly storage: StorageLike;
  private readonly rng: Rng;

  constructor(storage: StorageLike = defaultStorage(), seed = 0x5eed) {
    this.storage = storage;
    this.data = loadSave(storage);
    this.rng = createRng(seed);
    // Fewer than a full deck is not just "unlucky" — the game cannot start at all, so top up.
    // A migrated v1 save can legitimately land here with a single card in it.
    if (this.data.collection.length < DECK_SIZE) this.data = this.grantStarter();
    this.persist();
  }

  get save(): SaveData {
    return this.data;
  }

  get collector(): CollectorScore {
    return scoreCollection(this.data.collection);
  }

  snapshot(): ProfileSnapshot {
    return { save: this.data, collector: this.collector };
  }

  private persist(): void {
    writeSave(this.data, this.storage);
  }

  /**
   * Tops the collection up to something playable.
   *
   * Without this a fresh install has an empty deck and cannot start, and a migrated save with a
   * handful of cards is in exactly the same position. Existing cards are kept: this adds, never
   * replaces.
   */
  private grantStarter(base: SaveData = this.data): SaveData {
    const cards: Omit<OwnedCard, 'uid'>[] = [];
    const wanted = Math.max(STARTER_CARD_COUNT, DECK_SIZE) - base.collection.length;
    for (let i = 0; i < wanted; i++) {
      // Cycle through the middle tiers so a starter hand is not all one power band.
      const tier = ((i % 3) + 2) as Tier;
      const figure = this.rng.pick(figuresOfTier(tier));
      const card = acquireCard(0, figure.id, this.rng);
      cards.push({
        figureId: card.figureId,
        arrows: card.arrows,
        atk: card.atk,
        pdef: card.pdef,
        mdef: card.mdef,
        type: card.type,
      });
    }
    const seeded = addToCollection(base, cards);
    // Keep the cards the player already had, ahead of the new ones.
    return { ...seeded, deck: seeded.collection.slice(0, DECK_SIZE).map((card) => card.uid) };
  }

  /** The five cards the next match will be played with. */
  deckCards(): OwnedCard[] {
    const byUid = new Map(this.data.collection.map((card) => [card.uid, card]));
    const cards = this.data.deck.flatMap((uid) => {
      const card = byUid.get(uid);
      return card === undefined ? [] : [card];
    });
    return cards.length === DECK_SIZE ? cards : this.fallbackDeck();
  }

  /** Used when the saved deck is somehow incomplete: the five strongest cards held. */
  private fallbackDeck(): OwnedCard[] {
    return [...this.data.collection]
      .sort((a, b) => b.atk + b.pdef + b.mdef - (a.atk + a.pdef + a.mdef) || a.uid - b.uid)
      .slice(0, DECK_SIZE);
  }

  /** The match-ready view of the deck — `Card`s, which is all the engine takes. */
  matchDeck(): Card[] {
    return this.deckCards().map((card) => ({
      figureId: card.figureId,
      arrows: card.arrows,
      atk: card.atk,
      type: card.type,
      pdef: card.pdef,
      mdef: card.mdef,
    }));
  }

  setDeck(deck: readonly number[]): void {
    this.data = { ...this.data, deck: [...deck] };
    this.persist();
  }

  /** Adds a won card to the collection, as §1.1 allows after a win. */
  claim(card: Card): void {
    this.data = addToCollection(this.data, [
      {
        figureId: card.figureId,
        arrows: card.arrows,
        atk: card.atk,
        pdef: card.pdef,
        mdef: card.mdef,
        type: card.type,
      },
    ]);
    this.persist();
  }

  /**
   * Applies everything a finished match earned: §1.8 growth and evolution, the §1.8 credit for
   * battles won, and the match record.
   *
   * Called once per match, after the results are on screen. Both halves matter: evolution is
   * earned per *battle*, so it can fire on a lost match, while growth needs a win — getting that
   * backwards either robs wins or hands out free upgrades.
   */
  finishMatch(
    state: GameState,
    outcome: Outcome,
  ): { report: MatchReport; growth: ProgressionResult } {
    const report = analyseMatch(state, this.deckCards(), 'player');
    const growth = applyProgression(
      this.data.collection,
      {
        won: outcome === 'win' || outcome === 'perfect',
        usedUids: report.usedUids,
        battleWins: report.battleWins,
      },
      this.rng,
    );
    this.data = {
      ...this.data,
      collection: [...growth.collection],
      record: recordOutcome(this.data.record, outcome),
    };
    this.persist();
    return { report, growth };
  }

  setOpponent(id: string): void {
    this.data = { ...this.data, opponent: id };
    this.persist();
  }

  get settings(): Settings {
    return this.data.settings;
  }

  /** Updates one or more preferences and saves them at once. */
  updateSettings(patch: Partial<Settings>): Settings {
    this.data = withSettings(this.data, patch);
    this.persist();
    return this.data.settings;
  }

  get mode(): ModeId {
    return this.data.settings.mode;
  }

  setMode(mode: ModeId): void {
    this.updateSettings({ mode });
  }

  /** Wipes the save. Used by the reset control and by tests. */
  /** Wipes everything and deals a fresh starter collection. */
  reset(): void {
    this.data = this.grantStarter(emptySave());
    this.persist();
  }
}
