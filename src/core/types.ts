/**
 * Core domain types for the rules engine.
 *
 * `CardType`, `Phase` and `GameEvent.t` are discriminated unions on purpose: an exhaustive `switch`
 * over them makes a missing rule branch a compile error rather than a runtime surprise (PLAN.md
 * §2.3). This is the single most valuable thing the type system does for this project.
 */

/** A grid cell, row-major over the 4x4 board (PLAN.md §7.3). */
export type Cell = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15;

/** One of the eight compass directions, in the canonical order N, NE, E, SE, S, SW, W, NW. */
export type Direction = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** Which side owns a card. Hotseat 2P reuses these ids. */
export type Owner = 'player' | 'ai';

/** Card type, which selects the attacker's and defender's stats (PLAN.md §1.6.1). */
export type CardType = 'P' | 'M' | 'X' | 'A';

/** Which of a card's three stats is being read. */
export type StatKey = 'atk' | 'pdef' | 'mdef';

/** What the engine is waiting for. Drives the UI's legal-action set by narrowing (PLAN.md §3.1). */
export type Phase = 'place' | 'chooseBattle' | 'over';

/** Match outcome. A perfect game is a distinct win with a distinct reward. */
export type Outcome = 'win' | 'loss' | 'draw' | 'perfect';

/** A concrete stat index, 0-15, i.e. one hex digit. */
export type StatIndex = number;

/**
 * A card as it exists in a match.
 *
 * `figureId` picks the artwork and identity; `arrows` is an 8-bit mask where bit `d` is set when
 * the card has an arrow pointing in direction `d` (§1.2). The three stats are hex *indices*, not
 * values — index `n` stands for the interval [16n, 16n+15] (§1.3).
 */
export interface Card {
  readonly figureId: number;
  readonly arrows: number;
  readonly atk: StatIndex;
  readonly type: CardType;
  readonly pdef: StatIndex;
  readonly mdef: StatIndex;
}

/** A card on the board: a Card plus who currently owns it. `owner` is the only mutable field. */
export interface BoardCard extends Card {
  owner: Owner;
}

/** A card held for play but not yet placed. */
export interface HandCard extends Card {
  /** Where this card came from, for the UI. Purely informational. */
  readonly source?: string;
}

export interface PlayerState {
  /** The five cards committed to this match. */
  readonly deck: readonly Card[];
  /** Cards not yet placed, indexed by the `cardIndex` a place action refers to. */
  readonly hand: readonly Card[];
}

export interface MatchResult {
  readonly outcome: Outcome;
  /** Cards the winner takes. Empty on a draw or loss. */
  readonly taken: readonly Card[];
}

/**
 * The complete match state. Pure data: the reducer in match.ts produces new instances, never
 * mutating an existing one. The persistent collection is deliberately *not* here — it is global
 * meta state saved separately, so a match stays cheap to serialise (see STATUS.md Deviations).
 */
export interface GameState {
  readonly seed: number;
  /** Live RNG state, so a match can be saved and resumed mid-battle (PLAN.md §5.1). */
  rngState: number;
  /** Exactly 16 entries, row-major. `null` means empty. */
  board: readonly (BoardCard | null)[];
  /** Exactly 16 entries. Blocked cells cannot be played into and break adjacency (§1.1). */
  blocked: readonly boolean[];
  players: Record<Owner, PlayerState>;
  turn: Owner;
  phase: Phase;
  /** Non-empty only while `phase === 'chooseBattle'`. */
  pendingBattles: readonly Cell[];
  /** Append-only log for replay, debugging and the rules screen. */
  history: readonly GameEvent[];
  result: MatchResult | null;
}

/** Why a card changed hands — used by the animator to pick a sound and a highlight. */
export type TakedownReason = 'arrow' | 'combo' | 'battle';

/**
 * The event log the renderer animates (PLAN.md §3.2). Adding a member here forces every
 * `switch (event.t)` in the animator to handle it.
 */
export type GameEvent =
  | { t: 'place'; cell: Cell; owner: Owner; figureId: number }
  | { t: 'takedown'; cell: Cell; owner: Owner; from: Cell }
  | { t: 'combo'; cell: Cell; owner: Owner; from: Cell }
  | { t: 'battle'; attacker: Cell; defender: Cell; atkIndex: number; defIndex: number }
  | {
      t: 'battle-roll';
      attacker: Cell;
      defender: Cell;
      atkBase: number;
      atkRoll: number;
      atkActual: number;
      defBase: number;
      defRoll: number;
      defActual: number;
      probability: number;
      attackerWins: boolean;
    }
  | { t: 'flip'; cell: Cell; from: Owner; to: Owner; reason: TakedownReason }
  | { t: 'evolve'; cell: Cell; from: CardType; to: CardType }
  | {
      t: 'stat-up';
      figureId: number;
      stat: StatKey;
      value: number;
      /** True when the roll landed on a stat already at its cap — a wasted point (PLAN.md §1.8). */
      wasted: boolean;
    }
  | { t: 'turn'; owner: Owner }
  | { t: 'game-over'; result: MatchResult }
  | { t: 'hint'; text: string }
  | { t: 'illegal'; text: string };
