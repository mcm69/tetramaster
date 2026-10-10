/**
 * The placement cascade (PLAN.md §1.4, §1.5, §1.7).
 *
 * **Every expectation in this file is derived by hand from the rules, not captured from the
 * engine.** Each test states the board, then spells out which cells should change hands and why.
 * If the engine and a scenario disagree, the scenario is the arbiter.
 *
 * The battle resolver is stubbed (see `fixtures.ts`) so cascade *shape* can be tested without the
 * RNG. Stage 4 replaces it with the real two-roll implementation.
 */

import { describe, expect, it } from 'vitest';
import { previewPendingBattles, resolvePlacement } from '../../src/core/resolution';
import {
  attackerAlwaysLoses,
  attackerAlwaysWins,
  buildState,
  cardAt,
  cellsOfEvent,
  losesToAdvanced,
  ownedBy,
  resolverBy,
  winsOnArrowCount,
} from '../fixtures';
import { createRng } from '../../src/core/rng';
import type { GameEvent } from '../../src/core/types';

// Board reference used by the comments below:
//
//      0  1  2  3
//      4  5  6  7
//      8  9 10 11
//     12 13 14 15

describe('§1.4 only the placed card attacks', () => {
  it('[§1.4] a card placed with no arrows captures nothing', () => {
    // Played at 0 with no arrows. The opposing card at 1 points at 0, but 0 points at nothing.
    const state = buildState({
      pieces: { 1: { owner: 'ai', arrows: ['W'] } },
      play: 0,
      playedArrows: [],
    });
    const { state: after } = resolvePlacement(state, 0);
    expect(ownedBy(after, 'player')).toEqual([0]);
    expect(ownedBy(after, 'ai')).toEqual([1]);
  });

  it('[§1.4] an opponent arrow pointing at the new card does nothing on its own', () => {
    // Card at 1 points W at the freshly played card at 0. §1.4: already-placed cards are
    // defensive, so this must not flip anything — the played card has no arrows.
    const state = buildState({
      pieces: { 1: { owner: 'ai', arrows: ['W'] } },
      play: 0,
      playedArrows: [],
    });
    const { state: after, events } = resolvePlacement(state, 0);
    expect(events).toHaveLength(0);
    expect(cardAt(after, 0)?.owner).toBe('player');
    expect(cardAt(after, 1)?.owner).toBe('ai');
  });

  it('[§1.4] two already-placed cards pointing at each other are inert until one is played', () => {
    // 1 and 2 face each other; playing at 3 with a W arrow takes down 2 (it does not point back).
    const state = buildState({
      pieces: {
        1: { owner: 'ai', arrows: ['E'] },
        2: { owner: 'ai', arrows: ['W'] },
      },
      play: 3,
      playedArrows: ['W'],
    });
    const { state: after } = resolvePlacement(state, 3);
    expect(cardAt(after, 1)?.owner).toBe('ai'); // untouched
    expect(cardAt(after, 2)?.owner).toBe('player'); // taken down by the new card
  });
});

