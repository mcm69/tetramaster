/**
 * The opponent (PLAN.md §6, Stage 8).
 *
 * Three properties matter more than whether the AI is strong, and each is asserted here:
 *
 *  - **It never returns an illegal action.** An illegal action ends a match in `applyAction`, so a
 *    driver that slips one simply stops playing.
 *  - **It never cheats.** Asking the AI for a decision must not advance the match RNG, or the AI
 *    would be choosing its battles after seeing the rolls.
 *  - **It is beatable and not degenerate**, checked in `tools/balance.ts`.
 */

import { describe, expect, it } from 'vitest';
import {
  Opponent,
  pickAction,
  pickMove,
  toAction,
  defaultPersonality,
} from '../../src/ai/opponent.ts';
import {
  PERSONALITIES,
  personalityById,
  personalitiesOfDifficulty,
} from '../../src/ai/personalities.ts';
import { allMoves, battleMoves, bestMove, moveCount, placementMoves } from '../../src/ai/moves.ts';
import {
  evaluatePlacement,
  explain,
  relevantDefence,
  DEFAULT_WEIGHTS,
} from '../../src/ai/evaluate.ts';
import { applyAction, createMatch, legalCells, playMatch } from '../../src/core/match.ts';
import { createRng } from '../../src/core/rng.ts';
import { rollInstance } from '../../src/core/card.ts';
import { FIGURES } from '../../src/data/cards.ts';
import type { Action } from '../../src/core/match.ts';
import type { Personality } from '../../src/ai/opponent.ts';
import type { Card, GameState, Tier } from '../../src/core/types.ts';

function matchAt(seed: number, playerTier: Tier = 3, aiTier: Tier = 3): GameState {
  const rng = createRng(seed);
  const pool = FIGURES.filter((f) => f.tier === playerTier);
  const pool2 = FIGURES.filter((f) => f.tier === aiTier);
  const build = (source: typeof pool): Card[] =>
    Array.from({ length: 5 }, () => {
      const figure = source[rng.int(source.length)];
      if (!figure) throw new Error('empty tier pool');
      return rollInstance(figure, rng);
    });
  return createMatch({ seed, playerDeck: build(pool), aiDeck: build(pool2) });
}

describe('move enumeration', () => {
  it('offers every legal (cell, card) pair', () => {
    const state = matchAt(1);
    const moves = placementMoves(state, state.turn, DEFAULT_WEIGHTS);
    expect(moves).toHaveLength(legalCells(state).length * 5);
    for (const move of moves) {
      expect(legalCells(state)).toContain(move.cell);
      expect(move.cardIndex).toBeGreaterThanOrEqual(0);
      expect(move.cardIndex).toBeLessThan(5);
    }
  });

  it('never offers a blocked cell', () => {
    for (let seed = 0; seed < 40; seed++) {
      const state = matchAt(seed);
      const blocked = state.blocked.filter(Boolean).length;
      expect(moveCount(state, state.turn, DEFAULT_WEIGHTS)).toBe((16 - blocked) * 5);
    }
  });

  it('offers nothing once the match is over', () => {
    const { state } = playMatch(matchAt(2), (s) => {
      // A policy that answers battle orders too, otherwise the match parks in chooseBattle.
      if (s.phase === 'chooseBattle') {
        const next = s.pendingBattles[0];
        return next === undefined ? { t: 'forfeit' } : { t: 'chooseBattle', cell: next };
      }
      const cell = legalCells(s)[0];
      return cell === undefined ? { t: 'forfeit' } : { t: 'place', cell, cardIndex: 0 };
    });
    expect(state.phase).toBe('over');
    expect(allMoves(state, 'player', DEFAULT_WEIGHTS)).toEqual([]);
  });

  it('returns a null best move when nothing is legal', () => {
    const finished = playMatch(matchAt(3), () => ({ t: 'forfeit' })).state;
    expect(bestMove(finished, 'player', DEFAULT_WEIGHTS)).toBeNull();
  });

  it('converts a move to the action the reducer accepts', () => {
    const state = matchAt(4);
    const move = bestMove(state, state.turn, DEFAULT_WEIGHTS);
    expect(move).not.toBeNull();
    const action = toAction(move as NonNullable<typeof move>);
    expect(action?.t).toBe('place');
    expect(applyAction(state, action as Action).events.some((e) => e.t === 'illegal')).toBe(false);
  });
});

