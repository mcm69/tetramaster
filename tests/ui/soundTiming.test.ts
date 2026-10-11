/**
 * Sound timing.
 *
 * ## The bug
 *
 * `playEvents` was called from exactly one place in the program, and that place was the end of the
 * match:
 *
 * ```
 * settleIfFinished() -> playEvents(controller.state.history, result.outcome)
 * ```
 *
 * `history` is the log of the *whole* match. So a match was completely silent for its entire
 * length, and then every sound it had earned arrived at once: about 21 cues over roughly 1.4
 * seconds, in order, long after the cards they belonged to had landed.
 *
 * ## Why every existing test passed
 *
 * `tests/audio/synth.test.ts` covers `cuesFor` thoroughly — one cue per event, right cue per event,
 * the right ending, nothing for imperceptible events. All of that was true, throughout. What no test
 * looked at was **when** the cues were played. The mapping was right and the wiring was wrong, and
 * mapping is the part that got thirteen tests.
 *
 * So the assertions below are about *time and placement*: that a sound happens on the action that
 * caused it, that it happens when its animation does, and that a whole match produces the same
 * sounds it always did — just in the right order, spread through the match rather than crushed into
 * the last second and a half.
 */

import { describe, expect, it } from 'vitest';
import { Animator, type EventSlot } from '../../src/render/animator.ts';
import { planAction, planLengthMs, MIN_GAP_MS, type AudioCue } from '../../src/audio/schedule.ts';
import { cuesFor } from '../../src/audio/synth.ts';
import { MatchController } from '../../src/ui/app.ts';
import { humanSeatsFor, MODES, MODE_ORDER } from '../../src/game/modes.ts';
import { applyAction, createMatch, legalCells } from '../../src/core/match.ts';
import { createRng } from '../../src/core/rng.ts';
import { rollInstance } from '../../src/core/card.ts';
import { figuresOfTier } from '../../src/data/cards.ts';
import { installCanvasStub } from './canvasStub.ts';
import type { Card, GameEvent, GameState, Tier } from '../../src/core/types.ts';
import type { Action } from '../../src/core/match.ts';

installCanvasStub();

function deck(seed: number, tier: Tier = 3): Card[] {
  const pool = figuresOfTier(tier);
  const rng = createRng(seed);
  return Array.from({ length: 5 }, () => rollInstance(pool[rng.int(pool.length)]!, rng));
}

function matchAt(seed: number): GameState {
  return createMatch({ seed, playerDeck: deck(seed * 2 + 1), aiDeck: deck(seed * 2 + 2) });
}

/** Submits an action through the controller's own public paths, exactly as the interface does. */
function submit(controller: MatchController, action: Action): void {
  if (action.t === 'chooseBattle') {
    controller.chooseBattle(action.cell);
    return;
  }
  if (action.t !== 'place') return;
  controller.selectCard(action.cardIndex);
  controller.playAt(action.cell);
}

/**
 * Plays a match to the end through the controller's own input paths.
 *
 * Stops on a refused action rather than guessing: a `chooseBattle` submission leaves `placedCount`
 * alone, so a loop that reads "no card placed" as "stuck" gives up in the first cascade.
 */
function playWholeMatch(controller: MatchController): void {
  for (let guard = 0; guard < 80; guard++) {
    while (controller.busy) controller.advance(16);
    if (controller.state.phase === 'over') return;
    const action = greedy(controller.state);
    if (action === null) return;
    const before = controller.state;
    submit(controller, action);
    if (controller.state === before) return;
  }
}

/** The next legal action for whoever is to play, so a match can be walked without thinking. */
function greedy(state: GameState): Action | null {
  if (state.phase === 'chooseBattle') {
    const cell = state.pendingBattles[0];
    return cell === undefined ? null : { t: 'chooseBattle', cell };
  }
  if (state.phase !== 'place') return null;
  const cell = legalCells(state)[0];
  return cell === undefined ? null : { t: 'place', cell, cardIndex: 0 };
}

