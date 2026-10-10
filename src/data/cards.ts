/**
 * The 100-figure card catalog (PLAN.md §6, Stage 2).
 *
 * NOTE ON NAMES: the *structure* here is faithful to the original — 100 designs, each with a fixed
 * arrow pattern and per-figure stat caps, and stats rolled per acquisition rather than looked up.
 * The 100 names are a themed set written for this project, not the canonical FF9 card list, which
 * has not been sourced from a reliable reference. Swapping in a sourced list is a data-only
 * change: `FIGURE_TABLE` is the single place names live.
 *
 * Row format: [name, family, tier, atkCap, pdefCap, mdefCap, baseType]
 *
 * `caps` are the maximum stat *indices* a figure may ever reach, not values (§1.2/§1.3).
 * `base` is derived from tier via BASE_SPAN so a card starts partway up its own range and has room
 * to grow through play — see PLAN.md §1.8.
 */

import { FIGURE_SIGNATURES, patternForFigure, toPattern } from './arrowSets';
import type { CardFigure, Family, StatCaps, Tier } from '../core/types';

type Row = readonly [string, Family, Tier, number, number, number, CardFigure['baseType']];

const FIGURE_TABLE: readonly Row[] = [
  // ── Tier 1: the opening pool. Low caps, few arrows. ───────────────────────────────
  ['Goblin', 'beast', 1, 7, 9, 4, 'P'],
  ['Sahagin', 'beast', 1, 7, 8, 4, 'P'],
  ['Dodo', 'beast', 1, 5, 4, 8, 'M'],
  ['Vark', 'beast', 1, 6, 5, 5, 'P'],
  ['Bomb', 'machine', 1, 8, 3, 3, 'M'],
  ['Rabbit', 'beast', 1, 4, 5, 6, 'M'],
  ['Bat', 'beast', 1, 5, 4, 5, 'P'],
  ['Slime', 'elemental', 1, 6, 7, 4, 'P'],
  ['Scarab', 'construct', 1, 6, 8, 2, 'P'],
  ['Sprite', 'spirit', 1, 5, 4, 7, 'M'],
  ['Chocobo', 'beast', 1, 6, 6, 8, 'M'],
  ['Moogle', 'spirit', 1, 7, 5, 9, 'M'],
  ['Tonberry', 'beast', 1, 5, 9, 6, 'P'],
  ['Flamelet', 'elemental', 1, 8, 3, 7, 'M'],
  ['Frost', 'elemental', 1, 7, 4, 8, 'M'],
  ['Whirlwind', 'elemental', 1, 6, 4, 6, 'P'],
  ['Sand Devil', 'construct', 1, 8, 6, 3, 'P'],
  ['Chick', 'beast', 1, 4, 4, 6, 'M'],
  ['Gargoyle', 'construct', 1, 9, 8, 3, 'P'],
  ['Weevil', 'construct', 1, 7, 7, 2, 'P'],

  // ── Tier 2: the working deck. ──────────────────────────────────────────────────────
  ['Ochu', 'beast', 2, 10, 9, 5, 'P'],
  ['Grendel', 'beast', 2, 11, 10, 4, 'P'],
  ['Malboro', 'elemental', 2, 12, 8, 6, 'P'],
  ['Golem', 'construct', 2, 11, 13, 3, 'P'],
  ['Wyvern', 'beast', 2, 12, 9, 7, 'M'],
  ['Mimic', 'construct', 2, 13, 11, 2, 'P'],
  ['Lamia', 'spirit', 2, 10, 7, 11, 'M'],
  ['Harpy', 'beast', 2, 11, 7, 7, 'P'],
  ['Cerberus', 'beast', 2, 12, 9, 4, 'P'],
  ['Wraith', 'spirit', 2, 10, 5, 11, 'M'],
  ['Sandman', 'spirit', 2, 10, 6, 10, 'M'],
  ['Airship', 'machine', 2, 12, 11, 6, 'P'],
  ['Toad', 'beast', 2, 9, 8, 6, 'P'],
  ['Kobold', 'beast', 2, 9, 7, 6, 'P'],
  ['Mantis', 'beast', 2, 11, 8, 5, 'P'],
  ['Wisp', 'spirit', 2, 9, 5, 10, 'M'],
  ['Djinn', 'elemental', 2, 12, 5, 9, 'M'],
  ['Zombie', 'spirit', 2, 10, 11, 3, 'P'],
  ['Cockatrice', 'beast', 2, 11, 8, 6, 'P'],
  ['Imp', 'spirit', 2, 12, 6, 8, 'M'],

  // ── Tier 3: real threats. ──────────────────────────────────────────────────────────
  ['Ahriman', 'spirit', 3, 13, 10, 12, 'M'],
  ['Behemoth', 'beast', 3, 15, 12, 4, 'P'],
  ['Hydra', 'beast', 3, 14, 11, 5, 'P'],
  ['Medusa', 'spirit', 3, 12, 10, 13, 'M'],
  ['Minotaur', 'beast', 3, 14, 13, 4, 'P'],
  ['Mummy', 'spirit', 3, 12, 13, 9, 'P'],
  ['Nidhogg', 'beast', 3, 14, 11, 11, 'P'],
  ['Phoenix', 'spirit', 3, 13, 10, 14, 'M'],
  ['Chimera', 'beast', 3, 14, 12, 10, 'P'],
  ['Kraken', 'elemental', 3, 13, 10, 13, 'M'],
  ['Lich', 'spirit', 3, 13, 12, 12, 'M'],
  ['Vampire', 'spirit', 3, 14, 11, 12, 'M'],
  ['Werewolf', 'beast', 3, 15, 12, 6, 'P'],
  ['Gorgon', 'spirit', 3, 13, 11, 12, 'M'],
  ['Basilisk', 'beast', 3, 14, 12, 10, 'P'],
  ['Troll', 'beast', 3, 15, 13, 3, 'P'],
  ['Ogre', 'beast', 3, 14, 13, 5, 'P'],
  ['Spectre', 'spirit', 3, 12, 9, 13, 'M'],
  ['Revenant', 'spirit', 3, 13, 11, 12, 'M'],
  ['Gigas', 'beast', 3, 14, 13, 6, 'P'],

  // ── Tier 4: late-game. Caps reach F. ──────────────────────────────────────────────
  ['Alexander', 'machine', 4, 15, 14, 15, 'P'],
  ['Bahamut', 'dragon', 4, 15, 13, 15, 'M'],
  ['Draco', 'dragon', 4, 15, 13, 14, 'M'],
  ['Titan', 'construct', 4, 15, 15, 8, 'P'],
  ['Arc', 'spirit', 4, 14, 13, 15, 'M'],
  ['Carbuncle', 'spirit', 4, 12, 12, 15, 'M'],
  ['Fenris', 'beast', 4, 15, 14, 9, 'P'],
  ['Salamander', 'elemental', 4, 15, 9, 14, 'M'],
  ['Yeti', 'beast', 4, 14, 15, 7, 'P'],
  ['Griffin', 'beast', 4, 14, 13, 12, 'P'],
  ['Manticore', 'beast', 4, 15, 13, 11, 'P'],
  ['Sphinx', 'construct', 4, 14, 13, 13, 'M'],
  ['Berserker', 'humanoid', 4, 15, 13, 5, 'P'],
  ['Warlock', 'humanoid', 4, 14, 10, 15, 'M'],
  ['Necromancer', 'humanoid', 4, 14, 11, 15, 'M'],
  ['Archmage', 'humanoid', 4, 14, 10, 15, 'M'],
  ['Paladin', 'humanoid', 4, 13, 15, 13, 'P'],
  ['Knight', 'humanoid', 4, 14, 15, 9, 'P'],
  ['Assassin', 'humanoid', 4, 15, 11, 10, 'P'],
  ['Magitek', 'machine', 4, 14, 12, 14, 'M'],

  // ── Tier 5: the chase. Every stat can reach F. ────────────────────────────────────
  ['Zeromus', 'spirit', 5, 15, 14, 15, 'M'],
  ['Chaos', 'elemental', 5, 15, 15, 14, 'P'],
  ['Ark', 'machine', 5, 15, 15, 13, 'P'],
  ['Nemesis', 'spirit', 5, 14, 14, 15, 'M'],
  ['Leviathan', 'elemental', 5, 15, 13, 15, 'M'],
  ['Juggernaut', 'machine', 5, 15, 15, 11, 'P'],
  ['Colossus', 'construct', 5, 15, 15, 12, 'P'],
  ['Voidwalker', 'spirit', 5, 14, 13, 15, 'M'],
  ['Astral', 'spirit', 5, 13, 14, 15, 'M'],
  ['Eternal', 'construct', 5, 14, 15, 13, 'P'],
  ['Infinity', 'elemental', 5, 14, 13, 15, 'M'],
  ['Omega', 'construct', 5, 15, 14, 14, 'P'],
  ['Sigma', 'machine', 5, 14, 14, 14, 'M'],
  ['Primal', 'beast', 5, 15, 14, 12, 'P'],
  ['Avatar', 'spirit', 5, 14, 13, 15, 'M'],
  ['Devourer', 'beast', 5, 15, 13, 13, 'P'],
  ['Sovereign', 'humanoid', 5, 14, 15, 14, 'P'],
  ['Overlord', 'humanoid', 5, 15, 14, 14, 'M'],
  ['Eclipse', 'elemental', 5, 13, 13, 15, 'M'],
  ['Terminus', 'construct', 5, 15, 15, 15, 'P'],
];

