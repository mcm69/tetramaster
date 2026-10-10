/**
 * The placement cascade — the heart of the game (PLAN.md §1.4, §1.5, §1.7, pseudocode in §5.3).
 *
 * The one rule everything else hangs off: **only the card that was just placed attacks.** Every
 * other card on the board is defensive and fires nothing on its own (§1.4). That is the detail
 * players most often get wrong, so it is stated at the top of this file and asserted directly.
 *
 * A cascade, in order:
 *
 *  1. **Initial scan.** Each arrow of the placed card pointing at an opponent card either takes it
 *     down immediately (the target has no arrow pointing back, §1.5) or queues a battle.
 *  2. **Battles.** Each queued battle is fought in order. Winning flips the defender, fires a
 *     **combo** from the loser's arrows (no battle, ever), and then re-scans the placed card's
 *     remaining arrows — queueing further battles or taking down what does not point back.
 *  3. **Losing ends everything.** If the placed card loses, it flips to the opponent, fires a combo
 *     from its own arrows **in the winner's favour**, and the chain stops (§1.7.4).
 *
 * Two invariants, both asserted in `tests/core/resolution.test.ts`:
 *
 *  - **Combos never recurse.** A card flipped by a combo never fires its own arrows.
 *  - **Battles only originate from the placed card.** Once it is captured, the chain is over.
 *
 * This module is pure: it takes a state and returns a new one plus an event log. It never mutates
 * the input board, and it draws no randomness of its own — battles are decided by an injected
 * {@link BattleResolver}, which Stage 4 replaces with the real two-roll implementation.
 */

import { DIRECTIONS, hasArrow, neighbor, opposite } from './direction';
import { resolveStats, rngResolver, winProbability } from './battle';
import type {
  BattleResolver,
  BoardCard,
  Cell,
  Direction,
  GameEvent,
  GameState,
  Owner,
} from './types';
import type { Rng } from './rng';

/**
 * The Stage 3 stub: the placed card always loses. Replaced by the real roll in Stage 4.
 *
 * Losing is the conservative default — it makes cascades terminate immediately, so a bug in the
 * battle loop shows up as "nothing happened" rather than as an infinite loop.
 */
export const defaultResolver: BattleResolver = () => ({
  attackerWins: false,
  atkBase: 0,
  atkRoll: 0,
  atkActual: 0,
  defBase: 0,
  defRoll: 0,
  defActual: 0,
  probability: 0,
});

export interface ResolveOptions {
  /**
   * Decides battles. Defaults to {@link defaultResolver}. Stage 4 wires the real RNG-backed one;
   * tests override it to force a branch.
   */
  readonly battle?: BattleResolver;
  /** An RNG to draw battles from, when no explicit resolver is given. */
  readonly rng?: Rng;
}

export interface ResolveResult {
  readonly state: GameState;
  readonly events: GameEvent[];
}

/** The other player. */
function opponentOf(owner: Owner): Owner {
  return owner === 'player' ? 'ai' : 'player';
}

/**
 * True when `defender` has an arrow pointing back at `attackerCell` — i.e. a battle will occur
 * rather than a free takedown (§1.5).
 */
/**
 * True when the card at `target.cell` has an arrow pointing back at the source card, i.e. a
 * battle will occur rather than a free takedown (§1.5).
 *
 * `target.dir` is the direction from the source to the target, so the answer is simply whether the
 * defender holds the opposite arrow. No coordinate arithmetic needed.
 */
function pointsBack(board: readonly (BoardCard | null)[], target: Target): boolean {
  // `target` came from targetsOf, which only yields occupied cells, so the card is always there.
  const defender = board[target.cell] as BoardCard;
  return hasArrow(defender.arrows, opposite(target.dir));
}

/** An opponent card adjacent to `from`, and the direction that reaches it. */
interface Target {
  readonly cell: Cell;
  /** The direction from the source card to this target. */
  readonly dir: Direction;
}

/**
 * Opponent cards this card can act on: adjacent, on the board, not blocked, and not our own.
 * Each result carries the direction that reaches it, so callers never need to look it up again.
 */
function targetsOf(state: GameState, cell: Cell, owner: Owner): Target[] {
  const source = state.board[cell];
  if (!source) return []; // empty cell: nothing to attack from
  const found: Target[] = [];
  for (const dir of DIRECTIONS) {
    if (!hasArrow(source.arrows, dir)) continue;
    const target = neighbor(cell, dir);
    if (target === null) continue; // off-grid
    if (state.blocked[target]) continue; // blocked cells are always empty anyway
    const occupant = state.board[target];
    if (!occupant) continue; // empty
    if (occupant.owner === owner) continue; // our own card
    found.push({ cell: target, dir });
  }
  return found;
}

/** Flips `cell` to `owner`, returning a new board. Never mutates the input. */
function flip(
  board: readonly (BoardCard | null)[],
  cell: Cell,
  owner: Owner,
): (BoardCard | null)[] {
  const next = board.slice();
  // Every call site passes an occupied cell — either the placed card or a target from targetsOf.
  next[cell] = { ...(next[cell] as BoardCard), owner };
  return next;
}

