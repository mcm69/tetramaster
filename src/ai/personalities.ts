/**
 * The cast of opponents (PLAN.md §6, Stage 8).
 *
 * Each personality is a different set of weights over the same evaluation, so they disagree about
 * what matters without any of them needing different logic. A greedy player chases captures; a
 * patient one values quarantine above all; a reckless one takes every fight it can win on paper.
 * That variety is the point — it keeps the metagame from reducing to "always corner".
 *
 * The weights are the levers. `combo` and `capture` swing the most between characters because those
 * are the strategies that most change how a match plays out.
 */

import { DEFAULT_WEIGHTS, type Weights } from './evaluate.ts';
import type { Difficulty, Personality } from './opponent.ts';

function weights(overrides: Partial<Weights>): Weights {
  return { ...DEFAULT_WEIGHTS, ...overrides };
}

export const PERSONALITIES: readonly Personality[] = [
  {
    id: 'bibi',
    name: 'Bibi',
    difficulty: 'casual',
    // Enthusiastic and greedy: takes anything it can reach, thinks little about exposure.
    weights: weights({
      capture: 16,
      battle: 24,
      risk: 3,
      corner: 2,
      combo: 7,
      quarantine: 4,
      lowDefence: 5,
    }),
    volatility: 16,
    taunt: 'A card for a card! A good trade, yes? Yes!',
  },
  {
    id: 'danny',
    name: 'Danny',
    difficulty: 'casual',
    // Placid and safe: hugs corners, avoids fights.
    weights: weights({
      capture: 8,
      battle: 14,
      risk: 12,
      corner: 11,
      combo: 4,
      quarantine: 20,
      lowDefence: 14,
    }),
    volatility: 13,
    taunt: 'Maybe we should just sit here for a while.',
  },
  {
    id: 'pino',
    name: 'Pino',
    difficulty: 'steady',
    // A combo player: values the cards a loser's arrows drag along more than the winner itself.
    weights: weights({
      capture: 11,
      battle: 22,
      risk: 7,
      corner: 6,
      combo: 18,
      quarantine: 12,
      lowDefence: 10,
    }),
    volatility: 7,
    taunt: 'Let us set that one up nicely.',
  },
  {
    id: 'vivi',
    name: 'Vivi',
    difficulty: 'steady',
    // Even-handed, no strong bias.
    weights: DEFAULT_WEIGHTS,
    volatility: 7,
    taunt: 'Hmm. Let me think about this one.',
  },
  {
    id: 'quina',
    name: 'Quina',
    difficulty: 'steady',
    // A glutton for battles: fights on odds far more often than is sensible.
    weights: weights({
      capture: 9,
      battle: 38,
      risk: 5,
      corner: 4,
      combo: 9,
      quarantine: 8,
      lowDefence: 6,
    }),
    volatility: 8,
    taunt: 'I eat cards. It is delicious.',
  },
  {
    id: 'gil',
    name: 'Gil',
    difficulty: 'steady',
    // Defensive: hates exposing a card and values keeping what he has.
    weights: weights({
      capture: 10,
      battle: 18,
      risk: 14,
      corner: 10,
      combo: 6,
      quarantine: 22,
      lowDefence: 16,
    }),
    volatility: 6,
    taunt: 'Let us not give anything away.',
  },
  {
    id: 'zidane',
    name: 'Zidane',
    difficulty: 'sharp',
    // Balanced but sharp: the default model with little noise.
    weights: DEFAULT_WEIGHTS,
    volatility: 2,
    taunt: 'Trust me.',
  },
  {
    id: 'eidol',
    name: 'Eidol',
    difficulty: 'sharp',
    // Precision fighter: takes only fights it expects to win.
    weights: weights({
      capture: 12,
      battle: 32,
      risk: 10,
      corner: 8,
      combo: 10,
      quarantine: 20,
      lowDefence: 14,
    }),
    volatility: 1.5,
    taunt: 'I have already decided how this ends.',
  },
  {
    id: 'kuja',
    name: 'Kuja',
    difficulty: 'sharp',
    // Relentless: squeezes every last capture, and corner-hugs to avoid retaliation.
    weights: weights({
      capture: 18,
      battle: 28,
      risk: 9,
      corner: 13,
      combo: 14,
      quarantine: 16,
      lowDefence: 10,
    }),
    volatility: 1.5,
    taunt: 'Nothing personal. Everything is at stake.',
  },
  {
    id: 'master',
    name: 'The Master',
    difficulty: 'sharp',
    // The ceiling: every term weighted, almost no noise. This is the deck to beat.
    weights: weights({
      capture: 14,
      battle: 30,
      risk: 11,
      corner: 9,
      combo: 14,
      quarantine: 24,
      lowDefence: 15,
    }),
    volatility: 0.6,
    taunt: 'You have been reading the rules. Good. I have read more.',
  },
];

export function personalityById(id: string): Personality {
  const found = PERSONALITIES.find((p) => p.id === id);
  if (!found) throw new RangeError(`unknown personality: ${id}`);
  return found;
}

export function personalitiesOfDifficulty(difficulty: Difficulty): Personality[] {
  return PERSONALITIES.filter((p) => p.difficulty === difficulty);
}
