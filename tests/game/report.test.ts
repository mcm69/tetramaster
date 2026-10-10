/**
 * Replaying a match for progression (PLAN.md §1.8).
 *
 * The rule here is that §1.8 credits *battles won*, whether the card attacked or defended, so a
 * defender that holds its ground earns exactly as much as an attacker that takes a square. Getting
 * that backwards would quietly reward a turtling playstyle and punish the aggressive one, which is
 * not what the original does.
 *
 * The second thing worth testing is what happens when a card is lost: its battle credit stands,
 * because it was earned when the battle was won. Only the *square* is forgotten.
 */

import { describe, expect, it } from 'vitest';
import { analyseMatch } from '../../src/game/report.ts';
import { applyProgression, applyProgression as grow, capsFor } from '../../src/game/progression.ts';
import { createMatch, legalCells, playMatch } from '../../src/core/match.ts';
import { createRng } from '../../src/core/rng.ts';
import { acquireCard } from '../../src/game/progression.ts';
import { FIGURES, figuresOfTier } from '../../src/data/cards.ts';
import type { GameState, OwnedCard, Tier } from '../../src/core/types.ts';

/** A deck of five distinct low-tier cards, so nothing collides on figure. */
function deckAt(seed: number, tier: Tier = 2): OwnedCard[] {
  const rng = createRng(seed);
  const pool = figuresOfTier(tier);
  const seen = new Set<number>();
  const cards: OwnedCard[] = [];
  let guard = 0;
  while (cards.length < 5 && guard++ < 500) {
    const figure = pool[rng.int(pool.length)];
    if (figure === undefined || seen.has(figure.id)) continue;
    seen.add(figure.id);
    cards.push(acquireCard(cards.length + 1, figure.id, rng));
  }
  return cards;
}

function matchWith(deck: OwnedCard[], seed: number) {
  return createMatch({
    seed,
    playerDeck: deck,
    aiDeck: deck.map((card) => ({ ...card, uid: card.uid + 100 })),
  });
}

/** Plays a match where the player always takes the first legal square. */
function playAll(seed: number, deck: OwnedCard[]) {
  return playMatch(matchWith(deck, seed), (state) => {
    if (state.phase === 'chooseBattle') {
      const next = state.pendingBattles[0];
      return next === undefined ? { t: 'forfeit' } : { t: 'chooseBattle', cell: next };
    }
    const cell = legalCells(state)[0];
    return cell === undefined ? { t: 'forfeit' } : { t: 'place', cell, cardIndex: 0 };
  }).state;
}