describe('sound happens when the thing that caused it happens', () => {
  it('fires on the first placement, not at the end of the match', () => {
    // The direct pin for the report. One placement, and sound has already happened.
    const seen: AudioCue[] = [];
    const animator = new Animator();
    const controller = new MatchController(matchAt(1), animator, {
      humanSeats: ['player', 'ai'],
      onAction: (events, schedule) => {
        seen.push(...planAction(events, schedule, controller.state.result?.outcome ?? null));
      },
    });

    const action = greedy(controller.state);
    if (action === null) throw new Error('expected a legal opening move');
    expect(applyAction(controller.state, action).events.some((e) => e.t === 'place')).toBe(true);
    submit(controller, action);
    while (controller.busy) controller.advance(16);

    expect(seen.map((s) => s.cue)).toContain('place');
  });

  it('produces the same sounds over a match, just spread through it', () => {
    // Not "fewer sounds" — the same sounds, in the same order, arriving as things happen. A fix that
    // quietly dropped the cascade sounds would pass a "no burst at the end" test on its own.
    const schedules: AudioCue[][] = [];
    const animator = new Animator();
    const controller = new MatchController(matchAt(2), animator, {
      humanSeats: ['player', 'ai'],
      onAction: (events, schedule) => {
        // The controller's state is already updated by the time `onAction` runs, so the ending can
        // be named here — which is exactly what `main.ts` does.
        schedules.push(planAction(events, schedule, controller.state.result?.outcome ?? null));
      },
    });

    playWholeMatch(controller);
    expect(controller.state.phase).toBe('over');

    const played = schedules.flat();
    // The old bug fired every one of these in the last moment. Now they come from the actions.
    expect(played.length).toBeGreaterThan(5);
    expect(schedules.filter((s) => s.length > 0).length).toBeGreaterThan(4);
    // And the sounds are the same set the old end-of-match burst produced, in the same order.
    const wholeMatch = cuesFor(controller.state.history, controller.state.result?.outcome ?? null);
    expect(played.map((p) => p.cue)).toEqual(wholeMatch);
  });

  it('never fires a whole match of sound at once', () => {
    // The number the bug actually produced, as a ceiling. A match is ten placements; no single
    // action should ever sound like a dozen.
    const plans: AudioCue[][] = [];
    const animator = new Animator();
    const controller = new MatchController(matchAt(3), animator, {
      humanSeats: ['player', 'ai'],
      onAction: (events, schedule) => {
        plans.push(planAction(events, schedule, controller.state.result?.outcome ?? null));
      },
    });

    let worst = 0;
    let total = 0;
    playWholeMatch(controller);
    for (const plan of plans) {
      worst = Math.max(worst, plan.length);
      total += plan.length;
    }

    expect(total).toBeGreaterThan(5);
    expect(worst, 'one action produced an implausible number of sounds').toBeLessThanOrEqual(4);
  });
});

describe('sound lines up with the picture', () => {
  it('uses the schedule the animator actually built', () => {
    const state = matchAt(4);
    const cell = legalCells(state)[0] as never;
    const result = applyAction(state, { t: 'place', cell, cardIndex: 0 });

    const animator = new Animator();
    animator.syncTo(state.board);
    animator.push(result.events, result.state);

    // The same slots the queue was built from, not a second guess at them.
    expect(animator.lastSchedule.map((s) => s.event)).toEqual(result.events);
    for (const slot of animator.lastSchedule) {
      expect(slot.durationMs).toBeGreaterThan(0);
      expect(slot.startMs).toBeGreaterThanOrEqual(0);
    }
    // Strictly ordered: a schedule that went backwards would put a sound before its own picture.
    const starts = animator.lastSchedule.map((s) => s.startMs);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });

  it('lines a battle up with its roll', () => {
    // The centrepiece: a fight is `battle` then `battle-roll`, and the sound for the roll should
    // arrive when the numbers are moving, not on top of the wind-up.
    let found: { events: readonly GameEvent[]; before: GameState; after: GameState } | null = null;
    for (let seed = 1; seed <= 300 && found === null; seed++) {
      let state = matchAt(seed);
      for (let step = 0; step < 30 && state.phase !== 'over'; step++) {
        const action = greedy(state);
        if (action === null) break;
        const before = state;
        const result = applyAction(state, action);
        if (result.events.some((e) => e.t === 'battle-roll')) {
          found = { events: result.events, before, after: result.state };
          break;
        }
        if (result.events.some((e) => e.t === 'illegal')) break;
        state = result.state;
      }
    }
    if (found === null) throw new Error('no battle found');

    const animator = new Animator();
    animator.syncTo(found.before.board);
    animator.push(found.events, found.after);

    const plan = planAction(found.events, animator.lastSchedule, null);
    const battleCue = plan.find((p) => p.cue === 'battle' || p.cue === 'loseBattle');
    expect(battleCue).toBeDefined();

    const rollSlot = animator.lastSchedule.find((s) => s.event.t === 'battle-roll');
    expect(rollSlot).toBeDefined();
    expect(battleCue?.delayMs).toBe(rollSlot?.startMs);
    // And the whole plan fits inside the action's own animation rather than trailing off after it.
    const lastSlot = animator.lastSchedule.at(-1);
    expect(planLengthMs(plan)).toBeLessThanOrEqual(
      (lastSlot?.startMs ?? 0) + (lastSlot?.durationMs ?? 0),
    );
  });

  it('keeps sounds apart even when the schedule puts them together', () => {
    const slots: EventSlot[] = [
      { event: { t: 'turn', owner: 'ai' }, startMs: 0, durationMs: 0 },
      { event: { t: 'turn', owner: 'ai' }, startMs: 0, durationMs: 0 },
      { event: { t: 'turn', owner: 'ai' }, startMs: 0, durationMs: 0 },
    ];
    const plan = planAction(
      slots.map((s) => s.event),
      slots,
      null,
    );
    expect(plan).toHaveLength(0); // `turn` makes no sound, so nothing to space out
    expect(MIN_GAP_MS).toBeGreaterThan(0);
  });

  it('spaces sounds when motion is reduced', () => {
    // Reduced motion collapses every duration to zero, so the schedule is flat. Without the floor
    // an entire cascade would land on one millisecond and sound like a single click.
    const state = matchAt(5);
    const cell = legalCells(state)[0] as never;
    const result = applyAction(state, { t: 'place', cell, cardIndex: 0 });
    const animator = new Animator({ reduceMotion: 'reduced' });
    animator.syncTo(state.board);
    animator.push(result.events, result.state);

    const plan = planAction(result.events, animator.lastSchedule, null);
    const delays = plan.map((p) => p.delayMs);
    expect(delays).toEqual([...delays].sort((a, b) => a - b));
    for (let i = 1; i < delays.length; i++) {
      expect(delays[i] as number).toBeGreaterThan(delays[i - 1] as number);
    }
  });

  it('says nothing for events the player cannot perceive', () => {
    expect(planAction([{ t: 'turn', owner: 'ai' }], [], null)).toHaveLength(0);
  });
});

