/**
 * The animator: turns the engine's event log into motion (PLAN.md §3.2).
 *
 * The engine already produces an ordered `GameEvent[]` for every action, so animation is a pure
 * consumer of that log — no game logic lives here, and nothing here mutates game state. The
 * animator keeps its own **display board**: a picture of ownership that lags behind the true state
 * by whatever animations are still running, and catches up when they finish.
 *
 * The single `requestAnimationFrame` loop lives here, so the whole game has one clock.
 */

import type { BoardCard, Cell, GameEvent, GameState, Owner } from '../core/types.ts';
import { METRICS } from './theme.ts';

/** One cell's current animation state. */
export interface CardFrame {
  readonly cell: Cell;
  readonly card: BoardCard | null;
  /** 0-1. Fades in on placement, holds at 1 otherwise. */
  readonly opacity: number;
  /** Scales about the cell centre; pops in on placement and on capture. */
  readonly scale: number;
  /** Tinted while a battle's numbers are rolling. */
  readonly flash: number;
}

interface Animation {
  readonly cell: Cell;
  readonly kind: 'place' | 'flip' | 'battle';
  /** Wall-clock start, in the animator's own millisecond clock. */
  readonly start: number;
  readonly duration: number;
  /** The card as it should look when the animation ends. */
  readonly target: BoardCard | null;
}

export type ReduceMotion = 'full' | 'reduced';

export interface AnimatorOptions {
  /** `reduced` collapses every animation to an instant change, honouring prefers-reduced-motion. */
  readonly reduceMotion?: ReduceMotion;
}

/**
 * Drives the display board from an event log.
 *
 * Usage per action: `animator.push(events)` then let the render loop call `render()`. The display
 * board always converges on the true state once `idle` is true, which is what the tests assert.
 */
export class Animator {
  private queue: Animation[] = [];
  private display: (BoardCard | null)[] = Array.from({ length: 16 }, (): BoardCard | null => null);
  private clock = 0;
  private reduceMotion: ReduceMotion;

  constructor(options: AnimatorOptions = {}) {
    this.reduceMotion = options.reduceMotion ?? 'full';
  }

  /** Switches motion on or off at runtime, for the accessibility toggle. */
  setReduceMotion(mode: ReduceMotion): void {
    this.reduceMotion = mode;
    if (mode === 'reduced') this.queue = [];
  }

  get reduceMotionSetting(): ReduceMotion {
    return this.reduceMotion;
  }

  /** True when nothing is animating and the display matches the truth. */
  get idle(): boolean {
    return this.queue.length === 0;
  }

  /** Queues the animations for one action's event log. Order is preserved: it is the sequence. */
  push(events: readonly GameEvent[], state: GameState): void {
    let cursor = this.clock;
    for (const event of events) {
      const duration = this.reduceMotion === 'reduced' ? 0 : durationFor(event);
      if (eventHasCell(event)) {
        // The target is the board as it stands *after* the whole action, which is correct for
        // every cell an event names. Events without a cell animate nothing — in particular a
        // `turn` event must never touch a cell, or it would erase the card just played.
        const target = state.board[event.cell] ?? null;
        if (duration === 0) {
          // Reduced motion: apply at once rather than queueing a zero-length tween, so the board
          // is correct on the very next frame.
          this.display[event.cell] = target;
        } else {
          this.queue.push({
            cell: event.cell,
            kind: kindFor(event),
            start: cursor,
            duration,
            target,
          });
          cursor += duration;
        }
      }
    }
    if (cursor > this.clock) this.clock = cursor;
  }

  /**
   * Advances the clock and applies any animation whose time has come. Returns true if anything is
   * still running, so the caller knows whether to keep scheduling frames.
   */
  tick(deltaMs: number): boolean {
    if (this.queue.length === 0) return false;

    const now = this.clock + deltaMs;
    // Apply every animation whose window has closed, in order, so intermediate states are never
    // skipped: a card must flip, then pop, then settle.
    while (this.queue.length > 0) {
      const head = this.queue[0] as Animation;
      if (now < head.start + head.duration) break;
      this.display[head.cell] = head.target;
      this.queue.shift();
    }
    this.clock = now;
    return this.queue.length > 0;
  }

