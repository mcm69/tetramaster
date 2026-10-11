/**
 * The computer's turn handshake (PLAN.md §6).
 *
 * Deciding *when* the opponent moves is game flow, and it is not the engine's business — the engine
 * only knows whose turn it is. It used to live as a `thinking` flag inside `main.ts`'s render loop,
 * which is the one place no test could reach.
 *
 * The bug that flag carried is worth writing down. It was set when the opponent acted and cleared
 * only by `newController`, so **the opponent moved exactly once per match**. Nothing noticed for a
 * long time, because the game still advanced: `MatchController` had no turn check either, so a click
 * during the opponent's turn placed *their* card, and the match quietly continued with one person
 * playing both sides from the third move on.
 *
 * The rule is small enough to state in full:
 *
 *  - while the board is animating, do nothing;
 *  - while it is not the computer's turn, or the match is over, **release** the latch;
 *  - act once per turn, and latch until the turn changes hands.
 *
 * The release is the part that was missing, which is why this is a class rather than a boolean: a
 * flag you can only clear from one place is a flag you will forget to clear.
 */

import type { Action } from '../core/match.ts';
import type { GameState, Owner } from '../core/types.ts';

/** What the gate needs from the app. Injected so it can be tested without a canvas. */
export interface OpponentHost {
  /** True while the board is still animating. */
  readonly busy: boolean;
  /** The action to take for `owner`, or null if it has nothing. */
  decide(state: GameState, owner: Owner): Action | null;
  /** Submits an action from outside the local input path. Returns false if it was refused. */
  submit(action: Action): boolean;
}

export class OpponentGate {
  private engaged = false;

  /** True once this turn has been acted on, until the turn changes hands. */
  get hasActed(): boolean {
    return this.engaged;
  }

  /** Forgets the latch. For tearing a match down; `step` releases it on its own. */
  reset(): void {
    this.engaged = false;
  }

  /**
   * Runs one frame's worth of "is it the computer's turn yet".
   *
   * Returns true when an action was submitted, so the caller knows to repaint.
   */
  step(host: OpponentHost, state: GameState, owner: Owner): boolean {
    if (host.busy) return false;

    if (state.phase === 'over' || state.turn !== owner) {
      // The turn has changed hands, so the latch goes. Leaving this out is the bug this module
      // exists to make impossible to write again.
      this.engaged = false;
      return false;
    }

    if (this.engaged) return false;
    this.engaged = true;

    const action = host.decide(state, owner);
    if (action === null) return false;
    return host.submit(action);
  }
}
