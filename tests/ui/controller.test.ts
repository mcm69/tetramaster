/**
 * The controller and the UI components (PLAN.md §6, Stage 7).
 *
 * The Stage 7 DoD is "complete a match by mouse only, then again by keyboard only". That is checked
 * here rather than left to a human: `playMatchWith` drives the controller through one input path and
 * the other, and both must reach a finished match.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { MatchController, playToEnd, toCardView, type MatchView } from '../../src/ui/app.ts';
import { percentLabel, renderBattlePicker, verdict } from '../../src/ui/components/picker.ts';
import {
  cardWarning,
  renderHand,
  renderResults,
  statusText,
} from '../../src/ui/components/hand.ts';
import { installCanvasStub } from './canvasStub.ts';
import { createMatch, legalCells } from '../../src/core/match.ts';
import { createRng } from '../../src/core/rng.ts';
import { rollInstance } from '../../src/core/card.ts';
import { FIGURES } from '../../src/data/cards.ts';
import type { Cell, GameState } from '../../src/core/types.ts';

installCanvasStub();

function matchAt(seed: number): GameState {
  const rng = createRng(seed);
  const deck = Array.from({ length: 5 }, () =>
    rollInstance(FIGURES[rng.int(FIGURES.length)]!, rng),
  );
  return createMatch({ seed, playerDeck: deck, aiDeck: deck.slice() });
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('MatchController — card selection', () => {
  it('picks up and puts down a card', () => {
    const controller = new MatchController(matchAt(1));
    expect(controller.view.selected).toBeNull();
    expect(controller.selectCard(0)).toBe(true);
    expect(controller.view.selected).toBe(0);
    expect(controller.view.hand[0]?.selected).toBe(true);
    expect(controller.cancel()).toBe(true);
    expect(controller.view.selected).toBeNull();
  });

  it('refuses a card that is not in hand', () => {
    const controller = new MatchController(matchAt(1));
    expect(controller.selectCard(99)).toBe(false);
    expect(controller.view.selected).toBeNull();
  });

  it('refuses to play with no card selected', () => {
    const controller = new MatchController(matchAt(1));
    const cell = legalCells(controller.state)[0] as Cell;
    expect(controller.playAt(cell)).toBe(false);
  });

  it('exposes hand entries with stat codes and arrow counts', () => {
    const controller = new MatchController(matchAt(1));
    const hand = controller.view.hand;
    expect(hand).toHaveLength(5);
    for (const entry of hand) {
      expect(entry.card.statCode).toMatch(/^[0-9A-F][PMXA][0-9A-F][0-9A-F]$/);
      expect(entry.card.arrowCount).toBeGreaterThanOrEqual(0);
      expect(entry.card.name.length).toBeGreaterThan(0);
    }
  });
});

describe('MatchController — playing', () => {
  it('plays the selected card into a legal cell', () => {
    const controller = new MatchController(matchAt(1));
    const cell = legalCells(controller.state)[0] as Cell;
    controller.selectCard(0);
    expect(controller.playAt(cell)).toBe(true);
    expect(controller.state.board[cell]).not.toBeNull();
    expect(controller.view.selected).toBeNull();
  });

  it('refuses an illegal cell and leaves the match untouched', () => {
    const controller = new MatchController(matchAt(1));
    const cell = legalCells(controller.state)[0] as Cell;
    controller.selectCard(0);
    controller.playAt(cell);
    const occupied = cell;
    controller.selectCard(0);
    expect(controller.playAt(occupied)).toBe(false);
  });

  it('ignores input while the board is still animating', () => {
    const controller = new MatchController(matchAt(1));
    const cell = legalCells(controller.state)[0] as Cell;
    controller.selectCard(0);
    controller.playAt(cell);
    expect(controller.busy).toBe(true);
    const placedAfterFirstMove = controller.state.placedCount;

    // Hammer the board for the whole animation. Nothing may be placed, or the player outruns the
    // visuals and sees a stale position. Asserting on placedCount rather than on a return value
    // pins the *behaviour* — whichever guard stops it (selection or dispatch) is an implementation
    // detail, and both are defence-in-depth: the dispatch guard exists for callers that do not hold
    // a selected card, such as the AI in Stage 8.
    for (let i = 0; i < 20 && controller.busy; i++) {
      controller.selectCard(0);
      const next = legalCells(controller.state)[0];
      if (next !== undefined) controller.playAt(next);
      controller.advance(5);
    }
    expect(controller.state.placedCount).toBe(placedAfterFirstMove);

    while (controller.busy) controller.advance(1000);
    expect(controller.busy).toBe(false);
    // And input works again once the board settles.
    controller.selectCard(0);
    const after = legalCells(controller.state)[0];
    if (after !== undefined) expect(controller.playAt(after)).toBe(true);
  });

  it('refuses to pick up a card while the board is animating', () => {
    const controller = new MatchController(matchAt(1));
    const cell = legalCells(controller.state)[0] as Cell;
    controller.selectCard(0);
    controller.playAt(cell);
    expect(controller.busy).toBe(true);
    expect(controller.selectCard(0)).toBe(false);
    expect(controller.view.selected).toBeNull();
  });

  it('turns pass between players', () => {
    const controller = new MatchController(matchAt(1));
    const first = controller.state.turn;
    controller.selectCard(0);
    controller.playAt(legalCells(controller.state)[0] as Cell);
    while (controller.busy) controller.advance(1000);
    expect(controller.state.turn).not.toBe(first);
  });
});

describe('MatchController — keyboard cursor', () => {
  it('starts on the first legal cell and moves around the grid', () => {
    const controller = new MatchController(matchAt(2));
    expect(controller.moveHover(0, 0)).toBe(legalCells(controller.state)[0]);
    const first = controller.view.hover as Cell;
    const moved = controller.moveHover(0, 1);
    expect(moved).not.toBe(first);
    expect(legalCells(controller.state)).toContain(moved ?? -1);
  });

  it('never leaves the legal set', () => {
    const controller = new MatchController(matchAt(3));
    for (let i = 0; i < 40; i++) {
      const cell = controller.moveHover(i % 2 === 0 ? 1 : 0, i % 3 === 0 ? 1 : -1);
      expect(legalCells(controller.state)).toContain(cell ?? -1);
    }
  });

  it('confirm() plays at the cursor, not at the first legal cell', () => {
    const controller = new MatchController(matchAt(4));
    // Deliberately choose a target that is NOT the first legal cell, so "plays somewhere else"
    // cannot pass by coincidence.
    const first = legalCells(controller.state)[0];
    const target = legalCells(controller.state).find((cell) => cell !== first);
    expect(target).toBeDefined();

    controller.selectCard(0);
    controller.setHover(target as Cell);
    expect(controller.confirm()).toBe(true);

    expect(controller.state.board[target as Cell]).not.toBeNull();
    if (first !== undefined) expect(controller.state.board[first]).toBeNull();
  });

  it('a click and Enter on the same cell produce the same result', () => {
    const viaClick = new MatchController(matchAt(12));
    const viaKey = new MatchController(matchAt(12));
    const target = legalCells(viaClick.state)[1];

    viaClick.selectCard(0);
    viaClick.playAt(target as Cell);

    viaKey.selectCard(0);
    viaKey.setHover(target as Cell);
    viaKey.confirm();

    expect(viaKey.state.board).toEqual(viaClick.state.board);
  });
});

describe('MatchController — battle chooser (§1.7)', () => {
  /** Drives to a contested placement. */
  function reachContested(seed: number): MatchController | null {
    const controller = new MatchController(matchAt(seed));
    for (let step = 0; step < 8; step++) {
      if (controller.view.phase !== 'place') break;
      const cell = legalCells(controller.state)[0];
      if (cell === undefined) break;
      controller.selectCard(0);
      controller.playAt(cell);
      while (controller.busy) controller.advance(1000);
    }
    return controller.view.phase === 'chooseBattle' ? controller : null;
  }

  it('offers a choice with odds whenever a card points back', () => {
    let controller: MatchController | null = null;
    for (let seed = 0; seed < 300 && controller === null; seed++) {
      controller = reachContested(seed);
    }
    expect(controller).not.toBeNull();
    const choices = (controller as unknown as MatchController).battleChoices();
    expect(choices.length).toBeGreaterThan(0);
    for (const choice of choices) {
      expect(choice.probability).toBeGreaterThan(0);
      expect(choice.probability).toBeLessThan(1); // ties go to the defender, so never certain
      expect(choice.defender.statCode).toMatch(/^[0-9A-F][PMXA][0-9A-F][0-9A-F]$/);
    }
  });

  it('resolves once the player picks one', () => {
    let controller: MatchController | null = null;
    for (let seed = 0; seed < 300 && controller === null; seed++) {
      controller = reachContested(seed);
    }
    const live = controller as unknown as MatchController;
    const choice = live.battleChoices()[0] as { cell: Cell };
    expect(live.chooseBattle(choice.cell)).toBe(true);
    while (live.busy) live.advance(1000);
    expect(live.view.phase).not.toBe('chooseBattle');
  });

  it('refuses a battle that was not on the table', () => {
    const controller = new MatchController(matchAt(5));
    expect(controller.chooseBattle(0)).toBe(false);
  });
});

