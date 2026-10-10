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
import { PERSONALITIES, personalityById } from './ai/personalities.ts';
import { drawBoard, boardLayout, drawScoreBar } from './render/boardView.ts';
import { COLORS, FONTS } from './render/theme.ts';
import { clickToAction, hitTest } from './input/pointer.ts';
import { KEY_BINDINGS, handleKey, resolveKey } from './input/keys.ts';
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
import { describeMode, renderToolbar } from './ui/components/toolbar.ts';
import { renderRules } from './ui/screens/rulesView.ts';
import {
  Announcer,
  boardDescription,
  prefersReducedMotion,
  seatLabels,
  watchReducedMotion,
} from './ui/accessibility.ts';
import { MODES, blockedReason, isAiSeat, planDecks, type ModeId } from './game/modes.ts';
import { Profile } from './game/profile.ts';
import { describeChange } from './game/progression.ts';
import { cuesFor, Synth } from './audio/synth.ts';
import { Animator } from './render/animator.ts';
import type { Outcome } from './core/types.ts';

/**
 * The board's design size.
 *
 * Everything below is drawn in these CSS pixels and the canvas backing store is scaled to match the
 * device pixel ratio, so the art is identical at every density. `fitCanvas` then scales the whole
 * thing down on a narrow window rather than redrawing at a different size — one set of coordinates,
 * one layout table, no second code path to keep in step.
 */
const BOARD_SIZE = 560;

/** The narrowest window the layout is designed for (PLAN.md §6: down to 1280x720). */
const MIN_VIEWPORT = { width: 1280, height: 720 };

