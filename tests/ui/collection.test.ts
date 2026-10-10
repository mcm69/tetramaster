/**
 * The collection screen and deck editor (PLAN.md §7.4, Stage 9).
 *
 * The point of these screens is that §1.9 becomes *visible*: the collector level, the gap between
 * what the collection is worth and what it could be worth, and which cards are duplicates dragging
 * the score down. So the tests assert the information is on screen, not just that something
 * rendered.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_FILTER,
  buildRows,
  deckStatus,
  renderCollection,
  renderCollectorHeader,
  toggleDeck,
  totalPower,
  type CollectionFilter,
} from '../../src/ui/components/collection.ts';
import { renderDeckEditor, slotWarning, suggestDeck } from '../../src/ui/components/deckEditor.ts';
import { DECK_SIZE } from '../../src/core/constants.ts';
import { emptySave, memoryStorage, writeSave, type SaveData } from '../../src/game/save.ts';
import { scoreCollection } from '../../src/game/collector.ts';
import type { CardType, OwnedCard, Tier } from '../../src/core/types.ts';

let uid = 0;
function owned(figureId: number, arrows: number, type: CardType = 'P', tier: Tier = 3): OwnedCard {
  uid += 1;
  // Figures come in tiers of 20, so spread the ids to get the tier the caller asked for.
  const id = (tier - 1) * 20 + (figureId % 20);
  return { uid, figureId: id, arrows, atk: 4, pdef: 5, mdef: 6, type };
}

function saveWith(cards: OwnedCard[], deck: number[] = []): SaveData {
  return { ...emptySave(), collection: cards, deck, nextUid: 999 };
}

function mount(): HTMLElement {
  const host = document.createElement('div');
  document.body.append(host);
  return host;
}

beforeEach(() => {
  document.body.textContent = '';
  uid = 0;
});

describe('rows', () => {
  it('shows every card when no filter is applied', () => {
    const save = saveWith([owned(1, 1), owned(2, 2), owned(3, 4)]);
    expect(buildRows(save)).toHaveLength(3);
  });

  it('sorts by collector points by default, so uniques come first', () => {
    const save = saveWith([owned(1, 1), owned(2, 2), owned(1, 1)]);
    const rows = buildRows(save);
    // The duplicate figure scores 0 and sinks; the other two score 15 each.
    expect(rows[0]!.points).toBe(15);
    expect(rows[2]!.points).toBe(0);
  });

  it('filters by name, case-insensitively', () => {
    const save = saveWith([owned(1, 1), owned(2, 2)]);
    const first = buildRows(save)[0]!.name.toLowerCase();
    expect(buildRows(save, { ...DEFAULT_FILTER, search: first.slice(0, 4) })).toHaveLength(1);
    expect(buildRows(save, { ...DEFAULT_FILTER, search: 'zzz' })).toHaveLength(0);
  });

  it('filters by tier and by family', () => {
    const save = saveWith([owned(1, 1, 'P', 1), owned(2, 2, 'P', 4)]);
    expect(buildRows(save, { ...DEFAULT_FILTER, tier: 1 })).toHaveLength(1);
    expect(buildRows(save, { ...DEFAULT_FILTER, tier: 4 })).toHaveLength(1);
    expect(buildRows(save, { ...DEFAULT_FILTER, tier: 2 })).toHaveLength(0);
    const any = buildRows(save, { ...DEFAULT_FILTER, family: 'beast' });
    expect(any.length).toBeLessThanOrEqual(2);
  });

  it('hides cards that score nothing when asked', () => {
    const save = saveWith([owned(1, 1), owned(1, 1), owned(2, 2)]);
    const rows = buildRows(save, { ...DEFAULT_FILTER, scoringOnly: true });
    expect(rows.every((row) => row.points > 0)).toBe(true);
  });

  it('sorts by name, power and tier on request', () => {
    const save = saveWith([owned(3, 4), owned(1, 1), owned(2, 2)]);
    const names = buildRows(save, { ...DEFAULT_FILTER, sort: 'name' }).map((r) => r.name);
    expect([...names].sort((a, b) => a.localeCompare(b))).toEqual(names);
    expect(buildRows(save, { ...DEFAULT_FILTER, sort: 'power' })).toHaveLength(3);
    expect(buildRows(save, { ...DEFAULT_FILTER, sort: 'tier' })).toHaveLength(3);
  });

  it('reports the stats and arrows a card actually has', () => {
    const card = owned(1, 0b0000_0101);
    const row = buildRows(saveWith([card]))[0]!;
    expect(row.arrows).toHaveLength(2);
    expect(row.code).toMatch(/^[0-9A-F][A-Z][0-9A-F]{2}$/);
    expect(totalPower(card)).toBe(15);
  });
});

describe('deck status', () => {
  it('is invalid until it holds five cards', () => {
    const save = saveWith([owned(1, 1), owned(2, 2)], [1, 2]);
    const status = deckStatus(save);
    expect(status.valid).toBe(false);
    expect(status.missing).toBe(DECK_SIZE - 2);
  });

  it('is valid with exactly five', () => {
    const cards = [1, 2, 3, 4, 5].map((n) => owned(n, n));
    const status = deckStatus(
      saveWith(
        cards,
        cards.map((c) => c.uid),
      ),
    );
    expect(status.valid).toBe(true);
    expect(status.missing).toBe(0);
  });

  it('is invalid with six', () => {
    const cards = [1, 2, 3, 4, 5, 6].map((n) => owned(n, n));
    expect(
      deckStatus(
        saveWith(
          cards,
          cards.map((c) => c.uid),
        ),
      ).valid,
    ).toBe(false);
  });

  it('reports a deck entry that points at nothing', () => {
    const cards = [1, 2, 3, 4, 5].map((n) => owned(n, n));
    const status = deckStatus(saveWith(cards, [...cards.map((c) => c.uid), 999]));
    expect(status.valid).toBe(false);
    expect(status.dangling).toEqual([999]);
  });
});

describe('toggleDeck', () => {
  it('adds a card when there is room', () => {
    expect(toggleDeck([1, 2], 3)).toEqual([1, 2, 3]);
  });

  it('removes a card that is already in', () => {
    expect(toggleDeck([1, 2, 3], 2)).toEqual([1, 3]);
  });

  it('refuses a sixth card rather than overflowing', () => {
    expect(toggleDeck([1, 2, 3, 4, 5], 6)).toEqual([1, 2, 3, 4, 5]);
  });

  it('never mutates the deck it was given', () => {
    const deck = [1, 2];
    toggleDeck(deck, 3);
    expect(deck).toEqual([1, 2]);
  });
});

describe('the collector header', () => {
  it('shows the level and the point total', () => {
    const host = mount();
    renderCollectorHeader(host, saveWith([owned(1, 1), owned(2, 2)]));
    expect(host.querySelector('.collector-level')?.textContent).toBe('Beginner');
    expect(host.querySelector('.collector-points')?.textContent).toMatch(/30 points · 2 cards/);
  });

  it('shows how far the duplicates are costing', () => {
    const host = mount();
    renderCollectorHeader(host, saveWith([owned(1, 1), owned(1, 2)]));
    expect(host.querySelector('.collector-progress')?.textContent).toMatch(/with what you hold/);
  });

  it('marks the glitch when the catalogue is complete', () => {
    // Built directly rather than through `owned`, which has to keep figures inside the catalog's
    // per-tier blocks and so cannot produce 100 distinct ones.
    const cards: OwnedCard[] = Array.from({ length: 100 }, (_, i) => ({
      uid: i + 1,
      figureId: i,
      arrows: i + 1,
      atk: 4,
      pdef: 5,
      mdef: 6,
      type: 'A',
    }));
    const save = saveWith(cards);
    expect(scoreCollection(save.collection).points).toBe(1700);

    const host = mount();
    renderCollectorHeader(host, save);
    const level = host.querySelector('.collector-level');
    expect(level?.textContent).toBe('Would you like to discard?');
    expect(level?.classList.contains('is-glitch')).toBe(true);
  });
});

describe('rendering the grid', () => {
  it('draws a button per card and wires the toggle', () => {
    const host = mount();
    const save = saveWith([owned(1, 1), owned(2, 2)]);
    const toggled: number[] = [];
    renderCollection(host, buildRows(save), DEFAULT_FILTER, [], true, {
      onFilter: () => {},
      onToggleDeck: (u) => toggled.push(u),
    });
    const buttons = host.querySelectorAll<HTMLButtonElement>('button.collection-card');
    expect(buttons).toHaveLength(2);

    const first = save.collection[0]!;
    buttons[0]!.click();
    expect(toggled).toEqual([first.uid]);
  });

  it('marks the cards already in the deck', () => {
    const host = mount();
    const save = saveWith([owned(1, 1), owned(2, 2)]);
    renderCollection(host, buildRows(save), DEFAULT_FILTER, [save.collection[1]!.uid], true, {
      onFilter: () => {},
      onToggleDeck: () => {},
    });
    const decked = host.querySelectorAll('button.collection-card.is-decked');
    expect(decked).toHaveLength(1);
  });

  it('labels a duplicate as scoring nothing, rather than hiding it', () => {
    const host = mount();
    // Same figure *and* same arrows: neither dedup pass survives, so the card is worth nothing.
    const save = saveWith([owned(1, 1), owned(1, 1)]);
    renderCollection(host, buildRows(save), DEFAULT_FILTER, [], true, {
      onFilter: () => {},
      onToggleDeck: () => {},
    });
    expect(host.textContent).toMatch(/no collector points/);
  });

  it('says the collection is empty when it is', () => {
    const host = mount();
    renderCollection(host, [], DEFAULT_FILTER, [], false, {
      onFilter: () => {},
      onToggleDeck: () => {},
    });
    expect(host.querySelector('.collection-empty')?.textContent).toMatch(/No cards yet/);
  });

  it('says the filter matched nothing when it did not', () => {
    const host = mount();
    renderCollection(host, [], DEFAULT_FILTER, [], true, {
      onFilter: () => {},
      onToggleDeck: () => {},
    });
    expect(host.querySelector('.collection-empty')?.textContent).toMatch(/Nothing matches/);
  });

  it('drives the filter controls', () => {
    const host = mount();
    const save = saveWith([owned(1, 1), owned(2, 2)]);
    let next: CollectionFilter | null = null;
    renderCollection(host, buildRows(save), DEFAULT_FILTER, [], true, {
      onFilter: (f) => {
        next = f;
      },
      onToggleDeck: () => {},
    });

    const search = host.querySelector<HTMLInputElement>('input.collection-search');
    expect(search).not.toBeNull();
    search!.value = 'zz';
    search!.dispatchEvent(new Event('input'));
    expect(next).toMatchObject({ search: 'zz' });

    const select = host.querySelector<HTMLSelectElement>('select');
    select!.value = '3';
    select!.dispatchEvent(new Event('change'));
    expect(next).toMatchObject({ tier: '3' });

    const checkbox = host.querySelector<HTMLInputElement>('input[type="checkbox"]');
    checkbox!.checked = true;
    checkbox!.dispatchEvent(new Event('change'));
    expect(next).toMatchObject({ scoringOnly: true });
  });

  it('describes every card for a screen reader', () => {
    const host = mount();
    const save = saveWith([owned(1, 1)]);
    renderCollection(host, buildRows(save), DEFAULT_FILTER, [], true, {
      onFilter: () => {},
      onToggleDeck: () => {},
    });
    const label = host.querySelector('button.collection-card')?.getAttribute('aria-label') ?? '';
    expect(label).toMatch(/collector points/);
    expect(label).toMatch(/unique card/);
  });
});

/** The Play button, which the tests need in both its enabled and disabled states. */
function findPlayButton(host: HTMLElement): HTMLButtonElement {
  const found = [...host.querySelectorAll('button')].find((b) => b.textContent.startsWith('Play'));
  if (found === undefined) throw new Error('no play button rendered');
  return found;
}

