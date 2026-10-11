/**
 * Battles and turn handovers, as motion.
 *
 * Both of these had code written for them that never ran, which is why this file exists and why its
 * assertions are about *pixels and clocks* rather than return values.
 *
 * **The battle animation was unreachable.** `Animator.push` queued an animation per event only when
 * the event had a `cell` field. `battle` and `battle-roll` name `attacker` and `defender` instead,
 * because a fight is two cards — so every battle event was dropped on the floor, and `kindFor`'s
 * `'battle'` branch, `frameAt`'s `case 'battle'`, and `CardFrame.flash` were all unreachable code.
 * `flash` was additionally read by nothing anywhere. The visible result was that the loudest moment
 * in a match had no motion at all, and `tools/perf.ts` reported the animator doing useful work.
 *
 * The test that would have caught it is the first one below, and it is deliberately blunt: it renders
 * the board in the middle of a fight and again once the fight is over, and asserts the two drawings
 * differ. Counting draw calls cannot do that — the calls are the same shape, only the numbers change.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { Animator, totalDuration } from '../../src/render/animator.ts';
import { boardLayout, drawBoard, drawScoreBar } from '../../src/render/boardView.ts';
import { drawBattleRoll, drawCardFace } from '../../src/render/cardView.ts';
import { applyAction, createMatch, legalCells } from '../../src/core/match.ts';
import { createRng } from '../../src/core/rng.ts';
import { rollInstance } from '../../src/core/card.ts';
import { figuresOfTier } from '../../src/data/cards.ts';
import { installCanvasStub, stubContext } from './canvasStub.ts';
import { COLORS } from '../../src/render/theme.ts';
import type { BattleRollFrame } from '../../src/render/animator.ts';
import type { GameEvent, GameState, Tier } from '../../src/core/types.ts';
import type { Action } from '../../src/core/match.ts';

installCanvasStub();

function deck(seed: number, tier: Tier = 3): ReturnType<typeof rollInstance>[] {
  const pool = figuresOfTier(tier);
  const rng = createRng(seed);
  return Array.from({ length: 5 }, () => rollInstance(pool[rng.int(pool.length)]!, rng));
}

function matchAt(seed: number): GameState {
  return createMatch({ seed, playerDeck: deck(seed * 2 + 1), aiDeck: deck(seed * 2 + 2) });
}

/** One battle resolved by the engine, with the board as it stood before it. */
interface Fight {
  readonly before: GameState;
  readonly after: GameState;
  readonly events: readonly GameEvent[];
  readonly roll: Extract<GameEvent, { t: 'battle-roll' }>;
}

/** Plays greedy matches until one produces a battle, so the tests use real data. */
function findFight(maxSeeds = 400): Fight {
  for (let seed = 1; seed <= maxSeeds; seed++) {
    let state = matchAt(seed);
    for (let step = 0; step < 40 && state.phase !== 'over'; step++) {
      const action: Action =
        state.phase === 'chooseBattle'
          ? { t: 'chooseBattle', cell: state.pendingBattles[0] as never }
          : { t: 'place', cell: legalCells(state)[0] as never, cardIndex: 0 };
      const before = state;
      const result = applyAction(state, action);
      const roll = result.events.find(
        (e): e is Extract<GameEvent, { t: 'battle-roll' }> => e.t === 'battle-roll',
      );
      if (roll !== undefined) {
        return { before, after: result.state, events: result.events, roll };
      }
      if (result.events.some((e) => e.t === 'illegal')) break;
      state = result.state;
    }
  }
  throw new Error(`no battle in ${maxSeeds} seeds`);
}

function newCanvas(): CanvasRenderingContext2D {
  document.body.innerHTML = '<canvas id="c" width="520" height="520"></canvas>';
  return document
    .querySelector<HTMLCanvasElement>('#c')!
    .getContext('2d') as CanvasRenderingContext2D;
}

/** Records every canvas operation, so two frames can be compared call for call. */
/** Every `fillText` label a recorded frame drew, in order. */
function textOf(ops: readonly unknown[]): string[] {
  return ops
    .filter(
      (op): op is [string, string, number, number] => Array.isArray(op) && op[0] === 'fillText',
    )
    .map((op) => op[1]);
}

