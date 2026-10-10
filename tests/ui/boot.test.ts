/**
 * Smoke test for the entry point (PLAN.md §9.2: `main.ts` is excluded from coverage because its
 * behaviour is "does the game boot", verified by running it rather than by asserting on pixels).
 * This is the automated half of that claim: the module wires every panel without throwing and
 * paints a frame.
 */

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
    <div class="collection-panel" id="collection" hidden></div>
    <canvas id="board" width="560" height="560"></canvas>
    <div class="toolbar"><button type="button" class="rematch" id="toggle-collection">Collection (C)</button></div>
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
    // Backing store is sized from devicePixelRatio, which is 1 under jsdom.
    expect(board?.width).toBeGreaterThanOrEqual(560);
    expect(board?.style.width).toBe('560px');
    expect(canvasStub.recorder.calls['scale']).toBeGreaterThan(0);

    // The hand tray is populated from the initial view, so the player can see their cards.
    expect(document.querySelectorAll('#hand button.hand-card')).toHaveLength(5);
    // The key bindings are documented on the page, including the collection shortcut.
    expect(document.querySelector('#keys')?.textContent).toMatch(/Move the board cursor/);
    expect(document.querySelector('#keys')?.textContent).toMatch(/C — collection/);
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

  it('surfaces a clear error when a panel is missing', async () => {
    document.body.innerHTML = '<canvas id="board" width="560" height="560"></canvas>';
    vi.resetModules();

    await expect(import('../../src/main')).rejects.toThrow(/#status is missing/);
  });
});
