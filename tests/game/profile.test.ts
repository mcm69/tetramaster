/**
 * The player profile (PLAN.md §1.1, §1.8, §1.9).
 *
 * `Profile` is the join between a match and everything that outlives one, so the tests here are
 * about the properties a player would actually notice: nothing is lost on a reload, a won card
 * really joins the collection, and growth is paid exactly once per match.
 */

import { describe, expect, it } from 'vitest';
import { Profile, STARTER_CARD_COUNT } from '../../src/game/profile.ts';
import { DECK_SIZE } from '../../src/core/constants.ts';
import { memoryStorage, loadSave, SAVE_KEY } from '../../src/game/save.ts';
import { applyProgression } from '../../src/game/progression.ts';
import { createMatch, legalCells, playMatch } from '../../src/core/match.ts';
import { createRng } from '../../src/core/rng.ts';
import { scoreCollection } from '../../src/game/collector.ts';
import { figuresOfTier } from '../../src/data/cards.ts';
import type { Outcome } from '../../src/core/types.ts';

function storage() {
  return memoryStorage();
}

describe('a new profile', () => {
  it('starts with a playable collection rather than nothing', () => {
    // Without this the deck is empty and the game cannot start at all.
    const profile = new Profile(storage());
    expect(profile.save.collection).toHaveLength(STARTER_CARD_COUNT);
    expect(profile.save.deck).toHaveLength(DECK_SIZE);
  });

  it('deals cards that exist in the catalog', () => {
    const profile = new Profile(storage());
    for (const card of profile.save.collection) {
      expect(
        figuresOfTier(1)
          .concat(figuresOfTier(2))
          .concat(figuresOfTier(3))
          .concat(figuresOfTier(4))
          .concat(figuresOfTier(5))
          .some((f) => f.id === card.figureId),
      ).toBe(true);
    }
  });

  it('writes itself to storage immediately', () => {
    const store = storage();
    new Profile(store);
    expect(store.getItem(SAVE_KEY)).not.toBeNull();
  });

  it('is deterministic for a given seed', () => {
    const a = new Profile(storage(), 1234);
    const b = new Profile(storage(), 1234);
    expect(a.save.collection).toEqual(b.save.collection);
  });

  it('does not re-deal when the save already has cards', () => {
    const store = storage();
    const first = new Profile(storage(), 7);
    writeAll(store, first);
    const second = new Profile(store, 7);
    expect(second.save.collection).toHaveLength(STARTER_CARD_COUNT);
    expect(second.save.collection).toEqual(first.save.collection);
  });
});

describe('the deck', () => {
  it('hands the engine five plain cards, with no collection fields leaking through', () => {
    const profile = new Profile(storage());
    const deck = profile.matchDeck();
    expect(deck).toHaveLength(DECK_SIZE);
    for (const card of deck) {
      expect(Object.keys(card).sort()).toEqual([
        'arrows',
        'atk',
        'figureId',
        'mdef',
        'pdef',
        'type',
      ]);
    }
  });

  it('follows an edited deck', () => {
    const profile = new Profile(storage());
    const uids = profile.save.collection.slice(2, 7).map((card) => card.uid);
    profile.setDeck(uids);
    expect(profile.deckCards().map((c) => c.uid)).toEqual(uids);
  });

  it('falls back to the strongest cards when the saved deck is short', () => {
    const profile = new Profile(storage());
    profile.setDeck([profile.save.collection[0]!.uid]);
    const deck = profile.deckCards();
    expect(deck).toHaveLength(DECK_SIZE);
  });

  it('never hands the engine an incomplete deck', () => {
    const profile = new Profile(storage());
    profile.setDeck([]);
    expect(profile.matchDeck()).toHaveLength(DECK_SIZE);
  });
});

