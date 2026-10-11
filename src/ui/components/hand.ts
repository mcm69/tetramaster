/**
 * The hand tray and the results panel (PLAN.md §6, Stage 7).
 *
 * The tray is the player's only source of information about their own cards, so it shows more than
 * the board does: the exact stat code, the card's actual arrow pattern, and a warning when a card has
 * none — a card with no arrows can never take anything, and playing it is usually a wasted turn.
 *
 * The arrow pattern matters more than it looks. It used to say "5 arrows" — the count without the
 * direction — which is the one thing you need to decide where to play. Choosing a square was a guess
 * until you saw the arrows. Each card now carries a small canvas drawn by the same code that draws
 * the board, plus the directions in words for screen readers.
 */

import { arrowPreviewCanvas, describeArrows } from '../../render/arrowPreview.ts';
import type { HandEntry, MatchView } from '../app.ts';
import type { Card, MatchResult } from '../../core/types.ts';
import { toCardView } from '../app.ts';

/** A one-line warning about a card, or null when there is nothing worth saying. */
export function cardWarning(entry: HandEntry): string | null {
  if (entry.card.arrowCount === 0) {
    return 'no arrows — cannot take anything';
  }
  if (entry.card.arrowCount <= 2) return 'few arrows — good in a corner';
  if (entry.card.arrowCount >= 7) return 'many arrows — strong, but exposed';
  return null;
}

/** Builds the hand tray and wires selection to `onSelect`. */
export function renderHand(
  container: HTMLElement,
  entries: readonly HandEntry[],
  onSelect: (index: number) => void,
): void {
  container.textContent = '';

  for (const entry of entries) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'hand-card';
    if (entry.selected) button.classList.add('is-selected');
    button.dataset['index'] = String(entry.index);
    button.setAttribute('aria-pressed', String(entry.selected));
    button.setAttribute(
      'aria-label',
      `Card ${entry.index + 1}: ${entry.card.name}, ${entry.card.statCode}, ${describeArrows(entry.card.arrows)}.`,
    );

    // The pattern first: it is the thing that decides where this card should go.
    button.append(arrowPreviewCanvas(entry.card.arrows, { size: PREVIEW_SIZE }));

    const name = document.createElement('span');
    name.className = 'hand-name';
    name.textContent = entry.card.name;

    const code = document.createElement('span');
    code.className = 'hand-code';
    code.textContent = entry.card.statCode;

    const arrows = document.createElement('span');
    arrows.className = `hand-arrows${entry.card.arrowCount === 0 ? ' is-dead' : ''}`;
    // The directions, not just the count. "points NE, S, SW" tells you where it can take.
    arrows.textContent = describeArrows(entry.card.arrows);
    arrows.title = `${entry.card.arrowCount} arrows`;

    const warning = cardWarning(entry);
    if (warning !== null) {
      const note = document.createElement('span');
      note.className = 'hand-warning';
      note.textContent = warning;
      button.append(name, code, arrows, note);
    } else {
      button.append(name, code, arrows);
    }

    button.addEventListener('click', () => {
      onSelect(entry.index);
    });
    container.append(button);
  }

  // Now that the tray is in the document the cards have a width, and the sprites can be sized.
  sizeArrowPreviews(container);
}

/** Full-size arrow sprite, for a card with room for it. */
export const PREVIEW_SIZE = 56;
/** The reduced sprite, for a card too narrow for the full one. */
export const PREVIEW_SIZE_SMALL = 34;
/** Below this card width the sprite shrinks. Measured on a 360px phone, where cards are 57px. */
export const PREVIEW_NARROW_PX = 96;

/**
 * The sprite size for a card `widthPx` wide.
 *
 * Pure, and exported, because the *policy* is testable even though the measurement is not: jsdom
 * reports zero for every width, so nothing in Node can check that the right size was chosen — and
 * the harness cannot catch it either, since a 22px change is smaller than the slack at the tightest
 * device in the matrix. This is the one piece of M3 the unit suite can actually hold.
 */
