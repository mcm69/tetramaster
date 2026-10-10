/**
 * Arrow previews outside the board.
 *
 * The board has always drawn each card's real arrow pattern, so a card's reach was only ever visible
 * *after* you played it. The hand tray said "5 arrows" — the count, without the direction — which is
 * the one piece of information needed to decide where to play. Moves were effectively guesses.
 *
 * These tests exist because the first attempt at fixing it proved nothing: removing the preview and
 * the directions from the hand tray again left the whole suite green. There was no assertion that the
 * card showed its arrows at all.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { installCanvasStub } from './canvasStub.ts';

// jsdom has no 2d context, so the preview code takes its null branch and draws nothing. Install the
// stub so the drawing path is exercised rather than skipped.
const canvas = installCanvasStub();

beforeEach(() => {
  canvas.reset();
});
import { directionLetters, describeArrows } from '../../src/render/arrowPreview.ts';
import { renderHand } from '../../src/ui/components/hand.ts';
import { renderDeckEditor } from '../../src/ui/components/deckEditor.ts';
import { buildRows, DEFAULT_FILTER, renderCollection } from '../../src/ui/components/collection.ts';
import { emptySave, type SaveData } from '../../src/game/save.ts';
import { DIRECTIONS } from '../../src/core/direction.ts';
import { FULL_MASK, maskFrom } from '../../src/core/card.ts';
import { toCardView } from '../../src/ui/app.ts';
import type { HandEntry } from '../../src/ui/app.ts';
import type { OwnedCard } from '../../src/core/types.ts';

function mount(): HTMLElement {
  const host = document.createElement('div');
  document.body.append(host);
  return host;
}

beforeEach(() => {
  document.body.textContent = '';
});

/** A card with a known mask: N, E and SW. */
const SAMPLE: OwnedCard = {
  uid: 1,
  figureId: 1,
  arrows: (1 << 0) | (1 << 2) | (1 << 5),
  atk: 6,
  pdef: 7,
  mdef: 8,
  type: 'P',
};

function entry(overrides: Partial<OwnedCard> = {}, index = 0, selected = false): HandEntry {
  return { index, card: toCardView({ ...SAMPLE, ...overrides }), selected };
}

function saveWith(cards: OwnedCard[], deck: number[] = []): SaveData {
  return { ...emptySave(), collection: cards, deck, nextUid: 999 };
}