/**
 * How far below its cap a freshly rolled card starts, by tier. Larger tiers have less headroom,
 * so a strong card is already close to its ceiling while a weak one has room to grow.
 */
const BASE_SPAN: Record<Tier, number> = { 1: 4, 2: 5, 3: 6, 4: 7, 5: 7 };

function baseFrom(tier: Tier, cap: number): number {
  return Math.max(0, cap - BASE_SPAN[tier]);
}

function expand(row: Row, id: number): CardFigure {
  const [name, family, tier, atkCap, pdefCap, mdefCap, baseType] = row;
  const caps: StatCaps = { atk: atkCap, pdef: pdefCap, mdef: mdefCap };
  const signatureMask = FIGURE_SIGNATURES[name];
  return {
    id,
    name,
    family,
    tier,
    base: {
      atk: baseFrom(tier, atkCap),
      pdef: baseFrom(tier, pdefCap),
      mdef: baseFrom(tier, mdefCap),
    },
    caps,
    baseType,
    arrows: signatureMask ?? patternForFigure(tier, id),
    signature: signatureMask !== undefined,
  };
}

/** All 100 figures, indexed by position. */
export const FIGURES: readonly CardFigure[] = FIGURE_TABLE.map(expand);

/** Figures keyed by id, for O(1) lookup by a rolled card's `figureId`. */
export const FIGURES_BY_ID: ReadonlyMap<number, CardFigure> = new Map(
  FIGURES.map((figure) => [figure.id, figure]),
);