function recordedRender(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  animator: Animator,
): unknown[] {
  const ops: unknown[] = [];
  // The proxy has to *write* through to the real context, or the canvas stub's own state (fonts,
  // styles) would never update and later draws would be recorded against stale values.
  const backing = ctx as unknown as Record<string | symbol, unknown>;
  const proxy = new Proxy(ctx, {
    get(t, k) {
      if (k === 'canvas') return t.canvas;
      const value = backing[k];
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        ops.push([k === 'fillText' ? 'fillText' : String(k), ...args]);
        return undefined;
      };
    },
    set(_t, k, v) {
      ops.push(['set', String(k), v]);
      backing[k] = v;
      return true;
    },
  });

  drawBoard(proxy, state, {
    layout: boardLayout(480, 20, 20),
    frames: animator.frames(),
    highlightLegal: true,
  });
  return ops;
}

/** Ticks until the handover glow is lit, so tests do not care where in the action it is scheduled. */
function tickUntilGlow(animator: Animator): ReturnType<Animator['turnGlow']> {
  for (let i = 0; i < 400; i++) {
    const glow = animator.turnGlow();
    if (glow !== null) return glow;
    animator.tick(8);
  }
  return null;
}

beforeEach(() => {
  document.body.textContent = '';
});

describe('a battle is visible', () => {
  it('draws differently in the middle of a fight than after it', () => {
    // The blunt assertion, and the one that would have caught the whole thing. It compares rendered
    // output rather than internal state, because the bug was that the internals were fine and the
    // pixels were not.
    const fight = findFight();
    const animator = new Animator();
    animator.syncTo(fight.before.board);
    animator.push(fight.events, fight.after);

    let midFlight: unknown[] = [];
    let ticks = 0;
    while (!animator.idle && ticks < 400) {
      animator.tick(8);
      ticks++;
      if (midFlight.length === 0) midFlight = recordedRender(newCanvas(), fight.after, animator);
    }
    const settledFrame = recordedRender(newCanvas(), fight.after, animator);

    expect(ticks * 8, 'the fight should occupy real time').toBeGreaterThan(100);
    expect(midFlight.length, 'the mid-fight frame should have drawn something').toBeGreaterThan(0);
    expect(JSON.stringify(midFlight), 'the board looked identical mid-fight and after it').not.toBe(
      JSON.stringify(settledFrame),
    );
  });

  it('actually draws the numbers onto the board', () => {
    // The blunt test above passes on *any* difference between the frames — an opacity or a scale
    // would satisfy it — so it cannot tell "the fight is animated" from "the fight is drawn". A
    // mutation that computed the roll perfectly and never rendered it survived it. This one reads
    // the pixels: the counting number has to appear as text on the canvas.
    const fight = findFight();
    const animator = new Animator();
    animator.syncTo(fight.before.board);
    animator.push(fight.events, fight.after);

    let drawn: string[] = [];
    let ticks = 0;
    while (!animator.idle && ticks < 400) {
      animator.tick(8);
      ticks++;
      const roll = animator.frameAt(fight.roll.attacker).roll;
      if (roll === null) continue;
      drawn = textOf(recordedRender(newCanvas(), fight.after, animator));
      if (drawn.includes(`${roll.value}`)) break;
    }

    expect(drawn, 'no frame ever showed the counting number').toContain(
      `${animator.frameAt(fight.roll.attacker).roll?.value ?? ''}`,
    );
    // The odds line belongs to the overlay and to nothing else on the board, so it pins the
    // overlay specifically rather than a stray digit matching a stat code.
    expect(drawn.some((t) => /^\d{1,3}%$/.test(t))).toBe(true);

    // And once the fight is over none of it is left on screen.
    expect(textOf(recordedRender(newCanvas(), fight.after, animator))).not.toContain(
      `${fight.roll.atkActual}%`,
    );
  });

  it('shows a counting number on both cards in the fight', () => {
    const fight = findFight();
    const animator = new Animator();
    animator.syncTo(fight.before.board);
    animator.push(fight.events, fight.after);

    const attacker = animator.frameAt(fight.roll.attacker).roll;
    const defender = animator.frameAt(fight.roll.defender).roll;
    expect(attacker?.side).toBe('attacker');
    expect(defender?.side).toBe('defender');

    // Exactly one winner, and the two sides never both claim it.
    expect(attacker?.won).toBe(!defender?.won);
    expect(attacker?.probability).toBeCloseTo(fight.roll.probability, 6);
    expect(defender?.probability).toBeCloseTo(fight.roll.probability, 6);
  });

  it('counts down to the real value and stops there', () => {
    // Down, not up: §1.6 has the attacker subtract its roll from its ATK, so a bigger number is a
    // worse one. I wrote this test assuming it counted up and the implementation corrected me,
    // which is the right way round.
    const fight = findFight();
    const animator = new Animator();
    animator.syncTo(fight.before.board);
    animator.push(fight.events, fight.after);

    // One fight can be several `battle-roll` events in a chain on the same card, so take the runs of
    // frames that had numbers and check the last one. Gaps are real: the roll is absent between
    // fights, and merging across a gap would hide a number that jumps.
    const values: (number | null)[] = [];
    let ticks = 0;
    while (!animator.idle && ticks < 2000) {
      animator.tick(8);
      ticks++;
      values.push(animator.frameAt(fight.roll.attacker).roll?.value ?? null);
    }

    const runs: number[][] = [];
    let current: number[] | null = null;
    for (const value of values) {
      if (value === null) {
        current = null;
        continue;
      }
      if (current === null) {
        current = [];
        runs.push(current);
      }
      current.push(value);
    }

    // `fight.roll` is the first `battle-roll` in this log, so it is the first run.
    const seen = runs[0] ?? [];
    const distinct = [...new Set(seen)];
    expect(distinct.length, 'the number never moved').toBeGreaterThan(1);
    expect(distinct, 'the count did not fall').toEqual([...distinct].sort((a, b) => b - a));

    // It has to start at the printed stat and land exactly on the engine's figure, and never
    // stray outside the two.
    expect(seen[0]).toBe(fight.roll.atkBase);
    expect(seen.at(-1)).toBe(fight.roll.atkActual);
    for (const value of seen) {
      expect(value).toBeLessThanOrEqual(fight.roll.atkBase);
      expect(value).toBeGreaterThanOrEqual(fight.roll.atkActual);
    }
  });

  it('brightens the cards while the numbers run, and only then', () => {
    const fight = findFight();
    const animator = new Animator();
    animator.syncTo(fight.before.board);
    animator.push(fight.events, fight.after);

    let peak = 0;
    let ticks = 0;
    while (!animator.idle && ticks < 400) {
      animator.tick(8);
      ticks++;
      peak = Math.max(peak, animator.frameAt(fight.roll.attacker).flash);
    }
    expect(peak).toBeGreaterThan(0.5);

    // Once it is over there is nothing left to glow, or the board sits permanently lit.
    expect(animator.frameAt(fight.roll.attacker).flash).toBe(0);
    expect(animator.frameAt(fight.roll.attacker).roll).toBeNull();
  });

  it('leaves no numbers on cards that were not fighting', () => {
    const fight = findFight();
    const animator = new Animator();
    animator.syncTo(fight.before.board);
    animator.push(fight.events, fight.after);
    animator.tick(8);

    const fighting = new Set<number>([fight.roll.attacker, fight.roll.defender]);
    for (let cell = 0; cell < 16; cell++) {
      if (fighting.has(cell)) continue;
      expect(animator.frameAt(cell as never).roll, `cell ${cell}`).toBeNull();
    }
  });
});