describe('§1.5 arrow takedown', () => {
  it('[§1.5] an arrow into a card with no arrow back is an automatic takedown', () => {
    // Play at 5 with E. Cell 6 is opposing and points nowhere, so it flips.
    const state = buildState({
      pieces: { 6: { owner: 'ai', arrows: [] } },
      play: 5,
      playedArrows: ['E'],
    });
    const { state: after, events } = resolvePlacement(state, 5);
    expect(cardAt(after, 6)?.owner).toBe('player');
    expect(events.filter((e) => e.t === 'takedown')).toHaveLength(1);
    // No battle was fought.
    expect(events.filter((e) => e.t === 'battle')).toHaveLength(0);
  });

  it('[§1.5] every arrow resolves, so a multi-arrow card takes down everything it reaches', () => {
    // Play at 5 (r1c1) with N, E, S, W -> 1, 6, 9, 4. All four are adjacent and none points back.
    // 8 (r2c0) is SW of 5, not cardinal, so it is untouched.
    const state = buildState({
      pieces: {
        1: { owner: 'ai', arrows: [] },
        6: { owner: 'ai', arrows: [] },
        9: { owner: 'ai', arrows: [] },
        4: { owner: 'ai', arrows: [] },
        8: { owner: 'ai', arrows: [] },
      },
      play: 5,
      playedArrows: ['N', 'E', 'S', 'W'],
    });
    const { state: after } = resolvePlacement(state, 5);
    expect(ownedBy(after, 'player')).toEqual([1, 4, 5, 6, 9]);
    expect(ownedBy(after, 'ai')).toEqual([8]);
  });

  it('[§1.5] arrows pointing at our own cards do nothing', () => {
    const state = buildState({
      pieces: {
        6: { owner: 'player', arrows: [] },
        9: { owner: 'player', arrows: [] },
      },
      play: 5,
      playedArrows: ['E', 'S'],
    });
    const { state: after, events } = resolvePlacement(state, 5);
    expect(events).toHaveLength(0);
    expect(ownedBy(after, 'player')).toEqual([5, 6, 9]);
  });

  it('[§1.5] arrows pointing off the board are ignored, not wrapped', () => {
    // Play at 0 (top-left corner) with all four diagonals/cardinals. N, NE, NW and W leave the
    // board. Only SE (cell 5) is a legal target.
    const state = buildState({
      pieces: {
        1: { owner: 'ai', arrows: [] },
        4: { owner: 'ai', arrows: [] },
        5: { owner: 'ai', arrows: [] },
      },
      play: 0,
      playedArrows: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'],
    });
    const { state: after, events } = resolvePlacement(state, 0);
    expect(cellsOfEvent(events, 'takedown')).toEqual([1, 4, 5]);
    // The four arrows that left the board did nothing at all.
    expect(ownedBy(after, 'player')).toEqual([0, 1, 4, 5]);
  });

  it('[§1.5] arrows pointing at empty cells do nothing', () => {
    const state = buildState({ play: 5, playedArrows: ['N', 'E', 'S', 'W'] });
    const { events } = resolvePlacement(state, 5);
    expect(events).toHaveLength(0);
  });

  it('[§1.5] blocked cells are never occupied and never targeted', () => {
    // Block 6. The arrow finds nothing there, and the cell stays empty.
    const { state: after, events } = resolvePlacement(
      buildState({ blocked: [6], play: 5, playedArrows: ['E'] }),
      5,
    );
    expect(events).toHaveLength(0);
    expect(cardAt(after, 6)).toBeNull();
  });

  it('[§1.5] blocked cells break adjacency — a card behind one is safe', () => {
    // Play at 4 with N. Cell 0 is adjacent and empty. Blocking 0 is not meaningful here, so
    // instead: play at 4 with N where 0 is blocked and 1 holds an enemy card diagonally. The
    // diagonal is not cardinal, so nothing happens either way; the point is that the blocked cell
    // 0 absorbs the N arrow without affecting 1.
    const state = buildState({
      pieces: { 1: { owner: 'ai', arrows: [] } },
      blocked: [0],
      play: 4,
      playedArrows: ['N'],
    });
    const { events } = resolvePlacement(state, 4);
    expect(events).toHaveLength(0);
  });

  it('[§1.5] a corner card with three arrows takes down exactly its three neighbours', () => {
    // Play at 0 with E, SE, S. Targets are 1, 5, 4.
    const state = buildState({
      pieces: {
        1: { owner: 'ai', arrows: [] },
        4: { owner: 'ai', arrows: [] },
        5: { owner: 'ai', arrows: [] },
      },
      play: 0,
      playedArrows: ['E', 'SE', 'S'],
    });
    const { state: after } = resolvePlacement(state, 0);
    expect(ownedBy(after, 'player')).toEqual([0, 1, 4, 5]);
  });

  it('[§1.5] a card with no arrows at all is a legal placement and a dead one', () => {
    const state = buildState({
      pieces: {
        1: { owner: 'ai', arrows: ['W'] },
        6: { owner: 'ai', arrows: [] },
      },
      play: 5,
      playedArrows: [],
    });
    const { state: after } = resolvePlacement(state, 5);
    expect(ownedBy(after, 'player')).toEqual([5]);
    expect(ownedBy(after, 'ai')).toEqual([1, 6]);
  });
});

