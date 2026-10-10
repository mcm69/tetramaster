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
import { personalityById } from './ai/personalities.ts';
import { drawBoard, boardLayout, drawScoreBar } from './render/boardView.ts';
import { COLORS, FONTS } from './render/theme.ts';
import { clickToAction, hitTest, KEY_BINDINGS } from './input/pointer.ts';
import { MatchController } from './ui/app.ts';
import { Opponent } from './ai/opponent.ts';
import { renderBattlePicker } from './ui/components/picker.ts';
import { renderHand, renderResults, statusText } from './ui/components/hand.ts';
import {
  DEFAULT_FILTER,
  buildRows,
  renderCollection,
  renderCollectorHeader,
  toggleDeck,
  type CollectionFilter,
} from './ui/components/collection.ts';
import { renderDeckEditor, suggestDeck } from './ui/components/deckEditor.ts';
import { Profile } from './game/profile.ts';
import { describeChange } from './game/progression.ts';
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
  const collectionEl = query('#collection');
  const toggleCollectionEl = query('#toggle-collection') as HTMLButtonElement;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('boot: 2d canvas context unavailable');

  const dpr = window.devicePixelRatio || 1;
  canvas.width = BOARD_SIZE * dpr;
  canvas.height = BOARD_SIZE * dpr;
  canvas.style.width = `${BOARD_SIZE}px`;
  canvas.style.height = `${BOARD_SIZE}px`;
  ctx.scale(dpr, dpr);

  // Stage 9: the collection, deck and record survive a reload. Loaded before the controller,
  // which builds its deck from them.
  const profile = new Profile();

  let seed = 20261010;
  // Stage 8: the opponent plays its own side. Swap `personalityById` to face a different NPC.
  // Declared before `controller`, which is built by `newController` below and touches it.
  const opponent = new Opponent(personalityById(profile.save.opponent), seed + 101);
  let thinking = false;
  let filter: CollectionFilter = DEFAULT_FILTER;
  let deckSlots: number[] = [...profile.save.deck];
  let showingCollection = false;
  // Progression runs exactly once per finished match. Declared up here because `newController`
  // resets it and is called during initialisation, below this point.
  let settled = false;
  const layout = boardLayout(BOARD_SIZE - 40, 20, 20);
  let controller = newController(seed);

  function newController(nextSeed: number): MatchController {
    opponent.reset(nextSeed + 101);
    thinking = false;
    settled = false;
    hintEl.textContent = '';
    // The player's deck is now the saved one; the opponent keeps drawing from the catalogue so a
    // new save does not silently weaken the opposition.
    return new MatchController(
      createMatch({
        seed: nextSeed,
        playerDeck: profile.matchDeck(),
        aiDeck: demoDeck(nextSeed + 1, 3),
      }),
    );
  }

  keysEl.textContent =
    KEY_BINDINGS.map((b) => `${b.keys} — ${b.action}`).join('   ·   ') +
    `   ·   N — new match (vs ${personalityById(profile.save.opponent).name})   ·   C — collection`;

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

  /** Progression runs once per finished match, the first time the results appear. */
  const settleIfFinished = (): void => {
    if (settled) return;
    const result = controller.state.result;
    if (result === null) return;
    settled = true;
    const growth = profile.finishMatch(controller.state, result.outcome).growth;
    if (growth.changes.length > 0) {
      hintEl.textContent = growth.changes.map(describeChange).join('   ·   ');
    }
  };

  const syncDom = (): void => {
    settleIfFinished();
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
          const card = controller.taken[index];
          controller.claim(index);
          // §1.1: a won card joins the collection for good, which is how it ever grows.
          if (card !== undefined) profile.claim(card);
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

  // ── the collection screen ─────────────────────────────────────────────────────────────────

  const renderProfileScreen = (): void => {
    collectionEl.textContent = '';

    const header = document.createElement('div');
    renderCollectorHeader(header, profile.save);
    collectionEl.append(header);

    const deck = document.createElement('div');
    renderDeckEditor(
      deck,
      { ...profile.save, deck: deckSlots },
      {
        onSelect: (slot, uid) => {
          if (uid === null) {
            deckSlots = deckSlots.filter((_, index) => index !== slot);
          } else {
            const next = [...deckSlots];
            while (next.length < slot) next.push(uid);
            next[slot] = uid;
            deckSlots = next;
          }
          profile.setDeck(deckSlots);
          renderProfileScreen();
        },
        onAuto: () => {
          deckSlots = suggestDeck(profile.save);
          profile.setDeck(deckSlots);
          renderProfileScreen();
        },
        onPlay: () => {
          showCollection(false);
          seed += 1;
          controller = newController(seed);
          resultsEl.hidden = true;
          syncDom();
        },
      },
    );
    collectionEl.append(deck);

    const rows = buildRows(profile.save, filter);
    const grid = document.createElement('div');
    renderCollection(grid, rows, filter, deckSlots, profile.save.collection.length > 0, {
      onFilter: (next) => {
        filter = next;
        renderProfileScreen();
      },
      onToggleDeck: (uid) => {
        deckSlots = toggleDeck(deckSlots, uid);
        profile.setDeck(deckSlots);
        renderProfileScreen();
      },
    });
    collectionEl.append(grid);
  };

  const showCollection = (show: boolean): void => {
    showingCollection = show;
    collectionEl.hidden = !show;
    canvas.hidden = show;
    handEl.hidden = show;
    pickerEl.hidden = show || pickerEl.hidden;
    resultsEl.hidden = show || resultsEl.hidden;
    toggleCollectionEl.setAttribute('aria-pressed', String(show));
    toggleCollectionEl.textContent = show ? 'Back to the match (C)' : 'Collection (C)';
    if (show) renderProfileScreen();
    else syncDom();
  };

  toggleCollectionEl.addEventListener('click', () => {
    showCollection(!showingCollection);
  });

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
    } else if (event.key === 'c' || event.key === 'C') {
      showCollection(!showingCollection);
      return;
    } else if (event.key === 'n' || event.key === 'N') {
      seed += 1;
      controller = newController(seed);
      syncDom();
    } else {
      return;
    }
    syncDom();
  });

  // ── the one loop ───────────────────────────────────────────────────────────────────────────

  // The opponent's turn: hand it to the AI once the board is still. `thinking` keeps it to one
  // decision per turn rather than a burst of them as the animation settles.
  const stepOpponent = (): void => {
    if (thinking || controller.busy) return;
    const state = controller.state;
    if (state.phase === 'over' || state.turn !== 'ai') return;
    thinking = true;
    const action = opponent.act(state, 'ai') ?? { t: 'forfeit' as const };
    if (controller.submitExternal(action)) syncDom();
  };

  const loop = (): void => {
    const wasBusy = controller.busy;
    controller.advance(16);
    if (wasBusy && !controller.busy) syncDom();
    stepOpponent();
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
