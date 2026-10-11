/**
 * Drag-to-place, as a pure state machine (MOBILE.md stage M6, §5.2).
 *
 * Two taps per move is fine at a desk and poor at a thumb, so drag is added *on top of* tap-tap. The
 * tap path is untouched: this module emits `none` for a gesture that never travels, and the existing
 * click handler owns selection exactly as before.
 *
 * It is a separate pure module for the same reason `src/ui/turn.ts` is one: the rules of a gesture
 * are otherwise reachable only by synthesising pointer events, and every bug in them would be a
 * touch-only bug — invisible to a mouse-driven test suite and to a headless one.
 *
 * **No geometry here.** The caller resolves the point to a cell and to a legality flag with the
 * existing `hitTest` and `legalCells`, so this file needs no DOM and no engine. `hitTest` stays the
 * single source of truth for "what is under the finger".
 *
 * Three phases, not two:
 *
 * - `armed` — the finger is down on a card but has not moved far enough to be a drag. No ghost is
 *   drawn, because a ghost that appears and vanishes under a stationary thumb reads as a glitch.
 * - `dragging` — past the threshold. A ghost follows the finger and the legal-cell highlight does
 *   too, so the destination is visible before the player commits.
 * - `idle` — nothing in progress.
 *
 * Selection is deliberately **not** applied on `arm`. An armed finger has not yet distinguished
 * itself from a tap, and toggling the card the player is about to drag off the board would leave the
 * drag holding a card that is no longer selected. The selection lands on `select`, the first frame
 * that is unambiguously a drag.
 */

import type { Cell } from '../core/types.ts';

/**
 * How far the finger must travel before a press becomes a drag, in CSS pixels.
 *
 * A fingertip on glass wanders several pixels while resting, so a smaller threshold turns an
 * ordinary tap into a drag and a fast flick into an accidental one. 10px is past the wander and
 * well short of the distance between the hand tray and the board.
 */
export const DRAG_THRESHOLD_PX = 10;

export type DragPhase = 'idle' | 'armed' | 'dragging';

export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * A finger position, already resolved against the board.
 *
 * `x`/`y` are **client (screen) pixels**, not board coordinates. The threshold is a physical
 * distance a fingertip travels, so it has to be measured in the space the finger is actually in — the
 * board is drawn scaled, and on a 390px phone its scale is about 0.66, so measuring in board units
 * would quietly lower the threshold by a third on exactly the devices this stage exists for. The
 * caller converts to board coordinates to resolve `cell`, and converts back to draw the ghost.
 *
 * `cell` and `legal` are passed in rather than computed here so that the geometry stays in one place
 * and this module stays testable in Node.
 */
export interface DragInput extends Point {
  /** The cell under the finger, or null when it is off the board. */
  readonly cell: Cell | null;
  /** Whether that cell can receive the card right now. */
  readonly legal: boolean;
}

export interface DragState {
  readonly phase: DragPhase;
  /** The card under the finger, once one is. Null until armed, and again after any release. */
  readonly cardIndex: number | null;
  /** Where the finger went down, in the same space as `DragInput`. Null unless armed or dragging. */
  readonly origin: Point | null;
  /** Where the ghost is drawn. Null unless dragging — a tap never shows one. */
  readonly ghost: Point | null;
  /** The cell under the finger, for the highlight. Null unless dragging. */
  readonly cell: Cell | null;
  /** Whether that cell would accept the card, for tinting the ghost. */
  readonly legal: boolean;
}

export type DragEvent =
  /** `pointerdown` on a hand card. */
  | ({ readonly t: 'arm'; readonly cardIndex: number } & Point)
  | { readonly t: 'move'; readonly input: DragInput }
  /** `pointerup`. */
  | { readonly t: 'release'; readonly input: DragInput }
  /** `pointercancel`, or Escape. */
  | { readonly t: 'cancel' };

/** What the caller should do. The reducer never acts on the game itself. */
export type DragEffect =
  | { readonly t: 'none' }
  /** Crossed the threshold: this is a drag, so take the card. */
  | { readonly t: 'select'; readonly cardIndex: number }
  | { readonly t: 'place'; readonly cardIndex: number; readonly cell: Cell }
  /** Dropped on nothing playable. */
  | { readonly t: 'deselect' };

export interface DragResult {
  readonly state: DragState;
  readonly effect: DragEffect;
}

export const IDLE: DragState = {
  phase: 'idle',
  cardIndex: null,
  origin: null,
  ghost: null,
  cell: null,
  legal: false,
};

/**
 * The position half of an input, without its resolved cell.
 *
 * `DragInput` carries what the caller worked out about the point; `ghost` and `origin` are positions
 * and nothing else. Aliasing the input into state would smuggle `cell` and `legal` into two fields
 * whose whole meaning is "where the finger is".
 */
function pointOf(input: DragInput): Point {
  return { x: input.x, y: input.y };
}

/** Straight-line distance, kept here so the threshold rule has exactly one definition. */
function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Advances the gesture. Pure and total: every phase, every event, and no event at all.
 *
 * Callers hold the state and thread it through, so a drag reads as the sequence of events it was:
 * `drag = reduce(drag, { t: 'move', input }).state`.
 */
export function reduce(state: DragState, event: DragEvent): DragResult {
  const settle: DragResult = { state: IDLE, effect: { t: 'none' } };

  switch (event.t) {
    case 'arm': {
      // A second finger landing mid-drag must not restart the gesture. The caller also filters on
      // pointerId, but the reducer does not depend on that being done.
      if (state.phase !== 'idle') return settle;
      return {
        state: {
          ...IDLE,
          phase: 'armed',
          cardIndex: event.cardIndex,
          // Rebuilt rather than aliased to the event, so the state holds a position and nothing else.
          origin: { x: event.x, y: event.y },
        },
        effect: { t: 'none' },
      };
    }

    case 'move': {
      if (state.phase === 'idle' || state.cardIndex === null || state.origin === null)
        return settle;

      if (state.phase === 'armed') {
        if (distance(state.origin, event.input) < DRAG_THRESHOLD_PX) {
          // Jitter. Stay armed, still show nothing.
          return { state, effect: { t: 'none' } };
        }
        return {
          state: {
            ...state,
            phase: 'dragging',
            ghost: pointOf(event.input),
            cell: event.input.cell,
            legal: event.input.legal,
          },
          effect: { t: 'select', cardIndex: state.cardIndex },
        };
      }

      return {
        state: {
          ...state,
          ghost: pointOf(event.input),
          cell: event.input.cell,
          legal: event.input.legal,
        },
        effect: { t: 'none' },
      };
    }

    case 'release': {
      if (state.phase !== 'dragging' || state.cardIndex === null) {
        // Still armed: this was a tap. `none` on purpose — the click handler that fires next owns
        // selection, and doing it here as well would select on every tap and toggle nothing.
        return settle;
      }
      const cardIndex = state.cardIndex;
      if (event.input.cell !== null && event.input.legal) {
        return {
          state: IDLE,
          effect: { t: 'place', cardIndex, cell: event.input.cell },
        };
      }
      // Dropped on an illegal square, off the board, or back on the hand. The card goes back down:
      // having picked a card up and put it nowhere means you did not mean to play it.
      return { state: IDLE, effect: { t: 'deselect' } };
    }

    case 'cancel':
      return settle;
  }
}

/** True when a gesture is in progress, so callers know whether to expect a release. */
export function isActive(state: DragState): boolean {
  return state.phase !== 'idle';
}
