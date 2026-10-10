/**
 * Constants from the rules (PLAN.md §1). Nothing in src/core may hardcode these values — every
 * rule number lives here so §1 has exactly one home in the source.
 */

/** The board is 4x4 — hence "tetra" (§1.1). */
export const GRID = 4;

/** Number of cells on the board. */
export const CELLS = GRID * GRID; // 16

/** Up to six cells are blocked at the start of a match (§1.1). */
export const MAX_BLOCKED = 6;

/** Each player commits five cards (§1.1). */
export const HAND_SIZE = 5;

/**
 * How many cards a deck must hold to be playable. Same number as a hand, but a distinct concept:
 * the hand is what you play from this match, the deck is what you bring to it. Lives here rather
 * than in the UI because the game layer has to validate it too.
 */
export const DECK_SIZE = 5;

/** Total cards in a match: ten, which is also the final score total. */
export const TOTAL_CARDS = HAND_SIZE * 2;

/** Eight arrow directions, so arrow masks are 8 bits (§1.2). */
export const ARROW_SLOTS = 8;

/** The all-directions arrow mask. Legal, and the strongest card for combos. */
export const ALL_ARROWS = 0xff;

/** Stat indices are a single hex digit (§1.2). */
export const STAT_MIN = 0;
export const STAT_MAX = 15;

/** A stat index stands for an interval this many values wide: index n is [16n, 16n+15] (§1.3). */
export const STAT_SPAN = 16;

/** The smallest concrete stat value any index can represent. */
export const STAT_VALUE_MIN = STAT_MIN * STAT_SPAN; // 0

/** The largest concrete stat value any index can represent. */
export const STAT_VALUE_MAX = STAT_MAX * STAT_SPAN + (STAT_SPAN - 1); // 255

/** Direction labels, indexed by Direction. Order is normative: N, NE, E, SE, S, SW, W, NW. */
export const DIRECTION_NAMES = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
