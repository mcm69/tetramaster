/**
 * Application entry point (PLAN.md §6, Stage 7).
 *
 * Wires the DOM to the engine: the canvas shows the board, the hand tray and chooser are buttons,
 * and the keyboard does everything the mouse does. All the decision-making lives in
 * `ui/app.ts` — this file only translates events and paints.
 *
 * The loop is a single `requestAnimationFrame`: advance the animation, then draw. Input is ignored
 * while the board is animating, so the player can never outrun the visuals.
 */

import { createMatch } from './core/match.ts';
import { rollInstance } from './core/card.ts';
import { createRng } from './core/rng.ts';
import { figuresOfTier } from './data/cards.ts';
import { drawBoard, boardLayout, drawScoreBar } from './render/boardView.ts';
import { COLORS, FONTS } from './render/theme.ts';
import { clickToAction, hitTest, KEY_BINDINGS } from './input/pointer.ts';
import { MatchController } from './ui/app.ts';
import { renderBattlePicker } from './ui/components/picker.ts';
import { renderHand, renderResults, statusText } from './ui/components/hand.ts';
import type { Card, Tier } from './core/types.ts';

const BOARD_SIZE = 560;

function demoDeck(seed: number, tier: Tier): Card[] {
  const pool = figuresOfTier(tier);
  const rng = createRng(seed);
  return Array.from({ length: 5 }, () => {
    const figure = pool[rng.int(pool.length)];
    if (!figure) throw new Error(`no figure in tier ${tier}`);
    return rollInstance(figure, rng);
  });
}

function boot(): void {
  const canvas = query('#board') as HTMLCanvasElement;
  const statusEl = query('#status');
  const hintEl = query('#hint');
  const handEl = query('#hand');
  const pickerEl = query('#picker');
  const resultsEl = query('#results');
  const keysEl = query('#keys');

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('boot: 2d canvas context unavailable');

  const dpr = window.devicePixelRatio || 1;
  canvas.width = BOARD_SIZE * dpr;
  canvas.height = BOARD_SIZE * dpr;
  canvas.style.width = `${BOARD_SIZE}px`;
  canvas.style.height = `${BOARD_SIZE}px`;
  ctx.scale(dpr, dpr);

  let seed = 20261010;
  let controller = newController(seed);
  const layout = boardLayout(BOARD_SIZE - 40, 20, 20);

  function newController(nextSeed: number): MatchController {
    return new MatchController(
      createMatch({
        seed: nextSeed,
        playerDeck: demoDeck(nextSeed, 2),
        aiDeck: demoDeck(nextSeed + 1, 3),
      }),
    );
  }

  keysEl.textContent = KEY_BINDINGS.map((b) => `${b.keys} — ${b.action}`).join('   ·   ');

  // ── rendering ─────────────────────────────────────────────────────────────────────────────

  const draw = (): void => {
    const view = controller.view;
    ctx.fillStyle = COLORS.pageBackground;
    ctx.fillRect(0, 0, BOARD_SIZE, BOARD_SIZE);

    drawBoard(ctx, controller.state, {
      layout,
      frames: controller.animator.frames(),
      highlightLegal: true,
      hover: view.hover,
      pendingBattles: view.pending.map((choice) => choice.cell),
    });
    drawScoreBar(ctx, controller.state, 20, 14, BOARD_SIZE - 40);

    ctx.font = FONTS.label;
    ctx.fillStyle = COLORS.inkMuted;
    ctx.textAlign = 'center';
    ctx.fillText(
      `seed ${seed} · ${view.phase}${view.busy ? ' (animating)' : ''}`,
      BOARD_SIZE / 2,
      BOARD_SIZE - 10,
    );
  };

  // ── DOM sync ──────────────────────────────────────────────────────────────────────────────

  const syncDom = (): void => {
    const view = controller.view;
    statusEl.textContent = statusText(view);
    hintEl.textContent = view.hint ?? '';

    renderHand(handEl, view.hand, (index) => {
      controller.selectCard(index);
      syncDom();
      draw();
    });

    renderBattlePicker(pickerEl, view.pending, (cell) => {
      controller.chooseBattle(cell);
      syncDom();
    });

    if (view.result) {
      renderResults(
        resultsEl,
        view.result,
        controller.taken,
        (index) => {
          controller.claim(index);
          syncDom();
        },
        () => {
          seed += 1;
          controller = newController(seed);
          resultsEl.hidden = true;
          syncDom();
        },
      );
    } else {
      resultsEl.hidden = true;
    }
  };

  // ── input ──────────────────────────────────────────────────────────────────────────────────

  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    const cell = hitTest(event.clientX - rect.left, event.clientY - rect.top, layout);
    controller.setHover(cell);
    draw();
  });

  canvas.addEventListener('pointerleave', () => {
    controller.setHover(null);
    draw();
  });

  canvas.addEventListener('click', (event) => {
    const rect = canvas.getBoundingClientRect();
    const action = clickToAction(
      event.clientX - rect.left,
      event.clientY - rect.top,
      layout,
      controller.state,
      { selectedCard: controller.view.selected, hover: controller.view.hover },
    );
    if (action === null) return;
    if (action.t === 'place') {
      controller.selectCard(action.cardIndex);
      controller.playAt(action.cell);
    } else if (action.t === 'chooseBattle') {
      controller.chooseBattle(action.cell);
    }
    syncDom();
  });

  window.addEventListener('keydown', (event) => {
    const moves: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
      w: [-1, 0],
      s: [1, 0],
      a: [0, -1],
      d: [0, 1],
      W: [-1, 0],
      S: [1, 0],
      A: [0, -1],
      D: [0, 1],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      controller.moveHover(move[0], move[1]);
      draw();
      return;
    }
    if (event.key >= '1' && event.key <= '5') {
      controller.selectCard(Number(event.key) - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      controller.confirm();
    } else if (event.key === 'Escape') {
      controller.cancel();
    } else if (event.key === 'h' || event.key === 'H') {
      controller.showHint();
    } else if (event.key === 'n' || event.key === 'N') {
      seed += 1;
      controller = newController(seed);
    } else {
      return;
    }
    syncDom();
  });

  // ── the one loop ───────────────────────────────────────────────────────────────────────────

  const loop = (): void => {
    const wasBusy = controller.busy;
    controller.advance(16);
    if (wasBusy && !controller.busy) syncDom();
    draw();
    requestAnimationFrame(loop);
  };

  syncDom();
  requestAnimationFrame(loop);
}

function query(selector: string): HTMLElement {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`boot: ${selector} is missing from index.html`);
  return element as HTMLElement;
}

boot();