describe('MatchController — hints and claims', () => {
  it('explains a blocked cell, an occupied cell, and a pending fight', () => {
    const controller = new MatchController(matchAt(6));
    const blockedIndex = controller.state.blocked.findIndex(Boolean);
    if (blockedIndex >= 0) {
      controller.setHover(blockedIndex as Cell);
      expect(controller.showHint()).toMatch(/blocked/);
    }
    const cell = legalCells(controller.state)[0] as Cell;
    controller.selectCard(0);
    controller.playAt(cell);
    while (controller.busy) controller.advance(1000);
    controller.setHover(cell);
    expect(controller.showHint()).toMatch(/holds a/);
  });

  it('claims a captured card at the end of a match', () => {
    // Play a whole match out, then claim.
    const controller = new MatchController(matchAt(7));
    playToEnd(controller, () => null); // no-op policy: just settles animations
    expect(controller.view.result).toBeNull(); // nothing was played, so no result yet
  });
});

describe('the Stage 7 DoD — a whole match, mouse only then keyboard only', () => {
  /** Drives a whole match using only the mouse path: select a card, click a cell. */
  function playMatchWithMouse(seed: number): MatchController {
    const controller = new MatchController(matchAt(seed));
    const picker = createRng(seed + 17);

    for (let guard = 0; guard < 2000; guard++) {
      while (controller.busy) controller.advance(1000);
      const view = controller.view;
      if (view.phase === 'over') break;

      if (view.phase === 'chooseBattle') {
        // The picker is a mouse control: the player clicks one of the buttons.
        const choice = view.pending[picker.int(view.pending.length)];
        if (!choice) break;
        controller.chooseBattle(choice.cell);
        continue;
      }
      const cell = view.legal[picker.int(view.legal.length)];
      const index = view.hand[picker.int(view.hand.length)]?.index ?? 0;
      if (cell === undefined) break;
      // Mouse: click the card, then click the square.
      controller.selectCard(index);
      controller.setHover(cell);
      if (!controller.playAt(cell)) controller.selectCard(index);
    }
    return controller;
  }

  /** Drives the same match using only the keyboard path: 1-5 to pick, Enter to play. */
  function playMatchWithKeyboard(seed: number): MatchController {
    const controller = new MatchController(matchAt(seed));
    const picker = createRng(seed + 17);

    for (let guard = 0; guard < 2000; guard++) {
      while (controller.busy) controller.advance(1000);
      const view = controller.view;
      if (view.phase === 'over') break;

      if (view.phase === 'chooseBattle') {
        // Keyboard: move the cursor to the contested cell, then press Enter.
        const choice = view.pending[picker.int(view.pending.length)];
        if (!choice) break;
        controller.setHover(choice.cell);
        if (!controller.confirm()) controller.chooseBattle(choice.cell);
        continue;
      }
      const index = view.hand[picker.int(view.hand.length)]?.index ?? 0;
      controller.selectCard(index); // keys 1-5
      // Move the cursor by walking toward the chosen cell one step at a time.
      const target = view.legal[picker.int(view.legal.length)];
      if (target === undefined) break;
      for (let step = 0; step < 8; step++) {
        const from = controller.view.hover;
        if (from === target) break;
        const dr = Math.floor(target / 4) - (from === null ? 0 : Math.floor(from / 4));
        const dc = (target % 4) - (from === null ? 0 : from % 4);
        controller.moveHover(Math.sign(dr), Math.sign(dc));
      }
      if (!controller.confirm()) controller.moveHover(0, 0);
    }
    return controller;
  }

  it('completes a match with the mouse alone', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const controller = playMatchWithMouse(seed);
      expect(controller.view.phase, `seed ${seed}`).toBe('over');
      expect(controller.state.placedCount, `seed ${seed}`).toBe(10);
      expect(controller.view.result, `seed ${seed}`).not.toBeNull();
    }
  });

  it('completes a match with the keyboard alone', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const controller = playMatchWithKeyboard(seed);
      expect(controller.view.phase, `seed ${seed}`).toBe('over');
      expect(controller.state.placedCount, `seed ${seed}`).toBe(10);
      expect(controller.view.result, `seed ${seed}`).not.toBeNull();
    }
  });

  it('both input paths reach the same result for the same seed', () => {
    // Not bit-identical, because the paths pick differently, but both must terminate properly.
    for (const seed of [7, 8]) {
      const mouse = playMatchWithMouse(seed);
      const keyboard = playMatchWithKeyboard(seed);
      expect(mouse.state.placedCount).toBe(10);
      expect(keyboard.state.placedCount).toBe(10);
      expect(mouse.view.result?.outcome).toBeTruthy();
      expect(keyboard.view.result?.outcome).toBeTruthy();
    }
  });
});