/**
 * Resolves the placement at `cell`.
 *
 * `state` must already have the played card in place with its owner set; this function only works
 * out what that placement captures.
 */
export function resolvePlacement(
  state: GameState,
  cell: Cell,
  options: ResolveOptions = {},
): ResolveResult {
  const battle = options.battle ?? (options.rng ? rngResolver(options.rng) : defaultResolver);
  const placed = state.board[cell];
  if (!placed) {
    return { state, events: [] };
  }

  const owner = placed.owner;
  const events: GameEvent[] = [];
  let board = state.board.slice();

  // 1. Initial scan — takedowns resolve at once, pointing-back targets queue a battle (§1.5).
  const pending: Cell[] = [];
  for (const target of targetsOf(state, cell, owner)) {
    if (pointsBack(state.board, target)) {
      pending.push(target.cell);
    } else {
      board = flip(board, target.cell, owner);
      events.push({ t: 'takedown', cell: target.cell, owner, from: cell });
    }
  }

  // 2. Battles, in queue order. A player may choose this order later (§1.7); Stage 4 wires the
  //    chooser in, and the AI scores it in Stage 8.
  // Safe: only ever re-populated by pushes inside the loop, so shift cannot come back empty.
  for (let next = pending.shift(); next !== undefined; next = pending.shift()) {
    const defenderCell = next;
    // A queued battle is skipped if its defender was already flipped by an earlier combo (§1.7).
    const defender = board[defenderCell];
    if (!defender || defender.owner === owner) continue;

    // The placed card is still ours here: it only ever flips in the loss branch, which breaks.
    const current = board[cell] as BoardCard;
    const pick = resolveStats(current, defender);
    const outcome = battle(current, defender);
    events.push({
      t: 'battle',
      attacker: cell,
      defender: defenderCell,
      atkIndex: pick.atkIndex,
      defIndex: pick.defIndex,
    });
    events.push({
      t: 'battle-roll',
      attacker: cell,
      defender: defenderCell,
      atkBase: outcome.atkBase,
      atkRoll: outcome.atkRoll,
      atkActual: outcome.atkActual,
      defBase: outcome.defBase,
      defRoll: outcome.defRoll,
      defActual: outcome.defActual,
      probability: outcome.probability,
      attackerWins: outcome.attackerWins,
    });

    if (outcome.attackerWins) {
      board = flip(board, defenderCell, owner);
      events.push({
        t: 'flip',
        cell: defenderCell,
        from: defender.owner,
        to: owner,
        reason: 'battle',
      });

      // Combo from the loser: every card its arrows reach flips, with no battle, even if they
      // point back. Combos never recurse, so we do not scan the cards we just flipped (§1.7).
      for (const target of targetsOf({ ...state, board }, defenderCell, owner)) {
        board = flip(board, target.cell, owner);
        events.push({ t: 'combo', cell: target.cell, owner, from: defenderCell });
      }

      // The placed card keeps attacking with its remaining arrows (§1.7.3). Every opponent card
      // still adjacent must point back — the initial scan already took down the ones that did
      // not — so this can only ever queue further battles, never take anything down.
      for (const target of targetsOf({ ...state, board }, cell, owner)) {
        if (pointsBack(board, target)) pending.push(target.cell);
      }
    } else {
      // The placed card lost: it flips, fires a combo from its own arrows, and the chain ends.
      // The combo belongs to the *winner* now, so its targets are the cards the winner does not
      // already own — computed against `enemy`, not the owner we started with.
      const enemy = opponentOf(owner);
      board = flip(board, cell, enemy);
      events.push({ t: 'flip', cell, from: owner, to: enemy, reason: 'battle' });
      for (const target of targetsOf({ ...state, board }, cell, enemy)) {
        board = flip(board, target.cell, enemy);
        events.push({ t: 'combo', cell: target.cell, owner: enemy, from: cell });
      }
      break;
    }
  }

  const next: GameState = {
    ...state,
    board,
    pendingBattles: [],
    history: [...state.history, ...events],
  };
  return { state: next, events };
}

/**
 * Convenience for the UI: the probability the placed card beats each queued defender, without
 * running the cascade (§1.6). Stage 4 uses the real resolver's numbers; this is the pre-battle
 * estimate shown on hover.
 */
export function previewPendingBattles(
  state: GameState,
  cell: Cell,
): ReadonlyArray<{ cell: Cell; probability: number }> {
  const placed = state.board[cell];
  if (!placed) return [];
  return targetsOf(state, cell, placed.owner)
    .filter((target) => pointsBack(state.board, target))
    .flatMap((target) => {
      // targetsOf only yields occupied cells.
      const defender = state.board[target.cell] as BoardCard;
      const pick = resolveStats(placed, defender);
      // Midpoint of each interval is the honest estimate before the roll exists.
      const atkBase = pick.atkIndex * 16 + 8;
      const defBase = pick.defIndex * 16 + 8;
      return [{ cell: target.cell, probability: winProbability(atkBase, defBase) }];
    });
}

/** Re-exported so callers can describe a direction without importing direction.ts directly. */
export { opposite };
