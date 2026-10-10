import { beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * Smoke test for the entry point (PLAN.md §9.2: main.ts is excluded from coverage because its
 * behaviour is "does the game boot", verified by running it rather than by asserting on pixels).
 * This is the automated half of that claim — it proves the module executes without throwing and
 * wires up the canvas.
 */

let contextStub: Record<string, ReturnType<typeof vi.fn>>;

beforeAll(() => {
  // jsdom has no canvas backend; stub the 2d context with the surface main.ts actually touches.
  contextStub = {
    scale: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
  };
  HTMLCanvasElement.prototype.getContext = vi.fn(
    () => contextStub,
  ) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

describe('boot', () => {
  it('mounts the canvas and reports success', async () => {
    document.body.innerHTML = `
      <canvas id="board" width="480" height="480"></canvas>
      <p id="boot-note"></p>
    `;

    await import('../../src/main');

    const canvas = document.querySelector<HTMLCanvasElement>('#board');
    const note = document.querySelector<HTMLParagraphElement>('#boot-note');

    expect(canvas).not.toBeNull();
    expect(note?.textContent).toMatch(/canvas mounted/);
    expect(contextStub.scale).toHaveBeenCalled();
    expect(contextStub.fillRect).toHaveBeenCalled();
  });

  it('surfaces a clear error when the canvas is missing from the page', async () => {
    document.body.innerHTML = '';
    vi.resetModules();

    await expect(import('../../src/main')).rejects.toThrow(/#board canvas is missing/);
  });
});
