/**
 * The match state machine (PLAN.md §1.1, §5.4).
 *
 * A pure reducer over `GameState`: `applyAction(state, action) → { state, events }`. It never
 * mutates its input, never draws from an ambient source of randomness, and never blocks — when the
 * player must choose a battle order it returns with `phase: 'chooseBattle'` and the caller decides
 * what happens next. That is what lets the same code drive a human, the AI (Stage 8), and the
 * headless verifier (`tools/verify.ts`).
 *
 * Setup rules implemented here, from §1.1:
 *
 *  - the board is 4x4, with **0 to 6 cells blocked** at random
 *  - 16 − 6 = 10 free cells, and there are exactly 10 cards, so a legal placement always exists
 *  - a **coin flip** decides who plays first, decided up front so the UI can show it
 *  - players alternate placing one card into any empty, unblocked cell
 *  - the match ends when all ten are placed; most cards owned wins
 *  - capturing all five enemy cards is a **perfect game** and takes all five
 *  - otherwise a win takes any one enemy card currently owned
 */

import { CELLS, HAND_SIZE, MAX_BLOCKED } from './constants.ts';
import { createRng } from './rng.ts';
import { beginPlacement, continuePlacement } from './resolution.ts';
import { rollBattle } from './battle.ts';
import type {
  BoardCard,
  Card,
  Cell,
  GameEvent,
  GameState,
  MatchResult,
  Owner,
  Outcome,
  PlayerState,
} from './types.ts';

export type Action =
  | { t: 'place'; cell: Cell; cardIndex: number }
  | { t: 'chooseBattle'; cell: Cell }
  | { t: 'forfeit' };

export interface MatchOptions {
  readonly seed: number;
  readonly playerDeck: readonly Card[];
  readonly aiDeck: readonly Card[];
}

/** The other player. */
export function opponentOf(owner: Owner): Owner {
  return owner === 'player' ? 'ai' : 'player';
}

/**
 * Creates a match: blocks a random 0–6 cells (uniform, Q3), flips a coin for the first turn (Q5),
 * and deals both decks. The blocked cells are shared by both players (Q4).
 */
export function createMatch(options: MatchOptions): GameState {
  const { seed, playerDeck, aiDeck } = options;
  if (playerDeck.length !== HAND_SIZE) {
    throw new RangeError(`player deck must hold ${HAND_SIZE} cards, got ${playerDeck.length}`);
  }
  if (aiDeck.length !== HAND_SIZE) {
    throw new RangeError(`ai deck must hold ${HAND_SIZE} cards, got ${aiDeck.length}`);
  }

  const rng = createRng(seed);

  // Blocked cells: uniform 0-6 distinct cells, chosen by a seeded shuffle so the board is
  // reproducible from the seed alone.
  const blockCount = rng.int(MAX_BLOCKED + 1);
  const blocked: boolean[] = new Array<boolean>(CELLS).fill(false);
  for (const cell of rng
    .shuffle([...Array.from({ length: CELLS }, (_, i) => i as Cell)])
    .slice(0, blockCount)) {
    blocked[cell] = true;
  }

  // Coin flip for who opens. `rng.next() < 0.5` is an even split and is decided up front.
  const first: Owner = rng.next() < 0.5 ? 'player' : 'ai';

  const players: Record<Owner, PlayerState> = {
    player: { deck: playerDeck, hand: playerDeck.slice() },
    ai: { deck: aiDeck, hand: aiDeck.slice() },
  };

  return {
    seed,
    rngState: rng.state,
    board: new Array<BoardCard | null>(CELLS).fill(null),
    blocked,
    players,
    turn: first,
    phase: 'place',
    pendingBattles: [],
    placedCount: 0,
    history: [],
    result: null,
  };
}

/** Rebuilds the RNG from the state's live `rngState`, so a match resumes exactly. */
function rngFor(state: GameState) {
  const rng = createRng(state.seed);
  rng.state = state.rngState;
  return rng;
}

/** How many cards each owner currently holds. Always sums to the number placed. */
export function score(state: GameState): Record<Owner, number> {
  const counts: Record<Owner, number> = { player: 0, ai: 0 };
  for (const card of state.board) {
    if (card) counts[card.owner]++;
  }
  return counts;
}

/** Cells a player may legally drop a card into: empty, unblocked, in bounds. */
export function legalCells(state: GameState): Cell[] {
  const cells: Cell[] = [];
  state.board.forEach((card, index) => {
    if (!card && !state.blocked[index]) cells.push(index as Cell);
  });
  return cells;
}

