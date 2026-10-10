/**
 * A recording stand-in for `CanvasRenderingContext2D`.
 *
 * jsdom has no canvas backend, so tests assert on *how often* each drawing call was made rather
 * than on pixels (PLAN.md §9.4 — rasterised frames are brittle and prove little). What is worth
 * checking is that the right operations happen, that drawing is deterministic, and that nothing
 * mutates game state.
 */

import { vi } from 'vitest';

export interface Recorder {
  readonly ctx: CanvasRenderingContext2D;
  /** Call counts by method name, e.g. `fill`, `stroke`, `drawImage`. */
  readonly calls: Record<string, number>;
  /** Total draw calls, for assertions that do not care which operation. */
  total(): number;
}

/** Builds a fresh recording context. */
export function stubContext(): Recorder {
  const calls: Record<string, number> = {};
  const bump = (name: string): void => {
    calls[name] = (calls[name] ?? 0) + 1;
  };
  const gradient = {
    addColorStop: (): void => {
      bump('addColorStop');
    },
  };

  const ctx = {
    canvas: { width: 620, height: 620 },
    globalAlpha: 1,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'butt',
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    shadowColor: 'transparent',
    shadowBlur: 0,
    shadowOffsetY: 0,
    save: () => {
      bump('save');
    },
    restore: () => {
      bump('restore');
    },
    translate: () => {
      bump('translate');
    },
    rotate: () => {
      bump('rotate');
    },
    scale: () => {
      bump('scale');
    },
    beginPath: () => {
      bump('beginPath');
    },
    closePath: () => {
      bump('closePath');
    },
    moveTo: () => {
      bump('moveTo');
    },
    lineTo: () => {
      bump('lineTo');
    },
    arc: () => {
      bump('arc');
    },
    quadraticCurveTo: () => {
      bump('quadraticCurveTo');
    },
    rect: () => {
      bump('rect');
    },
    fill: () => {
      bump('fill');
    },
    stroke: () => {
      bump('stroke');
    },
    clip: () => {
      bump('clip');
    },
    fillRect: () => {
      bump('fillRect');
    },
    clearRect: () => {
      bump('clearRect');
    },
    strokeRect: () => {
      bump('strokeRect');
    },
    fillText: () => {
      bump('fillText');
    },
    setTransform: () => {
      bump('setTransform');
    },
    createLinearGradient: () => {
      bump('createLinearGradient');
      return gradient;
    },
    createRadialGradient: () => {
      bump('createRadialGradient');
      return gradient;
    },
    drawImage: () => {
      bump('drawImage');
    },
    measureText: () => ({ width: 10 }),
  } as unknown as CanvasRenderingContext2D;

  return {
    ctx,
    calls,
    total: () => Object.values(calls).reduce((sum, n) => sum + n, 0),
  };
}

/** Installs a recording context as the 2D backend for every canvas in the test. */
export interface CanvasStubHandle {
  /** The live recorder; swap it between tests with `reset`. */
  readonly recorder: Recorder;
  reset(): void;
}

export function installCanvasStub(): CanvasStubHandle {
  let current = stubContext();
  HTMLCanvasElement.prototype.getContext = vi.fn(
    () => current.ctx,
  ) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  return {
    get recorder(): Recorder {
      return current;
    },
    reset(): void {
      current = stubContext();
    },
  };
}
