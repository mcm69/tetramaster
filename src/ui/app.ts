/**
 * Match controller (PLAN.md §6, Stage 7).
 *
 * The single place where player intent becomes engine actions. It is deliberately **DOM-free**: the
 * renderer and the input layer both talk to it, and it can be driven entirely from a test. That is
 * what makes the Stage 7 DoD — *complete a match by mouse only, then again by keyboard only* —
 * something a test can check rather than a claim a human has to verify by hand.
 *
 * Two rules matter more than the rest:
 *
 *  - **Input is ignored while an animation is playing.** Otherwise a player can outrun the board and
 *    see a stale position. `busy` is the gate, and both mouse and keyboard respect it identically.
 *  - **Mouse and keyboard are interchangeable.** `playAt` is what a click calls; `confirm` is what
 *    Enter calls. They reach the same function, so the two input modes cannot drift apart.
 */

import { Animator } from '../render/animator.ts';
import { applyAction, legalCells, opponentOf, score, type Action } from '../core/match.ts';
import { previewPendingBattles } from '../core/resolution.ts';
import { figureById } from '../data/cards.ts';
import { resolveStats, winProbability } from '../core/battle.ts';
import { statCode } from '../core/card.ts';
import { arrowCount } from '../core/direction.ts';
import type { BoardCard, Card, Cell, GameState, MatchResult, Owner, Phase } from '../core/types.ts';

/** A card as the UI shows it. */
export interface CardView {
  readonly figureId: number;
  readonly name: string;
  readonly statCode: string;
  readonly arrows: number;
  readonly arrowCount: number;
}

export function toCardView(card: Card): CardView {
  return {
    figureId: card.figureId,
    name: figureById(card.figureId).name,
    statCode: statCode(card),
    arrows: card.arrows,
    arrowCount: arrowCount(card.arrows),
  };
}

/** One contested card the player may choose to fight, with the odds stated up front. */
export interface BattleChoice {
  readonly cell: Cell;
  /** 0-1 chance the player's card wins. Computed *before* the rolls (§1.6). */
  readonly probability: number;
  readonly attacker: CardView;
  readonly defender: CardView;
}

export interface HandEntry {
  readonly index: number;
  readonly card: CardView;
  readonly selected: boolean;
}

export interface MatchView {
  readonly phase: Phase;
  readonly turn: Owner;
  readonly busy: boolean;
  readonly legal: readonly Cell[];
  readonly hover: Cell | null;
  readonly selected: number | null;
  readonly hand: readonly HandEntry[];
  readonly pending: readonly BattleChoice[];
  readonly score: Readonly<Record<Owner, number>>;
  readonly result: MatchResult | null;
  /** Set by the H key: what would happen if the card were played here. */
  readonly hint: string | null;
}

export class MatchController {
  private current: GameState;
  private readonly anim: Animator;
  private selected: number | null = null;
  private hoverCell: Cell | null = null;
  private hintText: string | null = null;
  private claimed: readonly Card[] = [];

  constructor(initial: GameState, animator: Animator = new Animator()) {
    this.current = initial;
    this.anim = animator;
    this.anim.syncTo(initial.board);
  }

  get state(): GameState {
    return this.current;
  }

  get animator(): Animator {
    return this.anim;
  }

  /** True while the board is still animating; input is ignored until it settles. */
  get busy(): boolean {
    return !this.anim.idle;
  }

  // ── intent ───────────────────────────────────────────────────────────────────────────────

  /** Picks up (or puts down) a card from the hand. */
  selectCard(index: number | null): boolean {
    if (this.busy || this.current.phase !== 'place') return false;
    if (index === null) {
      this.selected = null;
      return true;
    }
    const card = this.current.players[this.current.turn].hand[index];
    if (!card) return false;
    this.selected = index;
    return true;
  }

  setHover(cell: Cell | null): void {
    this.hoverCell = cell;
  }