/** Looks up a figure by id. Throws rather than returning undefined, since ids come from cards. */
export function figureById(id: number): CardFigure {
  const figure = FIGURES_BY_ID.get(id);
  if (!figure) throw new RangeError(`unknown figureId: ${id}`);
  return figure;
}

/** Every figure of a given tier. */
export function figuresOfTier(tier: Tier): CardFigure[] {
  return FIGURES.filter((figure) => figure.tier === tier);
}

/** Every figure in a family — drives the procedural palette in Stage 6 (§7.5). */
export function figuresOfFamily(family: Family): CardFigure[] {
  return FIGURES.filter((figure) => figure.family === family);
}

/** A human-readable line per figure, for the debug screen and the collection view. */
export function describeFigure(figure: CardFigure): string {
  const arrows = toPattern(figure.arrows);
  return (
    `${figure.id.toString().padStart(3)} ${figure.name.padEnd(12)} ` +
    `t${figure.tier} ${figure.family.padEnd(10)} ` +
    `base ${figure.base.atk}/${figure.base.pdef}/${figure.base.mdef} ` +
    `caps ${figure.caps.atk}/${figure.caps.pdef}/${figure.caps.mdef} ` +
    `${figure.baseType} ${arrows}`
  );
}

/** Every distinct arrow mask in the catalog, ascending. */
export function distinctArrowMasks(): number[] {
  return [...new Set(FIGURES.map((figure) => figure.arrows))].sort((a, b) => a - b);
}
