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

/**
 * The numbers a card is showing while it is in a battle (§1.7).
 *
 * The count runs *down*, because that is the rule: §1.6 has the attacker dice its ATK away
 * (`atkActual = atkBase - atkRoll`), so a bigger ATK is a liability. Watching the number fall from
 * the card's printed stat to what it actually rolled is the whole drama of a battle.
 */
export interface BattleRollFrame {
  /** The number on screen right now, mid-count. */
  readonly value: number;
  /** Where the count lands. */
  readonly final: number;
  readonly side: 'attacker' | 'defender';
  /** Whether this card won its fight. Drives the colour, not the number. */
  readonly won: boolean;
  readonly probability: number;
}

/** Where one event's animation sits in time, relative to now. */
export interface EventSlot {
  readonly event: GameEvent;
  /** Milliseconds from now until it begins. */
  readonly startMs: number;
  readonly durationMs: number;
}

/** One cell's current animation state. */
export interface CardFrame {
  readonly cell: Cell;
  readonly card: BoardCard | null;
  /** 0-1. Fades in on placement, holds at 1 otherwise. */
  readonly opacity: number;
  /** Scales about the cell centre; pops in on placement and on capture. */
  readonly scale: number;
  /**
   * 0-1 brightness for a card in a fight: ramps up as the numbers run, and back down after.
   *
   * This was computed here and read nowhere — the whole battle animation was unreachable, because
   * battle events name `attacker`/`defender` while the queue only accepted events with a `cell`.
   */
  readonly flash: number;
  /** The counting numbers, or null when this card is not fighting. */
  readonly roll: BattleRollFrame | null;
}

interface Animation {
  readonly cell: Cell;
  readonly kind: 'place' | 'flip' | 'battle';
  /** Wall-clock start, in the animator's own millisecond clock. */
  readonly start: number;
  readonly duration: number;
  /** The card as it should look when the animation ends. */
  readonly target: BoardCard | null;
  /** Set only on the `battle-roll` step; null for every other animation. */
  readonly roll: AnimationRoll | null;
}

/** What one side of a fight is counting, and where to. */
interface AnimationRoll {
  readonly base: number;
  readonly actual: number;
  readonly side: 'attacker' | 'defender';
  readonly won: boolean;
  readonly probability: number;
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
  /** When the last turn handover started, and whose it was to. */
  private turnStartedAt: number | null = null;
  private turnOwner: Owner | null = null;
  /**
   * The schedule built by the last `push`.
   *
   * Anything that has to line up with the animation reads this rather than recomputing it. A second
   * call to `schedule` would answer differently, because the queue has since grown — and sound that
   * drifted a few hundred milliseconds from the picture it belongs to is worse than no sound.
   */
  private schedule0: readonly EventSlot[] = [];

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

  /**
   * How many animations are waiting.
   *
   * Exposed because the queue has to stay bounded (`PLAN.md` §6, Stage 11) and "it does not grow
   * without limit" is not a claim anyone can check without this. `tools/perf.ts` asserts the depth
   * across whole matches, which is the only way to catch a queue that only grows in a rare cascade.
   */
  get queueDepth(): number {
    return this.queue.length;
  }

  /** Where each event of the last pushed log will play. Empty before the first `push`. */
  get lastSchedule(): readonly EventSlot[] {
    return this.schedule0;
  }

  /**
   * When each event of `events` will animate, starting after anything already queued.
   *
   * `push` is built on this rather than the other way round, because a second implementation of the
   * same schedule is exactly how sound and picture end up disagreeing.
   */
  schedule(events: readonly GameEvent[]): readonly EventSlot[] {
    const slots: EventSlot[] = [];
    let cursor = this.clock;
    for (const queued of this.queue) {
      const end = queued.start + queued.duration;
      if (end > cursor) cursor = end;
    }
    const start = cursor;
    for (const event of events) {
      const duration = this.reduceMotion === 'reduced' ? 0 : durationFor(event);
      slots.push({ event, startMs: cursor - start, durationMs: duration });
      // Events that animate nothing still occupy their place in the sequence, so the numbers line up
      // with what is on screen rather than with the events that happen to be visible.
      cursor += duration;
    }
    return slots;
  }

  /**
   * Queues the animations for one action's event log. Order is preserved: it is the sequence.
   *
   * `this.clock` is wall time and is **not** moved here. It used to be advanced to the end of the
   * schedule, which meant every animation was already finished before the first frame was drawn —
   * the fade, the pop, the squash, the whole system — because `tick` compares wall time against
   * schedule times and wall time started past all of them. Nothing had ever been seen move.
   *
   * Instead the schedule starts after whatever is already queued, so two actions in quick
   * succession play in order rather than on top of each other.
   */
  push(events: readonly GameEvent[], state: GameState): void {
    const slots = this.schedule(events);
    this.schedule0 = slots;

    for (const slot of slots) {
      const event = slot.event;
      const duration = slot.durationMs;
      const at = this.clock + slot.startMs;

      // A turn handover has no cell, and must never touch one: it would erase the card just played.
      // It gets its own clock entry instead.
      if (event.t === 'turn') {
        // Reduced motion means no decorative motion either, and this is decoration.
        if (duration > 0) {
          this.turnStartedAt = at;
          this.turnOwner = event.owner;
        }
        continue;
      }

      for (const cell of cellsFor(event)) {
        // The target is the board as it stands *after* the whole action, which is correct for
        // every cell an event names.
        const target = state.board[cell] ?? null;
        if (duration === 0) {
          // Reduced motion: apply at once rather than queueing a zero-length tween, so the board
          // is correct on the very next frame.
          this.display[cell] = target;
          continue;
        }
        this.queue.push({
          cell,
          kind: kindFor(event),
          start: at,
          duration,
          target,
          roll: rollFor(event, cell),
        });
      }
    }
  }

