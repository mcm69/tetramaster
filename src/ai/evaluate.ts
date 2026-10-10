/**
 * Position evaluation for the opponent (PLAN.md §6, Stage 8).
 *
 * Scores a candidate placement from the placing player's point of view. The model follows the
 * strategies that actually decide Tetra Master, in roughly the order they matter:
 *
 *  1. **Free captures.** An arrow into an enemy card that does not point back is a guaranteed
 *     capture — the single most reliable thing on the board.
 *  2. **Battles, weighted by odds.** An arrow into a card that points back is a fight, worth its
 *     probability of being won. Never its outcome: the AI is not allowed to see the rolls (§5.2).
 *  3. **Risk.** Once placed, *our* card is exposed to every enemy arrow aimed at it. This is the
 *     half of the board players forget, and it is why a strong card in a corner beats a stronger
 *     card in the open.
 *  4. **Combos.** A card we take down drags its own neighbours with it (§1.7), so an enemy card
 *     pointing at other enemy cards is worth more than its face value.
 *  5. **Quarantine.** A card the enemy cannot reach at all cannot be taken back. Expert play treats
 *     this as the difference between a win and a draw.
 *
 * Every term is a plain weight so personalities can disagree about what matters, which is how the
 * NPCs end up playing differently without any of them needing different logic.
 */

import { DIRECTIONS, arrowCount, neighbor, pointsAt } from '../core/direction.ts';
import { resolveStats, winProbability } from '../core/battle.ts';
import type { BoardCard, Card, Cell, GameState, Owner } from '../core/types.ts';

/** How much each consideration contributes. Personalities override these. */
export interface Weights {
  readonly capture: number;
  readonly battle: number;
  readonly risk: number;
  readonly corner: number;
  readonly combo: number;
  readonly quarantine: number;
  readonly lowDefence: number;
}

export const DEFAULT_WEIGHTS: Weights = {
  // Captures dominate: a card you never take is a match you cannot win, so the avoidance terms
  // are deliberately kept smaller than the offensive ones.
  capture: 34,
  battle: 30,
  risk: 5,
  corner: 6,
  combo: 12,
  quarantine: 14,
  lowDefence: 6,
};

/** The named contributions, kept so a personality can be explained and tested. */
export interface Evaluation {
  readonly score: number;
  readonly captures: number;
  readonly battleValue: number;
  readonly risk: number;
  readonly cornerBonus: number;
  readonly comboBonus: number;
  readonly quarantineBonus: number;
  readonly defencePenalty: number;
}

/** Midpoint of a stat index's interval: the honest stand-in before a roll exists. */
function expectedBase(index: number): number {
  return index * 16 + 8;
}

/** True when the card at `cell` is an enemy card that would answer a placement with a battle. */
function isEnemy(state: GameState, cell: Cell, owner: Owner): boolean {
  const card = state.board[cell];
  return card !== null && card !== undefined && card.owner !== owner;
}

/**
 * How exposed a square is: the number of neighbours where the enemy could *place* a card next turn
 * and point it at us.
 *
 * This deliberately does **not** count enemy arrows already aimed at the cell. Per §1.4 only the
 * card just placed attacks, so an arrow on a card that is already sitting there does nothing — it is
 * not a threat at all. An earlier version of this file counted exactly that and the AI became
 * desperately passive, fleeing neighbours it could never be attacked through and so never capturing
 * anything. Being wrong here costs far more than being imprecise.
 */
function playableNeighbours(state: GameState, cell: Cell): number {
  let count = 0;
  for (const dir of DIRECTIONS) {
    const target = neighbor(cell, dir);
    if (target === null) continue; // off-grid: nothing can ever be placed there
    if (state.blocked[target]) continue; // blocked cells can never hold a card
    if (state.board[target]) continue; // already occupied, so no placement possible
    count++;
  }
  return count;
}

/** Neighbouring enemy cells, with the direction from `cell` to each. */
function enemyNeighbours(
  state: GameState,
  cell: Cell,
  owner: Owner,
): { cell: Cell; card: BoardCard }[] {
  const found: { cell: Cell; card: BoardCard }[] = [];
  for (const dir of DIRECTIONS) {
    const target = neighbor(cell, dir);
    if (target === null) continue;
    const card = state.board[target];
    if (card && card.owner !== owner) found.push({ cell: target, card });
  }
  return found;
}