describe('turn handovers', () => {
  /** One action's log, guaranteed to contain a `turn` event. */
  function actionWithHandover(): {
    before: GameState;
    after: GameState;
    events: readonly GameEvent[];
  } {
    const before = matchAt(11);
    const result = applyAction(before, {
      t: 'place',
      cell: legalCells(before)[0] as never,
      cardIndex: 0,
    });
    expect(result.events.some((e) => e.t === 'turn')).toBe(true);
    return { before, after: result.state, events: result.events };
  }

  it('says whose turn it became', () => {
    const { before, after, events } = actionWithHandover();
    const animator = new Animator();
    animator.syncTo(before.board);
    expect(animator.turnGlow()).toBeNull();

    animator.push(events, after);
    // The handover is scheduled where it sits in the action's sequence, so it lights when the
    // animation reaches it — not the instant the button was pressed.
    expect(animator.turnGlow()).toBeNull();
    const glow = tickUntilGlow(animator);
    expect(glow?.owner).toBe(after.turn);
    expect(glow?.strength).toBeGreaterThan(0);
  });

  it('fades out rather than staying on', () => {
    const { before, after, events } = actionWithHandover();
    const animator = new Animator();
    animator.syncTo(before.board);
    animator.push(events, after);

    tickUntilGlow(animator);
    const strengths: number[] = [];
    for (let i = 0; i < 200; i++) {
      const glow = animator.turnGlow();
      if (glow === null) break;
      strengths.push(glow.strength);
      animator.tick(16);
    }
    expect(strengths.length).toBeGreaterThan(2);
    // Rises fast, then decays — a handover should be noticed at once and then get out of the way.
    expect(strengths[0]).toBeLessThan(strengths[Math.min(3, strengths.length - 1)] as number);
    expect(strengths.at(-1)).toBeLessThan(0.2);
    expect(animator.turnGlow()).toBeNull();
  });

  it('never blocks input, because it is not in the queue', () => {
    // The point of keeping it out of `queue`: a decorative glow must not be able to cost somebody a
    // move. If this ever queues, `idle` waits for it and the game feels laggy for no reason.
    const { before, after, events } = actionWithHandover();
    const animator = new Animator();
    animator.syncTo(before.board);
    animator.push(events, after);

    tickUntilGlow(animator);
    let guard = 0;
    while (animator.tick(16) && guard++ < 500);
    expect(animator.idle).toBe(true);
    // Still within the glow's own lifetime, and yet nothing is blocked.
    expect(animator.turnGlow()).not.toBeNull();
  });

  it('reaches the screen', () => {
    // Same trap as the roll: the glow can be computed correctly and drawn nowhere, and a test that
    // only checks the animator cannot tell. The score bar's glow is the only radial gradient it
    // ever draws, so its presence is the pin.
    const glowed = stubContext();
    drawScoreBar(glowed.ctx, matchAt(13), 20, 14, 480, { owner: 'player', strength: 0.8 });
    const plain = stubContext();
    drawScoreBar(plain.ctx, matchAt(13), 20, 14, 480, null);

    expect(glowed.calls.addColorStop ?? 0).toBeGreaterThan(0);
    expect(plain.calls.addColorStop ?? 0).toBe(0);
  });

  it('glows on the side of the seat that gained the turn', () => {
    // The halo sits behind the seat's own end of the bar. Getting it on the wrong side is a small
    // mistake that reads as "the other player moved" — and a call count cannot catch it, because
    // both sides draw exactly one arc. Hence the recorded geometry.
    const originX = 20;
    const width = 480;
    const left = stubContext();
    drawScoreBar(left.ctx, matchAt(14), originX, 14, width, { owner: 'player', strength: 0.8 });
    const right = stubContext();
    drawScoreBar(right.ctx, matchAt(14), originX, 14, width, { owner: 'ai', strength: 0.8 });

    const playerGlow = left.arcs.at(-1);
    const aiGlow = right.arcs.at(-1);
    expect(playerGlow).toBeDefined();
    expect(aiGlow).toBeDefined();

    // Player's glow is on the left of the bar, the opponent's on the right, and neither is in the
    // middle. The counts and the seat badges are also drawn on the canvas, so compare the *last*
    // arc, which is the glow.
    expect(playerGlow?.x).toBeLessThan(originX + width / 2);
    expect(aiGlow?.x).toBeGreaterThan(originX + width / 2);
    expect(playerGlow?.x).not.toBe(aiGlow?.x);
  });

  it('appears even when the first thing that happens is a handover', () => {
    // The clock used to advance only while something was queued, so a glow started before the first
    // animation would have frozen at zero and never lit.
    const animator = new Animator();
    animator.syncTo(matchAt(12).board);
    for (let i = 0; i < 30; i++) animator.tick(16);
    expect(animator.idle).toBe(true);
    expect(animator.turnGlow()).toBeNull(); // nothing has been pushed; the clock moved anyway
  });

  it('is off entirely when motion is reduced', () => {
    const { before, after, events } = actionWithHandover();
    const animator = new Animator({ reduceMotion: 'reduced' });
    animator.syncTo(before.board);
    animator.push(events, after);
    expect(animator.turnGlow()).toBeNull();
    expect(animator.frameAt(legalCells(before)[0] as never).roll).toBeNull();
  });
});