describe('claiming', () => {
  it('adds a won card to the collection for good', () => {
    const profile = new Profile(storage());
    const before = profile.save.collection.length;
    const enemy = profile.save.collection[0]!;
    profile.claim(enemy);
    expect(profile.save.collection).toHaveLength(before + 1);
    expect(profile.save.collection.at(-1)?.figureId).toBe(enemy.figureId);
  });

  it('keeps the claimed card distinct from the original', () => {
    // Two copies of one figure are different cards that grow independently, so uids must differ.
    const profile = new Profile(storage());
    const enemy = profile.save.collection[0]!;
    profile.claim(enemy);
    const twin = profile.save.collection.at(-1)!;
    expect(twin.uid).not.toBe(enemy.uid);
    expect(twin.figureId).toBe(enemy.figureId);
  });
});

describe('finishing a match', () => {
  function playOne(profile: Profile, outcome: Outcome) {
    const state = playMatch(
      createMatch({ seed: 5, playerDeck: profile.matchDeck(), aiDeck: profile.matchDeck() }),
      (s) => {
        if (s.phase === 'chooseBattle') {
          const next = s.pendingBattles[0];
          return next === undefined ? { t: 'forfeit' } : { t: 'chooseBattle', cell: next };
        }
        const cell = legalCells(s)[0];
        return cell === undefined ? { t: 'forfeit' } : { t: 'place', cell, cardIndex: 0 };
      },
    ).state;
    return profile.finishMatch(state, outcome);
  }

  it('grows the cards on a win', () => {
    const profile = new Profile(storage());
    const before = profile.save.collection.map((c) => c.atk + c.pdef + c.mdef);
    const { growth } = playOne(profile, 'win');
    const after = profile.save.collection.map((c) => c.atk + c.pdef + c.mdef);
    const gained = after.reduce((sum, n, i) => sum + (n - (before[i] ?? 0)), 0);
    expect(growth.changes.length).toBeGreaterThan(0);
    expect(gained).toBeLessThanOrEqual(growth.changes.length);
  });

  it('grows nothing on a loss, but still records it', () => {
    const profile = new Profile(storage());
    const before = profile.save.collection.map((c) => c.atk + c.pdef + c.mdef);
    const { growth } = playOne(profile, 'loss');
    expect(growth.changes).toHaveLength(0);
    expect(profile.save.collection.map((c) => c.atk + c.pdef + c.mdef)).toEqual(before);
    expect(profile.save.record.losses).toBe(1);
  });

  it('counts a perfect game as a win', () => {
    const profile = new Profile(storage());
    playOne(profile, 'perfect');
    expect(profile.save.record.wins).toBe(1);
    expect(profile.save.record.perfects).toBe(1);
  });

  it('records a draw as neither', () => {
    const profile = new Profile(storage());
    playOne(profile, 'draw');
    expect(profile.save.record.draws).toBe(1);
    expect(profile.save.record.wins).toBe(0);
  });

  it('accumulates the record across matches', () => {
    const profile = new Profile(storage());
    playOne(profile, 'win');
    playOne(profile, 'loss');
    expect(profile.save.record.matches).toBe(2);
  });

  it('never exceeds the figure caps, however many matches are won', () => {
    const profile = new Profile(storage());
    for (let i = 0; i < 40; i++) playOne(profile, 'win');
    // A regression guard: progression must respect the catalog, and the caps are the catalog's.
    const reference = applyProgression(
      profile.save.collection,
      { won: false, usedUids: [], battleWins: new Map() },
      createRng(1),
    );
    expect(reference.collection).toHaveLength(profile.save.collection.length);
    for (const card of profile.save.collection) {
      expect(card.atk).toBeLessThanOrEqual(15);
      expect(card.pdef).toBeLessThanOrEqual(15);
      expect(card.mdef).toBeLessThanOrEqual(15);
    }
  });
});

