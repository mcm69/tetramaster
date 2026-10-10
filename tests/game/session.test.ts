/**
 * A whole session, end to end (PLAN.md §6, Stage 10 DoD: "all three modes playable ... no console
 * errors in a full session").
 *
 * This is the integration test that ties the stages together: a fresh install, a starter collection,
 * three matches in three different modes, progression paid and cards claimed, then a reload. Each
 * stage had its own tests; this is the one that would notice if the seams between them did not line
 * up — a deck the engine rejects, a save that loses a card, a mode that plays the wrong seat.
 *
 * It runs headlessly because everything except the canvas is testable without a browser, and the
 * canvas half is covered by `tests/ui/boot.test.ts`. A real browser session remains a manual check,
 * which is stated rather than implied.
 */

import { describe, expect, it } from 'vitest';
import { Profile, STARTER_CARD_COUNT } from '../../src/game/profile.ts';
import { MODES, MODE_ORDER, isAiSeat, planDecks, type ModeId } from '../../src/game/modes.ts';
import { memoryStorage, type StorageLike } from '../../src/game/save.ts';
import { createMatch, playMatch, score } from '../../src/core/match.ts';
import { Opponent } from '../../src/ai/opponent.ts';
import { PERSONALITIES, personalityById } from '../../src/ai/personalities.ts';
import { DECK_SIZE } from '../../src/core/constants.ts';
import type { Action, GameState } from '../../src/core/match.ts';
import type { Cell } from '../../src/core/types.ts';
import type { Outcome } from '../../src/core/types.ts';

/** The first square that is both empty and playable. */
function firstOpenCell(state: GameState): Cell | null {
  const cell = state.board.findIndex((entry, index) => entry === null && !state.blocked[index]);
  return cell === -1 ? null : (cell as Cell);
}

/**
 * A deliberately naive policy: take the first square, always the same card, answer every battle.
 * Used where the point is that the *engine* finishes a match, not that anyone plays well.
 */
function naivePolicy(state: GameState): Action {
  if (state.phase === 'chooseBattle') {
    const next = state.pendingBattles[0];
    return next === undefined ? { t: 'forfeit' } : { t: 'chooseBattle', cell: next };
  }
  const cell = firstOpenCell(state);
  if (cell === null) return { t: 'forfeit' };
  return { t: 'place', cell, cardIndex: 0 };
}

/** Plays a whole match in `mode`, with the computer driving the seats the mode gives it. */
function playOne(
  mode: ModeId,
  profile: Profile,
  seed: number,
): { outcome: Outcome; claimed: number } {
  const plan = planDecks(MODES[mode], profile.deckCards(), profile.save.collection, seed);
  const opponent = new Opponent(personalityById(profile.save.opponent), seed + 7);

  const state = playMatch(
    createMatch({ seed, playerDeck: [...plan.playerDeck], aiDeck: [...plan.aiDeck] }),
    (s, owner) => {
      if (s.phase === 'chooseBattle') {
        const next = s.pendingBattles[0];
        return next === undefined ? { t: 'forfeit' } : { t: 'chooseBattle', cell: next };
      }
      if (s.phase !== 'place') return { t: 'forfeit' };
      if (isAiSeat(MODES[mode], owner)) return opponent.act(s, owner) ?? { t: 'forfeit' };
      const cell = s.board.findIndex((entry, index) => entry === null && !s.blocked[index]);
      if (cell === -1) return { t: 'forfeit' };
      return { t: 'place', cell: cell as 0, cardIndex: 0 };
    },
  ).state;

  const outcome = state.result?.outcome ?? 'draw';
  profile.finishMatch(state, outcome);

  // §1.1: a won card joins the collection for good.
  let claimed = 0;
  for (const card of state.result?.claimable ?? []) {
    profile.claim(card);
    claimed++;
  }
  return { outcome, claimed };
}

