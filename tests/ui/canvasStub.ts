/**
 * A recording stand-in for `CanvasRenderingContext2D`.
 *
 * jsdom has no canvas backend, so tests assert on *how often* each drawing call was made rather
 * than on pixels (PLAN.md §9.4 — rasterised frames are brittle and prove little). What is worth
 * checking is that the right operations happen, that drawing is deterministic, and that nothing
 * mutates game state.
 */

import { vi } from 'vitest';

/** One `fillText` call, with enough context to reason about where the text landed. */
export interface TextCall {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly align: CanvasTextAlign;
  readonly font: string;
}

export interface StyleCall {
  readonly style: string;
  /** The text drawn, when this was a `fillText`. */
  readonly text?: string;
}

export interface ArcCall {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

export interface Recorder {
  readonly ctx: CanvasRenderingContext2D;
  /** Call counts by method name, e.g. `fill`, `stroke`, `drawImage`. */
  readonly calls: Record<string, number>;
  /** Every `fillText`, in order. Needed to assert labels do not overlap. */
  readonly text: TextCall[];
  /**
   * The `fillStyle` in force at each `fill` and `fillText`, in order.
   *
   * Call counts cannot tell a winner's green from a loser's red, and "does the right thing get the
   * right colour" is a real question — the seat frame is the colour-redundant accessibility channel,
   * so a wrong tint is a real defect rather than a cosmetic one.
   */
  readonly fills: StyleCall[];
  /** The `strokeStyle` at each `stroke`, in order. */
  readonly strokes: StyleCall[];
  /**
   * Every `arc`, with its centre and radius.
   *
   * Counts cannot say *where* something was drawn. A glow on the wrong side of the board draws the
   * same number of arcs as a glow on the right side, so the geometry has to be recorded too.
   */
  readonly arcs: ArcCall[];
  /** Total draw calls, for assertions that do not care which operation. */
  total(): number;
}

/** Builds a fresh recording context. */
export function stubContext(): Recorder {
  const calls: Record<string, number> = {};
  const text: TextCall[] = [];
  const fills: StyleCall[] = [];
  const strokes: StyleCall[] = [];
  const arcs: ArcCall[] = [];
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
    arc: (x: number, y: number, radius: number) => {
      bump('arc');
      arcs.push({ x, y, radius });
    },
    quadraticCurveTo: () => {
      bump('quadraticCurveTo');
    },
    rect: () => {
      bump('rect');
    },
    fill: () => {
      bump('fill');
      fills.push({ style: ctx.fillStyle as string });
    },
    stroke: () => {
      bump('stroke');
      strokes.push({ style: ctx.strokeStyle as string });
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
    fillText: (label: string, x: number, y: number) => {
      bump('fillText');
      // Recorded so a test can assert two labels drawn on one line do not overlap. Counting the
      // calls is not enough: the bug was three calls at the same y whose x ranges overlapped.
      text.push({ text: label, x, y, align: ctx.textAlign, font: ctx.font });
      fills.push({ style: ctx.fillStyle as string, text: label });
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
    text,
    fills,
    strokes,
    arcs,
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