describe('evaluation', () => {
  it('never prefers a move with worse odds over one with better odds', () => {
    let found = false;
    for (let seed = 0; seed < 40 && !found; seed++) {
      let s = matchAt(seed);
      for (let step = 0; step < 3 && !found; step++) {
        const cell = legalCells(s)[0];
        if (cell === undefined) break;
        s = applyAction(s, { t: 'place', cell, cardIndex: 0 }).state;
        if (s.board.filter(Boolean).length < 2) continue;
        const moves = placementMoves(s, s.turn, DEFAULT_WEIGHTS);
        const best = bestMove(s, s.turn, DEFAULT_WEIGHTS);
        const capturing = moves.filter((m) => m.evaluation.captures > 0);
        if (capturing.length > 0 && best !== null) {
          // The chosen move is at least as good as every capturing alternative.
          for (const move of capturing) {
            expect(best.score).toBeGreaterThanOrEqual(move.score - 1e-9);
          }
          found = true;
        }
      }
    }
    expect(found).toBe(true);
  });

  it('never returns NaN for any position', () => {
    for (let seed = 0; seed < 25; seed++) {
      let state = matchAt(seed);
      for (let step = 0; step < 5; step++) {
        const moves = placementMoves(state, state.turn, DEFAULT_WEIGHTS);
        for (const move of moves) {
          expect(Number.isFinite(move.score), `seed ${seed}`).toBe(true);
          expect(Number.isFinite(move.evaluation.risk)).toBe(true);
        }
        const cell = legalCells(state)[0];
        if (cell === undefined) break;
        state = applyAction(state, { t: 'place', cell, cardIndex: 0 }).state;
      }
    }
  });

  it('rates a battle by its odds, never by its outcome', () => {
    // Two identical cards: the odds must sit just under a half, reflecting the defender's ties.
    // The defender points W back at cell 0, so this is a battle and not a free capture.
    const card = { figureId: 0, arrows: 0, atk: 7, type: 'P' as const, pdef: 7, mdef: 7 };
    const placed = { ...card, arrows: 1 << 2, owner: 'player' as const }; // E
    const defender = { ...card, arrows: 1 << 6, owner: 'ai' as const }; // W, pointing back
    const state = matchAt(6);
    const board = state.board.slice();
    board[0] = placed;
    board[1] = defender;
    const fake: GameState = { ...state, board };
    const evaluation = evaluatePlacement(fake, 0, placed, 'player', DEFAULT_WEIGHTS);
    // Equal stats: just under a half, because ties go to the defender.
    expect(evaluation.captures).toBe(0);
    expect(evaluation.battleValue).toBeGreaterThan(0.4);
    expect(evaluation.battleValue).toBeLessThan(0.5);
  });

  it('picks the weaker of two defences when asked, as X and A do', () => {
    const card = { figureId: 0, arrows: 0, atk: 5, type: 'P' as const, pdef: 3, mdef: 11 };
    expect(relevantDefence(card, 'P')).toBe(3);
    expect(relevantDefence(card, 'M')).toBe(11);
    expect(relevantDefence(card, 'X')).toBe(3);
  });

  it('explains a move in plain words', () => {
    const state = matchAt(7);
    const move = placementMoves(state, state.turn, DEFAULT_WEIGHTS)[0];
    expect(move).toBeDefined();
    expect(typeof explain(move!.evaluation)).toBe('string');
  });
});

describe('the AI never cheats', () => {
  it('does not advance the match RNG when it chooses a move', () => {
    for (let seed = 0; seed < 30; seed++) {
      const state = matchAt(seed);
      const before = state.rngState;
      // Ask for a decision many times over; not one of them may touch the battle stream.
      for (let i = 0; i < 20; i++) {
        pickMove(state, state.turn, defaultPersonality('sharp'), createRng(seed * 31 + i));
        pickAction(state, state.turn, defaultPersonality('sharp'), createRng(seed * 17 + i));
      }
      expect(state.rngState, `seed ${seed}`).toBe(before);
    }
  });

  it('gives two opponents with the same seed the same decisions', () => {
    const state = matchAt(8);
    const a = pickAction(state, 'ai', personalityById('vivi'), createRng(99));
    const b = pickAction(state, 'ai', personalityById('vivi'), createRng(99));
    expect(a).toEqual(b);
  });

  it('reaches the same board whether or not the AI was consulted', () => {
    // The AI's own randomness must not leak into the match: the same seed and the same human moves
    // must produce the same result no matter how many decisions the AI considered on the way.
    const human = (s: GameState): Action => {
      const cell = legalCells(s)[0];
      return cell === undefined ? { t: 'forfeit' } : { t: 'place', cell, cardIndex: 0 };
    };
    const quiet = playMatch(matchAt(9), human);

    const talkative = new Opponent(personalityById('master'), 5);
    const { state } = playMatch(matchAt(9), (s, owner) => {
      talkative.act(s, owner); // consult it, then ignore the answer
      return human(s);
    });

    expect(talkative.personality.id).toBe('master');
    expect(state.board).toEqual(quiet.state.board);
    expect(state.result).toEqual(quiet.state.result);
  });
});

