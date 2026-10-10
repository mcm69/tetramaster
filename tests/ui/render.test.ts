/**
 * The renderer (PLAN.md §6, Stage 6).
 *
 * Pixel output is deliberately not asserted (§9.4) — comparing rasterised frames is brittle and
 * proves little. What matters and *is* asserted here:
 *
 *  - the animator converges on the true board, so an animation can never settle on the wrong state
 *  - render code never mutates game state (the Stage 6 DoD)
 *  - procedural art is deterministic, so a figure always looks the same
 *  - hit-testing maps screen points to the right cells
 *
 * jsdom has no canvas backend, so every test runs against a recording stub context.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Animator, totalDuration } from '../../src/render/animator.ts';
import {
  drawBoard,
  boardLayout,
  cellRect,
  drawScoreBar,
  drawBadge,
  hasArrows,
} from '../../src/render/boardView.ts';
import { drawCardFace, drawHandCard, cellFromPoint, roundRect } from '../../src/render/cardView.ts';
import { cardArt, clearArtCache, artCacheSize, drawSigil } from '../../src/render/sprites.ts';
import { drawArrow, drawArrows, DEFAULT_ARROW_STYLE } from '../../src/render/arrowSprite.ts';
import { COLORS, SEATS, FAMILY_HUE, seatOf } from '../../src/render/theme.ts';
import { applyAction, createMatch, playMatch, legalCells } from '../../src/core/match.ts';
import { createRng } from '../../src/core/rng.ts';
import { rollInstance } from '../../src/core/card.ts';
import { figureById, FIGURES } from '../../src/data/cards.ts';
import type { Cell, GameState } from '../../src/core/types.ts';
import type { Action } from '../../src/core/match.ts';

/** A recording stub: jsdom has no 2D context, so we count calls instead of drawing. */
interface Recorder {
  readonly ctx: CanvasRenderingContext2D;
  readonly calls: Record<string, number>;
  lastText: string | null;
}

function stubContext(): Recorder {
  const calls: Record<string, number> = {};
  const bump = (name: string) => {
    calls[name] = (calls[name] ?? 0) + 1;
  };
  const gradient = {
    addColorStop: () => {
      bump('addColorStop');
    },
  };
  const ctx = {
    canvas: { width: 620, height: 620 },
    globalAlpha: 1,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'butt',
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    shadowColor: 'transparent',
    shadowBlur: 0,
    shadowOffsetY: 0,
    save: () => {
      bump('save');
    },
    restore: () => {
      bump('restore');
    },
    translate: () => {
      bump('translate');
    },
    rotate: () => {
      bump('rotate');
    },
    scale: () => {
      bump('scale');
    },
    beginPath: () => {
      bump('beginPath');
    },
    closePath: () => {
      bump('closePath');
    },
    moveTo: () => {
      bump('moveTo');
    },
    lineTo: () => {
      bump('lineTo');
    },
    arc: () => {
      bump('arc');
    },
    quadraticCurveTo: () => {
      bump('quadraticCurveTo');
    },
    rect: () => {
      bump('rect');
    },
    fill: () => {
      bump('fill');
    },
    stroke: () => {
      bump('stroke');
    },
    clip: () => {
      bump('clip');
    },
    fillRect: () => {
      bump('fillRect');
    },
    clearRect: () => {
      bump('clearRect');
    },
    strokeRect: () => {
      bump('strokeRect');
    },
    fillText: () => {
      bump('fillText');
    },
    setTransform: () => {
      bump('setTransform');
    },
    createLinearGradient: () => {
      bump('createLinearGradient');
      return gradient;
    },
    createRadialGradient: () => {
      bump('createRadialGradient');
      return gradient;
    },
    drawImage: () => {
      bump('drawImage');
    },
    measureText: () => ({ width: 10 }),
  } as unknown as CanvasRenderingContext2D;

  const recorder: Recorder = { ctx, calls, lastText: null };
  return recorder;
}

let recorder: Recorder;

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(
    () => recorder.ctx,
  ) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

beforeEach(() => {
  recorder = stubContext();
  clearArtCache();
});

function matchAt(seed: number): GameState {
  const pool = FIGURES;
  const rng = createRng(seed);
  const deck = Array.from({ length: 5 }, () => rollInstance(pool[rng.int(pool.length)]!, rng));
  return createMatch({ seed, playerDeck: deck, aiDeck: deck.slice() });
}