/**
 * Scores playing `card` at `cell` for `owner`, given the current board.
 *
 * Pure: reads state, returns numbers. It never mutates anything and never draws randomness — the
 * AI must not be able to see a future roll even by accident.
 */
export function evaluatePlacement(
  state: GameState,
  cell: Cell,
  card: Card,
  owner: Owner,
  weights: Weights = DEFAULT_WEIGHTS,
): Evaluation {
  const enemies = enemyNeighbours(state, cell, owner);

  // 1 & 2. What this placement wins outright.
  let captures = 0;
  let battleValue = 0;
  const comboTargets = new Set<Cell>();

  for (const { cell: target, card: enemy } of enemies) {
    if (pointsAt(enemy.arrows, target, cell)) {
      // A battle. Value it by the odds, not the outcome.
      const pick = resolveStats(card, enemy);
      const odds = winProbability(expectedBase(pick.atkIndex), expectedBase(pick.defIndex));
      battleValue += odds;
      // A loser's arrows still combo, so even a likely loss drags its neighbours across.
      for (const dir of DIRECTIONS) {
        if (((enemy.arrows >> dir) & 1) === 0) continue;
        const onward = neighbor(target, dir);
        if (onward !== null && isEnemy(state, onward, owner)) comboTargets.add(onward);
      }
    } else {
      // A free capture — the most reliable value on the board.
      captures += 1;
      for (const dir of DIRECTIONS) {
        if (((enemy.arrows >> dir) & 1) === 0) continue;
        const onward = neighbor(target, dir);
        if (onward !== null && isEnemy(state, onward, owner)) comboTargets.add(onward);
      }
    }
  }

  // 4. Combos, minus the card we already counted as a direct target.
  const direct = new Set(enemies.map((e) => e.cell));
  let comboBonus = 0;
  for (const target of comboTargets) {
    if (!direct.has(target)) comboBonus += 1;
  }

  // 3. Risk: how many squares the enemy could attack from on the following turn. A heavily armed
  // card is more likely to point back at whatever is next to it.
  const exposure = playableNeighbours(state, cell);
  const risk = exposure * (1 + arrowCount(card.arrows) / 8);

  // 3b. A weak defence facing an open square is the classic way to lose a card you just won.
  // The lower of the two defences is the one that matters, since the attacker's type is unknown.
  const weakestDefence = Math.min(card.pdef, card.mdef);
  const defencePenalty = exposure * (16 - weakestDefence);

  // 5. Corners are worth having: three sides face the board edge, where nothing can attack from.
  const openSides = DIRECTIONS.filter((dir) => neighbor(cell, dir) === null).length;
  const cornerBonus = openSides * (weights.corner / 3);

  // 6. Quarantine: if the enemy has nowhere to stand that reaches this square, the card is safe.
  const quarantineBonus = exposure === 0 ? weights.quarantine : 0;

  const score =
    captures * weights.capture +
    battleValue * weights.battle +
    comboBonus * weights.combo +
    cornerBonus +
    quarantineBonus -
    risk * weights.risk -
    defencePenalty * (weights.lowDefence / 16);

  return {
    score,
    captures,
    battleValue,
    risk,
    cornerBonus,
    comboBonus,
    quarantineBonus,
    defencePenalty,
  };
}

/** The stat a card would defend with against a given attacker type, for the tooltip. */
export function relevantDefence(card: Card, againstType: BoardCard['type']): number {
  switch (againstType) {
    case 'P':
      return card.pdef;
    case 'M':
      return card.mdef;
    case 'X':
    case 'A':
      return Math.min(card.pdef, card.mdef);
    default:
      return Math.min(card.pdef, card.mdef);
  }
}

/** A short human-readable reason for a move, for the debug overlay. */
export function explain(evaluation: Evaluation): string {
  const parts: string[] = [];
  if (evaluation.captures > 0) parts.push(`${evaluation.captures} free capture(s)`);
  if (evaluation.battleValue > 0) parts.push(`${(evaluation.battleValue * 100).toFixed(0)}% odds`);
  if (evaluation.comboBonus > 0) parts.push(`${evaluation.comboBonus} combo`);
  if (evaluation.quarantineBonus > 0) parts.push('quarantined');
  if (evaluation.risk > 0) parts.push(`${evaluation.risk.toFixed(1)} risk`);
  return parts.length > 0 ? parts.join(', ') : 'positional play';
}

export { arrowCount };
