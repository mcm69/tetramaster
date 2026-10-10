/**
 * Smoke test for the entry point (PLAN.md §9.2: `main.ts` is excluded from coverage because its
 * behaviour is "does the game boot", verified by running it rather than by asserting on pixels).
 * This is the automated half of that claim: the module executes, wires up the canvas, and paints a
 * frame without throwing.
 */

import { beforeAll, describe, expect, it, vi } from 'vitest';
import { installCanvasStub } from './canvasStub.ts';

// jsdom has no canvas backend. The renderer touches far more of the 2D API than the old
// placeholder did, so boot and render tests share one recording stub.
const canvasStub = installCanvasStub();

beforeAll(() => {
  canvasStub.reset();
});

describe('boot', () => {
  it('mounts the canvas and paints a frame', async () => {
    document.body.innerHTML = `
      <canvas id="board" width="480" height="480"></canvas>
      <p id="boot-note"></p>
    `;
    // The render loop schedules frames; capture the callback so one can actually run.
    let frame: FrameRequestCallback | null = null;
    const raf = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
      frame = cb;
      return 0;
    });

    await import('../../src/main');

    const board = document.querySelector<HTMLCanvasElement>('#board');
    const note = document.querySelector<HTMLParagraphElement>('#boot-note');

    expect(board).not.toBeNull();
    expect(note?.textContent).toMatch(/Scripted demo match/);
    // HiDPI-corrected backing store.
    expect(board?.width).toBeGreaterThan(480);
    expect(canvasStub.recorder.calls['scale']).toBeGreaterThan(0);

    // Run one frame: the board should actually be painted, not merely mounted.
    expect(frame).not.toBeNull();
    (frame as unknown as FrameRequestCallback)(16);
    expect(canvasStub.recorder.calls['fillRect']).toBeGreaterThan(0);
    expect(canvasStub.recorder.calls['stroke']).toBeGreaterThan(0);
    raf.mockRestore();
  });

  it('surfaces a clear error when the canvas is missing from the page', async () => {
    document.body.innerHTML = '';
    vi.resetModules();

    await expect(import('../../src/main')).rejects.toThrow(/#board canvas is missing/);
  });
});
