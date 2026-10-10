/**
 * Progression (PLAN.md §1.8).
 *
 * Cards get stronger between matches, by two mechanisms that the original keeps entirely separate.
 *
 * **Stat growth** — after a *won* match, every card that was played gets +1 to one of its three
 * stats, picked uniformly at random. The pick ignores the caps, so a card that rolls a stat it has
 * already maxed gets nothing and the point is gone. There is no reroll. PLAN.md §1.8 calls this
 * "faithful, and deliberately frustrating", and it is: the single most common thing a player sees
 * after a good match is a wasted point, and that is the correct behaviour, not a bug to paper over.
 *
 * **Type evolution** — on winning *any single battle*, offense or defense, the winner rolls for a
 * type change: `P`/`M` → `X` at 1/32, `X` → `A` at 1/256. A card gets one roll per battle it wins,
 * so a card that swept four fights gets four chances. A card never jumps straight from `P` to `A`;
 * it has to become `X` first and come back.
 *
 * The two are independent: a card can change type long before its stats are anywhere near maxed, and
 * a maxed card can still evolve.
 *
 * This module sits in `src/game/` rather than `src/core/` because it needs the figure catalog for
 * stat caps, and `src/data/` already imports `src/core/` — putting this in core would make the
 * dependency graph cyclic. The order is core → data → game → ui.
 */

import { STAT_KEYS } from '../core/card.ts';
import { figureById } from '../data/cards.ts';
import type { Rng } from '../core/rng.ts';
import type {
  CardChange,
  CardType,
  OwnedCard,
  StatCaps,
  StatIndex,
  StatKey,
} from '../core/types.ts';

/** `P`/`M` → `X`: one battle win in 32 (§1.8). */
export const P_TO_X_ODDS = 32;

/** `X` → `A`: one battle win in 256 (§1.8). Deliberately rare — `A` is meant to be an event. */
export const X_TO_A_ODDS = 256;

/** The stat caps of the figure this card came from. */
export function capsFor(card: OwnedCard): StatCaps {
  return figureById(card.figureId).caps;
}

/** True when every stat is already at its ceiling. */
export function isFullyGrown(card: OwnedCard): boolean {
  const caps = capsFor(card);
  return STAT_KEYS.every((key) => card[key] >= caps[key]);
}

/**
 * Rolls one type-evolution attempt. Returns the new type, or `null` for no change.
 *
 * Note the asymmetry, which is faithful: a `P` card cannot become `A` in one step. It must become
 * `X` and then win another battle.
 */
export function rollEvolution(type: CardType, rng: Rng): CardType | null {
  if (type === 'P' || type === 'M') {
    return rng.int(P_TO_X_ODDS) === 0 ? 'X' : null;
  }
  if (type === 'X') {
    return rng.int(X_TO_A_ODDS) === 0 ? 'A' : null;
  }
  return null;
}

/** The result of one stat-growth attempt. */
export interface StatGrowth {
  readonly stat: StatKey;
  readonly from: StatIndex;
  readonly to: StatIndex;
  readonly wasted: boolean;
}

/**
 * Applies one +1 to a uniformly chosen stat.
 *
 * The choice is made *before* the cap is consulted, never after and never again — that ordering is
 * the whole rule. Choosing a stat that respects the cap would make growth converge, and rerolling
 * would make it deterministic once two stats are capped.
 */
export function growStat(card: OwnedCard, rng: Rng): StatGrowth {
  const key = rng.pick(STAT_KEYS);
  const from = card[key];
  const caps = capsFor(card);
  const wasted = from >= caps[key];
  return { stat: key, from, to: wasted ? from : from + 1, wasted };
}

/** What a match did that progression cares about. */
export interface ProgressionInput {
  /** Whether the player *won*. A draw and a loss both grow nothing (§1.8). */
  readonly won: boolean;
  /** Every card the player put on the board, by uid. */
  readonly usedUids: readonly number[];
  /** How many battles each card won, by uid. Drives type evolution (§1.8). */
  readonly battleWins: ReadonlyMap<number, number>;
}

export interface ProgressionResult {
  /** The updated collection. Untouched cards keep their identity; changed ones are copies. */
  readonly collection: readonly OwnedCard[];
  /** One entry per stat that moved. Wasted rolls are recorded too, so the UI can admit them. */
  readonly changes: readonly CardChange[];
  /** How many rolls were thrown at an already-capped stat. */
  readonly wasted: number;
}

/**
 * Applies §1.8 to a collection after a match.
 *
 * Pure: cards are copied on write, the input collection is never touched, and every random draw
 * comes from the injected `rng`. That matters because this runs against the player's actual save —
 * a partial mutation here would silently corrupt a real collection.
 */
export function applyProgression(
  collection: readonly OwnedCard[],
  input: ProgressionInput,
  rng: Rng,
): ProgressionResult {
  const byUid = new Map(collection.map((card) => [card.uid, card]));
  const updated = new Map<number, OwnedCard>();
  const changes: CardChange[] = [];
  let wasted = 0;

  // Copy-on-write helper: the first time a card is changed, park a copy in the map.
  const mutable = (uid: number): OwnedCard | undefined => {
    const current = updated.get(uid) ?? byUid.get(uid);
    if (current === undefined) return undefined;
    if (!updated.has(uid)) updated.set(uid, { ...current });
    return updated.get(uid);
  };

  // Type evolution first: it is independent of the match result and of stat growth.
  for (const [uid, wins] of input.battleWins) {
    if (wins <= 0) continue;
    const card = byUid.get(uid);
    if (card === undefined) continue;
    for (let i = 0; i < wins; i++) {
      const next = rollEvolution(card.type, rng);
      if (next === null) continue;
      const target = mutable(uid);
      if (target === undefined) continue;
      target.type = next;
    }
  }

  // Stat growth, and only for a won match.
  if (input.won) {
    for (const uid of input.usedUids) {
      const card = byUid.get(uid);
      if (card === undefined) continue;
      const growth = growStat(card, rng);
      if (growth.wasted) wasted++;
      const target = mutable(uid);
      if (target === undefined) continue;
      target[growth.stat] = growth.to;
      const evolvedTo = updated.get(uid)?.type;
      changes.push({
        uid,
        figureId: card.figureId,
        stat: growth.stat,
        from: growth.from,
        to: growth.to,
        wasted: growth.wasted,
        ...(evolvedTo !== undefined && evolvedTo !== card.type ? { evolvedTo } : {}),
      });
    }
  }

  const out = collection.map((card) => updated.get(card.uid) ?? card);
  return { collection: out, changes, wasted };
}

/** Rolls a brand-new instance of a figure: stats inside [base, caps] (§1.3). */
export function acquireCard(uid: number, figureId: number, rng: Rng): OwnedCard {
  const figure = figureById(figureId);
  const roll = (lo: number, hi: number): number => rng.range(lo, hi);
  return {
    uid,
    figureId,
    arrows: figure.arrows,
    atk: roll(figure.base.atk, figure.caps.atk),
    type: figure.baseType,
    pdef: roll(figure.base.pdef, figure.caps.pdef),
    mdef: roll(figure.base.mdef, figure.caps.mdef),
  };
}

/** A one-line summary of a change, for the results screen. */
export function describeChange(change: CardChange): string {
  const name = figureById(change.figureId).name;
  if (change.wasted)
    return `${name}: ${change.stat.toUpperCase()} was already maxed — the point is lost`;
  const grew = `${change.stat.toUpperCase()} ${change.from} → ${change.to}`;
  return change.evolvedTo === undefined
    ? `${name}: ${grew}`
    : `${name}: ${grew}, evolved to ${change.evolvedTo}`;
}