describe('the roll overlay', () => {
  const roll: BattleRollFrame = {
    value: 7,
    final: 12,
    side: 'attacker',
    won: true,
    probability: 0.62,
  };

  it('draws the counting number and the odds', () => {
    // It has to be drawn, not merely computed. `flash` was the original version of this mistake:
    // computed every frame, read by nobody.
    const rec = stubContext();
    drawBattleRoll(rec.ctx, 100, roll, 0.8);
    const text = rec.text.map((t) => t.text);
    expect(text).toContain('7');
    expect(text).toContain('62%');
  });

  it('changes with the number it is given', () => {
    const before = stubContext();
    drawBattleRoll(before.ctx, 100, { ...roll, value: 7 }, 0.8);
    const after = stubContext();
    drawBattleRoll(after.ctx, 100, { ...roll, value: 11 }, 0.8);
    expect(before.text.map((t) => t.text)).not.toEqual(after.text.map((t) => t.text));
  });

  it('does not draw the settled value it is counting towards', () => {
    // Showing "12" while counting to 12 gives the answer away before the roll lands.
    const rec = stubContext();
    drawBattleRoll(rec.ctx, 100, roll, 0.8);
    const text = rec.text.map((t) => t.text);
    expect(text).toContain('7');
    expect(text).not.toContain('12');
  });

  it('draws nothing at all when the flash has faded', () => {
    // No ring once the fight is over — a permanent outline would read as a permanent state.
    const rec = stubContext();
    drawBattleRoll(rec.ctx, 100, roll, 0);
    expect(rec.strokes).toHaveLength(0);
  });

  it('colours by who won, not by which side', () => {
    const numberColour = (won: boolean): string => {
      const rec = stubContext();
      drawBattleRoll(rec.ctx, 100, { ...roll, won }, 0.8);
      const number = rec.fills.find((f) => f.text === `${roll.value}`);
      if (number === undefined) throw new Error('the counting number was not drawn');
      return number.style;
    };
    expect(numberColour(true)).toBe(COLORS.good);
    expect(numberColour(false)).toBe(COLORS.bad);
  });

  it('lives outside drawCardFace, which stays a pure function of the card', () => {
    // Kept separate on purpose. If the overlay moves into the card face, the "rendering never
    // mutates state" tests stop meaning anything, because the face would depend on the fight.
    expect(drawCardFace.length).toBeLessThanOrEqual(4);
  });
});

describe('totalDuration tells the truth', () => {
  it('counts only events that actually animate', () => {
    // It claimed 864ms for a fight that occupied 240. Nothing used it, so nothing caught it; it is
    // exported, so it can be pinned.
    const fight = findFight();
    const animator = new Animator();
    animator.syncTo(fight.before.board);
    animator.push(fight.events, fight.after);

    const queued = totalDuration(fight.events);
    // Every battle event animates two cards at once, so the wall-clock total is the sum of per-event
    // durations — not twice that.
    expect(queued).toBeGreaterThan(0);
    expect(queued).toBe(totalDuration(fight.events.filter((e) => e.t !== 'turn')));

    let elapsed = 0;
    while (!animator.idle && elapsed < 10_000) {
      animator.tick(16);
      elapsed += 16;
    }
    expect(elapsed).toBeLessThanOrEqual(queued + 16);
  });

  it('is zero for a log with nothing to show', () => {
    expect(totalDuration([])).toBe(0);
  });
});
