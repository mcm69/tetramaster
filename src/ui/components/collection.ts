/**
 * The collection screen (PLAN.md §7.4, Stage 9).
 *
 * Browsing what you own is half of Tetra Master — the game is as much about the catalogue as about
 * the match — and it is where §1.9 becomes visible. So the screen leads with the collector level and
 * the gap between what the collection is worth and what it could be worth, because that gap *is* the
 * progression: duplicates are worth nothing, and seeing `points` climb far slower than `reachable`
 * teaches that faster than any amount of text.
 *
 * `buildRows` is pure and holds all the filtering and sorting, so the interesting behaviour is
 * testable without a DOM. `renderCollection` only paints what it is handed.
 */

import { cardArrowCount, cardArrows, statCode } from '../../core/card.ts';
import { figureById } from '../../data/cards.ts';
import { MAX_PER_CARD, scoreCollection } from '../../game/collector.ts';
import { DECK_SIZE } from '../../core/constants.ts';
import { capsFor, isFullyGrown } from '../../game/progression.ts';
import type { OwnedCard, Family, Tier } from '../../core/types.ts';
import type { SaveData } from '../../game/save.ts';

export type SortKey = 'points' | 'name' | 'power' | 'tier';

export interface CollectionFilter {
  readonly search: string;
  readonly tier: Tier | 'all';
  readonly family: Family | 'all';
  readonly sort: SortKey;
  /** Hide cards that score nothing, i.e. those whose figure and pattern are both duplicated. */
  readonly scoringOnly: boolean;
}

export const DEFAULT_FILTER: CollectionFilter = {
  search: '',
  tier: 'all',
  family: 'all',
  sort: 'points',
  scoringOnly: false,
};

export interface CollectionRow {
  readonly card: OwnedCard;
  readonly name: string;
  readonly family: Family;
  readonly tier: Tier;
  readonly code: string;
  readonly arrows: readonly number[];
  readonly points: number;
  readonly figureUnique: boolean;
  readonly patternUnique: boolean;
  readonly fullyGrown: boolean;
}

/**
 * Builds the rows to display, in the requested order.
 *
 * Sorted descending by points by default, so the cards still worth chasing — the unique ones — sit
 * at the top and the duplicates that score nothing sink to the bottom where they belong.
 */
export function buildRows(
  save: SaveData,
  filter: CollectionFilter = DEFAULT_FILTER,
): CollectionRow[] {
  const scores = new Map(scoreCollection(save.collection).cards.map((s) => [s.uid, s]));
  const search = filter.search.trim().toLowerCase();

  const rows: CollectionRow[] = save.collection.flatMap((card) => {
    const figure = figureById(card.figureId);
    const score = scores.get(card.uid);
    if (score === undefined) return [];
    if (filter.tier !== 'all' && figure.tier !== filter.tier) return [];
    if (filter.family !== 'all' && figure.family !== filter.family) return [];
    if (search !== '' && !figure.name.toLowerCase().includes(search)) return [];
    if (filter.scoringOnly && score.points === 0) return [];
    return [
      {
        card,
        name: figure.name,
        family: figure.family,
        tier: figure.tier,
        code: statCode(card),
        arrows: cardArrows(card),
        points: score.points,
        figureUnique: score.figureUnique,
        patternUnique: score.patternUnique,
        fullyGrown: isFullyGrown(card),
      },
    ];
  });

  const byPoints = (a: CollectionRow, b: CollectionRow): number =>
    b.points - a.points || a.name.localeCompare(b.name);
  const byName = (a: CollectionRow, b: CollectionRow): number => a.name.localeCompare(b.name);
  const byPower = (a: CollectionRow, b: CollectionRow): number =>
    totalPower(b.card) - totalPower(a.card) || a.name.localeCompare(b.name);
  const byTier = (a: CollectionRow, b: CollectionRow): number => a.tier - b.tier || byPoints(a, b);

  const comparators: Record<SortKey, (a: CollectionRow, b: CollectionRow) => number> = {
    points: byPoints,
    name: byName,
    power: byPower,
    tier: byTier,
  };
  return rows.sort(comparators[filter.sort]);
}

/** Sum of a card's three stats — a rough strength figure, used only for sorting. */
export function totalPower(card: OwnedCard): number {
  return card.atk + card.pdef + card.mdef;
}

/** What the deck editor needs to know about a save's deck (PLAN.md §7.4). */
export interface DeckStatus {
  readonly size: number;
  readonly required: number;
  readonly valid: boolean;
  readonly missing: number;
  readonly cards: readonly OwnedCard[];
  /** uids in the deck that are not in the collection, e.g. after a bad load. */
  readonly dangling: readonly number[];
}

export function deckStatus(save: SaveData): DeckStatus {
  const byUid = new Map(save.collection.map((card) => [card.uid, card]));
  const cards = save.deck.flatMap((uid) => {
    const card = byUid.get(uid);
    return card === undefined ? [] : [card];
  });
  const dangling = save.deck.filter((uid) => !byUid.has(uid));
  return {
    size: cards.length,
    required: DECK_SIZE,
    valid: cards.length === DECK_SIZE && dangling.length === 0,
    missing: Math.max(0, DECK_SIZE - cards.length),
    cards,
    dangling,
  };
}

/** Adds or removes a uid from the deck, keeping the order stable and never exceeding DECK_SIZE. */
export function toggleDeck(deck: readonly number[], uid: number): number[] {
  if (deck.includes(uid)) return deck.filter((entry) => entry !== uid);
  if (deck.length >= DECK_SIZE) return [...deck];
  return [...deck, uid];
}

