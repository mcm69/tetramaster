/**
 * What `main.ts` hands to `MatchController`.
 *
 * ## The bug
 *
 * `MatchController` gained a seat check in S18 — it refuses to act for a seat nobody is sitting at,
 * which is what stopped the player playing the computer's moves. `main.ts` was never told about it.
 * The controller's default is `['player']`, so:
 *
 *  - games against the computer worked **by luck**, because the default happens to be right there;
 *  - **hotseat was unplayable** — both seats are people, and the second seat's every turn was
 *    refused, so a second player could never move.
 *
 * `isHumanSeat`, and now `humanSeatsFor`, sat in `src/game/modes.ts`: correct, tested, and called
 * from nowhere in `src/`. The same shape as `Animator.flash`.
 *
 * ## Why this file exists when the function already had tests
 *
 * `humanSeatsFor` was tested. The *call site* was not, and the bug was at the call site. A test of
 * the function passes forever while the app keeps passing the wrong thing — and it did: a mutation
 * that replaced the correct wiring in `main.ts` with a literal `['player']` left every test green.
 *
 * So this boots the real application and plays the second seat. It is the only level at which the
 * wiring is observable.
 *
 * ## What it uses as evidence
 *
 * The announcer, not the canvas. `main.ts` rewrites `#announcer` from the turn and the board, and the
 * stub's draw-call total grows every frame whether or not anything happened — useless for "did the
 * position change". `seatLabels` already reads "Player 1" / "Player 2" in hotseat and "You" /
 * "Opponent" against the computer, so the announcer says who is to play, in words.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installCanvasStub } from './canvasStub.ts';
import { SAVE_KEY } from '../../src/game/save.ts';
import { boardLayout, cellRect } from '../../src/render/boardView.ts';
import type { Cell } from '../../src/core/types.ts';

installCanvasStub();

/** The elements `main.ts` queries, mirroring `index.html`. */
function page(): void {
  document.body.innerHTML = `
    <div class="toolbar-bar" id="toolbar"></div>
    <div class="collection-panel" id="collection" hidden></div>
    <div class="collection-panel" id="rules" hidden></div>
    <canvas id="board" width="560" height="560"></canvas>
    <div class="toolbar">
      <button type="button" class="rematch" id="toggle-collection">Collection (C)</button>
      <button type="button" class="rematch" id="toggle-rules">How to play (R)</button>
    </div>
    <p class="mode-note" id="mode-note"></p>
    <p class="sr-only" id="announcer" role="status" aria-live="polite" aria-atomic="true"></p>
    <p class="status" id="status"></p>
    <p class="hint" id="hint"></p>
    <div class="hand" id="hand"></div>
    <div class="picker" id="picker" hidden></div>
    <div class="picker" id="results" hidden></div>
    <p class="keys" id="keys"></p>
  `;
}

/** Captures the frames `main.ts` asks for, so the loop can be driven by hand. */
function captureFrames(): (() => void)[] {
  const frames: (() => void)[] = [];
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
    frames.push(() => {
      cb(16);
    });
    return frames.length;
  });
  return frames;
}

/** Runs queued frames until the queue stops growing or the budget runs out. */
function pump(frames: (() => void)[], budget = 3000): void {
  for (let i = 0; i < budget; i++) {
    if (frames.length === 0) return;
    frames.shift()?.();
  }
}

/** Puts a save in localStorage asking for `mode`, so the app boots into it. */
function saveAskingFor(mode: string): void {
  const raw = localStorage.getItem(SAVE_KEY);
  const data = raw === null ? {} : (JSON.parse(raw) as Record<string, unknown>);
  localStorage.setItem(
    SAVE_KEY,
    JSON.stringify({ ...data, settings: { ...(data.settings as object | undefined), mode } }),
  );
}

/** Everything the announcer said, normalised. The zero-width space is screen-reader punctuation. */
function announced(): string {
  return (document.querySelector('#announcer')?.textContent ?? '').replace(/[\u200b\s]+$/, '');
}

/**
 * The seat the announcer says is to play.
 *
 * Note what this cannot see: a contested placement does not change the turn (§1.7 — the attacker
 * chooses the battle order), so "the turn changed" is not the same as "a card was played". The first
 * version of `placeSomewhere` used it as the success signal and reported a perfectly good second
 * move as a failure.
 */
function announcedTurn(): string {
  const match = /^([^.]+)'s turn\./.exec(announced());
  if (match === null)
    throw new Error(`announcer did not name a turn: ${JSON.stringify(announced())}`);
  return match[1] as string;
}