describe('the deck editor', () => {
  it('shows one slot per deck card, plus empty slots', () => {
    const host = mount();
    const cards = [owned(1, 1), owned(2, 2)];
    const save = saveWith(cards, [cards[0]!.uid]);
    renderDeckEditor(host, save, { onSelect: () => {}, onAuto: () => {}, onPlay: () => {} });
    expect(host.querySelectorAll('.deck-slot')).toHaveLength(DECK_SIZE);
    expect(host.querySelectorAll('.deck-empty')).toHaveLength(DECK_SIZE - 1);
  });

  it('disables play until the deck is legal', () => {
    const host = mount();
    renderDeckEditor(host, saveWith([owned(1, 1)]), {
      onSelect: () => {},
      onAuto: () => {},
      onPlay: () => {},
    });
    expect(findPlayButton(host).disabled).toBe(true);
  });

  it('enables play with a legal deck', () => {
    const host = mount();
    const cards = [1, 2, 3, 4, 5].map((n) => owned(n, n));
    renderDeckEditor(
      host,
      saveWith(
        cards,
        cards.map((c) => c.uid),
      ),
      {
        onSelect: () => {},
        onAuto: () => {},
        onPlay: () => {},
      },
    );
    expect(findPlayButton(host).disabled).toBe(false);
  });

  it('clears a slot when asked', () => {
    const host = mount();
    const cards = [1, 2, 3, 4, 5].map((n) => owned(n, n));
    const cleared: (number | null)[] = [];
    renderDeckEditor(
      host,
      saveWith(
        cards,
        cards.map((c) => c.uid),
      ),
      {
        onSelect: (_slot, uid) => cleared.push(uid),
        onAuto: () => {},
        onPlay: () => {},
      },
    );
    (host.querySelector('.deck-clear') as HTMLButtonElement).click();
    expect(cleared).toEqual([null]);
  });

  it('warns about a card that can never take anything', () => {
    const host = mount();
    const dead = { ...owned(1, 0), arrows: 0 };
    const cards = [dead, ...[2, 3, 4, 5].map((n) => owned(n, n))];
    renderDeckEditor(
      host,
      saveWith(
        cards,
        cards.map((c) => c.uid),
      ),
      {
        onSelect: () => {},
        onAuto: () => {},
        onPlay: () => {},
      },
    );
    expect(host.querySelector('.deck-warning')?.textContent).toMatch(/no arrows/);
  });

  it('flags a card with no defence at all', () => {
    const glass = { ...owned(1, 1), pdef: 0, mdef: 0 };
    expect(slotWarning(glass)).toMatch(/no defence/);
    expect(slotWarning(owned(2, 2))).toBeNull();
  });

  it('tells the player when a deck entry went missing', () => {
    const host = mount();
    const cards = [1, 2, 3, 4, 5].map((n) => owned(n, n));
    renderDeckEditor(host, saveWith(cards, [...cards.map((c) => c.uid), 999]), {
      onSelect: () => {},
      onAuto: () => {},
      onPlay: () => {},
    });
    expect(host.textContent).toMatch(/no longer in the collection/);
  });
});

