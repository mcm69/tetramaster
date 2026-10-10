/**
 * Who gets battle credit (PLAN.md §1.8).
 *
 * §1.8 rewards a card for winning "any single battle (offense or defense)". That parenthetical is
 * the whole content of the rule: a defender that holds its ground earns exactly as much as an
 * attacker that takes a square. Implementing it as "credit the attacker" is the natural mistake, and
 * it quietly rewards turtling and punishes aggression.
 *
 * These are built from synthetic histories rather than played out, because a real match where the
 * *player* wins a defensive battle is rare and seed-dependent — a test that only fires sometimes is
 * a test that proves nothing.
 */

import { describe, expect, it } from 'vitest';
import { analyseMatch } from '../../src/game/report.ts';
import { createMatch } from '../../src/core/match.ts';
import { acquireCard } from '../../src/game/progression.ts';
import { createRng } from '../../src/core/rng.ts';
import { figuresOfTier } from '../../src/data/cards.ts';
import type { Cell, GameEvent, OwnedCard, Tier } from '../../src/core/types.ts';

let uidCounter = 0;
function deck(count: number, tier: Tier = 2): OwnedCard[] {
  const rng = createRng(99);
  const pool = figuresOfTier(tier);
  return Array.from({ length: count }, () => acquireCard((uidCounter += 1), pool[0]!.id, rng));
}

/** A battle-roll event. The stat fields are irrelevant here; only the squares and the winner matter. */
function battleRoll(attacker: Cell, defender: Cell, attackerWins: boolean): GameEvent {
  return {
    t: 'battle-roll',
    attacker,
    defender,
    atkBase: 0,
    atkRoll: 0,
    atkActual: 0,
    defBase: 0,
    defRoll: 0,
    defActual: 0,
    probability: 0.5,
    attackerWins,
  };
}

/** The same battle with the other side winning — i.e. the player defended and held. */
const defenderWins = (attacker: Cell, defender: Cell): GameEvent =>
  battleRoll(attacker, defender, false);

const ATTACKER_WINS = (attacker: Cell = 1, defender: Cell = 5): GameEvent =>
  battleRoll(attacker, defender, true);

function place(cell: number, owner: 'player' | 'ai', cardIndex: number): GameEvent {
  return { t: 'place', cell: cell as Cell, owner, figureId: 0, cardIndex };
}

/** Wraps a synthetic history in a real, empty match state so the types line up. */
function stateWith(history: GameEvent[]) {
  const base = createMatch({
    seed: 1,
    playerDeck: deck(5),
    aiDeck: deck(5),
  });
  return { ...base, history };
}

describe('a battle the player won on offense', () => {
  it('[§1.8] credits the attacking card', () => {
    const cards = deck(5);
    // The player places at 1 (their first card, index 0); the opponent's card sits at 5.
    const state = stateWith([place(1, 'player', 0), place(5, 'ai', 0), ATTACKER_WINS()]);
    const report = analyseMatch(state, cards, 'player');
    expect(report.battleWins.get(cards[0]!.uid)).toBe(1);
  });

  it('does not credit the defender', () => {
    const cards = deck(5);
    const state = stateWith([place(1, 'player', 0), place(5, 'ai', 0), ATTACKER_WINS()]);
    expect([...analyseMatch(state, cards, 'player').battleWins.values()]).toEqual([1]);
  });
});

describe('a battle the player won on defense', () => {
  it('[§1.8] credits the defending card', () => {
    const cards = deck(5);
    // Our card is at 5 and holds; the opponent attacks from 1.
    const state = stateWith([place(5, 'player', 0), place(1, 'ai', 0), defenderWins(1, 5)]);
    expect(analyseMatch(state, cards, 'player').battleWins.get(cards[0]!.uid)).toBe(1);
  });

  it('[§1.8] is credited exactly like an attacking win', () => {
    const cards = deck(5);
    const attacking = analyseMatch(
      stateWith([place(1, 'player', 0), place(5, 'ai', 0), ATTACKER_WINS()]),
      cards,
      'player',
    );
    const defending = analyseMatch(
      stateWith([place(5, 'player', 0), place(1, 'ai', 0), defenderWins(1, 5)]),
      cards,
      'player',
    );
    expect(attacking.battleWins.get(cards[0]!.uid)).toBe(defending.battleWins.get(cards[0]!.uid));
  });
});

describe('a battle the player lost', () => {
  it('[§1.8] credits nobody when the player attacked and lost', () => {
    const cards = deck(5);
    const state = stateWith([place(1, 'player', 0), place(5, 'ai', 0), defenderWins(1, 5)]);
    expect(analyseMatch(state, cards, 'player').battleWins.size).toBe(0);
  });

  it('[§1.8] credits nobody when the player defended and lost', () => {
    const cards = deck(5);
    const state = stateWith([place(5, 'player', 0), place(1, 'ai', 0), ATTACKER_WINS()]);
    expect(analyseMatch(state, cards, 'player').battleWins.size).toBe(0);
  });

  it('credits nobody when the opponent won the battle outright', () => {
    const cards = deck(5);
    const state = stateWith([place(1, 'ai', 0), place(5, 'ai', 1), ATTACKER_WINS(1, 5)]);
    expect(analyseMatch(state, cards, 'player').battleWins.size).toBe(0);
  });
});

describe('repeated and separate battles', () => {
  it('[§1.8] accumulates credit across several battles the same card won', () => {
    const cards = deck(5);
    const state = stateWith([
      place(5, 'player', 0),
      place(1, 'ai', 0),
      defenderWins(1, 5),
      place(9, 'ai', 0),
      defenderWins(9, 5),
    ]);
    expect(analyseMatch(state, cards, 'player').battleWins.get(cards[0]!.uid)).toBe(2);
  });

  it('[§1.8] counts one roll per battle, so four wins means four chances to evolve', () => {
    const cards = deck(5);
    const history: GameEvent[] = [place(5, 'player', 0), place(1, 'ai', 0)];
    for (const attacker of [9, 13, 6, 10] as Cell[]) {
      history.push(defenderWins(attacker, 5));
    }
    expect(analyseMatch(stateWith(history), cards, 'player').battleWins.get(cards[0]!.uid)).toBe(4);
  });

  it('stops crediting a card once it has left the board', () => {
    // The square is gone, so the replay no longer knows what is standing there. §1.8 does not
    // revoke credit already earned, but it cannot invent new credit either.
    const cards = deck(5);
    const state = stateWith([
      place(5, 'player', 0),
      place(1, 'ai', 0),
      defenderWins(1, 5),
      { t: 'flip', cell: 5, from: 'player', to: 'ai', reason: 'arrow' },
      defenderWins(1, 5),
    ]);
    expect(analyseMatch(state, cards, 'player').battleWins.get(cards[0]!.uid)).toBe(1);
  });

  it('credits the card that owns the square, not the one placed first', () => {
    const cards = deck(5);
    // Both placements use cardIndex 0, because the hand shrinks: the first takes deck slot 0 and
    // the second takes whatever slides into slot 0, which is deck slot 1.
    const state = stateWith([
      place(0, 'player', 0),
      place(4, 'player', 0),
      place(1, 'ai', 0),
      defenderWins(1, 4),
    ]);
    const report = analyseMatch(state, cards, 'player');
    expect(report.battleWins.get(cards[1]!.uid)).toBe(1);
    expect(report.battleWins.has(cards[0]!.uid)).toBe(false);
  });
});
