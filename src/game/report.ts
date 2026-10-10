/**
 * Reading a finished match back out for progression (PLAN.md §1.8).
 *
 * §1.8 rewards two things that only exist during a match: *which cards were used* (growth) and *how
 * many battles each one won* (evolution). Neither survives in `GameState` — the engine tracks cards
 * as `Card`s with no identity, and only the event log remembers the order they were played in.
 *
 * So this replays the log. That is what the log is for, and PLAN.md §3.2 already commits to keeping
 * it append-only precisely so a match can be read back after the fact. The alternative — threading a
 * uid through the engine — would put progression state inside the rules engine, where it does not
 * belong.
 *
 * One honest limitation: once a card is taken off the board, its identity is gone — the square is
 * then held by a card the replay cannot name. That does not matter here, because §1.8 credits
 * *battles won*, and a card that has been taken won the battle that preceded it. The credit is
 * earned at the moment of the win and is not revoked when the card later leaves the board.
 */

import type { Cell, GameState, OwnedCard, Owner } from '../core/types.ts';

/** What a finished match did that §1.8 cares about. */
export interface MatchReport {
  /** Uids the player actually placed, in the order they were played. */
  readonly usedUids: readonly number[];
  /** Uid → battles won, counting both attacking and defending (§1.8). */
  readonly battleWins: ReadonlyMap<number, number>;
}

/**
 * Replays a finished match against the deck it was played with.
 *
 * `deck` must be the same cards, in the same order, that the match was created from. The hand
 * shrinks as cards are played, so `cardIndex` in the log indexes the shrinking hand, and deck
 * positions have to be recovered by replaying the placements rather than read directly.
 */
export function analyseMatch(
  state: GameState,
  deck: readonly OwnedCard[],
  owner: Owner,
): MatchReport {
  /** Deck positions still in hand, in hand order. */
  let remaining: number[] = deck.map((_, index) => index);
  /** Which deck position our card occupies in each square we hold. */
  const mine = new Map<Cell, number>();
  const usedUids: number[] = [];
  const battleWins = new Map<number, number>();

  for (const event of state.history) {
    switch (event.t) {
      case 'place': {
        if (event.owner !== owner) break;
        const position = remaining[event.cardIndex];
        if (position === undefined) break;
        remaining = remaining.filter((_, index) => index !== event.cardIndex);
        const uid = deck[position]?.uid;
        if (uid === undefined) break;
        usedUids.push(uid);
        mine.set(event.cell, position);
        break;
      }

      case 'flip': {
        if (event.to === owner) break;
        // The square is no longer ours, and whatever card we had there is gone.
        mine.delete(event.cell);
        break;
      }

      case 'battle-roll': {
        // Winning counts whether you attacked or defended — §1.8 says "any single battle".
        const position = event.attackerWins ? mine.get(event.attacker) : mine.get(event.defender);
        if (position === undefined) break;
        const uid = deck[position]?.uid;
        if (uid === undefined) break;
        battleWins.set(uid, (battleWins.get(uid) ?? 0) + 1);
        break;
      }

      default:
        // takedown, combo, battle, evolve, turn, game-over, hint, illegal — none change which of
        // our cards is where, and §1.8 does not reward them.
        break;
    }
  }

  return { usedUids, battleWins };
}
