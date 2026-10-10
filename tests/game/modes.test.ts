/**
 * The three modes (PLAN.md §6, Stage 10).
 *
 * The property that matters most is negative: **no mode may change how a match is scored or
 * resolved.** All three drive the same `MatchController` over the same engine, and differ only in
 * who plays which seat and how the opponent's deck is built. A mode that quietly altered the rules
 * would make every rule test conditional on the mode, which is how a rules engine rots.
 */

import { describe, expect, it } from 'vitest';
import {
  MODE_ORDER,
  MODES,
  blockedReason,
  isAiSeat,
  isHumanSeat,
  modeById,
  planDecks,
  toCard,
  type ModeId,
} from '../../src/game/modes.ts';
import { acquireCard } from '../../src/game/progression.ts';
import { counterDeck } from '../../src/ai/counterDeck.ts';
import { createRng } from '../../src/core/rng.ts';
import { createMatch, legalCells, playMatch } from '../../src/core/match.ts';
import { DECK_SIZE, HAND_SIZE } from '../../src/core/constants.ts';
import { FIGURES } from '../../src/data/cards.ts';
import type { Card, OwnedCard } from '../../src/core/types.ts';

let uid = 0;
function owned(seed = 1, count = 12): OwnedCard[] {
  const rng = createRng(seed);
  uid = 0;
  return Array.from({ length: count }, () => {
    const figure = FIGURES[rng.int(FIGURES.length)];
    if (figure === undefined) throw new Error('empty catalog');
    uid += 1;
    return acquireCard(uid, figure.id, rng);
  });
}

describe('the mode table', () => {
  it('offers all three modes', () => {
    expect(MODE_ORDER).toEqual(['match', 'tournament', 'hotseat']);
    for (const id of MODE_ORDER) {
      expect(MODES[id].id).toBe(id);
      expect(MODES[id].name.length).toBeGreaterThan(0);
      expect(MODES[id].blurb.length).toBeGreaterThan(0);
    }
  });

  it('has the computer play only the second seat, except in hotseat', () => {
    expect(MODES.match.aiSeats).toEqual(['ai']);
    expect(MODES.tournament.aiSeats).toEqual(['ai']);
    // Two people at one keyboard is the whole point of hotseat.
    expect(MODES.hotseat.aiSeats).toEqual([]);
  });

  it('always leaves the first seat to a person', () => {
    for (const id of MODE_ORDER) {
      expect(isAiSeat(MODES[id], 'player'), id).toBe(false);
      expect(isHumanSeat(MODES[id], 'player'), id).toBe(true);
    }
  });

  it('lets you pick an opponent only where there is one', () => {
    expect(MODES.match.selectableOpponent).toBe(true);
    expect(MODES.tournament.selectableOpponent).toBe(false);
    expect(MODES.hotseat.selectableOpponent).toBe(false);
  });

  it('looks a mode up by id', () => {
    expect(modeById('hotseat')).toBe(MODES.hotseat);
  });
});

describe('entering a mode', () => {
  it('needs a full deck in the collection', () => {
    expect(blockedReason(MODES.match, 0)).toMatch(/at least 5 cards/);
    expect(blockedReason(MODES.match, DECK_SIZE)).toBeNull();
    expect(blockedReason(MODES.hotseat, 4)).not.toBeNull();
  });

  it('names the mode in the reason, so a disabled button explains itself', () => {
    expect(blockedReason(MODES.tournament, 1)).toMatch(/^Master Tournament/);
  });
});