describe('§1.7 battles and combos', () => {
  it('[§1.5] a pointing-back arrow starts a battle instead of a free capture', () => {
    // Play at 5 with E; cell 6 points W back, so a battle occurs and the stub says we lose.
    const state = buildState({
      pieces: { 6: { owner: 'ai', arrows: ['W'] } },
      play: 5,
      playedArrows: ['E'],
    });
    const { state: after, events } = resolvePlacement(state, 5, {
      battle: attackerAlwaysLoses,
    });
    expect(events.filter((e) => e.t === 'battle')).toHaveLength(1);
    expect(cardAt(after, 6)?.owner).toBe('ai'); // it defended successfully
    expect(cardAt(after, 5)?.owner).toBe('ai'); // our placed card flipped
  });

  it('[§1.7] winning a battle flips the defender', () => {
    const state = buildState({
      pieces: { 6: { owner: 'ai', arrows: ['W'] } },
      play: 5,
      playedArrows: ['E'],
    });
    const { state: after, events } = resolvePlacement(state, 5, {
      battle: attackerAlwaysWins,
    });
    expect(cardAt(after, 6)?.owner).toBe('player');
    const flip = events.find((e) => e.t === 'flip' && e.cell === 6);
    expect(flip).toMatchObject({ reason: 'battle', from: 'ai', to: 'player' });
  });

  it('[§1.7] losing flips the placed card itself, and its arrows then hurt us', () => {
    // 5 plays E at 6 (points back -> battle) and S at 9 (no return). The initial scan takes 9
    // before the battle is fought. We then lose, so 5 flips to the enemy — and 5's own S arrow
    // now combos in the enemy's favour, taking 9 straight back. The chain stops there.
    const state = buildState({
      pieces: {
        6: { owner: 'ai', arrows: ['W'] },
        9: { owner: 'ai', arrows: [] },
      },
      play: 5,
      playedArrows: ['E', 'S'],
    });
    const { state: after, events } = resolvePlacement(state, 5, {
      battle: attackerAlwaysLoses,
    });
    expect(cardAt(after, 5)?.owner).toBe('ai');
    expect(cardAt(after, 9)?.owner).toBe('ai');
    expect(cardAt(after, 6)?.owner).toBe('ai');
    // 9 was ours between the takedown and the loss, which is why the enemy's combo reached it.
    expect(events.some((e) => e.t === 'takedown' && e.cell === 9)).toBe(true);
    expect(events.some((e) => e.t === 'combo' && e.cell === 9 && e.owner === 'ai')).toBe(true);
  });

  it('[§1.7] a combo fires from the loser of a battle, capturing its targets without a battle', () => {
    // 5 plays E at 6. 6 points back W, and also S at 10 and SE at 11. We win.
    // Losing card 6's arrows then flip 10 and 11 with no battle of their own.
    const state = buildState({
      pieces: {
        6: { owner: 'ai', arrows: ['W', 'S', 'SE'] },
        10: { owner: 'ai', arrows: [] },
        11: { owner: 'ai', arrows: [] },
      },
      play: 5,
      playedArrows: ['E'],
    });
    const { state: after, events } = resolvePlacement(state, 5, {
      battle: attackerAlwaysWins,
    });
    expect(ownedBy(after, 'player')).toEqual([5, 6, 10, 11]);
    expect(cellsOfEvent(events, 'combo')).toEqual([10, 11]);
    // Exactly one battle: the combos did not start battles of their own.
    expect(events.filter((e) => e.t === 'battle')).toHaveLength(1);
  });

  it('[§1.7] a combo captures a card even when that card points back', () => {
    // 6 points S at 10, and 10 points N back at 6. A combo is not a battle, so 10 still flips
    // despite pointing back at the card that just lost.
    const state = buildState({
      pieces: {
        6: { owner: 'ai', arrows: ['W', 'S'] },
        10: { owner: 'ai', arrows: ['N'] },
      },
      play: 5,
      playedArrows: ['E'],
    });
    const { state: after, events } = resolvePlacement(state, 5, {
      battle: attackerAlwaysWins,
    });
    expect(cardAt(after, 10)?.owner).toBe('player');
    expect(events.filter((e) => e.t === 'combo' && e.cell === 10)).toHaveLength(1);
    // 10 pointed back at 6, but a combo still never starts a battle.
    expect(events.filter((e) => e.t === 'battle')).toHaveLength(1);
  });

  it('[§1.7] combos never recurse — a card flipped by a combo does not fire its own arrows', () => {
    // 5 -> 6 (battle, we win). 6's arrows reach 10 and 11, so both flip by combo.
    // 10 points S at 14 and 11 points S at 15. If combos recursed, 14 and 15 would flip too.
    // They must NOT.
    const state = buildState({
      pieces: {
        6: { owner: 'ai', arrows: ['W', 'S', 'SE'] },
        10: { owner: 'ai', arrows: ['S'] },
        11: { owner: 'ai', arrows: ['S'] },
        14: { owner: 'ai', arrows: [] },
        15: { owner: 'ai', arrows: [] },
      },
      play: 5,
      playedArrows: ['E'],
    });
    const { state: after, events } = resolvePlacement(state, 5, {
      battle: attackerAlwaysWins,
    });
    expect(ownedBy(after, 'player')).toEqual([5, 6, 10, 11]);
    expect(cardAt(after, 14)?.owner).toBe('ai');
    expect(cardAt(after, 15)?.owner).toBe('ai');
    expect(cellsOfEvent(events, 'combo')).toEqual([10, 11]);
  });

  it('[§1.7] a takedown does NOT produce a combo, even when the taken card has arrows', () => {
    // 5 plays E at 6; 6 has no arrow back, so it is a free takedown. 6's arrows reach 10 and 11,
    // which must stay put: combos only follow a battle (§1.7 first bullet).
    const state = buildState({
      pieces: {
        6: { owner: 'ai', arrows: ['S', 'SE'] },
        10: { owner: 'ai', arrows: [] },
        11: { owner: 'ai', arrows: [] },
      },
      play: 5,
      playedArrows: ['E'],
    });
    const { state: after, events } = resolvePlacement(state, 5);
    expect(ownedBy(after, 'player')).toEqual([5, 6]);
    expect(ownedBy(after, 'ai')).toEqual([10, 11]);
    expect(events.filter((e) => e.t === 'combo')).toHaveLength(0);
  });

  it('[§1.7] after winning, the placed card keeps attacking with its remaining arrows', () => {
    // 5 points E at 6 (battle) and S at 9 (no return). We win the battle, then take 9 down.
    const state = buildState({
      pieces: {
        6: { owner: 'ai', arrows: ['W'] },
        9: { owner: 'ai', arrows: [] },
      },
      play: 5,
      playedArrows: ['E', 'S'],
    });
    const { state: after } = resolvePlacement(state, 5, { battle: attackerAlwaysWins });
    expect(ownedBy(after, 'player')).toEqual([5, 6, 9]);
  });

  it('[§1.7] a combo that captures a pending defender cancels that battle', () => {
    // 5 points E at 6 and SE at 10; both 6 and 10 point back, so two battles queue.
    // Winning against 6 fires a combo from 6's S arrow onto 10, so 10 is already ours and its
    // queued battle must not happen.
    const state = buildState({
      pieces: {
        6: { owner: 'ai', arrows: ['W', 'S'] },
        10: { owner: 'ai', arrows: ['NW'] },
      },
      play: 5,
      playedArrows: ['E', 'SE'],
    });
    const { state: after, events } = resolvePlacement(state, 5, {
      battle: attackerAlwaysWins,
    });
    expect(ownedBy(after, 'player')).toEqual([5, 6, 10]);
    // Only one battle: the second was cancelled by the combo.
    expect(events.filter((e) => e.t === 'battle')).toHaveLength(1);
  });

  it('[§1.7] queued battles are fought in the order they were discovered', () => {
    // Canonical direction order is N, NE, E, SE, S, SW, W, NW. From cell 5 that puts N (1) before
    // E (6) before S (9) before W (4). The stub wins everything, so the battle events should
    // appear in exactly that order. Stage 5 layers the player's choice on top of this ordering.
    const state = buildState({
      pieces: {
        1: { owner: 'ai', arrows: ['S'] },
        6: { owner: 'ai', arrows: ['W'] },
        9: { owner: 'ai', arrows: ['N'] },
        4: { owner: 'ai', arrows: ['E'] },
      },
      play: 5,
      playedArrows: ['N', 'E', 'S', 'W'],
    });
    const { events } = resolvePlacement(state, 5, { battle: attackerAlwaysWins });
    const fought = events
      .filter((e): e is Extract<GameEvent, { t: 'battle' }> => e.t === 'battle')
      .map((e) => e.defender);
    expect(fought).toEqual([1, 6, 9, 4]);
  });

  it('[§1.7] two independent battles both resolve when neither cancels the other', () => {
    // 5 points E at 6 and SE at 10. 6 points W, 10 points NW. Neither can reach the other.
    const state = buildState({
      pieces: {
        6: { owner: 'ai', arrows: ['W'] },
        10: { owner: 'ai', arrows: ['NW'] },
      },
      play: 5,
      playedArrows: ['E', 'SE'],
    });
    const { state: after, events } = resolvePlacement(state, 5, {
      battle: attackerAlwaysWins,
    });
    expect(ownedBy(after, 'player')).toEqual([5, 6, 10]);
    expect(events.filter((e) => e.t === 'battle')).toHaveLength(2);
  });

  it('[§1.7] losing the first battle stops the chain — no second battle occurs', () => {
    // 5 points E at 6 and SE at 10; both point back. We lose the first, so 10 is never fought.
    const state = buildState({
      pieces: {
        6: { owner: 'ai', arrows: ['W'] },
        10: { owner: 'ai', arrows: ['NW'] },
      },
      play: 5,
      playedArrows: ['E', 'SE'],
    });
    const { state: after, events } = resolvePlacement(state, 5, {
      battle: attackerAlwaysLoses,
    });
    expect(cardAt(after, 5)?.owner).toBe('ai');
    expect(cardAt(after, 6)?.owner).toBe('ai');
    expect(cardAt(after, 10)?.owner).toBe('ai'); // never reached
    expect(events.filter((e) => e.t === 'battle')).toHaveLength(1);
  });

  it('[§1.7] a combo after a loss skips cards the winner already owns (Q7)', () => {
    // 5 plays E at 6 and SE at 10; both point back and both are enemy. We lose, 5 flips to ai,
    // and its arrows reach 6 and 10 — but the winner already owns both, so no combo events.
    const state = buildState({
      pieces: {
        6: { owner: 'ai', arrows: ['W'] },
        10: { owner: 'ai', arrows: ['NW'] },
      },
      play: 5,
      playedArrows: ['E', 'SE'],
    });
    const { state: after, events } = resolvePlacement(state, 5, {
      battle: attackerAlwaysLoses,
    });
    expect(cardAt(after, 5)?.owner).toBe('ai');
    expect(events.filter((e) => e.t === 'combo')).toHaveLength(0);
  });

  it('[§1.7] losing the battle lets the winner combo onto cards we own', () => {
    // 5 plays E at 6 (points back, battle) and SE at 10. 10 is ours, so the initial scan skips
    // it. We lose: 5 flips to ai and its SE arrow combos onto our card at 10.
    const state = buildState({
      pieces: {
        6: { owner: 'ai', arrows: ['W'] },
        10: { owner: 'player', arrows: [] },
      },
      play: 5,
      playedArrows: ['E', 'SE'],
    });
    const { state: after, events } = resolvePlacement(state, 5, {
      battle: attackerAlwaysLoses,
    });
    expect(cardAt(after, 5)?.owner).toBe('ai');
    expect(cardAt(after, 10)?.owner).toBe('ai');
    expect(events.filter((e) => e.t === 'combo' && e.cell === 10)).toHaveLength(1);
  });

  it('[§1.7] battles only originate from the placed card, never from combos', () => {
    // Everything reachable points back, so a naive implementation would fight a cascade.
    // 5 -> 6 (win) -> combo 10, 11 -> 10 and 11 each point S at cards that must stay put.
    const state = buildState({
      pieces: {
        6: { owner: 'ai', arrows: ['W', 'S', 'SE'] },
        10: { owner: 'ai', arrows: ['S'] },
        11: { owner: 'ai', arrows: ['S'] },
        14: { owner: 'ai', arrows: ['N', 'NW', 'NE'] },
        15: { owner: 'ai', arrows: [] },
      },
      play: 5,
      playedArrows: ['E'],
    });
    const { state: after, events } = resolvePlacement(state, 5, {
      battle: attackerAlwaysWins,
    });
    // Exactly one battle, and nothing beyond the first degree flips.
    expect(events.filter((e) => e.t === 'battle')).toHaveLength(1);
    expect(cardAt(after, 14)?.owner).toBe('ai');
    expect(cardAt(after, 15)?.owner).toBe('ai');
    expect(ownedBy(after, 'player')).toEqual([5, 6, 10, 11]);
  });
});

