/**
 * Turning an action's events into a sound schedule.
 *
 * ## Why this exists
 *
 * It used to be one line in `main.ts`:
 *
 * ```
 * settleIfFinished() → playEvents(controller.state.history, result.outcome)
 * ```
 *
 * `playEvents` was called from **one place in the whole program**, and that place was the end of the
 * match. So the entire match was silent, and then at the final result every sound the match had
 * earned was fired in one burst: about 21 cues over roughly 1.4 seconds, in order, long after the
 * cards they belonged to had landed. Nothing about `cuesFor` was wrong — the mapping from event to
 * sound was right, and thoroughly tested. The wiring was wrong, and nothing tested the wiring.
 *
 * ## Why it is its own module
 *
 * For the same reason `cueFor` is separated from the synth in `synth.ts`: the part where mistakes
 * live is a pure function of events and timing, and it can be checked without an `AudioContext`,
 * a canvas, or a DOM.
 */

import { cuesFor, type Cue } from './synth.ts';
import type { EventOutcome } from './synth.ts';
import type { EventSlot } from '../render/animator.ts';
import type { GameEvent } from '../core/types.ts';

/** One sound, and when it should happen relative to the action that caused it. */
export interface AudioCue {
  readonly cue: Cue;
  readonly delayMs: number;
}

/**
 * The floor between two sounds, in milliseconds.
 *
 * The animation schedule can legitimately put two cues at the same instant — a `battle` and the
 * `battle-roll` that follows it are separate events, and a cascade of takedowns resolves quickly.
 * Spacing them keeps a cascade audible as a sequence instead of one click. Under reduced motion
 * every duration is zero, so this floor is the *whole* schedule.
 */
export const MIN_GAP_MS = 70;

/**
 * The sounds for one action, timed against the animation that action is already playing.
 *
 * @param events  the action's event log, in order
 * @param slots   where the animator will play each of them; `lastSchedule` from the same push
 * @param outcome the match result, or null while the match is still running. Needed because a
 *                `game-over` event carries the result rather than the outcome.
 */
export function planAction(
  events: readonly GameEvent[],
  slots: readonly EventSlot[],
  outcome: EventOutcome,
): AudioCue[] {
  const plan: AudioCue[] = [];

  events.forEach((event, index) => {
    const slot = slots[index];
    // The schedule is the truth when there is one. The floor covers a missing slot (nothing
    // animated, reduced motion) and prevents two events landing on the same millisecond.
    const delayMs = Math.max(slot?.startMs ?? index * MIN_GAP_MS, index * MIN_GAP_MS);

    // Only the event that *is* the ending gets the outcome. `cuesFor` falls back to announcing the
    // result when the log it was given did not contain one — which is the right behaviour for a
    // whole match and catastrophic per event: a five-event log came out as `loss, battle, loss,
    // loss, combo, loss, loss`. Reusing a whole-log function one event at a time needs the argument
    // scoped to what that event is.
    const forEvent = event.t === 'game-over' ? outcome : null;
    for (const cue of cuesFor([event], forEvent)) plan.push({ cue, delayMs });
  });

  // A result the log did not announce — the fallback `cuesFor` has always had — belongs after
  // everything else, not on top of the last sound.
  if (
    outcome !== null &&
    !plan.some((c) => c.cue === 'win' || c.cue === 'loss' || c.cue === 'draw')
  ) {
    const last = slots.at(-1);
    plan.push({
      cue: outcome === 'loss' ? 'loss' : outcome === 'draw' ? 'draw' : 'win',
      delayMs: (last?.startMs ?? 0) + (last?.durationMs ?? 0) + MIN_GAP_MS,
    });
  }

  return plan;
}

/** The total length of a plan, in milliseconds. Used by the tests to bound it. */
export function planLengthMs(plan: readonly AudioCue[]): number {
  return plan.reduce((longest, entry) => Math.max(longest, entry.delayMs), 0);
}
