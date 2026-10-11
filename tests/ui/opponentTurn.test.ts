/**
 * The computer's turn handshake (PLAN.md §6).
 *
 * The reported symptom: in a match against the AI, the player made their two moves and then found
 * themselves making the *opponent's* moves too.
 *
 * Two bugs, and the second is why it looked like the game was still working:
 *
 *  1. **The opponent stopped moving.** The latch that stops it deciding twice in one turn was set
 *     when it acted and cleared only by `newController`, so it moved exactly once per match.
 *  2. **The controller would play for whoever's turn it was.** With the opponent stationary, a click
 *     during its turn placed *its* card, so the match carried on with one person playing both sides.
 *
 * Neither was reachable from a test: the latch lived in `main.ts`'s render loop, and the controller
 * tests drove the controller directly with the turn check absent. So the tests below are about the
 * *sequence* — "it moves on every one of its turns" — which is what the bug actually was, rather than
 * "it moved", which is all the old coverage could have asserted.
 */

import { describe, expect, it } from 'vitest';
import { OpponentGate, type OpponentHost } from '../../src/ui/turn.ts';
import { createMatch, applyAction, legalCells } from '../../src/core/match.ts';
import { createRng } from '../../src/core/rng.ts';
import { rollInstance } from '../../src/core/card.ts';
import { FIGURES } from '../../src/data/cards.ts';
import type { Action } from '../../src/core/match.ts';
import type { Card, GameState, Tier } from '../../src/core/types.ts';

function deck(seed: number, tier: Tier = 3): Card[] {
  const pool = FIGURES.filter((figure) => figure.tier === tier);
  const rng = createRng(seed);
  return Array.from({ length: 5 }, () => {
    const figure = pool[rng.int(pool.length)];
    if (figure === undefined) throw new Error(`no figure in tier ${tier}`);
    return rollInstance(figure, rng);
  });
}

/**
 * A host that records what it was asked to do and always succeeds.
 *
 * It plays a real move rather than forfeiting, so a match driven through the gate runs to the end
 * instead of ending on the computer's first turn.
 */
function host(): OpponentHost & { readonly submitted: Action[]; busy: boolean } {
  const submitted: Action[] = [];
  return {
    submitted,
    busy: false,
    decide: (state) => {
      if (state.phase === 'chooseBattle') {
        const next = state.pendingBattles[0];
        return next === undefined ? null : { t: 'chooseBattle', cell: next };
      }
      if (state.phase !== 'place') return null;
      const cell = legalCells(state)[0];
      return cell === undefined ? null : { t: 'place', cell, cardIndex: 0 };
    },
    submit: (action) => {
      submitted.push(action);
      return true;
    },
  };
}

describe('the latch', () => {
  it("acts on the computer's turn", () => {
    const gate = new OpponentGate();
    const h = host();
    const state = turn('ai');
    expect(gate.step(h, state, 'ai')).toBe(true);
    expect(h.submitted).toHaveLength(1);
    expect(gate.hasActed).toBe(true);
  });

  it('acts only once per turn, however many frames it is asked', () => {
    // The animation settles over several frames; without the latch the opponent would place five
    // cards in one turn.
    const gate = new OpponentGate();
    const h = host();
    const state = turn('ai');
    for (let frame = 0; frame < 60; frame++) {
      gate.step(h, state, 'ai');
    }
    expect(h.submitted).toHaveLength(1);
  });

  it('does nothing while the board is animating', () => {
    const gate = new OpponentGate();
    const h = host();
    h.busy = true;
    expect(gate.step(h, turn('ai'), 'ai')).toBe(false);
    expect(h.submitted).toHaveLength(0);
    expect(gate.hasActed).toBe(false);
  });

  it("does nothing when it is not the computer's turn", () => {
    const gate = new OpponentGate();
    const h = host();
    expect(gate.step(h, turn('player'), 'ai')).toBe(false);
    expect(h.submitted).toHaveLength(0);
  });

  it('does nothing once the match is over', () => {
    const gate = new OpponentGate();
    const h = host();
    const finished: GameState = { ...turn('ai'), phase: 'over' };
    expect(gate.step(h, finished, 'ai')).toBe(false);
    expect(h.submitted).toHaveLength(0);
  });

  it('releases when the turn changes hands', () => {
    const gate = new OpponentGate();
    const h = host();
    gate.step(h, turn('ai'), 'ai');
    expect(gate.hasActed).toBe(true);
    gate.step(h, turn('player'), 'ai');
    expect(gate.hasActed).toBe(false);
  });
});