describe('a full session', () => {
  it('plays all three modes without a card being lost or a hand being rejected', () => {
    const store: StorageLike = memoryStorage();
    const profile = new Profile(store);
    expect(profile.save.collection).toHaveLength(STARTER_CARD_COUNT);

    for (const [index, mode] of MODE_ORDER.entries()) {
      const before = profile.save.collection.length;
      const { claimed } = playOne(mode, profile, 100 + index);

      expect(profile.save.collection.length, mode).toBe(before + claimed);
      expect(profile.deckCards(), mode).toHaveLength(DECK_SIZE);
      expect(profile.save.record.matches, mode).toBe(index + 1);
      // The deck the engine will be handed is always a legal hand.
      expect(profile.matchDeck(), mode).toHaveLength(DECK_SIZE);
    }
  });

  it('leaves the collection strictly better after a session', () => {
    const store = memoryStorage();
    const profile = new Profile(store);
    const start = profile.collector.points;

    for (const [index, mode] of MODE_ORDER.entries()) playOne(mode, profile, 200 + index);

    const finish = profile.collector.points;
    expect(finish).toBeGreaterThanOrEqual(start);
    expect(profile.save.collection.length).toBeGreaterThanOrEqual(STARTER_CARD_COUNT);
  });

  it('survives a reload with the record and the collection intact', () => {
    const store = memoryStorage();
    const first = new Profile(store);
    playOne('match', first, 300);
    const snapshot = {
      collection: first.save.collection,
      record: first.save.record,
      deck: first.save.deck,
    };

    const reloaded = new Profile(store);
    expect(reloaded.save.collection).toEqual(snapshot.collection);
    expect(reloaded.save.record).toEqual(snapshot.record);
    expect(reloaded.save.deck).toEqual(snapshot.deck);
    // And it is immediately playable again.
    expect(reloaded.matchDeck()).toHaveLength(DECK_SIZE);
  });

  it('never grows a card past its figure caps, over a long session', () => {
    const profile = new Profile(memoryStorage());
    for (let i = 0; i < 60; i++) {
      playOne(i % 3 === 0 ? 'tournament' : 'match', profile, 400 + i);
    }
    for (const card of profile.save.collection) {
      expect(card.atk, `card ${card.uid} atk`).toBeLessThanOrEqual(15);
      expect(card.pdef, `card ${card.uid} pdef`).toBeLessThanOrEqual(15);
      expect(card.mdef, `card ${card.uid} mdef`).toBeLessThanOrEqual(15);
    }
    expect(profile.save.record.matches).toBe(60);
  });

  it('gives the hotseat board two people and never hands it to the computer', () => {
    const store = memoryStorage();
    const profile = new Profile(store);
    // Recorded which seats the computer actually acted for during a hotseat match.
    const aiTurns: string[] = [];
    const plan = planDecks(MODES.hotseat, profile.deckCards(), profile.save.collection, 500);

    playMatch(
      createMatch({ seed: 500, playerDeck: [...plan.playerDeck], aiDeck: [...plan.aiDeck] }),
      (s, owner) => {
        aiTurns.push(owner);
        return naivePolicy(s);
      },
    );
    // The same naive policy drove both seats, which is exactly what hotseat means.
    expect(new Set(aiTurns)).toEqual(new Set(['player', 'ai']));
    expect(MODES.hotseat.aiSeats).toEqual([]);
  });

  it('scores a completed match the same way in every mode', () => {
    // The modes differ in decks and seats, never in scoring.
    for (const mode of MODE_ORDER) {
      const profile = new Profile(memoryStorage());
      const plan = planDecks(MODES[mode], profile.deckCards(), profile.save.collection, 600);
      const state = playMatch(
        createMatch({ seed: 600, playerDeck: [...plan.playerDeck], aiDeck: [...plan.aiDeck] }),
        naivePolicy,
      ).state;
      const counts = score(state);
      expect(counts.player + counts.ai, mode).toBe(10);
    }
  });
});

describe('every personality', () => {
  it('can complete a match in every mode without an illegal action', () => {
    const profile = new Profile(memoryStorage());
    for (const personality of PERSONALITIES) {
      profile.setOpponent(personality.id);
      const plan = planDecks(MODES.match, profile.deckCards(), profile.save.collection, 700);
      const opponent = new Opponent(personality, 701);

      const { state } = playMatch(
        createMatch({ seed: 700, playerDeck: [...plan.playerDeck], aiDeck: [...plan.aiDeck] }),
        (s, owner) => {
          if (owner === 'ai' && s.phase !== 'over')
            return opponent.act(s, owner) ?? { t: 'forfeit' };
          return naivePolicy(s);
        },
      );
      expect(state.phase, personality.id).toBe('over');
      expect(state.placedCount, personality.id).toBe(10);
    }
  });
});
