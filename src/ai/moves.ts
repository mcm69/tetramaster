/**
 * Candidate moves for the opponent (PLAN.md §6, Stage 8).
 *
 * Enumerates every legal (cell, card) pair and every contested battle, and scores each with
 * `evaluatePlacement`. Purely a function of the state it is given.
 *
 * The one hard rule: **the AI never sees a roll.** It scores a battle by its probability, not its
 * outcome, and it never calls the match RNG. A test asserts that evaluating moves leaves
 * `state.rngState` untouched — if that ever changes, the AI is cheating.
 */

import { legalCells } from '../core/match.ts';
import { resolveStats, winProbability } from '../core/battle.ts';
import { evaluatePlacement, type Evaluation, type Weights } from './evaluate.ts';
import type { BoardCard, Card, Cell, GameState, Owner } from '../core/types.ts';

export interface PlacementMove {
  readonly kind: 'place';
  readonly cell: Cell;
  readonly cardIndex: number;
  readonly card: Card;
  readonly evaluation: Evaluation;
  readonly score: number;
}

export interface BattleMove {
  readonly kind: 'chooseBattle';
  readonly cell: Cell;
  readonly defender: BoardCard;
  /** 0-1 chance the attacking card wins this fight. */
  readonly probability: number;
  readonly score: number;
}

export type Move = PlacementMove | BattleMove;

/**
 * Every legal placement for `owner`, scored.
 *
 * `horizon` lets a weaker personality consider only the next move while a stronger one also counts
 * the value its own captures will expose.
 */
export function placementMoves(state: GameState, owner: Owner, weights: Weights): PlacementMove[] {
  const hand = state.players[owner].hand;
  const legal = legalCells(state);
  const moves: PlacementMove[] = [];

  for (const cell of legal) {
    for (let cardIndex = 0; cardIndex < hand.length; cardIndex++) {
      const card = hand[cardIndex];
      if (!card) continue;
      const evaluation = evaluatePlacement(state, cell, card, owner, weights);
      moves.push({ kind: 'place', cell, cardIndex, card, evaluation, score: evaluation.score });
    }
  }
  return moves;
}

/**
 * Every contested card, with the odds against it.
 *
 * §1.7 lets the player choose the order, so choosing well is a real decision: fight the card whose
 * loss costs you least, and whose win opens the most.
 */
export function battleMoves(state: GameState, owner: Owner, weights: Weights): BattleMove[] {
  if (state.phase !== 'chooseBattle') return [];
  const playedCell = state.pendingCell;
  if (playedCell === undefined) return [];
  const attacker = state.board[playedCell];
  if (!attacker) return [];

  const moves: BattleMove[] = [];
  for (const cell of state.pendingBattles) {
    const defender = state.board[cell];
    if (!defender) continue;
    const pick = resolveStats(attacker, defender);
    const probability = winProbability(pick.atkIndex * 16 + 8, pick.defIndex * 16 + 8);

    // Beyond the odds themselves: a defender whose loss drags two more cards across is worth
    // fighting even at mediocre odds, and a heavily armed one is dangerous to lose.
    let comboValue = 0;
    for (const dir of DIRECTIONS_OF) {
      if (((defender.arrows >> dir) & 1) === 0) continue;
      comboValue += countEnemyNeighbours(state, cell, dir, owner);
    }
    const armed = arrowCountOf(defender.arrows) / 8;

    moves.push({
      kind: 'chooseBattle',
      cell,
      defender,
      probability,
      score:
        probability * weights.battle +
        comboValue * weights.combo -
        armed * weights.risk -
        arrowCountOf(defender.arrows) * 0.5,
    });
  }
  return moves;
}

/** Every move available to `owner` right now, whatever phase the match is in. */
export function allMoves(state: GameState, owner: Owner, weights: Weights): Move[] {
  if (state.phase === 'chooseBattle') return battleMoves(state, owner, weights);
  if (state.phase === 'place') return placementMoves(state, owner, weights);
  return [];
}

/** The single best move by raw score. Ties are broken by call order, so callers add noise. */
export function bestMove(state: GameState, owner: Owner, weights: Weights): Move | null {
  const moves = allMoves(state, owner, weights);
  let best: Move | null = null;
  for (const move of moves) {
    if (best === null || move.score > best.score) best = move;
  }
  return best;
}

// Local imports kept at the bottom to avoid shadowing the public API above.
import {
  DIRECTIONS as DIRECTIONS_OF,
  arrowCount as arrowCountOf,
  neighbor,
} from '../core/direction.ts';
import type { Direction } from '../core/types.ts';

function countEnemyNeighbours(state: GameState, from: Cell, dir: Direction, owner: Owner): number {
  const target = neighbor(from, dir);
  if (target === null) return 0;
  const card = state.board[target];
  return card && card.owner !== owner ? 1 : 0;
}

/** How many candidate moves exist. Used by the balance sweep and by tests. */
export function moveCount(state: GameState, owner: Owner, weights: Weights): number {
  return allMoves(state, owner, weights).length;
}
