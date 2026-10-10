/**
 * Board fixtures for the resolution engine (PLAN.md §6, Stage 3).
 *
 * Scenarios live in `resolution.test.ts` next to the expectations, because those expectations are
 * derived **by hand** from §1.4/§1.5/§1.7 and must stay visibly separate from the engine that
 * produces them. This file only provides the vocabulary for writing a board readably.
 *
 * Board layout used throughout (row-major, 0-15):
 *
 *      0  1  2  3
 *      4  5  6  7
 *      8  9 10 11
 *     12 13 14 15
 */

import { CELLS } from '../src/core/constants';
import { maskFrom } from '../src/core/card';
import type {
  BattleOutcome,
  BattleResolver,
  BoardCard,
  Card,
  CardType,
  Cell,
  Direction,
  GameEvent,
  GameState,
  Owner,
} from '../src/core/types';

/** Direction names mapped to their indices, so scenarios read `arrows('N', 'SE')`. */
export const DIRS = {
  N: 0,
  NE: 1,
  E: 2,
  SE: 3,
  S: 4,
  SW: 5,
  W: 6,
  NW: 7,
} as const satisfies Record<string, Direction>;

export type DirName = keyof typeof DIRS;

/** Builds an arrow mask from direction names. */
export function arrows(...dirs: DirName[]): number {
  return maskFrom(dirs.map((name) => DIRS[name]));
}

/** A card already on the board. `arrows` lists the directions it points in. */
export interface BoardPiece {
  readonly owner: Owner;
  readonly arrows: DirName[];
  readonly atk?: number;
  readonly type?: CardType;
  readonly pdef?: number;
  readonly mdef?: number;
}

/** A board under construction. `pieces` may be omitted for an empty board. */
export interface Scene {
  /** Cards already on the board, by cell. */
  readonly pieces?: Readonly<Partial<Record<Cell, BoardPiece>>>;
  /** Cells that are blocked — unplayable, and always empty. */
  readonly blocked?: readonly Cell[];
  /** Where the current owner just played. */
  readonly play: Cell;
  /** Owner of the played card. Defaults to 'player'. */
  readonly owner?: Owner;
  readonly playedArrows?: DirName[];
  readonly playedStats?: { atk?: number; type?: CardType; pdef?: number; mdef?: number };
}

function toCard(p: BoardPiece): BoardCard {
  return {
    owner: p.owner,
    arrows: p.arrows.length > 0 ? arrows(...p.arrows) : 0,
    atk: p.atk ?? 5,
    type: p.type ?? 'P',
    pdef: p.pdef ?? 5,
    mdef: p.mdef ?? 5,
    figureId: 0,
  };
}

/** Builds a GameState from a scene, with the played card already in place. */
export function buildState(scene: Scene): GameState {
  const board: (BoardCard | null)[] = new Array<BoardCard | null>(CELLS).fill(null);
  for (const [cell, p] of Object.entries(scene.pieces ?? {})) {
    board[Number(cell) as Cell] = toCard(p);
  }
  const blocked = new Array<boolean>(CELLS).fill(false);
  for (const cell of scene.blocked ?? []) blocked[cell] = true;

  const owner = scene.owner ?? 'player';
  board[scene.play] = {
    owner,
    arrows: scene.playedArrows ? arrows(...scene.playedArrows) : 0,
    atk: scene.playedStats?.atk ?? 7,
    type: scene.playedStats?.type ?? 'P',
    pdef: scene.playedStats?.pdef ?? 5,
    mdef: scene.playedStats?.mdef ?? 5,
    figureId: 0,
  };

  return {
    seed: 1,
    rngState: 1,
    board,
    blocked,
    players: {
      player: { deck: [], hand: [] },
      ai: { deck: [], hand: [] },
    },
    turn: owner,
    phase: 'place',
    pendingBattles: [],
    history: [],
    result: null,
  };
}

/** Cells owned by `owner` after resolution, ascending, for stable assertions. */
export function ownedBy(state: GameState, owner: Owner): Cell[] {
  const cells: Cell[] = [];
  state.board.forEach((card, index) => {
    if (card && card.owner === owner) cells.push(index as Cell);
  });
  return cells.sort((a, b) => a - b);
}

/** The card at a cell, or null. */
export function cardAt(state: GameState, cell: Cell): BoardCard | null {
  return state.board[cell] ?? null;
}

/** Events that carry a `cell` — the ones a flip assertion cares about. */
type CellEvent = Extract<GameEvent, { cell: Cell }>;

/**
 * The cells of every event of a given kind, ascending. Deliberately not generic over the event
 * kind — the return type does not depend on it, and a phantom type parameter is noise.
 */
export function cellsOfEvent(events: readonly GameEvent[], kind: CellEvent['t']): Cell[] {
  return events
    .filter((e): e is CellEvent => e.t === kind)
    .map((e) => e.cell)
    .sort((a, b) => a - b);
}

// ── Deterministic battle outcomes ──────────────────────────────────────────────────────────
// Stage 3 stubs the battle so the cascade's *shape* can be tested without the RNG. Stage 4
// replaces the default resolver with the real two-roll implementation.

function outcome(attackerWins: boolean): BattleOutcome {
  return {
    attackerWins,
    atkBase: 50,
    atkRoll: 0,
    atkActual: 50,
    defBase: 7,
    defRoll: 0,
    defActual: 7,
    probability: attackerWins ? 0.9 : 0.1,
  };
}

/** The placed card always wins — drives the "chain continues" branch of §1.7. */
export const attackerAlwaysWins = (): BattleOutcome => outcome(true);

/** The placed card always loses — drives the "placed card captured, chain ends" branch. */
export const attackerAlwaysLoses = (): BattleOutcome => outcome(false);

/** A resolver choosing its outcome from a predicate on the two cards. */
export function resolverBy(predicate: (attacker: Card, defender: Card) => boolean): BattleResolver {
  return (attacker, defender) => outcome(predicate(attacker, defender));
}

/** A resolver that wins only when the attacker has at least as many arrows as the defender. */
export const winsOnArrowCount: BattleResolver = (attacker, defender) =>
  outcome(popcount(attacker.arrows) >= popcount(defender.arrows));

/** A resolver that loses when the defender is an X or A type, winning otherwise. */
export const losesToAdvanced: BattleResolver = (_attacker, defender) =>
  outcome(defender.type !== 'X' && defender.type !== 'A');

function popcount(mask: number): number {
  let count = 0;
  let value = mask;
  while (value !== 0) {
    count += value & 1;
    value >>>= 1;
  }
  return count;
}