describe('the AI only returns legal actions', () => {
  it('completes many full matches without ever going illegal', () => {
    for (let seed = 0; seed < 40; seed++) {
      const personality = PERSONALITIES[seed % PERSONALITIES.length] as Personality;
      const ai = new Opponent(personality, seed + 1);
      const { state } = playMatch(matchAt(seed), (s, owner) => {
        const action = ai.act(s, owner);
        return action ?? { t: 'forfeit' };
      });
      // An illegal action would end the match in applyAction, so replay and count them directly.
      const illegal = countIllegal(matchAt(seed), personality, seed + 1);
      expect(illegal, `seed ${seed}`).toBe(0);
      expect(state.placedCount).toBe(10);
      expect(state.phase).toBe('over');
    }
  });

  it('always picks a card that is actually in hand', () => {
    for (let seed = 0; seed < 30; seed++) {
      const ai = new Opponent(personalityById('zidane'), seed + 3);
      let state = matchAt(seed);
      for (let step = 0; step < 10; step++) {
        const action = ai.act(state, state.turn);
        if (action === null) break;
        if (action.t === 'place') {
          expect(action.cardIndex).toBeLessThan(state.players[state.turn].hand.length);
          expect(action.cardIndex).toBeGreaterThanOrEqual(0);
        }
        const next = applyAction(state, action);
        if (next.events.some((e) => e.t === 'illegal')) break;
        state = next.state;
      }
    }
  });
});

describe('battle-order choice (§1.7)', () => {
  it('offers the contested cards with their odds, and picks one', () => {
    let contested = false;
    for (let seed = 0; seed < 300 && !contested; seed++) {
      let state = matchAt(seed);
      const ai = new Opponent(personalityById('kuja'), seed + 5);
      for (let step = 0; step < 6 && !contested; step++) {
        if (state.phase !== 'place') break;
        const action = ai.act(state, state.turn);
        if (action === null) break;
        const next = applyAction(state, action);
        state = next.state;
        if (state.phase === 'chooseBattle') {
          const moves = battleMoves(state, state.turn, DEFAULT_WEIGHTS);
          expect(moves).toHaveLength(state.pendingBattles.length);
          for (const move of moves) {
            expect(move.probability).toBeGreaterThanOrEqual(0);
            expect(move.probability).toBeLessThanOrEqual(1);
          }
          const chosen = ai.act(state, state.turn);
          expect(chosen?.t).toBe('chooseBattle');
          contested = true;
        }
      }
    }
    expect(contested).toBe(true);
  });
});

describe('Opponent handle', () => {
  it('defaults to a steady opponent when given no personality', () => {
    const opponent = new Opponent();
    expect(opponent.personality.difficulty).toBe('steady');
    expect(opponent.act(matchAt(11), 'ai')).not.toBeNull();
  });

  it('explain() returns the move with its evaluation, for the debug overlay', () => {
    const opponent = new Opponent(personalityById('gil'), 7);
    const move = opponent.explain(matchAt(12), 'ai');
    expect(move).not.toBeNull();
    if (move?.kind === 'place') {
      expect(typeof move.evaluation.score).toBe('number');
      expect(explain(move.evaluation).length).toBeGreaterThan(0);
    }
  });

  it('reset() returns the opponent to a known state', () => {
    const state = matchAt(13);
    const a = new Opponent(personalityById('vivi'), 3);
    const b = new Opponent(personalityById('vivi'), 3);
    // Consume some randomness, then reset: the decisions must repeat.
    a.act(state, 'ai');
    a.act(state, 'ai');
    a.reset(3);
    expect(a.act(state, 'ai')).toEqual(b.act(state, 'ai'));
  });

  it('returns null once the match is over', () => {
    const finished = playMatch(matchAt(14), () => ({ t: 'forfeit' })).state;
    const opponent = new Opponent(personalityById('zidane'), 1);
    expect(opponent.act(finished, 'player')).toBeNull();
    expect(opponent.explain(finished, 'player')).toBeNull();
  });
});