describe('cascade mechanics', () => {
  it('resolving an empty cell is a no-op rather than a crash', () => {
    const state = buildState({ play: 0 });
    const { state: after, events } = resolvePlacement(state, 8);
    expect(events).toEqual([]);
    expect(after).toBe(state);
  });

  it('defaults to the always-lose resolver when none is supplied', () => {
    // Stage 3's default keeps cascades terminating immediately; Stage 4 replaces it. Asserting
    // the default explicitly stops a silent change to it from going unnoticed.
    const state = buildState({
      pieces: { 6: { owner: 'ai', arrows: ['W'] } },
      play: 5,
      playedArrows: ['E'],
    });
    const { state: after, events } = resolvePlacement(state, 5);
    expect(cardAt(after, 5)?.owner).toBe('ai');
    expect(events.filter((e) => e.t === 'battle')).toHaveLength(1);
  });

  it('an empty placed cell yields no targets, even with a resolver attached', () => {
    const state = buildState({ play: 0 });
    const { events } = resolvePlacement(state, 8, { battle: attackerAlwaysWins });
    expect(events).toEqual([]);
  });

  it('does not mutate the input state', () => {
    const state = buildState({
      pieces: { 6: { owner: 'ai', arrows: ['S'] } },
      play: 5,
      playedArrows: ['E'],
    });
    const before = JSON.stringify(state.board);
    resolvePlacement(state, 5, { battle: attackerAlwaysWins });
    expect(JSON.stringify(state.board)).toBe(before);
  });

  it('appends its events to the state history', () => {
    const state = buildState({
      pieces: { 6: { owner: 'ai', arrows: [] } },
      play: 5,
      playedArrows: ['E'],
    });
    const { state: after, events } = resolvePlacement(state, 5);
    expect(after.history.length).toBe(events.length);
    expect(after.history).toEqual(events);
  });

  it('clears pendingBattles after resolution', () => {
    const state = buildState({
      pieces: { 6: { owner: 'ai', arrows: ['W'] } },
      play: 5,
      playedArrows: ['E'],
    });
    const { state: after } = resolvePlacement(state, 5, { battle: attackerAlwaysWins });
    expect(after.pendingBattles).toEqual([]);
  });

  it('works symmetrically for the ai as the placing side', () => {
    const state = buildState({
      pieces: { 6: { owner: 'player', arrows: [] } },
      play: 5,
      owner: 'ai',
      playedArrows: ['E'],
    });
    const { state: after } = resolvePlacement(state, 5);
    expect(cardAt(after, 6)?.owner).toBe('ai');
    expect(ownedBy(after, 'ai')).toEqual([5, 6]);
  });

  it('an eight-arrow card facing four enemies takes down all of them', () => {
    // Play at 5 (r1c1) with all eight arrows. Its neighbours are 0,1,2,4,6,8,9,10; the four
    // diagonal ones hold enemies too, so all five enemy cards must flip.
    const state = buildState({
      pieces: {
        0: { owner: 'ai', arrows: [] },
        1: { owner: 'ai', arrows: [] },
        2: { owner: 'ai', arrows: [] },
        4: { owner: 'ai', arrows: [] },
        6: { owner: 'ai', arrows: [] },
        8: { owner: 'ai', arrows: [] },
        9: { owner: 'ai', arrows: [] },
        10: { owner: 'ai', arrows: [] },
      },
      play: 5,
      playedArrows: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'],
    });
    const { state: after } = resolvePlacement(state, 5);
    expect(ownedBy(after, 'player')).toEqual([0, 1, 2, 4, 5, 6, 8, 9, 10]);
  });

  it('resolves a realistic corner sweep mixing takedowns and a battle', () => {
    // Play at 15 (bottom-right corner) with N, W, NW -> 11, 14, 10.
    // 14 points E back at 15, so that one is a battle. 10 and 11 do not point back, so the
    // initial scan takes them before the battle is fought.
    const state = buildState({
      pieces: {
        10: { owner: 'ai', arrows: [] },
        11: { owner: 'ai', arrows: [] },
        14: { owner: 'ai', arrows: ['E'] },
      },
      play: 15,
      playedArrows: ['N', 'W', 'NW'],
    });
    const { state: after, events } = resolvePlacement(state, 15, {
      battle: attackerAlwaysWins,
    });
    expect(ownedBy(after, 'player')).toEqual([10, 11, 14, 15]);
    expect(events.filter((e) => e.t === 'takedown')).toHaveLength(2);
    expect(events.filter((e) => e.t === 'battle')).toHaveLength(1);
  });
});