  /** Moves the keyboard cursor, skipping cells that cannot be played into. */
  moveHover(deltaRow: number, deltaCol: number): Cell | null {
    const legal = legalCells(this.current);
    if (legal.length === 0) return null;
    const from = this.hoverCell ?? legal[0];
    // Cell 0 is a valid cell and is falsy: an `if (!from)` guard here would strand the cursor.
    if (from === undefined) return null;

    const row = clamp(Math.floor(from / 4) + deltaRow, 0, 3);
    const col = clamp((from % 4) + deltaCol, 0, 3);
    const candidate = (row * 4 + col) as Cell;
    if (legal.includes(candidate)) {
      this.hoverCell = candidate;
      return candidate;
    }
    // Nearest legal cell in the direction of travel, so the cursor never sticks.
    let best: Cell = from;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const cell of legal) {
      const distance = Math.abs(Math.floor(cell / 4) - row) + Math.abs((cell % 4) - col);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = cell;
      }
    }
    this.hoverCell = best;
    return best;
  }

  /**
   * The one place an action is dispatched. Mouse and keyboard both come through here, which is
   * what guarantees the two input modes behave identically.
   */
  playAt(cell: Cell): boolean {
    if (this.current.phase === 'chooseBattle') {
      return this.current.pendingBattles.includes(cell) ? this.chooseBattle(cell) : false;
    }
    if (this.current.phase !== 'place') return false;
    if (this.selected === null) return false;
    if (!legalCells(this.current).includes(cell)) return false;

    return this.dispatch({ t: 'place', cell, cardIndex: this.selected });
  }

  /** Fights one of the contested cards. §1.7 lets the player pick the order. */
  chooseBattle(cell: Cell): boolean {
    if (this.current.phase !== 'chooseBattle') return false;
    return this.dispatch({ t: 'chooseBattle', cell });
  }

  /**
   * Submits an action produced elsewhere — by the AI, a replay, or a script.
   *
   * This is the seam the opponent uses, and it is also why the busy guard lives in `dispatch`:
   * an external caller holds no selected card, so nothing else would stop it acting mid-animation.
   */
  submitExternal(action: Action): boolean {
    return this.dispatch(action);
  }

  /**
   * Enter/Space: play at the cursor if a card is held, otherwise fight the contested card under
   * the cursor. Identical in effect to clicking there.
   */
  confirm(): boolean {
    if (this.hoverCell === null) return false;
    return this.playAt(this.hoverCell);
  }

  /** Escape: put the held card down. */
  cancel(): boolean {
    if (this.selected === null) return false;
    this.selected = null;
    return true;
  }

  /** H: explain what playing here would do. */
  showHint(): string | null {
    this.hintText = this.hintFor(this.hoverCell);
    return this.hintText;
  }

  /** Claims a captured card at the end of a match (§1.1). */
  claim(index: number): boolean {
    const result = this.current.result;
    if (!result) return false;
    const card = result.claimable[index];
    if (!card || this.claimed.includes(card)) return false;
    this.claimed = [...this.claimed, card];
    this.current = {
      ...this.current,
      result: { ...result, taken: this.claimed },
    };
    return true;
  }

  get taken(): readonly Card[] {
    return this.claimed;
  }

  /** Advances the animation clock. The render loop calls this every frame. */
  advance(deltaMs: number): boolean {
    return this.anim.tick(deltaMs);
  }

  // ── view ─────────────────────────────────────────────────────────────────────────────────

  get view(): MatchView {
    const owner = this.current.turn;
    const hand = this.current.players[owner].hand;
    return {
      phase: this.current.phase,
      turn: owner,
      busy: this.busy,
      legal: legalCells(this.current),
      hover: this.hoverCell,
      selected: this.selected,
      hand: hand.map((card, index) => ({
        index,
        card: toCardView(card),
        selected: index === this.selected,
      })),
      pending: this.battleChoices(),
      score: score(this.current),
      result: this.current.result,
      hint: this.hintText,
    };
  }

  /**
   * The contested cards, each with its odds. Shown by the chooser so the player can weigh a fight
   * before committing — the single most useful piece of information the original withheld.
   */
  battleChoices(): BattleChoice[] {
    if (this.current.phase !== 'chooseBattle') return [];
    const playedCell = this.current.pendingCell;
    if (playedCell === undefined) return [];
    const attacker = this.current.board[playedCell];
    if (!attacker) return [];

    const odds = new Map(
      previewPendingBattles(this.current, playedCell).map((o) => [o.cell, o.probability]),
    );
    const choices: BattleChoice[] = [];
    for (const cell of this.current.pendingBattles) {
      const defender = this.current.board[cell];
      if (!defender) continue;
      choices.push({
        cell,
        probability: odds.get(cell) ?? this.estimateOdds(attacker, defender),
        attacker: toCardView(attacker),
        defender: toCardView(defender),
      });
    }
    return choices;
  }

  private estimateOdds(attacker: BoardCard, defender: BoardCard): number {
    const pick = resolveStats(attacker, defender);
    return winProbability(pick.atkIndex * 16 + 8, pick.defIndex * 16 + 8);
  }

  private hintFor(cell: Cell | null): string | null {
    if (cell === null) return null;
    if (this.current.blocked[cell]) return `Cell ${cell} is blocked — nothing can be played there.`;
    const occupant = this.current.board[cell];
    if (occupant) {
      const who = occupant.owner === this.current.turn ? 'yours' : 'theirs';
      return `Cell ${cell} holds a ${toCardView(occupant).name} card, ${who}, with ${arrowCount(occupant.arrows)} arrows.`;
    }
    if (this.current.phase === 'chooseBattle') {
      const choice = this.battleChoices().find((c) => c.cell === cell);
      if (choice) {
        const pct = Math.round(choice.probability * 100);
        return `Fighting here: ${choice.defender.name} (${choice.defender.statCode}) — you win ${pct}% of the time.`;
      }
      return 'Choose one of the highlighted cards to fight.';
    }
    if (this.selected === null) return 'Pick a card from your hand first (click it, or press 1-5).';
    return `Playing here is legal. ${this.current.blocked.filter(Boolean).length} cells are blocked.`;
  }

  // ── internals ────────────────────────────────────────────────────────────────────────────

  /**
   * The single choke point for every action. The busy guard lives here rather than in each public
   * method: it is the one place that is genuinely reachable, and having it in one place means no
   * input path can forget it.
   */
  private dispatch(action: Action): boolean {
    if (this.busy) return false;
    const result = applyAction(this.current, action);
    if (result.events.some((e) => e.t === 'illegal')) return false;

    this.current = result.state;
    this.anim.push(result.events, result.state);
    this.selected = null;
    this.hintText = null;
    // A placement invalidates the old cursor position, so re-seat it on something legal.
    this.hoverCell = legalCells(this.current)[0] ?? null;
    if (result.state.result) this.claimed = [];
    return true;
  }
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Drives a whole match with a policy, ignoring animation timing. Used by tests and tools. */
export function playToEnd(
  controller: MatchController,
  choose: (view: MatchView) => Action | null,
): void {
  for (let guard = 0; guard < 2000; guard++) {
    const view = controller.view;
    if (view.phase === 'over') return;
    // Let the board settle before the next move, exactly as the render loop would.
    while (controller.busy) controller.advance(1000);

    const action = choose(controller.view);
    if (!action) return;
    if (action.t === 'place') {
      controller.selectCard(action.cardIndex);
      controller.playAt(action.cell);
    } else if (action.t === 'chooseBattle') {
      controller.chooseBattle(action.cell);
    } else {
      return;
    }
  }
}

export { opponentOf };
