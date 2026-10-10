/**
 * Where text lands (PLAN.md §6).
 *
 * The score bar used to draw all three of its labels at the same y: the two card counts at
 * `mid - 10` and `mid + 10`, and the turn label centred on `mid`. The counts therefore ran straight
 * through the middle label, and the overlap grew as the counts did — so it was worst exactly when the
 * score was worth reading.
 *
 * Counting `fillText` calls would never have caught it. It takes three calls to look right, one call
 * to look broken, and the failure is in their *positions*. So the canvas stub records every
 * `fillText` with its x, y, alignment and font, and this suite checks the geometry.
 */

import { describe, expect, it } from 'vitest';
import { drawScoreBar, turnLabel } from '../../src/render/boardView.ts';
import { stubContext } from './canvasStub.ts';
import { createMatch, applyAction, legalCells } from '../../src/core/match.ts';
import { createRng } from '../../src/core/rng.ts';
import { rollInstance } from '../../src/core/card.ts';
import { figuresOfTier } from '../../src/data/cards.ts';
import type { Card, Tier } from '../../src/core/types.ts';

function deck(seed: number, tier: Tier = 3): Card[] {
  const pool = figuresOfTier(tier);
  const rng = createRng(seed);
  return Array.from({ length: 5 }, () => {
    const figure = pool[rng.int(pool.length)];
    if (figure === undefined) throw new Error(`no figure in tier ${tier}`);
    return rollInstance(figure, rng);
  });
}

/** Roughly how wide `text` is at 13px, in canvas units. */
function widthOf(text: string): number {
  return text.length * 7.2;
}

/**
 * The horizontal span a `fillText` call occupies, given its alignment and x.
 *
 * `left` starts at x, `right` ends at x, `center` straddles it. `start`/`end` are resolved against
 * the inline direction, which for this renderer is always left-to-right.
 */
function spanOf(call: { text: string; x: number; align: CanvasTextAlign }): [number, number] {
  const width = widthOf(call.text);
  switch (call.align) {
    case 'right':
    case 'end':
      return [call.x - width, call.x];
    case 'center':
      return [call.x - width / 2, call.x + width / 2];
    default:
      return [call.x, call.x + width];
  }
}

describe('the score bar', () => {
  it('draws three labels, one per column', () => {
    const recorder = stubContext();
    drawScoreBar(
      recorder.ctx,
      createMatch({ seed: 1, playerDeck: deck(1), aiDeck: deck(2) }),
      20,
      14,
      520,
    );
    expect(recorder.text).toHaveLength(3);
  });

  it('does not overlap its labels at any score', () => {
    // The regression. Every reachable score, from an empty board to a full one.
    for (let placed = 0; placed <= 10; placed++) {
      let state = createMatch({ seed: 3, playerDeck: deck(3), aiDeck: deck(4) });
      for (let i = 0; i < placed; i++) {
        if (state.phase !== 'place') break;
        const cell = legalCells(state)[0];
        if (cell === undefined) break;
        state = applyAction(state, { t: 'place', cell, cardIndex: 0 }).state;
      }
      for (const phase of ['place', 'chooseBattle'] as const) {
        const recorder = stubContext();
        drawScoreBar(
          recorder.ctx,
          phase === 'chooseBattle' ? { ...state, phase } : state,
          20,
          14,
          520,
        );
        const labels = recorder.text.filter((call) => call.y === 14);
        for (let a = 0; a < labels.length; a++) {
          for (let b = a + 1; b < labels.length; b++) {
            const first = labels[a] as { text: string; x: number; align: CanvasTextAlign };
            const second = labels[b] as { text: string; x: number; align: CanvasTextAlign };
            const [aStart, aEnd] = spanOf(first);
            const [bStart, bEnd] = spanOf(second);
            const collides = aStart < bEnd && bStart < aEnd;
            expect(
              collides,
              `placed=${placed} phase=${phase}: "${first.text}" [${aStart.toFixed(0)}..${aEnd.toFixed(0)}] overlaps "${second.text}" [${bStart.toFixed(0)}..${bEnd.toFixed(0)}]`,
            ).toBe(false);
          }
        }
      }
    }
  });

  it('keeps every label inside the bar it was given', () => {
    const recorder = stubContext();
    const originX = 20;
    const width = 520;
    drawScoreBar(
      recorder.ctx,
      createMatch({ seed: 5, playerDeck: deck(5), aiDeck: deck(6) }),
      originX,
      14,
      width,
    );
    for (const call of recorder.text) {
      const [start, end] = spanOf(call);
      expect(start, call.text).toBeGreaterThanOrEqual(originX - 1);
      expect(end, call.text).toBeLessThanOrEqual(originX + width + 1);
    }
  });

  it('pluralises, so a single card does not read "1 cards"', () => {
    const recorder = stubContext();
    drawScoreBar(
      recorder.ctx,
      createMatch({ seed: 7, playerDeck: deck(7), aiDeck: deck(8) }),
      20,
      14,
      520,
    );
    expect(recorder.text.map((call) => call.text)).toEqual([
      '0 cards',
      '0 cards',
      'Player 1 to play',
    ]);
  });

  it('uses one line of text, not two', () => {
    const recorder = stubContext();
    drawScoreBar(
      recorder.ctx,
      createMatch({ seed: 9, playerDeck: deck(9), aiDeck: deck(10) }),
      20,
      14,
      520,
    );
    expect(new Set(recorder.text.map((call) => call.y)).size).toBe(1);
  });
});

describe('the turn label', () => {
  it('names the seat rather than leaking the internal id', () => {
    // It used to say "player to play", which reads as an identifier and matches nothing else on
    // screen. The rest of the interface says "Player 1" / "Player 2".
    const state = createMatch({ seed: 1, playerDeck: deck(1), aiDeck: deck(2) });
    expect(turnLabel(state)).toBe('Player 1 to play');
    expect(turnLabel({ ...state, turn: 'ai' })).toBe('Player 2 to play');
  });

  it('says what is happening rather than whose turn it is', () => {
    const state = createMatch({ seed: 1, playerDeck: deck(1), aiDeck: deck(2) });
    expect(turnLabel({ ...state, phase: 'chooseBattle' })).toBe('choose a battle');
    expect(turnLabel({ ...state, phase: 'over' })).toBe('match over');
  });

  it('never contains a raw owner id', () => {
    const state = createMatch({ seed: 1, playerDeck: deck(1), aiDeck: deck(2) });
    for (const turn of ['player', 'ai'] as const) {
      // `\b(player|ai)\b` would not match "Player 1" because of the capital P... it would, actually:
      // case-insensitive matching aside, the point is the raw lowercase ids are gone.
      expect(turnLabel({ ...state, turn })).toMatch(/^Player [12] to play$/);
      expect(turnLabel({ ...state, turn })).not.toContain(`${turn} to play`);
    }
  });
});