export function previewSizeFor(widthPx: number): number {
  return widthPx > 0 && widthPx < PREVIEW_NARROW_PX ? PREVIEW_SIZE_SMALL : PREVIEW_SIZE;
}

/**
 * Sizes the arrow sprites now that the tray is in the document.
 *
 * This has to be a second pass. The first attempt asked the card its width while the sprite was
 * being built, at which point the card had no layout at all — `getBoundingClientRect()` returned
 * zero, every card measured as "no width known", and the sprite stayed at its full size on exactly
 * the narrow screens it was meant to shrink on. A detached element measures nothing; that is not an
 * edge case, it is the normal state of a component being constructed.
 */
function sizeArrowPreviews(container: HTMLElement): void {
  for (const card of container.querySelectorAll<HTMLElement>('.hand-card')) {
    const width = card.getBoundingClientRect().width;
    if (width <= 0) continue;
    const size = previewSizeFor(width);
    const sprite = card.querySelector<HTMLCanvasElement>('canvas.arrow-preview');
    if (sprite === null || sprite.style.width === `${size}px`) continue;
    sprite.style.width = `${size}px`;
    sprite.style.height = `${size}px`;
  }
}

/** Builds the results panel. A perfect game is called out explicitly — it is the point of playing. */
export function renderResults(
  container: HTMLElement,
  result: MatchResult,
  taken: readonly Card[],
  onClaim: (index: number) => void,
  onRematch: () => void,
): void {
  container.textContent = '';
  container.hidden = false;

  const heading = document.createElement('h2');
  heading.className = 'result-heading';
  heading.textContent = outcomeHeadline(result.outcome);
  container.append(heading);

  const body = document.createElement('p');
  body.className = 'result-body';
  body.textContent = outcomeBody(result);
  container.append(body);

  if (result.claimable.length > 0 && taken.length < result.claimable.length) {
    const claimHeading = document.createElement('h3');
    claimHeading.textContent = 'Choose a card to take';
    container.append(claimHeading);

    const list = document.createElement('div');
    list.className = 'claim-list';
    result.claimable.forEach((card, index) => {
      if (taken.includes(card)) return;
      const view = toCardView(card);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'claim-card';
      button.textContent = `${view.name} ${view.statCode}`;
      button.addEventListener('click', () => {
        onClaim(index);
      });
      list.append(button);
    });
    container.append(list);
  }

  if (taken.length > 0) {
    const takenList = document.createElement('p');
    takenList.className = 'result-taken';
    takenList.textContent = `Taken: ${taken.map((c) => toCardView(c).name).join(', ')}`;
    container.append(takenList);
  }

  const again = document.createElement('button');
  again.type = 'button';
  again.className = 'rematch';
  again.textContent = 'Play again';
  again.addEventListener('click', onRematch);
  container.append(again);
}

function outcomeHeadline(outcome: MatchResult['outcome']): string {
  switch (outcome) {
    case 'win':
      return 'You win';
    case 'perfect':
      return 'Perfect game — you take everything';
    case 'loss':
      return 'You lose';
    case 'draw':
      return 'A draw';
    default:
      return 'Match over';
  }
}

function outcomeBody(result: MatchResult): string {
  const count = result.claimable.length;
  if (result.outcome === 'perfect') {
    return 'Every one of their cards is yours. You may take all five.';
  }
  if (result.outcome === 'win' && count > 0) {
    return 'You may take one of the cards you captured.';
  }
  if (result.outcome === 'loss') return 'They take one of the cards they captured.';
  return 'Neither side gained the edge.';
}

/** The status line under the board: whose turn it is, or what is being decided. */
export function statusText(view: MatchView): string {
  if (view.phase === 'over') return 'Match over';
  if (view.phase === 'chooseBattle') {
    if (view.pending.length === 0) return 'Resolving the fight';
    return view.pending.length === 1
      ? 'A card points back — fight it'
      : `${view.pending.length} cards point back — choose one`;
  }
  if (view.selected === null) return 'Pick a card, then click a square';
  return 'Click a square to play';
}