/**
 * An illegal action leaves the match exactly as it was and reports why. The engine never throws
 * for a bad move: the UI wants to show "you can't play there", not crash (§5.4).
 */
function illegal(state: GameState, text: string): { state: GameState; events: GameEvent[] } {
  return { state, events: [{ t: 'illegal', text }] };
}

/**
 * The enemy cards the **player** may claim (§1.1). Empty on a loss or draw: only a winner takes
 * anything, and from the player's seat a loss means the opponent won.
 */
function claimableForPlayer(state: GameState): Card[] {
  const enemy = opponentOf('player');
  const all = state.players[enemy].deck;
  const captured = all.filter((card) => ownedBy(state, card, 'player'));
  // A perfect game captured every enemy card, so all five may be taken (§1.1).
  return captured.length === all.length ? all.slice() : captured.slice(0, 1);
}

/** True when the given (deck) card currently sits on the board owned by `owner`. */
function ownedBy(state: GameState, card: Card, owner: Owner): boolean {
  return state.board.some(
    (placed) => placed !== null && placed.owner === owner && sameCard(placed, card),
  );
}

/** Two cards are the same instance if they came from the same hand slot. */
function sameCard(a: Card, b: Card): boolean {
  return a === b || (a.figureId === b.figureId && a.arrows === b.arrows && a.atk === b.atk);
}

/**
 * Works out the result once both hands are empty (§1.1). A perfect game is one in which every
 * enemy card was captured; otherwise more cards owned wins; equal counts draw.
 *
 * The match ends when all ten cards are placed — not when the board is full, which would need
 * sixteen cards and can never happen.
 */
function finishMatch(state: GameState): MatchResult | null {
  if (state.placedCount < HAND_SIZE * 2) return null;

  const counts = score(state);
  const total = state.placedCount;
  const playerWon = counts.player > counts.ai;
  const aiWon = counts.ai > counts.player;

  let outcome: Outcome;
  if (!playerWon && !aiWon) {
    outcome = 'draw';
  } else if (counts.player === total) {
    // §1.1: a perfect game is *yours* — you captured all five of their cards. The check used to be
    // `counts.player === total || counts.ai === total`, on the reasonable-sounding ground that a
    // sweep is a sweep. But `Outcome` has no direction to it, and everything downstream read
    // `'perfect'` as a player win: the results panel said "Perfect game — you take everything" over a
    // 0:10 board with nothing to take, and `recordOutcome` counted a lost match as a win and a
    // perfect. An opponent sweeping the board is a loss, and an unremarkable one.
    outcome = 'perfect';
  } else {
    outcome = playerWon ? 'win' : 'loss';
  }

  const playerWonMatch = outcome === 'win' || outcome === 'perfect';
  return {
    outcome,
    taken: [],
    claimable: playerWonMatch ? claimableForPlayer(state) : [],
  };
}

/**
 * The single entry point for changing a match. Returns a new state plus the events describing what
 * happened, which the renderer animates and the log replays.
 */
export function applyAction(
  state: GameState,
  action: Action,
): { state: GameState; events: GameEvent[] } {
  const step = reduce(state, action);
  // An illegal action changed nothing, so it must not even grow the log — and returning the very
  // same state object is what lets a caller detect a rejected action by identity.
  if (step.events.some((event) => event.t === 'illegal')) return step;
  // History is appended here and only here, so it holds exactly the events of this action and
  // nothing else. Resolution used to append its own, which quietly left `place`, `turn` and
  // `game-over` out of the log — and PLAN.md §3.2 promises a log a match can be replayed from.
  // Stage 9 needs exactly that to work out which cards were used (§1.8).
  return {
    state: { ...step.state, history: [...state.history, ...step.events] },
    events: step.events,
  };
}

function reduce(state: GameState, action: Action): { state: GameState; events: GameEvent[] } {
  switch (action.t) {
    case 'place':
      return place(state, action.cell, action.cardIndex);
    case 'chooseBattle':
      return chooseBattle(state, action.cell);
    case 'forfeit':
      return forfeit(state);
    default: {
      const exhaustive: never = action;
      throw new Error(`unreachable action: ${JSON.stringify(exhaustive)}`);
    }
  }
}

