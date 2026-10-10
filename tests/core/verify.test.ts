/**
 * The headless invariant sweep, run as part of the normal suite (PLAN.md §9.2, signal 3).
 *
 * This is the third correctness signal. Rule traceability proves each rule is individually right;
 * coverage proves the code ran; this proves the game is *coherent* — that no combination of rules
 * produces a match that deadlocks, miscounts, or never ends.
 *
 * `npm run verify` runs the same function over 1,000–10,000 matches; here it runs a smaller batch
 * so the invariant check is part of every `npm test`.
 */

import { describe, expect, it } from 'vitest';
import { verify } from '../../tools/verify';

describe('headless match verification', () => {
  it('holds every invariant across 500 matches', () => {
    const report = verify(500);
    expect(report.failures, JSON.stringify(report.failures.slice(0, 10), null, 2)).toEqual([]);
    expect(report.matches).toBe(500);
  });

  it('every match reaches a decided-or-drawn result', () => {
    const report = verify(200);
    const total = Object.values(report.outcomes).reduce((sum, n) => sum + n, 0);
    expect(total).toBe(200);
    expect(report.outcomes['none']).toBeUndefined();
  });

  it('produces a spread of outcomes rather than one degenerate result', () => {
    const report = verify(400);
    // A game where one side always wins, or always draws, would mean a rule is stuck.
    expect(Object.keys(report.outcomes).length).toBeGreaterThanOrEqual(3);
    for (const [outcome, count] of Object.entries(report.outcomes)) {
      expect(count, `${outcome} count`).toBeGreaterThan(0);
    }
  });

  it('is reproducible for a given match count', () => {
    const a = verify(120);
    const b = verify(120);
    expect(a.outcomes).toEqual(b.outcomes);
    expect(a.firstPlayerWins).toBe(b.firstPlayerWins);
  });

  it('does not favour the opening player overwhelmingly', () => {
    // No AI exists yet, so this is a sanity check on turn order rather than a balance gate.
    const report = verify(600);
    const rate = report.firstPlayerWins / (report.matches - (report.outcomes['draw'] ?? 0));
    expect(rate).toBeGreaterThan(0.3);
    expect(rate).toBeLessThan(0.7);
  });
});