  /** The frame for a cell right now: its animation progress, or a settled card. */
  frameAt(cell: Cell): CardFrame {
    const now = this.clock;
    let opacity = 1;
    let scale = 1;
    let flash = 0;
    let card = this.display[cell] ?? null;

    for (const animation of this.queue) {
      if (animation.cell !== cell) continue;
      const progress =
        animation.duration === 0 ? 1 : clamp((now - animation.start) / animation.duration, 0, 1);
      if (progress >= 1) {
        card = animation.target;
        continue;
      }
      switch (animation.kind) {
        case 'place':
          opacity = progress;
          scale = 0.7 + 0.3 * easeOut(progress);
          break;
        case 'flip':
          // A quick squash as ownership changes hands.
          scale = 1 + 0.12 * Math.sin(progress * Math.PI);
          break;
        case 'battle':
          flash = Math.sin(progress * Math.PI);
          break;
      }
    }
    return { cell, card, opacity, scale, flash };
  }

  /** Every cell's frame, for a whole-board render. */
  frames(): Map<Cell, CardFrame> {
    const map = new Map<Cell, CardFrame>();
    for (let i = 0; i < 16; i++) map.set(i as Cell, this.frameAt(i as Cell));
    return map;
  }

  /**
   * Forces the display to the true board at once. Used on load, on rematch, and when motion is
   * reduced — anywhere a jump is correct rather than animated.
   */
  snapTo(board: readonly (BoardCard | null)[] = this.display): void {
    this.display = board.slice();
    this.queue = [];
  }

  /** Seeds the display board without animation, e.g. when loading a saved match. */
  syncTo(board: readonly (BoardCard | null)[]): void {
    this.snapTo(board);
  }

  /**
   * True when the display has caught up with the truth. The tests use this to assert that an
   * animation converges on the correct final state rather than merely finishing.
   */
  settled(board: readonly (BoardCard | null)[]): boolean {
    if (!this.idle) return false;
    for (let i = 0; i < 16; i++) {
      const shown = this.display[i];
      const truth = board[i];
      if (!shown || !truth) {
        if (shown !== truth) return false;
        continue;
      }
      if (shown.owner !== truth.owner || shown.figureId !== truth.figureId) return false;
    }
    return true;
  }

  /** The current display board, for tests and for hit-testing against what the player sees. */
  get displayBoard(): readonly (BoardCard | null)[] {
    return this.display;
  }
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

/** How long each kind of event takes to play. */
function durationFor(event: GameEvent): number {
  switch (event.t) {
    case 'place':
      return METRICS.beatMs * 1.1;
    case 'battle-roll':
      // The number roll-down is the centrepiece; give it room to read.
      return METRICS.beatMs * 1.6;
    case 'flip':
    case 'takedown':
    case 'combo':
      return METRICS.beatMs;
    default:
      return METRICS.beatMs * 0.5;
  }
}

function kindFor(event: GameEvent): 'place' | 'flip' | 'battle' {
  if (event.t === 'place') return 'place';
  if (event.t === 'battle' || event.t === 'battle-roll') return 'battle';
  return 'flip';
}

function eventHasCell(event: GameEvent): event is GameEvent & { cell: Cell } {
  return 'cell' in event;
}

/** Total animation length for a log, so the UI can show a progress hint. */
export function totalDuration(events: readonly GameEvent[], mode: ReduceMotion = 'full'): number {
  if (mode === 'reduced') return 0;
  return events.reduce((sum, event) => sum + durationFor(event), 0);
}

/** The owner currently displayed at a cell, for hover and pointer logic. */
export function displayedOwner(animator: Animator, cell: Cell): Owner | null {
  return animator.frameAt(cell).card?.owner ?? null;
}