function boot(): void {
  const canvas = query('#board') as HTMLCanvasElement;
  const statusEl = query('#status');
  const hintEl = query('#hint');
  const handEl = query('#hand');
  const pickerEl = query('#picker');
  const resultsEl = query('#results');
  const keysEl = query('#keys');
  const toggleRulesEl = query('#toggle-rules') as HTMLButtonElement;
  const collectionEl = query('#collection');
  const toggleCollectionEl = query('#toggle-collection') as HTMLButtonElement;
  const toolbarEl = query('#toolbar');
  const rulesEl = query('#rules');
  const announceEl = query('#announcer');
  const modeNoteEl = query('#mode-note');

  const context = canvas.getContext('2d');
  if (!context) throw new Error('boot: 2d canvas context unavailable');
  // Captured as a non-optional const: narrowing does not survive into the closures below.
  const ctx: CanvasRenderingContext2D = context;

  // ── responsive sizing ──────────────────────────────────────────────────────────────────────
  // The canvas is drawn at BOARD_SIZE in CSS pixels and then scaled to fit. Resizing the backing
  // store on every resize event instead would mean recomputing the layout and re-deriving every
  // coordinate, and would make pointer hit-testing depend on the scale.
  let dpr = Math.max(1, window.devicePixelRatio || 1);
  let cssScale = 1;

  function fitCanvas(): void {
    dpr = Math.max(1, window.devicePixelRatio || 1);
    const available = Math.min(
      window.innerWidth - 32,
      window.innerHeight - 260, // room for the toolbar, hand tray and status lines
      BOARD_SIZE,
    );
    // Never shrink below what fits at the minimum supported window: a board too small to read is
    // worse than a page that scrolls. Below 1280x720 the page scrolls rather than the board
    // becoming illegible.
    const minBoard = Math.min(MIN_VIEWPORT.width - 380, MIN_VIEWPORT.height - 300);
    cssScale = Math.max(minBoard / BOARD_SIZE, Math.min(1, available / BOARD_SIZE));
    canvas.width = Math.round(BOARD_SIZE * dpr);
    canvas.height = Math.round(BOARD_SIZE * dpr);
    canvas.style.width = `${Math.round(BOARD_SIZE * cssScale)}px`;
    canvas.style.height = `${Math.round(BOARD_SIZE * cssScale)}px`;
    // Scale the transform rather than the layout: every coordinate stays in BOARD_SIZE units, so
    // there is exactly one coordinate system in the whole renderer. Setting the transform (rather
    // than calling ctx.scale) also avoids compounding it on every resize.
    ctx.setTransform(dpr * cssScale, 0, 0, dpr * cssScale, 0, 0);
  }
  fitCanvas();
  window.addEventListener('resize', fitCanvas);

  // Stage 9: the collection, deck and record survive a reload. Loaded before the controller,
  // which builds its deck from them.
  const profile = new Profile();

  let seed = 20261010;
  // The opponent plays its own side (Stage 8). Rebuilt rather than mutated when the player picks a
  // different personality, so it keeps its own RNG and never shares state with the match.
  // Declared before `controller`, which is built by `newController` below and touches it.
  let opponent = new Opponent(personalityById(profile.save.opponent), seed + 101);

  // Stage 10: sound is synthesised, off by default, and a no-op where WebAudio is missing.
  const synth = new Synth({ volume: profile.settings.volume });
  synth.setEnabled(profile.settings.audio && synth.available);
  const announcer = new Announcer(announceEl);
  let thinking = false;
  let filter: CollectionFilter = DEFAULT_FILTER;
  let deckSlots: number[] = [...profile.save.deck];
  let showingCollection = false;
  let showingRules = false;
  let modeId: ModeId = profile.mode;
  let counterNote: string | null = null;
  // Progression runs exactly once per finished match. Declared up here because `newController`
  // resets it and is called during initialisation, below this point.
  let settled = false;
  const layout = boardLayout(BOARD_SIZE - 40, 20, 20);
  let controller = newController(seed);

  function newController(nextSeed: number): MatchController {
    const mode = MODES[modeId];
    opponent.reset(nextSeed + 101);
    thinking = false;
    settled = false;
    hintEl.textContent = '';

    // Deck construction is the only mode-specific decision, and it lives in `planDecks`. The
    // player's deck is the saved one; in tournament mode the computer's deck is built against it.
    const plan = planDecks(mode, profile.deckCards(), profile.save.collection, nextSeed);
    counterNote = plan.counter?.summary ?? plan.warning;

    return new MatchController(
      createMatch({
        seed: nextSeed,
        playerDeck: [...plan.playerDeck],
        aiDeck: [...plan.aiDeck],
      }),
      new Animator({ reduceMotion: reducedMotion() ? 'reduced' : 'full' }),
    );
  }

  function reducedMotion(): boolean {
    return profile.settings.reduceMotion ?? prefersReducedMotion();
  }

  /** Starts a match in `next`, rebuilding the opponent if the mode has one. */
  function startMode(next: ModeId): void {
    const reason = blockedReason(MODES[next], profile.save.collection.length);
    if (reason !== null) {
      hintEl.textContent = reason;
      return;
    }
    modeId = next;
    profile.setMode(next);
    if (MODES[next].selectableOpponent) {
      // A fresh opponent deserves a fresh personality, otherwise every rematch is the same fight.
      const pool = PERSONALITIES.filter((p) => p.difficulty !== 'sharp');
      const pick = pool[(seed + 101) % pool.length];
      if (pick !== undefined) profile.setOpponent(pick.id);
    }
    opponent = new Opponent(personalityById(profile.save.opponent), seed + 102);
    seed += 1;
    controller = newController(seed);
    showCollection(false);
    showRulesPanel(false);
    renderToolbarBar();
    syncDom();
  }

  keysEl.textContent = KEY_BINDINGS.map(
    (binding) => `${binding.keys} — ${binding.description}`,
  ).join('   ·   ');

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
    playEvents(controller.state.history, result.outcome);
    const growth = profile.finishMatch(controller.state, result.outcome).growth;
    if (growth.changes.length > 0) {
      hintEl.textContent = growth.changes.map(describeChange).join('   ·   ');
    }
  };

  const syncDom = (): void => {
    settleIfFinished();
    const view = controller.view;
    announce();
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

  // ── the toolbar, the rules screen, announcements and sound ───────────────────────────────────

  const renderToolbarBar = (): void => {
    renderToolbar(
      toolbarEl,
      {
        mode: modeId,
        opponent: profile.save.opponent,
        settings: profile.settings,
        collectionSize: profile.save.collection.length,
        opponentIsComputer: isAiSeat(MODES[modeId], 'ai'),
        audioAvailable: synth.available,
      },
      {
        onMode: (next) => {
          startMode(next);
        },
        onOpponent: (id) => {
          profile.setOpponent(id);
          opponent = new Opponent(personalityById(id), seed + 103);
          renderToolbarBar();
        },
        onSettings: (patch) => {
          const next = profile.updateSettings(patch);
          synth.setVolume(next.volume);
          synth.setEnabled(next.audio && synth.available);
          controller.animator.setReduceMotion(reducedMotion() ? 'reduced' : 'full');
          renderToolbarBar();
        },
      },
    );
    modeNoteEl.textContent = describeMode(MODES[modeId], counterNote);
  };

  const showRulesPanel = (show: boolean): void => {
    showingRules = show;
    rulesEl.hidden = !show;
    if (show) {
      renderRules(rulesEl, () => {
        showRulesPanel(false);
      });
    }
  };

  // Reduced motion follows the OS setting until the player overrides it here, and keeps following
  // it afterwards if they never have.
  watchReducedMotion((systemReduced) => {
    if (profile.settings.reduceMotion === null) {
      controller.animator.setReduceMotion(systemReduced ? 'reduced' : 'full');
    }
  });

  /** Announces the turn, the result, or the board — whichever a screen reader most needs now. */
  const announce = (): void => {
    const view = controller.view;
    const mode = MODES[modeId];
    const labels = seatLabels(isAiSeat(mode, 'ai'));

    if (view.result !== null) {
      const outcome: Outcome = view.result.outcome;
      announcer.say(
        outcome === 'loss'
          ? `Match over. You lose. ${view.score.player} cards to ${view.score.ai}.`
          : outcome === 'draw'
            ? `Match drawn, ${view.score.player} cards each.`
            : outcome === 'perfect'
              ? `Perfect game. All five cards taken.`
              : `Match over. You win, ${view.score.player} to ${view.score.ai}.`,
      );
      return;
    }

    const state = controller.state;
    announcer.say(
      `${labels[state.turn]}'s turn. ${boardDescription(
        state.board.map((card) =>
          card === null ? null : { owner: card.owner, name: String(card.figureId) },
        ),
        state.blocked,
        labels,
      )}`,
    );
  };

  const playEvents = (events: readonly { t: string }[], outcome: Outcome | null): void => {
    if (!synth.isEnabled) return;
    const cues = cuesFor(events as never, outcome);
    if (cues.length > 0) synth.playSequence(cues);
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
    pickerEl.hidden = show || showingRules || pickerEl.hidden;
    resultsEl.hidden = show || showingRules || resultsEl.hidden;
    rulesEl.hidden = showingRules;
    toggleCollectionEl.setAttribute('aria-pressed', String(show));
    toggleCollectionEl.textContent = show ? 'Back to the match (C)' : 'Collection (C)';
    if (show) renderProfileScreen();
    else syncDom();
  };

  toggleCollectionEl.addEventListener('click', () => {
    showCollection(!showingCollection);
  });

  toggleRulesEl.addEventListener('click', () => {
    showRulesPanel(!showingRules);
  });

  // ── input ──────────────────────────────────────────────────────────────────────────────────

  /** Pointer position in design coordinates, undoing the CSS scale applied by `fitCanvas`. */
  const pointerInLayout = (event: MouseEvent): [number, number] => {
    const rect = canvas.getBoundingClientRect();
    const scale = cssScale === 0 ? 1 : cssScale;
    return [(event.clientX - rect.left) / scale, (event.clientY - rect.top) / scale];
  };

  canvas.addEventListener('pointermove', (event) => {
    const [x, y] = pointerInLayout(event);
    const cell = hitTest(x, y, layout);
    controller.setHover(cell);
    draw();
  });

  canvas.addEventListener('pointerleave', () => {
    controller.setHover(null);
    draw();
  });

  canvas.addEventListener('click', (event) => {
    const [x, y] = pointerInLayout(event);
    const action = clickToAction(x, y, layout, controller.state, {
      selectedCard: controller.view.selected,
      hover: controller.view.hover,
    });
    if (action === null) return;
    if (action.t === 'place') {
      controller.selectCard(action.cardIndex);
      controller.playAt(action.cell);
    } else if (action.t === 'chooseBattle') {
      controller.chooseBattle(action.cell);
    }
    syncDom();
  });

  // The key layer is one list in `src/input/keys.ts`: what the page documents and what the app
  // performs come from the same source, so a binding cannot be documented without being wired.
  window.addEventListener('keydown', (event) => {
    const resolved = resolveKey(event.key);
    if (resolved === null) return;
    if (resolved.preventDefault) event.preventDefault();

    handleKey(event.key, {
      move: (dx, dy) => {
        controller.moveHover(dx, dy);
        draw();
      },
      select: (index) => {
        controller.selectCard(index);
      },
      confirm: () => {
        controller.confirm();
      },
      cancel: () => {
        controller.cancel();
      },
      hint: () => {
        controller.showHint();
      },
      newMatch: () => {
        seed += 1;
        controller = newController(seed);
      },
      nextMode: () => {
        startMode(
          modeId === 'match' ? 'tournament' : modeId === 'tournament' ? 'hotseat' : 'match',
        );
      },
      collection: () => {
        showCollection(!showingCollection);
      },
      rules: () => {
        showRulesPanel(!showingRules);
      },
    });
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

  renderToolbarBar();
  syncDom();
  requestAnimationFrame(loop);
}

function query(selector: string): HTMLElement {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`boot: ${selector} is missing from index.html`);
  return element as HTMLElement;
}

boot();