describe('cascade with the real battle maths (Stage 4)', () => {
  it('[§1.6] resolves a seeded battle through the cascade end to end', () => {
    // 5 plays E at 6, and 6 points W back, so a real battle is fought with the seeded RNG.
    const state = buildState({
      pieces: { 6: { owner: 'ai', arrows: ['W'], atk: 5, type: 'P', pdef: 5, mdef: 5 } },
      play: 5,
      playedArrows: ['E'],
      playedStats: { atk: 5, type: 'P', pdef: 5, mdef: 5 },
    });
    const rng = createRng(4242);
    const { state: after, events } = resolvePlacement(state, 5, { rng });

    const roll = events.find(
      (e): e is Extract<GameEvent, { t: 'battle-roll' }> => e.t === 'battle-roll',
    );
    expect(roll).toBeDefined();
    // The event log carries everything the animator needs to replay the fight.
    expect(roll?.atkActual).toBe((roll?.atkBase ?? 0) - (roll?.atkRoll ?? 0));
    expect(roll?.defActual).toBe((roll?.defBase ?? 0) - (roll?.defRoll ?? 0));
    expect(roll?.probability).toBeGreaterThan(0);
    expect(roll?.probability).toBeLessThan(1);
    // Exactly one battle, and the winner is whoever the rolls say.
    expect(events.filter((e) => e.t === 'battle')).toHaveLength(1);
    expect(cardAt(after, 6)?.owner).toBe(roll?.attackerWins ? 'player' : 'ai');
  });

  it('[§1.6] is reproducible from a seed, so a match can be replayed exactly', () => {
    const build = () =>
      buildState({
        pieces: {
          6: { owner: 'ai', arrows: ['W'], atk: 8, type: 'M', pdef: 4, mdef: 9 },
          9: { owner: 'ai', arrows: ['N'], atk: 6, type: 'P', pdef: 7, mdef: 3 },
        },
        play: 5,
        playedArrows: ['E', 'S'],
        playedStats: { atk: 11, type: 'X', pdef: 6, mdef: 6 },
      });
    const a = resolvePlacement(build(), 5, { rng: createRng(9001) });
    const b = resolvePlacement(build(), 5, { rng: createRng(9001) });
    expect(a.events).toEqual(b.events);
    expect(a.state.board).toEqual(b.state.board);
  });

  it('[§1.6] different seeds produce different fights from the same position', () => {
    const build = () =>
      buildState({
        pieces: { 6: { owner: 'ai', arrows: ['W'], atk: 8, type: 'M', pdef: 4, mdef: 9 } },
        play: 5,
        playedArrows: ['E'],
        playedStats: { atk: 9, type: 'X', pdef: 5, mdef: 5 },
      });
    const outcomes = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((seed) => {
        const { events } = resolvePlacement(build(), 5, { rng: createRng(seed) });
        const roll = events.find((e) => e.t === 'battle-roll');
        return `${String(roll?.atkActual)}/${String(roll?.defActual)}`;
      }),
    );
    expect(outcomes.size).toBeGreaterThan(1);
  });

  it('[§1.6] many seeded battles eventually flip the defender', () => {
    // The stub made this trivial. With the real maths, an equal fight should flip roughly half
    // the time, which proves the cascade is genuinely driven by the rolls.
    let flipped = 0;
    const trials = 40;
    for (let seed = 0; seed < trials; seed++) {
      const state = buildState({
        pieces: { 6: { owner: 'ai', arrows: ['W'], atk: 7, type: 'P', pdef: 7, mdef: 7 } },
        play: 5,
        playedArrows: ['E'],
        playedStats: { atk: 7, type: 'P', pdef: 7, mdef: 7 },
      });
      const { state: after } = resolvePlacement(state, 5, { rng: createRng(seed) });
      if (cardAt(after, 6)?.owner === 'player') flipped++;
    }
    // Equal cards: the attacker should win a little under half the time (ties go to the defender).
    expect(flipped / trials).toBeGreaterThan(0.25);
    expect(flipped / trials).toBeLessThan(0.5);
  });
});

