/**
 * Application entry point.
 *
 * Stage 6 wires the real renderer to the real engine: a scripted match is played through
 * `applyAction`, and the animator replays each action's event log on a single rAF loop. This is the
 * end-to-end proof that the engine's output drives the screen.
 *
 * Stages 7 and 8 replace the scripted driver with human input and the AI.
 */

import { applyAction, createMatch, legalCells } from './core/match.ts';
import { rollInstance } from './core/card.ts';
import { createRng } from './core/rng.ts';
import { figuresOfTier } from './data/cards.ts';
import { drawBoard, boardLayout, drawScoreBar } from './render/boardView.ts';
import { Animator } from './render/animator.ts';
import { COLORS, FONTS } from './render/theme.ts';
import type { Action } from './core/match.ts';
import type { Card, GameState, Tier } from './core/types.ts';

const SEED = 20261010;

function deck(seed: number, tier: Tier): Card[] {
  const pool = figuresOfTier(tier);
  const rng = createRng(seed);
  return Array.from({ length: 5 }, () => {
    const figure = pool[rng.int(pool.length)];
    if (!figure) throw new Error(`no figure in tier ${tier}`);
    return rollInstance(figure, rng);
  });
}

function boot(): void {
  const canvas = document.querySelector<HTMLCanvasElement>('#board');
  const note = document.querySelector<HTMLParagraphElement>('#boot-note');
  if (!canvas) throw new Error('boot: #board canvas is missing from index.html');

  const size = 620;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('boot: 2d canvas context unavailable');
  ctx.scale(dpr, dpr);

  let state: GameState = createMatch({
    seed: SEED,
    playerDeck: deck(SEED, 2),
    aiDeck: deck(SEED + 1, 3),
  });
  const animator = new Animator();
  animator.syncTo(state.board);

  const layout: ReturnType<typeof boardLayout> = boardLayout(size - 40, 20, 56);
  let hover = legalCells(state)[0] ?? null;
  let step = 0;
  const policy = createRng(SEED + 99);

  const draw = (): void => {
    ctx.fillStyle = COLORS.pageBackground;
    ctx.fillRect(0, 0, size, size);

    drawBoard(ctx, state, {
      layout,
      frames: animator.frames(),
      highlightLegal: true,
      hover,
      pendingBattles: state.pendingBattles,
    });
    drawScoreBar(ctx, state, 20, 28, size - 40);

    ctx.font = FONTS.label;
    ctx.fillStyle = COLORS.inkMuted;
    ctx.textAlign = 'center';
    ctx.fillText(`seed ${SEED} · step ${step} · ${state.phase}`, size / 2, size - 12);
  };

  // A single rAF loop owns the clock. The scripted policy plays a move whenever the board settles.
  const loop = (): void => {
    const busy = animator.tick(16);
    draw();
    if (!busy && state.phase !== 'over') {
      const action = scriptedAction(policy, state);
      if (action) {
        const result = applyAction(state, action);
        if (!result.events.some((e) => e.t === 'illegal')) {
          state = result.state;
          animator.push(result.events, state);
          step++;
          hover = legalCells(state)[0] ?? null;
        }
      }
    }
    requestAnimationFrame(loop);
  };

  if (note) {
    note.textContent =
      'Scripted demo match — the engine drives the board through the animator. Player input and the AI arrive in Stages 7 and 8.';
  }
  requestAnimationFrame(loop);
}

/**
 * A deterministic stand-in for a player. It picks a random legal cell and, when a battle order is
 * pending, takes the first contested card — enough to drive a whole match for the demo.
 */
function scriptedAction(rng: ReturnType<typeof createRng>, state: GameState): Action | null {
  if (state.phase === 'chooseBattle') {
    const next = state.pendingBattles[0];
    return next === undefined ? null : { t: 'chooseBattle', cell: next };
  }
  const cells = legalCells(state);
  const cell = cells[rng.int(cells.length)];
  if (cell === undefined) return null;
  return { t: 'place', cell, cardIndex: rng.int(state.players[state.turn].hand.length) };
}

boot();
