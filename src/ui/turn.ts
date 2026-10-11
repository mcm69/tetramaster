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
 *  - while it is not the computer's turn, or the match is over, release the latch;
 *  - act once per turn, and latch until there is something new to decide about.
 *
 * ## Why the latch is keyed on the state, not on the turn
 *
 * "Until the turn changes hands" was the first attempt, and it is wrong. A contested placement does
 * **not** change hands: `applyAction` returns `phase: 'chooseBattle'` with `turn` still belonging to
 * whoever placed the card (§1.7 — the attacker picks the battle order). So after the computer placed
 * a counter-attacking card, the latch was still shut, the computer was never asked again, and the
 * match hung on a battle order that only the computer was allowed to fill in. The interface offered it
 * to the player, who could not act — correctly, for once — so it just sat there.
 *
 * The rule that survives: **latch against the exact state object the decision was made on.** Any
 * action produces a new state, so a new state re-arms; the same state on the next frame does not. That
 * covers cascades, follow-up battle orders, and ordinary turns without needing to enumerate them, and
 * it still prevents a burst of decisions while the animation settles, because the state object is
 * identical across frames until an action lands.
 *
 * The release on "not our turn" is kept as well. It is not what makes a normal turn work, but it is
 * what stops a stale latch surviving into a new match.
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
  /** The state object the last decision was made against, or null if none has been made. */
  private decidedOn: GameState | null = null;

  /** True once a decision has been made and no new state has arrived to justify another. */
  get hasActed(): boolean {
    return this.decidedOn !== null;
  }

  /** Forgets the latch. For tearing a match down; `step` clears it on its own. */
  reset(): void {
    this.decidedOn = null;
  }

  /**
   * Runs one frame's worth of "is it the computer's turn yet".
   *
   * Returns true when an action was submitted, so the caller knows to repaint.
   */
  step(host: OpponentHost, state: GameState, owner: Owner): boolean {
    if (host.busy) return false;

    if (state.phase === 'over' || state.turn !== owner) {
      this.decidedOn = null;
      return false;
    }

    // Same state, already decided. Re-deciding would either be a no-op or, worse, the same placement
    // twice — and the animation would still be running, so `host.submit` would refuse it anyway.
    if (this.decidedOn === state) return false;
    this.decidedOn = state;

    const action = host.decide(state, owner);
    if (action === null) return false;
    return host.submit(action);
  }
}