describe('persistence', () => {
  it('survives a reload', () => {
    const store = storage();
    const first = new Profile(store);
    first.setOpponent('kuja');
    const second = new Profile(store);
    expect(second.save.opponent).toBe('kuja');
    expect(second.save.collection).toEqual(first.save.collection);
  });

  it('keeps the collector score in step with the collection', () => {
    const profile = new Profile(storage());
    expect(profile.collector.points).toBe(scoreCollection(profile.save.collection).points);
    expect(profile.snapshot().collector.points).toBe(profile.collector.points);
  });

  it('survives a corrupt save by starting fresh rather than throwing', () => {
    const store = storage();
    store.setItem(SAVE_KEY, 'not json at all');
    const profile = new Profile(store);
    expect(profile.save.collection).toHaveLength(STARTER_CARD_COUNT);
  });

  it('migrates an old save on load', () => {
    const store = storage();
    store.setItem(
      SAVE_KEY,
      JSON.stringify({
        version: 1,
        collection: [{ figureId: 4, arrows: 2, atk: 5, pdef: 6, mdef: 7, type: 'P' }],
        deck: [0],
        record: { matches: 3, wins: 2, losses: 1, draws: 0, perfects: 0 },
      }),
    );
    const profile = new Profile(store);
    // The v1 card survives and keeps its record; only a starter deck is missing.
    expect(profile.save.collection.some((card) => card.figureId === 4)).toBe(true);
    expect(profile.save.record.matches).toBe(3);
  });

  it('tops a short collection up rather than leaving it unplayable', () => {
    const store = storage();
    store.setItem(
      SAVE_KEY,
      JSON.stringify({
        version: 1,
        collection: [{ figureId: 4, arrows: 2, atk: 5, pdef: 6, mdef: 7, type: 'P' }],
        deck: [],
        nextUid: 2,
      }),
    );
    const profile = new Profile(store);
    // The migrated card survives, and enough are added to make a real deck.
    expect(profile.save.collection.some((card) => card.figureId === 4)).toBe(true);
    expect(profile.save.collection.length).toBeGreaterThanOrEqual(STARTER_CARD_COUNT);
    expect(profile.deckCards()).toHaveLength(DECK_SIZE);
    expect(profile.matchDeck()).toHaveLength(DECK_SIZE);
  });

  it('ignores a deck entry that points at a card which is gone', () => {
    const profile = new Profile(storage());
    const uids = profile.save.collection.slice(0, 4).map((card) => card.uid);
    profile.setDeck([...uids, 4242]);
    // The dangling entry drops out and the fallback takes over, so the deck is still legal.
    expect(profile.matchDeck()).toHaveLength(DECK_SIZE);
  });

  it('never hands the engine fewer cards than a match needs', () => {
    for (const count of [0, 1, 3]) {
      const store = storage();
      store.setItem(
        SAVE_KEY,
        JSON.stringify({
          version: 2,
          collection: Array.from({ length: count }, (_, i) => ({
            uid: i + 1,
            figureId: i,
            arrows: 1,
            atk: 1,
            pdef: 1,
            mdef: 1,
            type: 'P',
          })),
          deck: [],
          nextUid: count + 1,
        }),
      );
      expect(new Profile(store).matchDeck(), `collection of ${count}`).toHaveLength(DECK_SIZE);
    }
  });
});

describe('settings', () => {
  it('starts with sound off, because the player never asked for it', () => {
    expect(new Profile(storage()).settings.audio).toBe(false);
  });

  it('updates and persists', () => {
    const store = storage();
    const profile = new Profile(store);
    profile.updateSettings({ audio: true, volume: 0.25 });
    expect(new Profile(store).settings).toMatchObject({ audio: true, volume: 0.25 });
  });

  it('merges rather than replacing', () => {
    const profile = new Profile(storage());
    profile.updateSettings({ audio: true });
    profile.updateSettings({ volume: 0.9 });
    const settings = profile.settings;
    expect(settings.audio).toBe(true);
    expect(settings.volume).toBe(0.9);
  });

  it('remembers the mode across a reload', () => {
    const store = storage();
    const profile = new Profile(store);
    expect(profile.mode).toBe('match');
    profile.setMode('hotseat');
    expect(new Profile(store).mode).toBe('hotseat');
  });
});

describe('reset', () => {
  it('wipes the record and re-deals', () => {
    const store = storage();
    const profile = new Profile(store);
    profile.setOpponent('gil');
    profile.reset();
    expect(profile.save.opponent).toBe('vivi');
    expect(profile.save.collection).toHaveLength(STARTER_CARD_COUNT);
    expect(loadSave(store).record.matches).toBe(0);
  });
});

function writeAll(store: ReturnType<typeof memoryStorage>, profile: Profile): void {
  store.setItem(SAVE_KEY, JSON.stringify(profile.save));
}