describe('personalities', () => {
  it('gives every personality a distinct id, name and taunt', () => {
    expect(PERSONALITIES.length).toBeGreaterThanOrEqual(6);
    const ids = new Set(PERSONALITIES.map((p) => p.id));
    expect(ids.size).toBe(PERSONALITIES.length);
    for (const p of PERSONALITIES) {
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.taunt.length).toBeGreaterThan(0);
      expect(Number.isFinite(p.volatility)).toBe(true);
      expect(p.volatility).toBeGreaterThan(0);
    }
  });

  it('spans all three difficulties', () => {
    for (const difficulty of ['casual', 'steady', 'sharp'] as const) {
      expect(personalitiesOfDifficulty(difficulty).length).toBeGreaterThan(0);
    }
  });

  it('makes sharper opponents less volatile', () => {
    const casual = personalitiesOfDifficulty('casual');
    const sharp = personalitiesOfDifficulty('sharp');
    const avg = (list: typeof casual): number =>
      list.reduce((sum, p) => sum + p.volatility, 0) / list.length;
    expect(avg(sharp)).toBeLessThan(avg(casual));
  });

  it('looks one up by id and rejects an unknown one', () => {
    expect(personalityById('vivi').name).toBe('Vivi');
    expect(() => personalityById('nobody')).toThrow(/unknown personality/);
  });

  it('does not all play identically', () => {
    // Different weight vectors must produce different preferences somewhere across a few boards.
    const state = matchAt(10);
    const choices = new Set(
      PERSONALITIES.map((p) => JSON.stringify(pickMove(state, 'ai', p, createRng(4)))),
    );
    expect(choices.size).toBeGreaterThan(1);
  });
});

describe('difficulty behaves as advertised', () => {
  it('a sharp opponent picks the best-scoring move far more often than a casual one', () => {
    let sharpBest = 0;
    let casualBest = 0;
    let trials = 0;

    for (let seed = 0; seed < 80; seed++) {
      let state = matchAt(seed);
      for (let step = 0; step < 3; step++) {
        if (state.phase !== 'place') break;
        const moves = placementMoves(state, state.turn, DEFAULT_WEIGHTS);
        if (moves.length < 2) break;

        // Compare against the exact argmax. A tolerance band would let a noisy opponent "win"
        // by landing on any of several near-equal moves, which measures nothing.
        const best = moves.reduce((a, b) => (b.score > a.score ? b : a));
        const sharp = personalityById('master');
        const casual = personalityById('bibi');

        let sharpHit = 0;
        let casualHit = 0;
        const rounds = 25;
        for (let i = 0; i < rounds; i++) {
          const rng = createRng(seed * 977 + step * 31 + i);
          const sharpMove = pickMove(state, state.turn, sharp, rng);
          const casualMove = pickMove(state, state.turn, casual, rng);
          const isArgmax = (m: typeof sharpMove): boolean =>
            m !== null &&
            m.kind === 'place' &&
            m.cell === best.cell &&
            m.cardIndex === best.cardIndex;
          if (isArgmax(sharpMove)) sharpHit++;
          if (isArgmax(casualMove)) casualHit++;
        }
        sharpBest += sharpHit;
        casualBest += casualHit;
        trials += rounds;

        const cell = legalCells(state)[0];
        if (cell === undefined) break;
        state = applyAction(state, { t: 'place', cell, cardIndex: 0 }).state;
      }
    }

    expect(trials).toBeGreaterThan(200);
    // The Master must land on the best move substantially more often than Bibi does.
    expect(sharpBest / trials).toBeGreaterThan(casualBest / trials);
    expect(sharpBest / trials).toBeGreaterThan(0.5);
  });
});

/** Replays a match counting illegal actions the reducer rejected. */
function countIllegal(initial: GameState, personality: Personality, seed: number): number {
  const ai = new Opponent(personality, seed);
  let illegal = 0;
  playMatch(initial, (s, owner) => {
    const action = ai.act(s, owner);
    if (action === null) return { t: 'forfeit' };
    const next = applyAction(s, action);
    illegal += next.events.filter((e) => e.t === 'illegal').length;
    return action;
  });
  return illegal;
}

export {};