describe('the regression this module exists for', () => {
  /**
   * Plays a whole match the way `main.ts` does: the gate drives the computer, and the "player"
   * only ever acts on their own turn. The computer's submissions are applied, so the state the
   * gate sees is real.
   */
  function playThroughGate(seed: number): { computerTurns: number; final: GameState } {
    let state: GameState = createMatch({
      seed,
      playerDeck: deck(seed * 2 + 1),
      aiDeck: deck(seed * 2 + 2),
    });
    let computerTurns = 0;

    const h: OpponentHost = {
      busy: false,
      decide: (current) => {
        if (current.phase === 'chooseBattle') {
          const next = current.pendingBattles[0];
          return next === undefined ? null : { t: 'chooseBattle', cell: next };
        }
        if (current.phase !== 'place') return null;
        const cell = legalCells(current)[0];
        return cell === undefined ? null : { t: 'place', cell, cardIndex: 0 };
      },
      submit: (action) => {
        state = applyAction(state, action).state;
        return true;
      },
    };

    const gate = new OpponentGate();
    // One action per frame, and the gate is asked every frame — which is exactly what `main.ts`
    // does. Skipping the gate on the player's frames is not a shortcut, it is a different program:
    // the latch releases when the gate *observes* the turn change hands, so a driver that never
    // calls it on the player's turn holds the latch forever and deadlocks. That is exactly the bug,
    // which is why the driver has to look like the real loop.
    for (let frame = 0; frame < 5000 && state.phase !== 'over'; frame++) {
      if (gate.step(h, state, 'ai')) {
        computerTurns++;
        continue;
      }
      const next = resolve(state);
      if (next === null) break;
      state = next;
    }
    return { computerTurns, final: state };
  }

  it('acts on every one of its turns, not just the first', () => {
    // The bug: the latch was set once and only cleared by `newController`, so the opponent made
    // one move per match. Ten placements alternate, so it gets five turns.
    const { computerTurns, final } = playThroughGate(1);
    expect(final.phase).toBe('over');
    expect(computerTurns).toBe(5);
  });

  it('still moves when the computer opens, and when it is the one contesting a battle', () => {
    const { computerTurns, final } = playThroughGate(2);
    expect(final.phase).toBe('over');
    expect(computerTurns).toBeGreaterThanOrEqual(4);
  });

  it('handles several seeds, because the failure depended on the board', () => {
    for (let seed = 3; seed < 12; seed++) {
      const { computerTurns, final } = playThroughGate(seed);
      expect(final.phase, `seed ${seed}`).toBe('over');
      expect(computerTurns, `seed ${seed}`).toBe(5);
    }
  });

  it('forgets the latch when told to reset', () => {
    const gate = new OpponentGate();
    const h = host();
    gate.step(h, turn('ai'), 'ai');
    expect(gate.hasActed).toBe(true);
    gate.reset();
    expect(gate.hasActed).toBe(false);
    expect(gate.step(h, turn('ai'), 'ai')).toBe(true);
  });

  it('does not latch on when the opponent has nothing to do', () => {
    const gate = new OpponentGate();
    const submitted: Action[] = [];
    const idle: OpponentHost = {
      busy: false,
      decide: () => null,
      submit: (action) => {
        submitted.push(action);
        return true;
      },
    };
    expect(gate.step(idle, turn('ai'), 'ai')).toBe(false);
    expect(gate.hasActed).toBe(true);
    expect(submitted).toHaveLength(0);
  });
});

/** Answers whatever the match is asking for, so the loop body can stay a loop. */
function resolve(state: GameState): GameState | null {
  if (state.phase === 'chooseBattle') {
    const next = state.pendingBattles[0];
    return next === undefined ? null : applyAction(state, { t: 'chooseBattle', cell: next }).state;
  }
  if (state.phase !== 'place') return null;
  const cell = legalCells(state)[0];
  if (cell === undefined) return null;
  const step = applyAction(state, { t: 'place', cell, cardIndex: 0 });
  return step.events.some((event) => event.t === 'illegal') ? null : step.state;
}

/** A state whose turn is `owner`, without playing a whole match to get one. */
function turn(owner: 'player' | 'ai'): GameState {
  const state = createMatch({ seed: 7, playerDeck: deck(7), aiDeck: deck(8) });
  return state.turn === owner ? state : { ...state, turn: owner };
}