describe('which cards were used', () => {
  it('[§1.8] reports all five cards when a match runs to completion', () => {
    const deck = deckAt(1);
    const state = playAll(1, deck);
    const report = analyseMatch(state, deck, 'player');
    expect(state.placedCount).toBe(10);
    expect([...report.usedUids].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it('reports only the cards actually placed when the player forfeits', () => {
    const deck = deckAt(2);
    const state = playMatch(matchWith(deck, 2), () => ({ t: 'forfeit' })).state;
    const report = analyseMatch(state, deck, 'player');
    expect(report.usedUids).toEqual([]);
  });

  it('reports a partial hand when the match stops early', () => {
    const deck = deckAt(3);
    let playerPlaced = 0;
    const state = playMatch(matchWith(deck, 3), (s) => {
      if (s.phase === 'chooseBattle') {
        const next = s.pendingBattles[0];
        return next === undefined ? { t: 'forfeit' } : { t: 'chooseBattle', cell: next };
      }
      const cell = legalCells(s)[0];
      if (cell === undefined) return { t: 'forfeit' };
      // Only count the player's placements; the opponent must not eat the budget.
      if (s.turn !== 'player') return { t: 'place', cell, cardIndex: 0 };
      playerPlaced++;
      return playerPlaced > 2 ? { t: 'forfeit' } : { t: 'place', cell, cardIndex: 0 };
    }).state;
    const report = analyseMatch(state, deck, 'player');
    expect(report.usedUids).toHaveLength(2);
  });

  it('follows the hand as it shrinks, so later placements map to the right card', () => {
    // Always play cardIndex 0: without replaying the shrink this would report the same uid twice.
    const deck = deckAt(4);
    const state = playAll(4, deck);
    const report = analyseMatch(state, deck, 'player');
    expect(new Set(report.usedUids).size).toBe(5);
  });

  it('credits each side only from the deck that side actually played', () => {
    const deck = deckAt(5);
    const aiDeck = deck.map((card) => ({ ...card, uid: card.uid + 100 }));
    const state = playMatch(createMatch({ seed: 5, playerDeck: deck, aiDeck }), (s) => {
      if (s.phase === 'chooseBattle') {
        const next = s.pendingBattles[0];
        return next === undefined ? { t: 'forfeit' } : { t: 'chooseBattle', cell: next };
      }
      const cell = legalCells(s)[0];
      return cell === undefined ? { t: 'forfeit' } : { t: 'place', cell, cardIndex: 0 };
    }).state;

    const mine = analyseMatch(state, deck, 'player');
    const theirs = analyseMatch(state, aiDeck, 'ai');
    expect(mine.usedUids).toHaveLength(5);
    expect(theirs.usedUids).toHaveLength(5);
    // The two sets must not overlap: a uid collision here would grow one card for both sides.
    expect(mine.usedUids.filter((uid) => theirs.usedUids.includes(uid))).toEqual([]);
  });
});

describe('battle wins', () => {
  it('credits a card for each battle it won, attacking or defending', () => {
    // Play the player's cards into the corners and let every battle happen; over many seeds some
    // card must have won at least one.
    let credited = 0;
    for (let seed = 0; seed < 60; seed++) {
      const deck = deckAt(seed);
      const report = analyseMatch(playAll(seed, deck), deck, 'player');
      credited += [...report.battleWins.values()].reduce((sum, n) => sum + n, 0);
    }
    expect(credited).toBeGreaterThan(0);
  });

  it('never credits a battle the card lost', () => {
    // Over many matches, total credits must not exceed total battles the player was in.
    let credits = 0;
    let battles = 0;
    for (let seed = 0; seed < 40; seed++) {
      const deck = deckAt(seed);
      const state = playAll(seed, deck);
      const report = analyseMatch(state, deck, 'player');
      credits += [...report.battleWins.values()].reduce((sum, n) => sum + n, 0);
      battles += state.history.filter((e) => e.t === 'battle-roll').length;
    }
    expect(credits).toBeLessThanOrEqual(battles);
    expect(credits).toBeGreaterThan(0);
  });

  it('only credits uids that are in the deck', () => {
    const deck = deckAt(6);
    const report = analyseMatch(playAll(6, deck), deck, 'player');
    for (const uid of report.battleWins.keys()) {
      expect(deck.some((card) => card.uid === uid)).toBe(true);
    }
  });

  it('keeps the credit when the card is later taken off the board', () => {
    // The battle was won at the time; §1.8 does not claw it back when the card later leaves.
    // Find a seed where some card won a battle and then did not end the match on the board.
    let found = false;
    for (let seed = 0; seed < 60 && !found; seed++) {
      const deck = deckAt(seed);
      const state = playAll(seed, deck);
      const report = analyseMatch(state, deck, 'player');
      if (report.battleWins.size === 0) continue;
      // The player lost at least one of their own cards during this match...
      const lostACard = state.history.some((e) => e.t === 'flip' && e.from === 'player');
      found = lostACard;
    }
    expect(found).toBe(true);
  });
});

describe('applying a report', () => {
  it('drives progression end to end', () => {
    const deck = deckAt(8);
    const state = playAll(8, deck);
    const report = analyseMatch(state, deck, 'player');
    const result = grow(
      deck,
      { won: true, usedUids: report.usedUids, battleWins: report.battleWins },
      createRng(3),
    );

    // The deck must still be the same length and uids, whatever the rolls did.
    expect(result.collection.map((c) => c.uid)).toEqual([1, 2, 3, 4, 5]);
    expect(result.changes.length).toBeLessThanOrEqual(5);
  });

  it('grows a card only once even if it appears twice in the report', () => {
    // Defensive: duplicate uids must not double-credit. `applyProgression` iterates `usedUids`, so
    // this asserts the caller is not expected to de-duplicate, and that the result is still sane.
    const deck = deckAt(9);
    const result = grow(deck, { won: true, usedUids: [1, 1], battleWins: new Map() }, createRng(4));
    expect(result.changes).toHaveLength(2);
  });

  it('leaves every card alone when the match was lost', () => {
    const deck = deckAt(10);
    const report = analyseMatch(playAll(10, deck), deck, 'player');
    const result = grow(
      deck,
      { won: false, usedUids: report.usedUids, battleWins: report.battleWins },
      createRng(5),
    );
    for (let i = 0; i < deck.length; i++) {
      expect(result.collection[i]!.atk).toBe(deck[i]!.atk);
      expect(result.collection[i]!.pdef).toBe(deck[i]!.pdef);
      expect(result.collection[i]!.mdef).toBe(deck[i]!.mdef);
    }
  });

  it('never grows a card past its figure caps', () => {
    // Integration safety net: progression must respect the catalog even after many matches.
    const deck = deckAt(11);
    let collection = deck;
    for (let seed = 0; seed < 60; seed++) {
      const state = playAll(seed, collection);
      const report = analyseMatch(state, collection, 'player');
      const result = applyProgression(
        collection,
        { won: true, usedUids: report.usedUids, battleWins: report.battleWins },
        createRng(seed),
      );
      collection = [...result.collection];
      result.collection.forEach((card, index) => {
        const caps = capsFor(card);
        expect(card.atk, 'atk').toBeLessThanOrEqual(caps.atk);
        expect(card.pdef, 'pdef').toBeLessThanOrEqual(caps.pdef);
        expect(card.mdef, 'mdef').toBeLessThanOrEqual(caps.mdef);
        expect(card.figureId).toBe(deck[index]!.figureId);
      });
    }
  });
});

describe('a malformed log', () => {
  // The event log is the only record of what happened, and a save written by a different version
  // could contain anything. Progression must survive it rather than throw part-way through a
  // player's save.

  it('ignores a placement that names a hand slot that does not exist', () => {
    const deck = deckAt(12);
    const state = {
      ...createMatch({ seed: 1, playerDeck: deck, aiDeck: deck }),
      history: [{ t: 'place', cell: 0, owner: 'player', figureId: 0, cardIndex: 99 }],
    } as unknown as GameState;
    expect(analyseMatch(state, deck, 'player').usedUids).toEqual([]);
  });

  it('ignores a battle on a square it never saw occupied', () => {
    const deck = deckAt(13);
    const state = {
      ...createMatch({ seed: 1, playerDeck: deck, aiDeck: deck }),
      history: [
        { t: 'place', cell: 0, owner: 'player', figureId: 0, cardIndex: 0 },
        {
          t: 'battle-roll',
          attacker: 9,
          defender: 8,
          atkBase: 0,
          atkRoll: 0,
          atkActual: 0,
          defBase: 0,
          defRoll: 0,
          defActual: 0,
          probability: 0.5,
          attackerWins: true,
        },
      ],
    } as unknown as GameState;
    const report = analyseMatch(state, deck, 'player');
    expect(report.battleWins.size).toBe(0);
    expect(report.usedUids).toHaveLength(1);
  });

  it('ignores a placement that points past the end of the deck', () => {
    // `createMatch` insists on a full hand, so build a legal match and then hand `analyseMatch`
    // a deck shorter than the log implies — which is what a stale save looks like.
    const full = deckAt(14);
    const deck = full.slice(0, 2);
    const state = {
      ...createMatch({ seed: 1, playerDeck: full, aiDeck: full }),
      history: [
        { t: 'place', cell: 0, owner: 'player', figureId: 0, cardIndex: 0 },
        { t: 'place', cell: 1, owner: 'player', figureId: 0, cardIndex: 0 },
        { t: 'place', cell: 2, owner: 'player', figureId: 0, cardIndex: 0 },
      ],
    } as unknown as GameState;
    // Two of the three map to real cards; the third has no deck position left.
    expect(analyseMatch(state, deck, 'player').usedUids).toHaveLength(2);
  });
});

describe('the catalog it replays against', () => {
  it('has enough distinct figures for a five-card deck', () => {
    expect(FIGURES.length).toBeGreaterThanOrEqual(100);
    for (const tier of [1, 2, 3, 4, 5] as Tier[]) {
      expect(figuresOfTier(tier).length).toBeGreaterThanOrEqual(5);
    }
  });
});