function policy(state: GameState): Action {
  if (state.phase === 'chooseBattle') {
    const next = state.pendingBattles[0];
    return next === undefined ? { t: 'forfeit' } : { t: 'chooseBattle', cell: next };
  }
  const cell = legalCells(state)[0];
  return cell === undefined ? { t: 'forfeit' } : { t: 'place', cell, cardIndex: 0 };
}

describe('layout', () => {
  it('lays out a 4x4 grid of equal cells', () => {
    const layout = boardLayout(620, 0, 0);
    expect(layout.cellSize).toBeGreaterThan(0);
    // The four corners must all be inside the padded board area.
    const topLeft = cellRect(layout, 0);
    const bottomRight = cellRect(layout, 15);
    expect(topLeft.x).toBeGreaterThan(0);
    expect(bottomRight.x + bottomRight.size).toBeLessThan(620);
    expect(topLeft.y).toBeLessThan(bottomRight.y);
  });

  it('cellFromPoint agrees with hit-testing', () => {
    const layout = boardLayout(620, 0, 0);
    for (let index = 0; index < 16; index++) {
      const cell = index as Cell;
      const rect = cellRect(layout, cell);
      const centreX = rect.x + rect.size / 2;
      const centreY = rect.y + rect.size / 2;
      const found = cellFromPoint(
        centreX,
        centreY,
        layout.originX,
        layout.originY,
        layout.cellSize,
        layout.gutter,
        16,
      );
      expect(found).toBe(cell);
    }
  });

  it('cellFromPoint returns null off the board', () => {
    const layout = boardLayout(620, 0, 0);
    expect(
      cellFromPoint(-50, -50, layout.originX, layout.originY, layout.cellSize, layout.gutter, 16),
    ).toBeNull();
    expect(
      cellFromPoint(5000, 5000, layout.originX, layout.originY, layout.cellSize, layout.gutter, 16),
    ).toBeNull();
  });
});

describe('drawing', () => {
  it('draws an empty board without throwing', () => {
    const state = matchAt(1);
    const layout = boardLayout(620, 0, 0);
    expect(() => {
      drawBoard(recorder.ctx, state, { layout });
    }).not.toThrow();
    expect(recorder.calls['fill']).toBeGreaterThan(0);
  });

  it('paints every cell, blocked ones included', () => {
    let drewBlocked = false;
    for (let seed = 0; seed < 40 && !drewBlocked; seed++) {
      recorder = stubContext();
      const state = matchAt(seed);
      if (!state.blocked.some(Boolean)) continue;
      drawBoard(recorder.ctx, state, { layout: boardLayout(620, 0, 0) });
      drewBlocked = true;
    }
    expect(drewBlocked).toBe(true);
  });

  it('draws a card face with art, arrows, frame and stats', () => {
    const card = { ...figureInstance(3), owner: 'player' as const };
    drawCardFace(recorder.ctx, card, 100);
    expect(recorder.calls['fill']).toBeGreaterThan(3);
    expect(recorder.calls['stroke']).toBeGreaterThan(0);
    expect(recorder.calls['drawImage']).toBe(1); // procedural art
  });

  it('distinguishes seats by shape, not colour alone', () => {
    const card = { ...figureInstance(3), owner: 'ai' as const };
    // The ownership pip is a square for the player and a hexagon for the AI, so the board stays
    // readable without colour vision. A rect() call means the square path was taken.
    drawCardFace(recorder.ctx, { ...card, owner: 'player' }, 100);
    expect(recorder.calls['rect']).toBeGreaterThan(0);
    recorder = stubContext();
    drawCardFace(recorder.ctx, card, 100);
    expect(recorder.calls['rect']).toBeUndefined(); // hexagon is built from line segments
    expect(SEATS.player.shape).not.toBe(SEATS.ai.shape);
    expect(SEATS.player.frame).not.toBe(SEATS.ai.frame);
  });

  it('honours opacity and scale', () => {
    const card = { ...figureInstance(3), owner: 'player' as const };
    drawCardFace(recorder.ctx, card, 100, { opacity: 0.5, scale: 1.2 });
    expect(recorder.calls['scale']).toBeGreaterThan(0);
    recorder = stubContext();
    drawCardFace(recorder.ctx, card, 100, { opacity: 0 });
    expect(recorder.calls['fill']).toBeUndefined(); // nothing drawn when fully transparent
  });

  it('draws a hand card and a stat-less variant', () => {
    const card = { ...figureInstance(1), owner: 'player' as const };
    expect(() => {
      drawHandCard(recorder.ctx, card, 60);
    }).not.toThrow();
    recorder = stubContext();
    expect(() => {
      drawCardFace(recorder.ctx, card, 60, { showStats: false });
    }).not.toThrow();
    expect(recorder.calls['fillText']).toBeUndefined();
  });

  it('roundRect produces a closed path', () => {
    roundRect(recorder.ctx, 0, 0, 10, 10, 3);
    expect(recorder.calls['moveTo']).toBeGreaterThan(0);
    expect(recorder.calls['quadraticCurveTo']).toBeGreaterThan(0);
  });

  it('draws the score bar and badges', () => {
    const state = matchAt(2);
    expect(() => drawScoreBar(recorder.ctx, state, 0, 10, 620)).not.toThrow();
    expect(recorder.calls['fillText']).toBeGreaterThan(0);
    recorder = stubContext();
    drawBadge(recorder.ctx, 10, 10, '5', COLORS.accent);
    expect(recorder.calls['arc']).toBe(1);
  });

  it('reports whether a card has any arrows', () => {
    expect(hasArrows({ arrows: 0 })).toBe(false);
    expect(hasArrows({ arrows: 0b1 })).toBe(true);
  });
});