describe('describing a pattern', () => {
  it('names the directions in canonical order', () => {
    expect(directionLetters(SAMPLE.arrows)).toEqual(['N', 'E', 'SW']);
  });

  it('is ordered, not in mask-bit order', () => {
    // Every direction is set, so the order must be the compass order rather than numeric accident.
    expect(directionLetters(FULL_MASK)).toEqual(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']);
    expect(DIRECTIONS).toHaveLength(8);
  });

  it('says so when there is nothing to point', () => {
    expect(describeArrows(0)).toBe('no arrows — cannot take anything');
    expect(describeArrows(0)).not.toMatch(/points/);
  });

  it('says which way, not just how many', () => {
    // The old text was "5 arrows". This is the difference the bug was about.
    expect(describeArrows(maskFrom([0, 1, 2, 3, 4]))).toBe('points N, NE, E, SE, S');
    expect(describeArrows(SAMPLE.arrows)).not.toMatch(/\d+ arrows/);
  });

  it('round-trips every direction', () => {
    for (const dir of DIRECTIONS) {
      expect(directionLetters(1 << dir)).toEqual([describeArrows(1 << dir).replace('points ', '')]);
    }
  });
});

describe('the hand tray', () => {
  it("draws every card's arrow pattern", () => {
    const host = mount();
    renderHand(host, [entry(), entry({ uid: 2 }, 1)], () => {});
    const cards = host.querySelectorAll('button.hand-card');
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      expect(card.querySelectorAll('canvas.arrow-preview')).toHaveLength(1);
    }
  });

  it('states the directions in words on the card', () => {
    const host = mount();
    renderHand(host, [entry()], () => {});
    expect(host.querySelector('.hand-arrows')?.textContent).toBe('points N, E, SW');
  });

  it('tells a screen reader the same thing the canvas shows', () => {
    const host = mount();
    renderHand(host, [entry()], () => {});
    const label = host.querySelector('button.hand-card')?.getAttribute('aria-label') ?? '';
    expect(label).toMatch(/points N, E, SW/);
    // And the canvas itself is decorative, so the words are not announced twice.
    expect(host.querySelector('.arrow-preview')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('flags a card with no arrows, in the preview label too', () => {
    const host = mount();
    renderHand(host, [entry({ arrows: 0 })], () => {});
    expect(host.querySelector('.hand-arrows')?.textContent).toBe(
      'no arrows — cannot take anything',
    );
    expect(host.querySelector('.hand-arrows')?.className).toContain('is-dead');
    // The preview is still drawn: an empty pattern is information, and the card is still playable.
    expect(host.querySelectorAll('canvas.arrow-preview')).toHaveLength(1);
  });

  it('still selects, so the preview cost nothing in interaction', () => {
    const host = mount();
    const picked: number[] = [];
    renderHand(host, [entry({}, 0), entry({ uid: 2 }, 1)], (index) => picked.push(index));
    host.querySelectorAll<HTMLButtonElement>('button.hand-card')[1]?.click();
    expect(picked).toEqual([1]);
  });
});

describe('the deck editor', () => {
  it('shows the pattern for every slot', () => {
    const host = mount();
    const cards = [SAMPLE, { ...SAMPLE, uid: 2, arrows: 0b0000_0001 }];
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
    expect(host.querySelectorAll('.deck-slot')).toHaveLength(5);
    // Two filled slots, each with a preview; the three empty ones have nothing to show.
    expect(host.querySelectorAll('canvas.arrow-preview')).toHaveLength(2);
  });

  it('states the directions for each slot', () => {
    const host = mount();
    renderDeckEditor(host, saveWith([SAMPLE], [SAMPLE.uid]), {
      onSelect: () => {},
      onAuto: () => {},
      onPlay: () => {},
    });
    expect(host.querySelector('.deck-code')?.textContent).toMatch(/points N, E, SW/);
  });
});

describe('the collection grid', () => {
  it('shows the pattern on every card', () => {
    const host = mount();
    const cards = [SAMPLE, { ...SAMPLE, uid: 2, arrows: 0b0000_0011 }];
    const save = saveWith(cards);
    renderCollection(host, buildRows(save, DEFAULT_FILTER), DEFAULT_FILTER, [], true, {
      onFilter: () => {},
      onToggleDeck: () => {},
    });
    expect(host.querySelectorAll('button.collection-card')).toHaveLength(2);
    expect(host.querySelectorAll('canvas.arrow-preview')).toHaveLength(2);
  });

  it('keeps the count out of the visible line, where it was the only thing there was', () => {
    const host = mount();
    const save = saveWith([SAMPLE]);
    renderCollection(host, buildRows(save, DEFAULT_FILTER), DEFAULT_FILTER, [], true, {
      onFilter: () => {},
      onToggleDeck: () => {},
    });
    const code = host.querySelector('.collection-code')?.textContent ?? '';
    expect(code).not.toMatch(/\d+ arrows/);
    expect(host.querySelector('.collection-code')?.getAttribute('title')).toMatch(
      /points N, E, SW/,
    );
  });
});

describe('every surface that shows a card shows its arrows', () => {
  it('covers the hand, the deck and the collection', () => {
    const host = mount();
    const cards = [SAMPLE];
    renderHand(host, [entry()], () => {});
    const hand = host.querySelectorAll('canvas.arrow-preview').length;
    renderDeckEditor(host, saveWith(cards, [SAMPLE.uid]), {
      onSelect: () => {},
      onAuto: () => {},
      onPlay: () => {},
    });
    const deck = host.querySelectorAll('canvas.arrow-preview').length;
    renderCollection(host, buildRows(saveWith(cards), DEFAULT_FILTER), DEFAULT_FILTER, [], true, {
      onFilter: () => {},
      onToggleDeck: () => {},
    });
    const grid = host.querySelectorAll('canvas.arrow-preview').length;

    expect(hand).toBeGreaterThan(0);
    expect(deck).toBeGreaterThan(0);
    expect(grid).toBeGreaterThan(0);
  });

  it('actually paints, using the same drawArrows the board uses', () => {
    // If these ever diverge the preview would be lying, which is worse than no preview at all.
    const host = mount();
    canvas.reset();
    renderHand(host, [entry()], () => {});
    // The preview paints a background and a centre dot, then `drawArrows` strokes three arrows.
    expect(canvas.recorder.calls['fill'] ?? 0).toBeGreaterThanOrEqual(2);
    expect(canvas.recorder.calls['stroke'] ?? 0).toBeGreaterThan(0);
  });

  it('draws a different picture for a different pattern', () => {
    const three = mount();
    canvas.reset();
    renderHand(three, [entry({ arrows: (1 << 0) | (1 << 2) | (1 << 5) })], () => {});
    const strokesWithThree = canvas.recorder.calls['stroke'] ?? 0;

    const two = mount();
    canvas.reset();
    renderHand(two, [entry({ arrows: (1 << 0) | (1 << 2) })], () => {});
    const strokesWithTwo = canvas.recorder.calls['stroke'] ?? 0;

    // One more arrow means more drawing. If the count did not move, the pattern is being ignored.
    expect(strokesWithThree).toBeGreaterThan(strokesWithTwo);
  });

  it('still renders the element when there is no 2d context', () => {
    // Node and any environment without canvas: the button must still exist and still be labelled,
    // even though the picture cannot be painted.
    const host = mount();
    const prototype: { getContext?: unknown } = HTMLCanvasElement.prototype;
    const original = prototype.getContext;
    prototype.getContext = () => null;
    try {
      renderHand(host, [entry()], () => {});
      expect(host.querySelectorAll('canvas.arrow-preview')).toHaveLength(1);
      expect(host.querySelector('.hand-arrows')?.textContent).toBe('points N, E, SW');
    } finally {
      prototype.getContext = original;
    }
  });
});