  /**
   * Advances the clock and applies any animation whose time has come. Returns true if anything is
   * still running, so the caller knows whether to keep scheduling frames.
   */
  tick(deltaMs: number): boolean {
    // The clock advances whether or not anything is queued. The turn glow runs on it, and a clock
    // that only moves while cards are animating would freeze the handover pulse for the first
    // placement of the match.
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

  /**
   * The handover glow, or null when there is nothing to show.
   *
   * A turn change used to be announced by three words in the score bar changing and nothing else,
   * which is a lot to ask of a player who has just watched a cascade of cards land. This is the
   * only feedback a handover had, so it is deliberately short and quiet.
   *
   * It is decorative and never blocks input: it is not in `queue`, so `idle` does not wait for it
   * and a slow frame cannot cost somebody a move.
   */
  turnGlow(): { readonly owner: Owner; readonly strength: number } | null {
    if (this.turnOwner === null || this.turnStartedAt === null) return null;
    const elapsed = this.clock - this.turnStartedAt;
    if (elapsed < 0 || elapsed > TURN_GLOW_MS) return null;
    // Up fast, down slow: the change should be noticed immediately and then get out of the way.
    const t = elapsed / TURN_GLOW_MS;
    const strength = t < 0.25 ? t / 0.25 : 1 - (t - 0.25) / 0.75;
    // The glow starts from nothing and ends at nothing, and neither end is worth drawing.
    if (strength <= 0.01) return null;
    return { owner: this.turnOwner, strength };
  }

  /** The frame for a cell right now: its animation progress, or a settled card. */
  frameAt(cell: Cell): CardFrame {
    const now = this.clock;
    let opacity = 1;
    let scale = 1;
    let flash = 0;
    let roll: BattleRollFrame | null = null;
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
          // Later animations win, so a `flip` queued behind a fight does not erase the numbers.
          if (animation.roll !== null) {
            const { base, actual, side, won, probability } = animation.roll;
            roll = {
              value: Math.round(base + (actual - base) * easeOut(progress)),
              final: actual,
              side,
              won,
              probability,
            };
          }
          break;
      }
    }
    return { cell, card, opacity, scale, flash, roll };
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

/** How long a turn handover's glow lasts. Short: it is a nudge, not a spectacle. */
const TURN_GLOW_MS = 520;

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

/**
 * Every cell an event touches.
 *
 * This was `'cell' in event`, which silently dropped every battle: `battle` and `battle-roll` name
 * `attacker` and `defender` instead, because a fight involves two cards. So the centrepiece of the
 * game — the number rolling up — was never animated at all, and the `battle` branch below it was
 * unreachable. Battle events now contribute both of their cells.
 */
function cellsFor(event: GameEvent): readonly Cell[] {
  if ('cell' in event) return [event.cell];
  if (event.t === 'battle' || event.t === 'battle-roll') return [event.attacker, event.defender];
  return [];
}

/** The numbers one side of a fight should count, or null for events that are not a roll. */
function rollFor(event: GameEvent, cell: Cell): AnimationRoll | null {
  if (event.t !== 'battle-roll') return null;
  if (cell === event.attacker) {
    return {
      base: event.atkBase,
      actual: event.atkActual,
      side: 'attacker',
      won: event.attackerWins,
      probability: event.probability,
    };
  }
  if (cell === event.defender) {
    return {
      base: event.defBase,
      actual: event.defActual,
      side: 'defender',
      won: !event.attackerWins,
      probability: event.probability,
    };
  }
  return null;
}

/**
 * Total animation length for a log, so the UI can show a progress hint.
 *
 * Only events that actually animate are counted. A `turn` or `winner` event occupies no time on
 * screen, and including it reported 864ms for a fight that took 240 — a number nothing checked,
 * because nothing used it. It is exported, so it can be checked now.
 */
export function totalDuration(events: readonly GameEvent[], mode: ReduceMotion = 'full'): number {
  if (mode === 'reduced') return 0;
  return events.reduce(
    (sum, event) => sum + (cellsFor(event).length > 0 ? durationFor(event) : 0),
    0,
  );
}

/** The owner currently displayed at a cell, for hover and pointer logic. */
export function displayedOwner(animator: Animator, cell: Cell): Owner | null {
  return animator.frameAt(cell).card?.owner ?? null;
}
