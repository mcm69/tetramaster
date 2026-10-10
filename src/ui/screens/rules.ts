/**
 * The rules screen (PLAN.md §6, Stage 10).
 *
 * The original never explained itself, which is the single most-cited flaw of Tetra Master and the
 * reason a rule this deep is hard to learn from playing alone. This screen is the answer — and it is
 * generated from `RULES`, one entry per §1 paragraph, rather than written as prose.
 *
 * The important property is the one that is easy to miss: `tests/ui/rules.test.ts` asserts that the
 * ids here are exactly the §1 headings parsed out of `PLAN.md`. So if a rule is added to the spec
 * and not to this screen, a test fails. **A documentation screen that can fall behind the
 * implementation is worse than none**, because it is confidently wrong. Deriving both from one list
 * is the only way to keep that honest, and §1's own audit already exists to enforce the same thing
 * for the tests.
 */

export interface RuleBullet {
  readonly text: string;
  /** Set when the original does something surprising here, and the reader deserves warning. */
  readonly caveat?: string;
}

export interface RuleSection {
  /** Matches the `### 1.x` heading in `PLAN.md` §1. Kept as a string, checked by a test. */
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly bullets: readonly RuleBullet[];
}

export const RULES: readonly RuleSection[] = [
  {
    id: '1.1',
    title: 'Setting up',
    summary: 'Two hands of five, one shared 4×4 board, and a coin flip.',
    bullets: [
      {
        text: 'Each player brings five cards. Ten cards are played in total, five each, then the board is scored.',
      },
      {
        text: 'Before the first card, up to six cells are blocked. They can never hold a card and they break adjacency.',
      },
      {
        text: 'A coin flip decides who opens. It is shown before the match starts, not after the first move.',
      },
      {
        text: 'Winning means holding more cards when the board fills. A draw is possible and is scored as one.',
      },
      {
        text: 'A perfect game — taking all five enemy cards — is a distinct win with a distinct reward.',
        caveat:
          'A perfect game only counts if you won. Losing with four cards is not a perfect game.',
      },
    ],
  },
  {
    id: '1.2',
    title: 'What a card is',
    summary: 'A design, an arrow pattern, and three stats rolled once when you get it.',
    bullets: [
      {
        text: 'Each card has a figure. The figure fixes its arrows exactly, so two copies always point the same way.',
      },
      {
        text: "The three stats are rolled within the figure's range when the card is acquired, so copies of one figure can differ.",
      },
      {
        text: 'Every card also carries a type — P, M, X or A — which decides how it fights. See "How battles work".',
      },
    ],
  },
  {
    id: '1.3',
    title: 'Stats are bands, not numbers',
    summary: 'Each stat is a single hex digit, and each digit stands for a band of sixteen values.',
    bullets: [
      {
        text: "A stat of 4 does not mean 4. It means the card's attack is somewhere in 64–79, rolled at the moment of the battle.",
      },
      { text: "So a card's strength is decided when the fight happens, not when you acquire it." },
      {
        text: 'This is the whole reason a strong card still loses: it is a favourite, not a certainty.',
      },
    ],
  },
  {
    id: '1.4',
    title: 'Only the card you just placed attacks',
    summary: 'Everything already on the board is holding its arrows up as a defence.',
    bullets: [
      { text: 'When you play a card, its arrows fire at the neighbours they point to.' },
      {
        text: 'Cards already on the board do not attack. Their arrows matter only when they were placed.',
      },
      {
        text: 'So a card already pointing at you is not a threat — you cannot be hit by something you did not just play.',
        caveat:
          'This catches almost everyone out. Exposure comes from empty squares beside your card, not from arrows aimed at it.',
      },
    ],
  },
  {
    id: '1.5',
    title: 'Taking a card',
    summary: 'An arrow into a card that does not point back takes it for free.',
    bullets: [
      {
        text: 'If the target has no arrow pointing back at you, you take it. No roll, no defence, no chance.',
      },
      { text: 'If it does point back, a battle happens instead.' },
      { text: "Blocked cells cannot be attacked through, so blocking cuts an arrow's reach." },
    ],
  },
  {
    id: '1.6',
    title: 'How battles work',
    summary: "The attacker's type alone picks both stats. The defender's type is never consulted.",
    bullets: [
      {
        text: "P attacks the defender's P-defence and defends with its own. M does the same with M-defence.",
      },
      {
        text: 'X attacks whichever of the two defences is weaker, and defends with the weaker of its own.',
      },
      {
        text: "A attacks with its highest stat against the opponent's lowest stat — attack included.",
      },
      { text: 'Both sides then roll a uniform value inside their band and the higher total wins.' },
      {
        text: 'A tie goes to the defender.',
        caveat:
          'That is why two identical cards do not fight to an even chance — the attacker loses ties, so it wins slightly under half.',
      },
    ],
  },
  {
    id: '1.7',
    title: 'Combos and choosing your order',
    summary: "The loser's arrows still fire, and when several cards fight you choose the order.",
    bullets: [
      {
        text: 'When a card loses, its arrows flip with it — so a loser can still take its own neighbours on the way down.',
      },
      { text: 'Your own cards are skipped, silently. Combos never cost you a card.' },
      {
        text: 'If more than one card points at you, you pick which to fight first. The order changes the result, because each loss can cascade.',
      },
    ],
  },
  {
    id: '1.8',
    title: 'Cards grow between matches',
    summary: 'Win, and each card you used gains a point — at random, and sometimes not.',
    bullets: [
      {
        text: 'After a match you won, every card you played gets +1 to one of its three stats, chosen at random.',
      },
      {
        text: 'The choice ignores the caps. Roll a stat that is already maxed and the point is lost — there is no reroll.',
        caveat:
          'This is faithful to the original, and it is deliberately frustrating. Losing a point to a maxed stat is the most common thing you will see after a good match.',
      },
      {
        text: 'Separately, winning any single battle rolls for a type change: P or M becomes X at 1 in 32, and X becomes A at 1 in 256.',
      },
      {
        text: 'The two are independent. A card can change type long before its stats are maxed, and it takes two separate wins to reach A.',
      },
    ],
  },
  {
    id: '1.9',
    title: 'Collector level',
    summary: 'You level up by completing the catalogue, not by winning matches.',
    bullets: [
      {
        text: 'Each card is worth 10 points if its figure appears exactly once in your collection, and 5 if its arrow pattern does.',
      },
      {
        text: 'Those are two separate passes over the whole collection. Duplicates are worth nothing at all.',
      },
      { text: 'X adds 1 point and A adds 2, on top.' },
      { text: 'A card can therefore be worth 17 points, and a complete set of 100 is 1700.' },
      {
        text: 'The top title, Master, is 1698. At 1700 the original superimposes "Would you like to discard?" over the level display.',
        caveat:
          'That is the famous discard bug in the original, reproduced here on purpose rather than quietly fixed.',
      },
    ],
  },
];

/** Every rule id, for the test that ties this screen to `PLAN.md` §1. */
export function ruleIds(): string[] {
  return RULES.map((section) => section.id);
}

/** The rules as flat text, for a copy-to-clipboard or a quick-reference print. */
export function ruleText(): string {
  return RULES.map((section) => {
    const lines = section.bullets.map((bullet) => `  - ${bullet.text}`);
    return [`${section.id} ${section.title} — ${section.summary}`, ...lines].join('\n');
  }).join('\n\n');
}