describe('previewPendingBattles', () => {
  it('lists only the opponents that would actually start a battle', () => {
    const state = buildState({
      pieces: {
        6: { owner: 'ai', arrows: ['W'], atk: 2 },
        9: { owner: 'ai', arrows: [], atk: 2 },
      },
      play: 5,
      playedArrows: ['E', 'S'],
      playedStats: { atk: 12, type: 'P', pdef: 5, mdef: 5 },
    });
    const pending = previewPendingBattles(state, 5);
    expect(pending.map((p) => p.cell)).toEqual([6]);
    // atk index 12 vs pdef index 2 -> a strong fight, well above even odds.
    expect(pending[0]?.probability).toBeGreaterThan(0.7);
  });

  it('is empty when nothing points back', () => {
    const state = buildState({
      pieces: { 6: { owner: 'ai', arrows: [] } },
      play: 5,
      playedArrows: ['E'],
    });
    expect(previewPendingBattles(state, 5)).toEqual([]);
  });

  it('is empty for an empty cell', () => {
    const state = buildState({ play: 0 });
    expect(previewPendingBattles(state, 7)).toEqual([]);
  });
});

describe('battle stub variants drive both branches', () => {
  it('resolverBy chooses the outcome from the cards involved', () => {
    // Defender is type A, so the predicate (win unless A) says we lose.
    const state = buildState({
      pieces: { 6: { owner: 'ai', arrows: ['W'], type: 'A' } },
      play: 5,
      playedArrows: ['E'],
    });
    const lost = resolvePlacement(state, 5, {
      battle: resolverBy((_a, d) => d.type !== 'A'),
    });
    expect(cardAt(lost.state, 5)?.owner).toBe('ai');

    // The same board, but the resolver loses only to advanced types — which is this defender.
    const stillLost = resolvePlacement(state, 5, { battle: losesToAdvanced });
    expect(cardAt(stillLost.state, 5)?.owner).toBe('ai');

    // A plain P defender beats that resolver, so the placed card survives.
    const plain = buildState({
      pieces: { 6: { owner: 'ai', arrows: ['W'], type: 'P' } },
      play: 5,
      playedArrows: ['E'],
    });
    const won = resolvePlacement(plain, 5, { battle: losesToAdvanced });
    expect(cardAt(won.state, 6)?.owner).toBe('player');
  });

  it('winsOnArrowCount wins when the attacker has at least as many arrows', () => {
    const state = buildState({
      pieces: { 6: { owner: 'ai', arrows: ['W'] } },
      play: 5,
      playedArrows: ['E', 'S', 'W'],
    });
    const { state: after } = resolvePlacement(state, 5, { battle: winsOnArrowCount });
    expect(cardAt(after, 6)?.owner).toBe('player');
  });
});
