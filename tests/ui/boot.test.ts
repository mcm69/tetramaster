/**
 * Smoke test for the entry point (PLAN.md §9.2: `main.ts` is excluded from coverage because its
 * behaviour is "does the game boot", verified by running it rather than by asserting on pixels).
 * This is the automated half of that claim: the module wires every panel without throwing and
 * paints a frame.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Vitest runs from the project root, as `tools/*.ts` do. */
const ROOT = process.cwd();
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { installCanvasStub } from './canvasStub.ts';

const canvasStub = installCanvasStub();

beforeAll(() => {
  canvasStub.reset();
});

/**
 * The elements main.ts queries, in the shape index.html provides them.
 *
 * Kept in step with index.html by hand: boot is the one test that catches an element the app needs
 * but the page does not have, and it can only do that if the fixture really does mirror the page.
 */
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

describe('boot', () => {
  it('wires every panel and paints a frame', async () => {
    page();
    let frame: FrameRequestCallback | null = null;
    const raf = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
      frame = cb;
      return 0;
    });

    await import('../../src/main');

    const board = document.querySelector<HTMLCanvasElement>('#board');
    expect(board).not.toBeNull();

    // The board's size belongs to CSS (MOBILE.md stage M1). Two things are asserted here, and both
    // are about the new arrangement rather than the old numbers:
    //
    //  - JavaScript does not size the board. It used to write `canvas.style.width` from a floor of
    //    420px that was derived from a desktop minimum viewport, which is why a 320px phone put the
    //    board 50px off-screen on each side.
    //  - jsdom has no layout engine, so the canvas measures zero and `fitCanvas` deliberately does
    //    nothing rather than guessing. That is the honest behaviour, and it is what stops a layout
    //    change from being papered over with a fallback size in a test environment.
    //
    // The sizing arithmetic itself is tested in tests/ui/sizing.test.ts, and against a real browser
    // by `npm run viewport`.
    expect(board?.style.width, 'javascript must not size the board').toBe('');
    // `fitCanvas` bails before touching the backing store when the canvas measures zero, so it is
    // still the 560 from the markup. Counting `setTransform` calls would not show this: the hand
    // tray's arrow previews call it too, five times.
    expect(board?.width, 'the backing store was resized against a canvas that measures zero').toBe(
      560,
    );

    // The hand tray is populated from the initial view, so the player can see their cards.
    expect(document.querySelectorAll('#hand button.hand-card')).toHaveLength(5);
    // The mode bar offers all three modes, and the board is mirrored into a live region.
    expect(document.querySelectorAll('#toolbar button.mode-button')).toHaveLength(3);
    // The canvas is opaque to a screen reader, so the turn must be mirrored into a live region.
    const announcer = document.querySelector('#announcer');
    expect(announcer?.getAttribute('aria-live')).toBe('polite');
    expect(announcer?.textContent).toMatch(/turn/);
    // The key bindings are documented on the page, including the collection shortcut.
    expect(document.querySelector('#keys')?.textContent).toMatch(/Move the board cursor/);
    // Every documented binding is rendered, so the page cannot advertise a key the app lacks.
    expect(document.querySelector('#keys')?.textContent).toMatch(/Collection and deck editor/);
    expect(document.querySelector('#keys')?.textContent).toMatch(/How to play/);
    expect(document.querySelector('#keys')?.textContent).toMatch(/Next mode/);
    expect(document.querySelector('#status')?.textContent).toMatch(/Pick a card/);

    // Run one frame: the board should actually be painted, not merely mounted.
    expect(frame).not.toBeNull();
    (frame as unknown as FrameRequestCallback)(16);
    expect(canvasStub.recorder.calls['fillRect']).toBeGreaterThan(0);
    expect(canvasStub.recorder.calls['stroke']).toBeGreaterThan(0);
    raf.mockRestore();
  });

  it('surfaces a clear error when the board canvas is missing', async () => {
    document.body.innerHTML = '<p id="status"></p>';
    vi.resetModules();

    await expect(import('../../src/main')).rejects.toThrow(/#board is missing/);
  });

  it('links a favicon that is actually there', () => {
    // A referenced-but-missing asset is silent: the page still loads, the tab just shows a broken
    // glyph. Same family as the key binding that was documented and never wired (S14) — something
    // named in one place and absent from another.
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
    const href = /<link[^>]+rel="icon"[^>]+href="([^"]+)"/.exec(html)?.[1];
    if (href === undefined) throw new Error('index.html declares no icon');

    // Vite serves `public/` at the root, so the href is the path inside `dist/`.
    expect(href).toMatch(/^\//);
    const onDisk = join(ROOT, 'public', href);
    expect(existsSync(onDisk), `${href} is linked but there is no ${onDisk}`).toBe(true);
    expect(readFileSync(onDisk, 'utf8')).toContain('<svg');
  });

  it('surfaces a clear error when a panel is missing', async () => {
    document.body.innerHTML = '<canvas id="board" width="560" height="560"></canvas>';
    vi.resetModules();

    await expect(import('../../src/main')).rejects.toThrow(/#status is missing/);
  });
});