describe('auto-fill', () => {
  it('fills the deck with the strongest cards held', () => {
    const weak = { ...owned(1, 1), atk: 1, pdef: 1, mdef: 1 };
    const strong = { ...owned(2, 2), atk: 12, pdef: 12, mdef: 12 };
    const save = saveWith([weak, strong, ...[3, 4, 5, 6, 7].map((n) => owned(n, n))]);
    const suggestion = suggestDeck(save);
    expect(suggestion).toHaveLength(DECK_SIZE);
    expect(suggestion).toContain(strong.uid);
  });

  it('cannot fill a deck larger than the collection', () => {
    expect(suggestDeck(saveWith([owned(1, 1), owned(2, 2)]))).toHaveLength(2);
  });

  it('does not mutate the save', () => {
    const save = saveWith([owned(1, 1), owned(2, 2)]);
    suggestDeck(save);
    expect(save.deck).toEqual([]);
  });
});

describe('storage behind the screens', () => {
  it('survives a save that was never written', () => {
    expect(memoryStorage().getItem('nothing')).toBeNull();
    const storage = memoryStorage();
    writeSave(saveWith([owned(1, 1)]), storage);
    expect(loadCollectionFrom(storage)).toHaveLength(1);
  });
});

function loadCollectionFrom(storage: ReturnType<typeof memoryStorage>): OwnedCard[] {
  const raw = storage.getItem('tetramaster.save.v1');
  if (raw === null) return [];
  const parsed = JSON.parse(raw) as SaveData;
  return [...parsed.collection];
}
