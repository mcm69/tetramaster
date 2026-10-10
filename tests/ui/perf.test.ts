/**
 * The performance gate (PLAN.md §6, Stage 11).
 *
 * The point of this is not the numbers — they are comfortably inside budget and will stay there —
 * it is that the budgets are *enforced*. A requirement nobody checks is a requirement that quietly
 * stops being true, and "board render under 4ms/frame" is exactly the kind of line that holds until
 * someone adds a per-frame allocation to the card renderer.
 *
 * The animator queue is the half most likely to break, because its failure mode is invisible until
 * the game stutters: events pile up faster than they drain and the board falls further and further
 * behind the truth. So the queue bound gets its own assertion, over whole matches, rather than a
 * synthetic burst.
 */

import { describe, expect, it } from 'vitest';
import { BUDGETS, measurePerf, summarise } from '../../tools/perf.ts';
import { Animator } from '../../src/render/animator.ts';
import { applyAction, createMatch, legalCells } from '../../src/core/match.ts';
import { createRng } from '../../src/core/rng.ts';
import { rollInstance } from '../../src/core/card.ts';
import { figuresOfTier } from '../../src/data/cards.ts';
import type { Card, GameEvent, Tier } from '../../src/core/types.ts';

function deck(seed: number, tier: Tier = 3): Card[] {
  const pool = figuresOfTier(tier);
  const rng = createRng(seed);
  return Array.from({ length: 5 }, () => {
    const figure = pool[rng.int(pool.length)];
    if (figure === undefined) throw new Error(`no figure in tier ${tier}`);
    return rollInstance(figure, rng);
  });
}

describe('the measured budgets', () => {
  it('passes over a batch of full matches', () => {
    const report = measurePerf(40);
    expect(report.failures).toEqual([]);
  });

  it('reports both a median and a p95, because the tail is what a player feels', () => {
    const report = measurePerf(20);
    for (const timing of report.timings) {
      expect(timing.samples, timing.name).toBeGreaterThan(0);
      expect(timing.p95Ms, timing.name).toBeGreaterThanOrEqual(timing.medianMs);
    }
  });

  it('leaves the frame budget with room to spare', () => {
    // Recorded as a ratio rather than an absolute, so the assertion states what it means: the
    // renderer's per-frame work is a small fraction of a 16ms frame.
    const report = measurePerf(30);
    const frame = report.timings.find((t) => t.name === 'animator frame');
    expect(frame?.p95Ms ?? Infinity).toBeLessThan(BUDGETS.frameMs / 4);
  });
});

describe('summarising samples', () => {
  it('reports a median and a p95 that bracket the data', () => {
    const timing = summarise('x', [1, 2, 3, 4, 5, 6, 7, 8, 9, 100], 10);
    expect(timing.samples).toBe(10);
    expect(timing.medianMs).toBeLessThan(10);
    expect(timing.p95Ms).toBeGreaterThan(90);
    expect(timing.overBudget).toBe(1);
  });

  it('survives an empty sample set', () => {
    const timing = summarise('empty', [], 4);
    expect(timing.samples).toBe(0);
    expect(timing.medianMs).toBe(0);
    expect(timing.overBudget).toBe(0);
  });
});

describe('the animator queue stays bounded', () => {
  it('never grows past the budget over whole matches', () => {
    // The real assertion. A queue that only runs away on a rare cascade cannot be caught by a
    // synthetic burst, so this replays matches and watches the depth throughout.
    const report = measurePerf(60);
    expect(report.maxQueueDepth).toBeLessThanOrEqual(BUDGETS.maxQueueDepth);
  });

  it('drains completely once an action finishes', () => {
    const animator = new Animator();
    const state = createMatch({ seed: 1, playerDeck: deck(1), aiDeck: deck(2) });
    const [cell] = legalCells(state);
    if (cell === undefined) throw new Error('no legal cell');
    const step = applyAction(state, { t: 'place', cell, cardIndex: 0 });
    animator.push(step.events, step.state);
    expect(animator.queueDepth).toBeGreaterThan(0);

    for (let i = 0; i < 200 && !animator.idle; i++) animator.tick(16);
    expect(animator.idle).toBe(true);
    expect(animator.queueDepth).toBe(0);
  });

  it('grows by one animation per cell-bearing event, and no more', () => {
    // An event with no cell -- `turn`, `game-over`, `hint` -- must never queue anything. If it did,
    // the queue would grow on events that animate nothing, which is a leak with no visible cause.
    const animator = new Animator();
    const state = createMatch({ seed: 2, playerDeck: deck(3), aiDeck: deck(4) });
    const cellEvents = (events: readonly GameEvent[]): number =>
      events.filter((event) => 'cell' in event).length;
    const step = applyAction(state, { t: 'place', cell: 0, cardIndex: 0 });
    animator.push(step.events, step.state);
    expect(animator.queueDepth).toBe(cellEvents(step.events));

    const turnOnly: GameEvent[] = [
      { t: 'turn', owner: 'ai' },
      { t: 'hint', text: 'x' },
      { t: 'game-over', result: { outcome: 'draw', taken: [], claimable: [] } },
    ];
    const before = animator.queueDepth;
    animator.push(turnOnly, step.state);
    expect(animator.queueDepth).toBe(before);
  });

  it('queues nothing at all under reduced motion', () => {
    const animator = new Animator({ reduceMotion: 'reduced' });
    const state = createMatch({ seed: 3, playerDeck: deck(5), aiDeck: deck(6) });
    const step = applyAction(state, { t: 'place', cell: 0, cardIndex: 0 });
    animator.push(step.events, step.state);
    expect(animator.queueDepth).toBe(0);
    expect(animator.idle).toBe(true);
  });

  it('reports its depth honestly, not a guess', () => {
    const animator = new Animator();
    expect(animator.queueDepth).toBe(0);
    const state = createMatch({ seed: 4, playerDeck: deck(7), aiDeck: deck(8) });
    const step = applyAction(state, { t: 'place', cell: 0, cardIndex: 0 });
    animator.push(step.events, step.state);
    expect(animator.queueDepth).toBeGreaterThan(0);
    animator.snapTo(step.state.board);
    expect(animator.queueDepth).toBe(0);
  });
});
