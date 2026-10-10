/**
 * Card battle: stat selection and odds (PLAN.md §1.6).
 *
 * Stage 1 provides only the two pure pieces — which stats are compared, and how likely the
 * attacker is to win. `rollBattle` itself arrives in Stage 4, once the seeded draws exist.
 *
 * Everything here is a pure function of its arguments and an `Rng`. Nothing peeks at future rolls.
 */

import { STAT_SPAN } from './constants';
import { lowestStat, highestStat, statInterval } from './card';
import type { Rng } from './rng';
import type { BattleOutcome, BattleResolver, Card, StatIndex, StatKey } from './types';

/** Which stat each side contributes to a battle. */
export interface StatPick {
  /** The stat the attacker reads. */
  readonly atkKey: StatKey;
  /** The stat the attacker reads on the defender. */
  readonly defKey: StatKey;
  /** Index values, for the UI to show the interval bands. */
  readonly atkIndex: StatIndex;
  readonly defIndex: StatIndex;
}

/**
 * Chooses the compared stats (PLAN.md §1.6.1).
 *
 * Note that the **attacker's type alone** decides both halves: a `P` card attacks the defender's
 * `pdef`, an `A` card attacks the lowest of the defender's three stats *including its attack*. The
 * defender's own type is never consulted — it only matters when the defender is itself attacking.
 *
 * Ties in `highestStat`/`lowestStat` break toward the earlier key in [atk, pdef, mdef]. The chosen
 * values are equal in a tie, so this affects only which label the UI displays, never the outcome.
 */
export function resolveStats(attacker: Card, defender: Card): StatPick {
  switch (attacker.type) {
    case 'P':
      return { atkKey: 'atk', defKey: 'pdef', atkIndex: attacker.atk, defIndex: defender.pdef };
    case 'M':
      return { atkKey: 'atk', defKey: 'mdef', atkIndex: attacker.atk, defIndex: defender.mdef };
    case 'X': {
      // X attacks whichever of the two defences is weaker. Ties go to pdef for a stable label.
      const defKey: StatKey = defender.pdef <= defender.mdef ? 'pdef' : 'mdef';
      return {
        atkKey: 'atk',
        defKey,
        atkIndex: attacker.atk,
        defIndex: defender[defKey],
      };
    }
    case 'A': {
      // A attacks with its highest stat and against the opponent's lowest, attack included.
      const best = highestStat(attacker);
      const worst = lowestStat(defender);
      return {
        atkKey: best.key,
        defKey: worst.key,
        atkIndex: best.index,
        defIndex: worst.index,
      };
    }
    default: {
      // Exhaustiveness guard: a fifth card type becomes a compile error here (PLAN.md §2.3).
      const unreachable: never = attacker.type;
      throw new Error(`unreachable card type: ${String(unreachable)}`);
    }
  }
}

/** A battle's two concrete bases and the derived odds, as shown to the player before rolling. */
export interface BattleOdds {
  readonly atkBase: number;
  readonly defBase: number;
  readonly probability: number;
}

/**
 * Draws the base value for a stat index: uniform over its interval (§1.3, §1.6 step 2).
 */
export function baseValue(index: StatIndex, roll: () => number): number {
  const { min, max } = statInterval(index);
  return min + Math.floor(roll() * (max - min + 1));
}

/**
 * Fights one battle (PLAN.md §1.6). This is where the game's famous randomness lives.
 *
 * The order of draws is fixed and deliberate, because it is what makes a seeded match
 * reproducible:
 *
 *   1. the attacker's base, from its stat's interval
 *   2. the defender's base, from its stat's interval
 *   3. the attacker's roll, uniform in [0, atkBase]
 *   4. the defender's roll, uniform in [0, defBase]
 *
 * Both `actual` values are `base − roll`, so they are uniform on [0, base] and never negative.
 * A tie goes to the defender (§1.6.2), which is why the comparison is strict.
 *
 * Note the consequence: a *higher roll is worse*. The strongest card can lose to the weakest,
 * and will occasionally lose to a card many intervals below it. That is faithful, and it is why
 * `winProbability` exists — to let the player see the odds before committing.
 */
export function rollBattle(attacker: Card, defender: Card, rng: Rng): BattleOutcome {
  const pick = resolveStats(attacker, defender);

  const atkBase = baseValue(pick.atkIndex, () => rng.next());
  const defBase = baseValue(pick.defIndex, () => rng.next());

  // Computed before rolling, so the UI can show the real odds before the outcome exists.
  const probability = winProbability(atkBase, defBase);

  const atkRoll = rng.int(atkBase + 1);
  const defRoll = rng.int(defBase + 1);
  const atkActual = atkBase - atkRoll;
  const defActual = defBase - defRoll;

  return {
    attackerWins: atkActual > defActual, // ties go to the defender
    atkBase,
    atkRoll,
    atkActual,
    defBase,
    defRoll,
    defActual,
    probability,
  };
}

/** A {@link BattleResolver} bound to an RNG, ready to hand to `resolvePlacement`. */
export function rngResolver(rng: Rng): BattleResolver {
  return (attacker, defender) => rollBattle(attacker, defender, rng);
}

/**
 * Probability that the attacker wins a battle with the given concrete bases.
 *
 * Each side's `actual` is uniform on [0, base] (§1.6 step 3-4), and ties go to the defender
 * (§1.6.2), so this counts the pairs with `atkActual > defActual` out of all pairs:
 *
 *     m      = min(a, b)
 *     P(win) = ((m + 1) * a - m * (m + 1) / 2) / ((a + 1) * (b + 1))
 *
 * The tie term is what makes this differ from a naive ratio: two identical digits give 0.46875,
 * not 0.5, and `P(0, 0)` is 0 rather than 0.5. Pinned by a brute-force enumeration test.
 */
export function winProbability(atkBase: number, defBase: number): number {
  const m = Math.min(atkBase, defBase);
  const favourable = (m + 1) * atkBase - (m * (m + 1)) / 2;
  const total = (atkBase + 1) * (defBase + 1);
  return favourable / total;
}

/**
 * The odds of a battle between two cards, using the midpoint of each side's interval as the
 * displayed base. Only an estimate — the real roll is drawn later, in Stage 4 — but it is the
 * number the UI shows so the player can weigh a fight.
 */
export function previewOdds(attacker: Card, defender: Card): BattleOdds {
  const pick = resolveStats(attacker, defender);
  // Midpoint of the interval: the most honest single estimate before the roll exists.
  const atkBase = Math.round(pick.atkIndex * 16 + STAT_SPAN / 2 - 0.5);
  const defBase = Math.round(pick.defIndex * 16 + STAT_SPAN / 2 - 0.5);
  return { atkBase, defBase, probability: winProbability(atkBase, defBase) };
}