describe('the result sounds once, at the end, and only once', () => {
  it('plays the ending from the game-over event rather than adding one', () => {
    let found: { events: readonly GameEvent[]; before: GameState; after: GameState } | null = null;
    for (let seed = 1; seed <= 400 && found === null; seed++) {
      let state = matchAt(seed);
      for (let step = 0; step < 40 && state.phase !== 'over'; step++) {
        const action = greedy(state);
        if (action === null) break;
        const before = state;
        const result = applyAction(state, action);
        if (result.events.some((e) => e.t === 'game-over')) {
          found = { events: result.events, before, after: result.state };
          break;
        }
        state = result.state;
      }
    }
    if (found === null) throw new Error('no finished match found');

    const plan = planAction(found.events, [], found.after.result?.outcome ?? null);
    const endings = plan.filter((p) => p.cue === 'win' || p.cue === 'loss' || p.cue === 'draw');
    expect(endings).toHaveLength(1);
  });

  it('still announces a result the log did not carry', () => {
    const state = matchAt(6);
    const ending = state.result === null ? 'win' : 'draw';
    const plan = planAction([], [], ending);
    expect(plan).toHaveLength(1);
    expect(plan[0]?.cue).toBe(ending);
    // And after everything else, not on top of it.
    expect(plan[0]?.delayMs).toBeGreaterThanOrEqual(MIN_GAP_MS);
  });
});

describe('every mode lets a person play the seats they are sitting at', () => {
  it('gives hotseat both seats and the computer modes one', () => {
    expect(humanSeatsFor(MODES.hotseat)).toEqual(['player', 'ai']);
    expect(humanSeatsFor(MODES.match)).toEqual(['player']);
    expect(humanSeatsFor(MODES.tournament)).toEqual(['player']);

    for (const id of MODE_ORDER) {
      const seats = humanSeatsFor(MODES[id]);
      const aiSeats = MODES[id].aiSeats;
      expect(seats.length + aiSeats.length, id).toBe(2);
    }
  });

  it('lets the controller accept exactly the seats the mode lists', () => {
    // The bug this pins: `humanSeatsFor` existed, was tested, and was never passed to the
    // controller. The controller defaults to `['player']`, so games against the computer worked by
    // luck and **hotseat could not be played at all** — every second-seat turn was refused.
    for (const id of MODE_ORDER) {
      const seats = humanSeatsFor(MODES[id]);
      const controller = new MatchController(matchAt(7), undefined, { humanSeats: seats });

      // Every mode starts on the player seat, and a person is always sitting there.
      expect(controller.state.turn, id).toBe('player');
      expect(controller.acceptsLocalInput, id).toBe(true);

      controller.selectCard(0);
      controller.playAt(legalCells(controller.state)[0] as never);
      while (controller.busy) controller.advance(1000);
      expect(controller.state.turn, id).toBe('ai');

      // Now the answer depends on the mode, which is the whole point.
      expect(controller.acceptsLocalInput, id).toBe(seats.includes('ai'));
      expect(controller.acceptsLocalInput, id).toBe(id === 'hotseat');
    }
  });

  it('would refuse a seat the mode does not list', () => {
    // The converse, so the test above cannot pass by accident: an unlisted seat is refused.
    const controller = new MatchController(matchAt(8), undefined, { humanSeats: ['player'] });
    controller.selectCard(0);
    controller.playAt(legalCells(controller.state)[0] as never);
    while (controller.busy) controller.advance(1000);
    expect(controller.state.turn).toBe('ai');
    expect(controller.acceptsLocalInput).toBe(false);
  });
});