/**
 * Plays a card, the way a person does: take the first card, then try squares until one takes.
 *
 * Hard-coding a square does not work — some start blocked, and which ones depends on the seed — and
 * the first version of this test asserted "the first seat could not move" about a click that had
 * landed on a blocked cell. It also cannot read which squares are legal: the app keeps that to
 * itself, and working around it with a second derivation of the layout is how the first version got
 * the geometry wrong instead.
 */
function placeSomewhere(): boolean {
  const before = announced();
  const card = document.querySelectorAll<HTMLButtonElement>('#hand button.hand-card')[0];
  if (card === undefined) throw new Error('the hand is empty, so nothing can be placed');
  card.click();

  for (let index = 0; index < 16; index++) {
    clickCell(index);
    if (announced() !== before) return true;
  }
  return false;
}

function clickCell(index: number): void {
  const board = document.querySelector('#board');
  if (board === null) throw new Error('no board');
  // The app's own layout rather than a second derivation of it: the first attempt at this test
  // re-computed the geometry by hand, got it subtly wrong, and reported "the first seat could not
  // move" for a card that had moved perfectly well.
  // 560 is `main.ts`'s own `BOARD_SIZE`, so the geometry matches the app exactly.
  const rect0 = cellRect(boardLayout(560 - 40, 20, 20), index as Cell);
  const x = rect0.x + rect0.size / 2;
  const y = rect0.y + rect0.size / 2;
  const rect = board.getBoundingClientRect();
  board.dispatchEvent(
    new MouseEvent('click', {
      clientX: rect.left + x,
      clientY: rect.top + y,
      bubbles: true,
    }),
  );
}

beforeEach(() => {
  document.body.textContent = '';
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('the seats the app hands the controller', () => {
  it('lets a person play the second seat in hotseat', async () => {
    // The bug, end to end. With the wiring absent the controller refuses the second seat's every
    // turn, so the click below does nothing and the announcer never moves off "Player 2's turn".
    page();
    saveAskingFor('hotseat');
    const frames = captureFrames();
    await import('../../src/main');
    pump(frames, 40);

    expect(announcedTurn()).toBe('Player 1');

    expect(placeSomewhere(), 'the first seat could not move').toBe(true);
    pump(frames, 400);
    expect(announcedTurn(), 'the first seat could not move').toBe('Player 2');

    // In hotseat there is no computer to move, so this turn can only be answered by the person
    // sitting at this keyboard. It is the move that was impossible.
    expect(placeSomewhere(), 'the second seat could not move').toBe(true);
    pump(frames, 400);
    // Either seat may come next: a contested placement leaves the turn with the attacker, so a move
    // does not always hand it over. What matters is that the position advanced and nobody was about
    // to be denied.
    expect(['Player 1', 'Player 2']).toContain(announcedTurn());

    // And a third, so this is not a one-off.
    expect(placeSomewhere(), 'the second seat could not move a second time').toBe(true);
    pump(frames, 400);
    expect(['Player 1', 'Player 2']).toContain(announcedTurn());
  }, 30_000);

  it('leaves the second seat to the person sitting at it', async () => {
    // A second bug, found by the first one. `stepOpponent` hardcoded the computer to the `'ai'` seat,
    // which is right for two modes out of three and quietly wrong for hotseat — where the second
    // seat *is* `'ai'` and a person is sitting at it. The computer therefore played that player's
    // turns, the moment the board stopped animating, and the second player watched.
    page();
    saveAskingFor('hotseat');
    const frames = captureFrames();
    await import('../../src/main');
    pump(frames, 40);

    expect(announcedTurn()).toBe('Player 1');
    expect(placeSomewhere()).toBe(true);

    // Frames run the loop to completion. Nothing should move without a person moving it.
    for (let frame = 0; frame < 600; frame++) {
      if (frames.length === 0) break;
      frames.shift()?.();
      expect(announcedTurn(), `the computer played for seat two on frame ${frame}`).toBe(
        'Player 2',
      );
    }
  }, 30_000);

  it('still lets the computer take its own turn in a match', async () => {
    // The other half. The fix must not have been "allow both seats always" — that is the original
    // S18 bug, where a click during the computer's turn placed its card.
    page();
    saveAskingFor('match');
    const frames = captureFrames();
    await import('../../src/main');
    pump(frames, 40);

    expect(announcedTurn()).toBe('You');

    // One move, then nothing: the computer answers on its own from the frame loop.
    expect(placeSomewhere()).toBe(true);
    pump(frames, 2000);
    expect(announcedTurn()).toBe('You');
  }, 30_000);
});
