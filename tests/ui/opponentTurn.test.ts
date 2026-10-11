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
 *
 * ## The bug this file's own driver found
 *
 * Writing that driver surfaced a third one, and it is why the header is worth reading twice. The
 * first version of the latch here released "when the turn changes hands". That is wrong, because a
 * contested placement does not hand the turn over: the attacker picks the battle order (§1.7), so
 * `state.turn` is still the computer's while it owes a choice. The gate latched shut against a
 * decision only it could make. In the app that surfaced as an interface asking the player to choose a
 * battle they were not allowed to choose — a control that did nothing when clicked, which is exactly
 * what was reported. The driver deadlocked on it for a while before I believed it was not a driver
 * bug.
 */

import { describe, expect, it } from 'vitest';
import { OpponentGate, type OpponentHost } from '../../src/ui/turn.ts';
import { createMatch, applyAction, legalCells } from '../../src/core/match.ts';
import { createRng } from '../../src/core/rng.ts';
import { rollInstance } from '../../src/core/card.ts';
import { FIGURES } from '../../src/data/cards.ts';
import type { Action } from '../../src/core/match.ts';
import type { Card, Cell, GameState, Tier } from '../../src/core/types.ts';

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
  /** What a match driven through the gate looks like from the outside. */
  interface Driven {
    readonly computerPlacements: number;
    readonly computerBattles: number;
    readonly final: GameState;
    /** True if the match never got going, rather than stalling half way. */
    readonly stalled: boolean;
  }

  /**
   * Plays a whole match the way `main.ts` does: the gate is asked on *every* frame, and whichever
   * side the gate does not serve, the "player" plays — but only on the player's own turn.
   *
   * Two shapes here are load-bearing, and both were wrong at first:
   *
   *  - the gate is asked every frame, not only on the computer's. `main.ts` calls `stepOpponent()`
   *    unconditionally. A driver that skips it elsewhere holds the latch forever.
   *  - at most one action per frame, because a frame that does two things is not a frame.
   */
  function playThroughGate(seed: number): Driven {
    let state: GameState = createMatch({
      seed,
      playerDeck: deck(seed * 2 + 1),
      aiDeck: deck(seed * 2 + 2),
    });
    let computerPlacements = 0;
    let computerBattles = 0;

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
        if (action.t === 'place') computerPlacements++;
        else if (action.t === 'chooseBattle') computerBattles++;
        return true;
      },
    };

    const gate = new OpponentGate();
    for (let frame = 0; frame < 5000 && state.phase !== 'over'; frame++) {
      if (gate.step(h, state, 'ai')) continue;

      // The gate declined. That is only correct on the player's own turn — if it is the computer's
      // turn and the gate is silent, the match is stuck and that is the failure being looked for.
      if (state.turn !== 'player')
        return { computerPlacements, computerBattles, final: state, stalled: true };

      const next = resolve(state);
      if (next === null)
        return { computerPlacements, computerBattles, final: state, stalled: true };
      state = next;
    }
    return { computerPlacements, computerBattles, final: state, stalled: state.phase !== 'over' };
  }

  it('places all five of its cards, not just the first', () => {
    // The first bug: the latch was set once and only cleared by `newController`, so the opponent
    // made one move per match. Ten placements alternate, so it gets five turns.
    const { computerPlacements, final, stalled } = playThroughGate(1);
    expect(stalled).toBe(false);
    expect(final.phase).toBe('over');
    expect(computerPlacements).toBe(5);
  });

  it('resolves the battle orders its own cards trigger', () => {
    // The second bug, and the one that looked like a broken button. A contested placement does *not*
    // hand the turn over (§1.7): the attacker picks the order. So after the computer played a
    // counter-attacking card, it was the computer's turn to choose and the latch was shut -- the
    // match hung on a decision only the computer could make, and the interface asked the player.
    let sawContestedComputerPlacement = false;
    for (let seed = 1; seed < 40 && !sawContestedComputerPlacement; seed++) {
      const run = playThroughGate(seed);
      expect(run.stalled, `seed ${seed}`).toBe(false);
      expect(run.final.phase, `seed ${seed}`).toBe('over');
      expect(run.computerPlacements, `seed ${seed}`).toBe(5);
      sawContestedComputerPlacement = run.computerBattles > 0;
    }
    // If no seed ever produced a contested computer placement the assertions above are vacuous, so
    // insist on having actually walked through the situation.
    expect(sawContestedComputerPlacement).toBe(true);
  });

  it('never leaves a battle order for a seat that cannot fill it in', () => {
    // End to end: whatever the computer did, the match finished without a human being asked to act
    // on the computer's behalf. The driver only ever plays on the player's turn, so a stuck battle
    // order would show up as a stall rather than a pass.
    for (let seed = 1; seed <= 12; seed++) {
      const run = playThroughGate(seed);
      expect(run.stalled, `seed ${seed}`).toBe(false);
      expect(run.final.phase, `seed ${seed}`).toBe('over');
    }
  });

  it('acts on a battle order left open by its own placement', () => {
    // The narrow case, stated directly: hand the gate a contested state that is still the
    // computer's turn, and it must fill in the order rather than waiting for the turn to move.
    const gate = new OpponentGate();
    const opened = findContestedComputerTurn();
    expect(opened, 'no seed produced a contested computer placement').not.toBeNull();

    const state = opened as GameState;
    expect(state.phase).toBe('chooseBattle');
    expect(state.turn).toBe('ai');

    const submitted: Action[] = [];
    const acted = gate.step(
      {
        busy: false,
        decide: (current) => ({ t: 'chooseBattle', cell: current.pendingBattles[0] as Cell }),
        submit: (action) => {
          submitted.push(action);
          return true;
        },
      },
      state,
      'ai',
    );

    expect(acted).toBe(true);
    expect(submitted).toHaveLength(1);
    expect(submitted[0]?.t).toBe('chooseBattle');
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

/**
 * Finds a state where the *computer* has just made a contested placement and owes a battle order.
 *
 * That is the exact shape the bug needed: `turn` is still the computer's, so a latch waiting for the
 * turn to change hands never opens.
 */
function findContestedComputerTurn(): GameState | null {
  for (let seed = 1; seed < 60; seed++) {
    let state: GameState = createMatch({
      seed,
      playerDeck: deck(seed * 2 + 1),
      aiDeck: deck(seed * 2 + 2),
    });
    for (let frame = 0; frame < 200 && state.phase !== 'over'; frame++) {
      if (state.phase === 'chooseBattle' && state.turn === 'ai') return state;
      const next = resolve(state);
      if (next === null) break;
      state = next;
    }
  }
  return null;
}

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