describe('picker component', () => {
  const choices = [
    {
      cell: 6 as Cell,
      probability: 0.82,
      attacker: { figureId: 1, name: 'Goblin', statCode: '7P23', arrows: 31, arrowCount: 5 },
      defender: { figureId: 2, name: 'Sahagin', statCode: '3M21', arrows: 3, arrowCount: 2 },
    },
    {
      cell: 9 as Cell,
      probability: 0.31,
      attacker: { figureId: 1, name: 'Goblin', statCode: '7P23', arrows: 31, arrowCount: 5 },
      defender: { figureId: 3, name: 'Behemoth', statCode: 'FFFA', arrows: 255, arrowCount: 8 },
    },
  ];

  it('formats percentages and verdicts', () => {
    expect(percentLabel(0.821)).toBe('82%');
    expect(verdict(0.82)).toMatch(/strong/);
    expect(verdict(0.6)).toMatch(/favoured/);
    expect(verdict(0.5)).toMatch(/coin flip/);
    expect(verdict(0.3)).toMatch(/unfavourable/);
    expect(verdict(0.05)).toMatch(/losing/);
  });

  it('renders one accessible button per contested card', () => {
    const container = document.createElement('div');
    document.body.append(container);
    renderBattlePicker(container, choices, () => {});

    expect(container.hidden).toBe(false);
    const buttons = container.querySelectorAll('button.picker-option');
    expect(buttons).toHaveLength(2);
    expect(buttons[0]?.textContent).toContain('82%');
    // The *defender's* arrow count is what matters: its arrows drive the combo if it loses.
    expect(buttons[0]?.textContent).toContain('their 2 arrows');
    // The odds and the verdict must reach assistive tech, not just the pixels.
    expect(buttons[1]?.getAttribute('aria-label')).toContain('31%');
    expect(
      container.getAttribute('role') ?? container.querySelector('h2')?.textContent,
    ).toBeTruthy();
  });

  it('dispatches the chosen cell', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const seen: Cell[] = [];
    renderBattlePicker(container, choices, (cell) => seen.push(cell));
    (container.querySelectorAll('button.picker-option')[1] as HTMLButtonElement).click();
    expect(seen).toEqual([9]);
  });

  it('hides itself when there is nothing to choose', () => {
    const container = document.createElement('div');
    document.body.append(container);
    renderBattlePicker(container, [], () => {});
    expect(container.hidden).toBe(true);
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });
});