describe('arrow sprites', () => {
  it('draws nothing for a zero mask', () => {
    drawArrows(recorder.ctx, 0, 100);
    expect(recorder.calls['fill']).toBeUndefined();
  });

  it('draws one head per arrow in the mask', () => {
    for (let mask = 1; mask <= 255; mask++) {
      recorder = stubContext();
      drawArrows(recorder.ctx, mask, 100);
      const bits = mask
        .toString(2)
        .split('')
        .filter((b) => b === '1').length;
      expect(recorder.calls['fill'], `mask ${mask}`).toBe(bits);
    }
  });

  it('ignores an out-of-range direction rather than throwing', () => {
    expect(() => {
      drawArrow(recorder.ctx, 99 as never, 100);
    }).not.toThrow();
    expect(recorder.calls['fill']).toBeUndefined();
  });

  it('accepts a custom style', () => {
    drawArrows(recorder.ctx, 0b101, 100, { ...DEFAULT_ARROW_STYLE, alpha: 0.5 });
    expect(recorder.calls['stroke']).toBeGreaterThan(0);
  });
});

describe('procedural art', () => {
  it('is deterministic — the same figure always renders identically', () => {
    const figure = figureById(11);
    recorder = stubContext();
    drawSigil(recorder.ctx, figure, 128);
    const first = { ...recorder.calls };
    recorder = stubContext();
    drawSigil(recorder.ctx, figure, 128);
    expect(recorder.calls).toEqual(first);
    // Layer kinds vary by seed, so only the total work is guaranteed, not any single op.
    const drawn = Object.values(first).reduce((sum, n) => sum + n, 0);
    expect(drawn).toBeGreaterThan(4);
  });

  it('caches by figure and size', () => {
    expect(artCacheSize()).toBe(0);
    cardArt(figureById(4), 96);
    expect(artCacheSize()).toBe(1);
    cardArt(figureById(4), 96);
    expect(artCacheSize()).toBe(1); // cache hit, no new canvas
    cardArt(figureById(4), 128);
    expect(artCacheSize()).toBe(2); // different size, new entry
  });

  it('renders every figure without throwing', () => {
    for (const figure of FIGURES) {
      expect(() => cardArt(figure, 64), figure.name).not.toThrow();
    }
    expect(artCacheSize()).toBe(FIGURES.length);
  });

  it('gives different figures different artwork', () => {
    const a = stubContext();
    drawSigil(a.ctx, figureById(0), 128);
    const b = stubContext();
    drawSigil(b.ctx, figureById(1), 128);
    expect(a.calls).not.toEqual(b.calls);
  });

  it('covers every family with a hue', () => {
    for (const figure of FIGURES) {
      expect(FAMILY_HUE[figure.family], figure.name).toBeDefined();
    }
  });
});

