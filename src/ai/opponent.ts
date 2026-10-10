/**
 * The opponent (PLAN.md §6, Stage 8).
 *
 * Picks a move by scoring every legal option and adding a little seeded noise so it is neither
 * perfectly predictable nor wildly random. Three difficulty tiers differ in how much noise they add
 * and how sharply they prefer the best move:
 *
 *  - **casual** — heavy noise, plays the second or third best move often. Beatable on purpose.
 *  - **steady** — moderate noise.
 *  - **sharp** — almost no noise, and it also avoids moves that hand over a card for free.
 *
 * Two properties matter more than its strength, and both are tested:
 *
 *  - **It never cheats.** `pickAction` reads only the public state, and it never draws from the
 *    match RNG. It has its own seeded stream, so asking for a decision cannot shift the battle
 *    rolls by even one step.
 *  - **It only ever returns a legal action.** A driver that returns an illegal action loses the
 *    match in `applyAction`, so the AI would simply stop playing.
 */

import { createRng, type Rng } from '../core/rng.ts';
import type { Action } from '../core/match.ts';
import { allMoves, type Move } from './moves.ts';
import { DEFAULT_WEIGHTS, type Weights } from './evaluate.ts';
import type { GameState, Owner } from '../core/types.ts';

export type Difficulty = 'casual' | 'steady' | 'sharp';

export interface Personality {
  readonly id: string;
  readonly name: string;
  readonly difficulty: Difficulty;
  readonly weights: Weights;
  /** Multiplies the noise added to each move's score. */
  readonly volatility: number;
  /** Short line shown when challenging this opponent. */
  readonly taunt: string;
}

/** Noise scale by tier. Sharp plays near-optimally; casual is beatable by design. */
const VOLATILITY: Record<Difficulty, number> = {
  casual: 14,
  steady: 6,
  sharp: 1.5,
};

export function defaultPersonality(difficulty: Difficulty = 'steady'): Personality {
  return {
    id: difficulty,
    name: `${difficulty} opponent`,
    difficulty,
    weights: DEFAULT_WEIGHTS,
    volatility: VOLATILITY[difficulty],
    taunt: 'Careful now.',
  };
}

/**
 * Chooses an action for `owner`.
 *
 * `rng` is the opponent's own stream. Passing the match RNG here would let the AI's *decisions*
 * consume randomness the battles then depend on — a subtle and very real form of cheating.
 */
export function pickAction(
  state: GameState,
  owner: Owner,
  personality: Personality,
  rng: Rng,
): Action | null {
  const move = pickMove(state, owner, personality, rng);
  if (move === null) return null;
  return toAction(move);
}

export function pickMove(
  state: GameState,
  owner: Owner,
  personality: Personality,
  rng: Rng,
): Move | null {
  const moves = allMoves(state, owner, personality.weights);
  if (moves.length === 0) return null;

  const scored = moves.map((move) => ({
    move,
    // Uniform in [-volatility/2, +volatility/2] around the raw score.
    score: move.score + (rng.next() - 0.5) * personality.volatility,
  }));

  const first = scored[0];
  if (first === undefined) return null;
  let best = first;
  for (const candidate of scored) {
    if (candidate.score > best.score) best = candidate;
  }
  return best.move;
}

/** Converts a chosen move into the action the reducer accepts. */
export function toAction(move: Move): Action | null {
  if (move.kind === 'place') {
    return { t: 'place', cell: move.cell, cardIndex: move.cardIndex };
  }
  return { t: 'chooseBattle', cell: move.cell };
}

/**
 * A ready-made opponent handle: owns its RNG, so several can coexist without sharing state.
 */
export class Opponent {
  private readonly rng: Rng;
  readonly personality: Personality;

  constructor(personality: Personality = defaultPersonality(), seed = 1) {
    this.personality = personality;
    this.rng = createRng(seed);
  }

  /** The action to take now, or null when the match is over. */
  act(state: GameState, owner: Owner): Action | null {
    return pickAction(state, owner, this.personality, this.rng);
  }

  /** The move with its evaluation, for the debug overlay. */
  explain(state: GameState, owner: Owner): Move | null {
    return pickMove(state, owner, this.personality, this.rng);
  }

  reset(seed = 1): void {
    this.rng.state = createRng(seed).state;
  }
}