describe('planning the decks', () => {
  it('gives the player their saved deck in every mode', () => {
    const cards = owned(2);
    for (const id of MODE_ORDER) {
      const plan = planDecks(MODES[id], cards, cards, 11);
      expect(plan.playerDeck, id).toHaveLength(DECK_SIZE);
      expect(plan.playerDeck[0]!.figureId, id).toBe(cards[0]!.figureId);
    }
  });

  it("builds the tournament opponent out of the player's own collection", () => {
    const cards = owned(3, 20);
    const plan = planDecks(MODES.tournament, cards, cards, 12);
    expect(plan.counter).not.toBeNull();
    expect(plan.aiDeck).toHaveLength(DECK_SIZE);
    // Every card the computer plays is one the player owns (Q8).
    const uids = new Set(cards.map((card) => card.uid));
    const expected = counterDeck(plan.playerDeck, cards, DECK_SIZE).picks.map((p) => p.uid);
    expect(expected.every((id) => uids.has(id))).toBe(true);
  });

  it('explains the counter-deck it built', () => {
    const cards = owned(4, 20);
    const plan = planDecks(MODES.tournament, cards, cards, 13);
    expect(plan.counter?.summary).toMatch(/Counter-deck/);
  });

  it('tops the opponent up from the catalog when the collection is too small to counter with', () => {
    // Three cards cannot produce a five-card counter-deck, so two have to come from somewhere.
    const cards = owned(5, 3);
    const plan = planDecks(MODES.tournament, cards, cards, 14);
    expect(plan.counter?.cards).toHaveLength(3);
    expect(plan.counter?.short).toBe(true);
    expect(plan.aiDeck).toHaveLength(DECK_SIZE);
    expect(plan.warning).toMatch(/came from the catalog/);
  });

  it('tops the player up too, because the engine will not accept a short hand', () => {
    const cards = owned(5, 3);
    for (const id of MODE_ORDER) {
      const plan = planDecks(MODES[id], cards, cards, 14);
      expect(plan.playerDeck, id).toHaveLength(DECK_SIZE);
      expect(plan.aiDeck, id).toHaveLength(DECK_SIZE);
      // And the match actually starts.
      expect(() =>
        createMatch({ seed: 14, playerDeck: [...plan.playerDeck], aiDeck: [...plan.aiDeck] }),
      ).not.toThrow();
    }
  });

  it('does not build a counter-deck in the other two modes', () => {
    const cards = owned(6, 20);
    for (const id of ['match', 'hotseat'] as ModeId[]) {
      expect(planDecks(MODES[id], cards, cards, 15).counter, id).toBeNull();
    }
  });

  it('plays the same rules regardless of mode', () => {
    // Three modes, one engine: the board, the cascade and the scoring are untouched.
    const cards = owned(7);
    for (const id of MODE_ORDER) {
      const plan = planDecks(MODES[id], cards, cards, 16);
      const state = playMatch(
        createMatch({ seed: 16, playerDeck: [...plan.playerDeck], aiDeck: [...plan.aiDeck] }),
        (s) => {
          if (s.phase === 'chooseBattle') {
            const next = s.pendingBattles[0];
            return next === undefined ? { t: 'forfeit' } : { t: 'chooseBattle', cell: next };
          }
          const cell = legalCells(s)[0];
          return cell === undefined ? { t: 'forfeit' } : { t: 'place', cell, cardIndex: 0 };
        },
      ).state;
      expect(state.placedCount, id).toBe(HAND_SIZE * 2);
      expect(state.phase, id).toBe('over');
      expect(state.board, id).toHaveLength(16);
    }
  });

  it('falls back to the catalog when there is no saved deck at all', () => {
    const plan = planDecks(MODES.match, [], [], 17);
    expect(plan.playerDeck).toHaveLength(DECK_SIZE);
    expect(plan.warning).toMatch(/No saved deck/);
  });

  it('is deterministic for a seed, and varies with it', () => {
    const cards = owned(8, 20);
    const a = planDecks(MODES.match, cards, cards, 18);
    const b = planDecks(MODES.match, cards, cards, 18);
    expect(a.aiDeck).toEqual(b.aiDeck);
    // The RNG is injected and local, so building a deck cannot shift the battle rolls that follow.
    expect(a.aiDeck).not.toEqual(planDecks(MODES.match, cards, cards, 19).aiDeck);
  });

  it('gives a tournament the same counter-deck for the same deck, whatever the seed', () => {
    // The counter is built from the collection against the player's deck, so it must not depend on
    // the match seed — otherwise a rematch would face a different "master" for no stated reason.
    const cards = owned(8, 20);
    const a = planDecks(MODES.tournament, cards, cards, 18);
    const b = planDecks(MODES.tournament, cards, cards, 19);
    expect(a.aiDeck).toEqual(b.aiDeck);
  });

  it('leaves the collection it was given untouched', () => {
    const cards = owned(9, 20);
    const before = JSON.stringify(cards);
    planDecks(MODES.tournament, cards, cards, 20);
    expect(JSON.stringify(cards)).toBe(before);
  });
});

describe('converting for the engine', () => {
  it('drops the collection-only fields', () => {
    const card = owned(10, 1)[0] as OwnedCard;
    const converted: Card = toCard(card);
    expect(Object.keys(converted).sort()).toEqual([
      'arrows',
      'atk',
      'figureId',
      'mdef',
      'pdef',
      'type',
    ]);
    expect(converted.atk).toBe(card.atk);
    expect(converted.type).toBe(card.type);
  });
});