/** Renders the collector level line, including the §1.9 glitch. */
export function renderCollectorHeader(container: HTMLElement, save: SaveData): void {
  container.textContent = '';
  const score = scoreCollection(save.collection);

  const level = document.createElement('p');
  level.className = 'collector-level';
  if (score.glitch) level.classList.add('is-glitch');
  level.textContent = score.display;
  container.append(level);

  const points = document.createElement('p');
  points.className = 'collector-points';
  points.textContent = `${score.points} points · ${save.collection.length} cards`;
  container.append(points);

  const progress = document.createElement('p');
  progress.className = 'collector-progress';
  if (score.nextAt === null) {
    progress.textContent = `Top title reached — ${MAX_PER_CARD * 100} is the maximum.`;
  } else {
    const gap = score.nextAt - score.points;
    progress.textContent =
      gap <= 0
        ? `Next: ${score.nextTitle}`
        : `${gap} to ${score.nextTitle ?? 'the next title'} · up to ${score.reachable} with what you hold`;
  }
  container.append(progress);
}

export interface CollectionCallbacks {
  readonly onFilter: (filter: CollectionFilter) => void;
  readonly onToggleDeck: (uid: number) => void;
}

/** Paints the collection browser. */
export function renderCollection(
  container: HTMLElement,
  rows: readonly CollectionRow[],
  filter: CollectionFilter,
  deck: readonly number[],
  /** Whether the save holds anything at all, so an empty filter result reads correctly. */
  hasCards: boolean,
  callbacks: CollectionCallbacks,
): void {
  container.textContent = '';

  const controls = document.createElement('div');
  controls.className = 'collection-controls';

  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'collection-search';
  search.placeholder = 'Search cards';
  search.value = filter.search;
  search.setAttribute('aria-label', 'Search cards by name');
  search.addEventListener('input', () => {
    callbacks.onFilter({ ...filter, search: search.value });
  });
  controls.append(search);

  const select = (
    label: string,
    options: [string, string][],
    current: string,
    next: string,
  ): void => {
    const node = document.createElement('label');
    node.className = 'collection-filter';
    node.textContent = label;
    const picker = document.createElement('select');
    for (const [value, text] of options) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = text;
      if (value === current) option.selected = true;
      picker.append(option);
    }
    picker.addEventListener('change', () => {
      callbacks.onFilter({ ...filter, [next]: picker.value });
    });
    node.append(picker);
    controls.append(node);
  };

  select(
    'Tier',
    [
      ['all', 'All'],
      ...([1, 2, 3, 4, 5] as Tier[]).map(
        (tier) => [String(tier), String(tier)] as [string, string],
      ),
    ],
    String(filter.tier),
    'tier',
  );
  select(
    'Family',
    [
      ['all', 'All'],
      ...(
        ['beast', 'construct', 'elemental', 'spirit', 'machine', 'dragon', 'humanoid'] as Family[]
      ).map((family) => [family, family] as [string, string]),
    ],
    filter.family,
    'family',
  );
  select(
    'Sort',
    [
      ['points', 'Collector points'],
      ['name', 'Name'],
      ['power', 'Power'],
      ['tier', 'Tier'],
    ],
    filter.sort,
    'sort',
  );

  const scoring = document.createElement('label');
  scoring.className = 'collection-filter collection-filter-check';
  const check = document.createElement('input');
  check.type = 'checkbox';
  check.checked = filter.scoringOnly;
  check.addEventListener('change', () => {
    callbacks.onFilter({ ...filter, scoringOnly: check.checked });
  });
  scoring.append(check, document.createTextNode(' Only cards that score'));
  controls.append(scoring);

  container.append(controls);

  if (rows.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'collection-empty';
    empty.textContent = hasCards
      ? 'Nothing matches that filter.'
      : 'No cards yet. Win a match — a perfect game claims the whole enemy hand.';
    container.append(empty);
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'collection-grid';
  for (const row of rows) {
    grid.append(collectionCard(row, deck.includes(row.card.uid), callbacks.onToggleDeck));
  }
  container.append(grid);
}

function collectionCard(
  row: CollectionRow,
  inDeck: boolean,
  onToggle: (uid: number) => void,
): HTMLElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'collection-card';
  if (inDeck) button.classList.add('is-decked');
  button.dataset['uid'] = String(row.card.uid);
  button.setAttribute('aria-pressed', String(inDeck));

  const badges: string[] = [];
  if (row.figureUnique) badges.push('unique card');
  if (row.patternUnique) badges.push('unique arrows');
  if (row.fullyGrown) badges.push('fully grown');
  button.setAttribute(
    'aria-label',
    `${row.name}, ${row.code}, ${row.arrows.length} arrows, tier ${row.tier}, ${row.points} collector points${badges.length > 0 ? `, ${badges.join(', ')}` : ''}.`,
  );

  const name = document.createElement('span');
  name.className = 'collection-name';
  name.textContent = row.name;

  const code = document.createElement('span');
  code.className = 'collection-code';
  code.textContent = `${row.code} · ${row.arrows.length} arrows · tier ${row.tier}`;

  const meta = document.createElement('span');
  meta.className = 'collection-meta';
  meta.textContent = badges.join(' · ') || `no collector points (duplicated)`;

  const points = document.createElement('span');
  points.className = `collection-points-badge${row.points === 0 ? ' is-zero' : ''}`;
  points.textContent = `+${row.points}`;

  button.append(name, code, meta, points);
  button.addEventListener('click', () => {
    onToggle(row.card.uid);
  });
  return button;
}

/** Caps read-out for the card detail line. */
export function growthLine(card: OwnedCard): string {
  const caps = capsFor(card);
  return `ATK ${card.atk}/${caps.atk}  PD ${card.pdef}/${caps.pdef}  MD ${card.mdef}/${caps.mdef}  ${cardArrowCount(card)} arrows`;
}