function place(
  state: GameState,
  cell: Cell,
  cardIndex: number,
): { state: GameState; events: GameEvent[] } {
  if (state.phase === 'over') return illegal(state, 'the match is already over');
  if (state.phase === 'chooseBattle') return illegal(state, 'finish the current battle first');
  if (state.blocked[cell]) return illegal(state, `cell ${cell} is blocked`);
  if (state.board[cell]) return illegal(state, `cell ${cell} is already occupied`);

  const owner = state.turn;
  const card = state.players[owner].hand[cardIndex];
  if (!card) return illegal(state, `no card at index ${cardIndex} for ${owner}`);

  const withCard: BoardCard = { ...card, owner };
  const board = state.board.slice();
  board[cell] = withCard;
  const hand = state.players[owner].hand.filter((_, i) => i !== cardIndex);

  const placed: GameState = {
    ...state,
    board,
    players: { ...state.players, [owner]: { ...state.players[owner], hand } },
    placedCount: state.placedCount + 1,
  };

  const rng = rngFor(placed);
  const begun = beginPlacement(placed, cell);
  const events: GameEvent[] = [
    { t: 'place', cell, owner, figureId: card.figureId, cardIndex },
    ...begun.events,
  ];

  // If any card points back, the battle order is a real decision (§1.7). Park the queue and let
  // the caller choose rather than blocking here.
  if (begun.pendingBattles.length > 0) {
    return {
      state: { ...begun.state, phase: 'chooseBattle', pendingCell: cell },
      events,
    };
  }
  return settle({ ...begun.state, pendingBattles: [] }, owner, rng, events);
}

function chooseBattle(state: GameState, cell: Cell): { state: GameState; events: GameEvent[] } {
  if (state.phase !== 'chooseBattle') return illegal(state, 'no battle order is pending');
  if (!state.pendingBattles.includes(cell)) {
    return illegal(state, `cell ${cell} is not one of the pending battles`);
  }
  const playedCell = state.pendingCell;
  if (playedCell === undefined) return illegal(state, 'no placement is awaiting a battle');

  const rng = rngFor(state);
  // The chosen battle goes first; the rest keep discovery order.
  const order = [cell, ...state.pendingBattles.filter((c) => c !== cell)];
  const queued: GameState = { ...state, pendingBattles: order };
  const done = continuePlacement(queued, playedCell, { rng });
  const events: GameEvent[] = [...done.events];
  return settle(done.state, state.turn, rng, events);
}

/** After a placement fully resolves: either the match ends, or the turn passes. */
function settle(
  state: GameState,
  owner: Owner,
  rng: ReturnType<typeof rngFor>,
  events: GameEvent[],
): { state: GameState; events: GameEvent[] } {
  const cleared: GameState = { ...state, pendingBattles: [], pendingCell: undefined };
  const result = finishMatch(cleared);
  if (result) {
    events.push({ t: 'game-over', result });
    return { state: { ...cleared, phase: 'over', result, rngState: rng.state }, events };
  }
  const next: Owner = opponentOf(owner);
  events.push({ t: 'turn', owner: next });
  return {
    state: { ...cleared, phase: 'place', turn: next, rngState: rng.state },
    events,
  };
}

function forfeit(state: GameState): { state: GameState; events: GameEvent[] } {
  if (state.phase === 'over') return illegal(state, 'the match is already over');
  const loser = state.turn;
  const result: MatchResult = {
    outcome: loser === 'player' ? 'loss' : 'win',
    taken: [],
    claimable: [],
  };
  const events: GameEvent[] = [{ t: 'game-over', result }];
  return { state: { ...state, phase: 'over', result }, events };
}

/**
 * Runs a whole match with both sides playing legal moves chosen by `pick`.
 * `pick(state, owner) → Action` lets the same loop serve a human, the AI, and the verifier.
 */
export function playMatch(
  initial: GameState,
  pick: (state: GameState, owner: Owner) => Action,
): { state: GameState; events: GameEvent[] } {
  let state = initial;
  const events: GameEvent[] = [];
  // Bounded: a match is ten placements plus at most a few battle orders each, so this cannot
  // spin, but a hard cap keeps a buggy driver from hanging the verifier.
  for (let guard = 0; guard < 10_000 && state.phase !== 'over'; guard++) {
    const step = applyAction(state, pick(state, state.turn));
    state = step.state;
    events.push(...step.events);
    if (step.events.some((e) => e.t === 'illegal')) break;
  }
  return { state, events };
}

/** Re-exported so callers can fight a single pair of cards without importing battle.ts. */
export { rollBattle };
export type { GameState, Card, Cell, Owner, GameEvent, MatchResult };