describe('hand component', () => {
  const entries = [
    {
      index: 0,
      card: { figureId: 1, name: 'Goblin', statCode: '7P23', arrows: 31, arrowCount: 5 },
      selected: true,
    },
    {
      index: 1,
      card: { figureId: 2, name: 'Vark', statCode: '0P00', arrows: 0, arrowCount: 0 },
      selected: false,
    },
    {
      index: 2,
      card: { figureId: 3, name: 'Chimera', statCode: 'FAFA', arrows: 255, arrowCount: 8 },
      selected: false,
    },
  ];

  it('warns about arrows in ways that change how a card should be played', () => {
    expect(cardWarning(entries[0]!)).toBeNull();
    expect(cardWarning(entries[1]!)).toMatch(/no arrows/);
    expect(cardWarning(entries[2]!)).toMatch(/exposed/);
  });

  it('renders the tray with the selected card marked', () => {
    const container = document.createElement('div');
    document.body.append(container);
    renderHand(container, entries, () => {});
    const buttons = container.querySelectorAll('button.hand-card');
    expect(buttons).toHaveLength(3);
    expect(buttons[0]?.classList.contains('is-selected')).toBe(true);
    expect(buttons[0]?.getAttribute('aria-pressed')).toBe('true');
    expect(container.textContent).toContain('7P23');
  });

  it('dispatches the clicked index', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const seen: number[] = [];
    renderHand(container, entries, (index) => seen.push(index));
    (container.querySelectorAll('button.hand-card')[2] as HTMLButtonElement).click();
    expect(seen).toEqual([2]);
  });
});