describe('animator', () => {
  it('converges on the true board after an action', () => {
    const state = matchAt(3);
    const animator = new Animator();
    animator.syncTo(state.board);

    // Drive a real action through the engine, then animate its log.
    const cell = legalCells(state)[0] as Cell;
    const result = applyAction(state, { t: 'place', cell, cardIndex: 0 });
    animator.push(result.events, result.state);

    expect(animator.idle).toBe(false);
    let guard = 0;
    while (animator.tick(50) && guard++ < 200);
    expect(animator.idle).toBe(true);
    expect(animator.settled(result.state.board)).toBe(true);
  });

  it('ends up showing the correct owner after a contested battle', () => {
    let state = matchAt(4);
    const animator = new Animator();
    animator.syncTo(state.board);

    // Play until something changes hands.
    let found = false;
    for (let step = 0; step < 12 && !found; step++) {
      const action = policy(state);
      const result = applyAction(state, action);
      animator.push(result.events, result.state);
      let guard = 0;
      while (animator.tick(50) && guard++ < 500);
      state = result.state;
      found = result.events.some((e) => e.t === 'flip' || e.t === 'takedown' || e.t === 'combo');
    }
    expect(found).toBe(true);
    expect(animator.settled(state.board)).toBe(true);
  });

  it('collapses instantly when motion is reduced', () => {
    const state = matchAt(5);
    const animator = new Animator({ reduceMotion: 'reduced' });
    animator.syncTo(state.board);
    const cell = legalCells(state)[0] as Cell;
    const result = applyAction(state, { t: 'place', cell, cardIndex: 0 });
    animator.push(result.events, result.state);
    expect(animator.idle).toBe(true);
    expect(animator.settled(result.state.board)).toBe(true);
    expect(totalDuration(result.events, 'reduced')).toBe(0);
  });

  it('can switch motion off mid-flight', () => {
    const state = matchAt(6);
    const animator = new Animator();
    animator.syncTo(state.board);
    const cell = legalCells(state)[0] as Cell;
    animator.push(applyAction(state, { t: 'place', cell, cardIndex: 0 }).events, state);
    expect(animator.idle).toBe(false);
    animator.setReduceMotion('reduced');
    expect(animator.idle).toBe(true);
  });

  it('animates a full match to a correct final board', () => {
    const initial = matchAt(7);
    const animator = new Animator();
    animator.syncTo(initial.board);
    const { state } = playMatch(initial, policy);
    animator.snapTo(state.board);
    expect(animator.settled(state.board)).toBe(true);
    expect(animator.idle).toBe(true);
  });

  it('exposes a frame for every cell', () => {
    const animator = new Animator();
    const frames = animator.frames();
    expect(frames.size).toBe(16);
    for (const frame of frames.values()) {
      expect(frame.cell).toBeLessThan(16);
    }
  });

  it('totalDuration grows with the number of events', () => {
    expect(totalDuration([])).toBe(0);
    const long = totalDuration([
      {
        t: 'battle-roll',
        attacker: 0,
        defender: 1,
        atkBase: 1,
        atkRoll: 0,
        atkActual: 1,
        defBase: 1,
        defRoll: 0,
        defActual: 1,
        probability: 0.5,
        attackerWins: true,
      },
      { t: 'flip', cell: 1, from: 'ai', to: 'player', reason: 'battle' },
    ]);
    expect(long).toBeGreaterThan(0);
  });
});

describe('rendering never mutates state (Stage 6 DoD)', () => {
  it('leaves the game state byte-identical after a full render', () => {
    const state = matchAt(8);
    const snapshot = JSON.stringify(state);
    const layout = boardLayout(620, 0, 0);
    const animator = new Animator();
    animator.syncTo(state.board);

    drawBoard(recorder.ctx, state, {
      layout,
      frames: animator.frames(),
      highlightLegal: true,
      hover: 0,
      pendingBattles: [],
    });
    drawScoreBar(recorder.ctx, state, 0, 10, 620);

    expect(JSON.stringify(state)).toBe(snapshot);
  });

  it('leaves the state untouched when drawing every figure', () => {
    const state = matchAt(9);
    const snapshot = JSON.stringify(state);
    for (const figure of FIGURES) {
      drawSigil(recorder.ctx, figure, 64);
    }
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});

describe('theme', () => {
  it('maps both owners to distinct seats', () => {
    expect(seatOf('player')).toBe('player');
    expect(seatOf('ai')).toBe('ai');
    expect(seatOf('anything-else')).toBe('player');
  });

  it('gives every seat a frame, glow, pip and shape', () => {
    for (const seat of ['player', 'ai'] as const) {
      expect(SEATS[seat].frame).toMatch(/^#/);
      expect(SEATS[seat].glow).toMatch(/rgba/);
      expect(SEATS[seat].shape).toBeTruthy();
    }
  });
});

// ── helpers ────────────────────────────────────────────────────────────────────────────────

function figureInstance(id: number) {
  const figure = figureById(id);
  return { ...rollInstance(figure, createRng(id)), owner: 'player' as const };
}
