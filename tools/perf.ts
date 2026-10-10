/**
 * Performance measurement (PLAN.md §6, Stage 11).
 *
 * The plan asks for a board render under 4ms a frame and a bounded animator queue. Both are the kind
 * of requirement that is easy to satisfy on the day and quietly lose later, so they are measured in a
 * tool that *fails* rather than a number nobody reads.
 *
 * Two honest notes about what this can and cannot tell you.
 *
 * **Drawing is not measured here.** It needs a real canvas. Timing it in Node against a stub would
 * report the *stub's* speed, which is meaningless and worse than no number because it looks like a
 * measurement. What is measured instead is everything a frame depends on before the browser's own
 * draw calls: the animator's per-frame tick and frame lookups, and the AI's per-turn decision, which
 * is the heaviest single thing that can happen inside a frame.
 *
 * **The gate is p95, not the median.** A median hides the bad tail; a frame that is slow one time in
 * twenty is exactly the one a player feels. Both are printed, and `over` counts how many samples
 * blew the budget.
 */

import { applyAction, createMatch, legalCells } from '../src/core/match.ts';
import { createRng } from '../src/core/rng.ts';
import { rollInstance } from '../src/core/card.ts';
import { Animator } from '../src/render/animator.ts';
import { Opponent } from '../src/ai/opponent.ts';
import { personalityById } from '../src/ai/personalities.ts';
import { figuresOfTier } from '../src/data/cards.ts';
import type { Action, GameState } from '../src/core/match.ts';
import type { Card, Tier } from '../src/core/types.ts';

/** Budgets from `PLAN.md` §6. Exceeding one fails `npm run verify`. */
export const BUDGETS = {
  /** One animation tick plus the frame lookups a draw performs. */
  frameMs: 4,
  /** A full AI decision, which may run inside the frame the opponent moves. */
  decideMs: 8,
  /** The animator queue must not grow without bound during a normal match. */
  maxQueueDepth: 64,
} as const;

function deck(seed: number, tier: Tier): Card[] {
  const pool = figuresOfTier(tier);
  const rng = createRng(seed);
  return Array.from({ length: 5 }, () => {
    const figure = pool[rng.int(pool.length)];
    if (figure === undefined) throw new Error(`no figure in tier ${tier}`);
    return rollInstance(figure, rng);
  });
}

function naive(state: GameState): Action {
  if (state.phase === 'chooseBattle') {
    const next = state.pendingBattles[0];
    return next === undefined ? { t: 'forfeit' } : { t: 'chooseBattle', cell: next };
  }
  const cell = legalCells(state)[0];
  return cell === undefined ? { t: 'forfeit' } : { t: 'place', cell, cardIndex: 0 };
}

export interface Timing {
  readonly name: string;
  readonly samples: number;
  readonly medianMs: number;
  readonly p95Ms: number;
  readonly budgetMs: number;
  readonly overBudget: number;
}

/** Median and p95 of a sample set. */
export function summarise(name: string, durations: readonly number[], budgetMs: number): Timing {
  const sorted = [...durations].sort((a, b) => a - b);
  const at = (q: number): number =>
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
  return {
    name,
    samples: sorted.length,
    medianMs: at(0.5),
    p95Ms: at(0.95),
    budgetMs,
    overBudget: sorted.filter((ms) => ms > budgetMs).length,
  };
}

export interface PerfReport {
  readonly timings: readonly Timing[];
  readonly maxQueueDepth: number;
  readonly queueBudget: number;
  readonly failures: readonly string[];
}

/**
 * Drives whole matches through a real animator and times the work a frame performs.
 *
 * Each action's event log is pushed in one go, exactly as `MatchController` does it, and then the
 * animator is ticked in 16ms steps until it settles. The queue depth is sampled throughout, which is
 * the only way to notice a queue that is fine for nine moves and unbounded on the tenth.
 */
export function measurePerf(matches = 200): PerfReport {
  const frame: number[] = [];
  const decide: number[] = [];
  let maxQueueDepth = 0;

  for (let seed = 0; seed < matches; seed++) {
    const options = {
      seed,
      playerDeck: deck(seed * 2 + 1, 3),
      aiDeck: deck(seed * 2 + 2, 3),
    };

    // Play the match for real, pushing each action's events to a live animator as they arrive.
    const animator = new Animator();
    const opponent = new Opponent(personalityById('master'), seed + 1);
    let state = createMatch(options);

    for (let guard = 0; guard < 200 && state.phase !== 'over'; guard++) {
      let action: Action;
      if (state.turn === 'ai') {
        const started = performance.now();
        action = opponent.act(state, 'ai') ?? { t: 'forfeit' };
        decide.push(performance.now() - started);
      } else {
        action = naive(state);
      }

      const step = applyAction(state, action);
      animator.push(step.events, step.state);
      maxQueueDepth = Math.max(maxQueueDepth, animator.queueDepth);
      state = step.state;

      // Run the animator out, timing a whole simulated frame each step: the tick, plus the frame
      // lookups the renderer performs for all sixteen cells.
      for (let tick = 0; tick < 400 && !animator.idle; tick++) {
        const started = performance.now();
        animator.tick(16);
        for (let cell = 0; cell < 16; cell++) animator.frameAt(cell as never);
        frame.push(performance.now() - started);
        maxQueueDepth = Math.max(maxQueueDepth, animator.queueDepth);
      }
    }
  }

  const timings = [
    summarise('animator frame', frame, BUDGETS.frameMs),
    summarise('ai.decide', decide, BUDGETS.decideMs),
  ];

  const failures: string[] = [];
  for (const timing of timings) {
    if (timing.p95Ms > timing.budgetMs) {
      failures.push(
        `${timing.name} p95 is ${timing.p95Ms.toFixed(3)}ms, over the ${timing.budgetMs}ms budget`,
      );
    }
    if (timing.samples > 0 && timing.overBudget > timing.samples * 0.05) {
      failures.push(
        `${timing.name} exceeded its budget on ${timing.overBudget}/${timing.samples} samples`,
      );
    }
  }
  if (maxQueueDepth > BUDGETS.maxQueueDepth) {
    failures.push(
      `animator queue reached depth ${maxQueueDepth}, over the ${BUDGETS.maxQueueDepth} limit`,
    );
  }

  return { timings, maxQueueDepth, queueBudget: BUDGETS.maxQueueDepth, failures };
}

function main(): void {
  const count = Number(process.argv[2] ?? 200);
  const report = measurePerf(count);

  console.log(`\nPerformance — sampled over ${count} matches\n`);
  console.log('  operation          samples     median        p95   budget    over');
  console.log('  ─────────────────  ────────  ────────  ────────  ───────  ──────');
  for (const timing of report.timings) {
    console.log(
      `  ${timing.name.padEnd(17)} ${String(timing.samples).padStart(7)}` +
        `  ${`${timing.medianMs.toFixed(4)}ms`.padStart(8)}` +
        `  ${`${timing.p95Ms.toFixed(4)}ms`.padStart(7)}` +
        `  ${`${timing.budgetMs}ms`.padStart(6)}` +
        `  ${String(timing.overBudget).padStart(5)}`,
    );
  }
  console.log(
    `\n  animator queue depth reached ${report.maxQueueDepth}, budget ${report.queueBudget}`,
  );

  if (report.failures.length > 0) {
    console.error('\n  PERFORMANCE FAILURES:\n');
    for (const failure of report.failures) console.error(`    ${failure}`);
    console.error('');
    process.exit(1);
  }

  console.log('\n  OK — every measured operation is inside its budget.\n');
}

if (process.argv[1]?.endsWith('perf.ts')) {
  main();
}