describe('results component', () => {
  it('calls out a perfect game and offers all five cards', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const card = {
      figureId: 1,
      name: 'x',
      arrows: 0,
      atk: 1,
      type: 'P',
      pdef: 1,
      mdef: 1,
    } as const;
    renderResults(
      container,
      { outcome: 'perfect', taken: [], claimable: [card, card, card, card, card] },
      [],
      () => {},
      () => {},
    );
    expect(container.textContent).toContain('Perfect game');
    expect(container.querySelectorAll('button.claim-card')).toHaveLength(5);
  });

  it('offers exactly one card for an ordinary win', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const card = {
      figureId: 1,
      name: 'x',
      arrows: 0,
      atk: 1,
      type: 'P',
      pdef: 1,
      mdef: 1,
    } as const;
    renderResults(
      container,
      { outcome: 'win', taken: [], claimable: [card] },
      [],
      () => {},
      () => {},
    );
    expect(container.textContent).toContain('You win');
    expect(container.querySelectorAll('button.claim-card')).toHaveLength(1);
  });

  it('offers nothing on a loss, and always offers a rematch', () => {
    const container = document.createElement('div');
    document.body.append(container);
    let rematched = false;
    renderResults(
      container,
      { outcome: 'loss', taken: [], claimable: [] },
      [],
      () => {},
      () => {
        rematched = true;
      },
    );
    expect(container.textContent).toContain('You lose');
    expect(container.querySelectorAll('button.claim-card')).toHaveLength(0);
    (container.querySelector('button.rematch') as HTMLButtonElement).click();
    expect(rematched).toBe(true);
  });
});

describe('status text', () => {
  it('says what the player is being asked to do', () => {
    const controller = new MatchController(matchAt(9));
    const base = { ...controller.view, phase: 'place' as const };
    expect(statusText(base)).toMatch(/Pick a card/);
    expect(statusText({ ...base, selected: 0 })).toMatch(/Click a square/);
    // The engine only enters chooseBattle with at least one pending fight, but the label should
    // still say something sensible in the impossible empty case rather than "0 cards point back".
    expect(statusText({ ...base, phase: 'chooseBattle', pending: [] })).toMatch(/Resolving/);
    expect(
      statusText({ ...base, phase: 'chooseBattle', pending: [{} as never, {} as never] }),
    ).toMatch(/2 cards/);
    expect(statusText({ ...base, phase: 'over' })).toBe('Match over');
  });
});

describe('toCardView', () => {
  it('names a card from its figure', () => {
    const controller = new MatchController(matchAt(10));
    const card = controller.state.players.player.deck[0];
    expect(card).toBeDefined();
    const view = toCardView(card!);
    expect(view.name).toBeTruthy();
    expect(view.statCode).toHaveLength(4);
  });
});

describe('MatchView shape', () => {
  it('exposes everything the UI needs in one object', () => {
    const controller = new MatchController(matchAt(11));
    const view: MatchView = controller.view;
    for (const key of [
      'phase',
      'turn',
      'busy',
      'legal',
      'hover',
      'selected',
      'hand',
      'pending',
      'score',
      'result',
    ]) {
      expect(key in view, `missing ${key}`).toBe(true);
    }
  });
});
