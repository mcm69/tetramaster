/**
 * The deck editor (PLAN.md §7.4, Stage 9).
 *
 * Five cards go into a match, so the editor's whole job is to make the deck's weakness obvious
 * before the match rather than after: arrows are shown per slot, and a slot with none is called out,
 * because a card with no arrows can never take anything and will always be a wasted turn.
 */

import { cardArrowCount, statCode } from '../../core/card.ts';
import { figureById } from '../../data/cards.ts';
import { arrowPreviewCanvas, describeArrows } from '../../render/arrowPreview.ts';
import { deckStatus, growthLine } from './collection.ts';
import { DECK_SIZE } from '../../core/constants.ts';
import type { OwnedCard } from '../../core/types.ts';
import type { SaveData } from '../../game/save.ts';

/** Why a slot is a problem, or null when it is fine. */
export function slotWarning(card: OwnedCard): string | null {
  if (cardArrowCount(card) === 0) return 'no arrows — will never take anything';
  if (card.pdef === 0 && card.mdef === 0) return 'no defence — will lose every battle';
  return null;
}

export interface DeckCallbacks {
  /** Fills a slot from a collection card, replacing whatever was there. */
  readonly onSelect: (slot: number, uid: number | null) => void;
  /** Auto-fills the empty slots. */
  readonly onAuto: () => void;
  readonly onPlay: () => void;
}

/** Paints the deck slots plus the play button. */
export function renderDeckEditor(
  container: HTMLElement,
  save: SaveData,
  callbacks: DeckCallbacks,
): void {
  container.textContent = '';
  const status = deckStatus(save);

  const heading = document.createElement('p');
  heading.className = 'deck-heading';
  heading.textContent = `Deck — ${status.size} of ${status.required}`;
  container.append(heading);

  const slots = document.createElement('div');
  slots.className = 'deck-slots';
  for (let slot = 0; slot < DECK_SIZE; slot++) {
    slots.append(deckSlot(save, slot, callbacks));
  }
  container.append(slots);

  if (status.dangling.length > 0) {
    // A dangling entry means the save referenced a card that is gone; say so rather than
    // silently showing a short deck.
    const warning = document.createElement('p');
    warning.className = 'deck-warning';
    warning.textContent = `${status.dangling.length} deck entr${
      status.dangling.length === 1 ? 'y' : 'ies'
    } pointed at cards no longer in the collection and ${
      status.dangling.length === 1 ? 'was' : 'were'
    } dropped.`;
    container.append(warning);
  }

  const actions = document.createElement('div');
  actions.className = 'deck-actions';

  const auto = document.createElement('button');
  auto.type = 'button';
  auto.className = 'rematch';
  auto.textContent = 'Auto-fill';
  auto.disabled = status.size >= status.required;
  auto.addEventListener('click', () => {
    callbacks.onAuto();
  });
  actions.append(auto);

  const play = document.createElement('button');
  play.type = 'button';
  play.className = 'rematch';
  play.textContent = status.valid ? 'Play with this deck' : `Play (${status.missing} short)`;
  play.disabled = !status.valid;
  play.addEventListener('click', () => {
    callbacks.onPlay();
  });
  actions.append(play);

  container.append(actions);
}

function deckSlot(save: SaveData, slot: number, callbacks: DeckCallbacks): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'deck-slot';

  const uid = save.deck[slot];
  const card = uid === undefined ? undefined : save.collection.find((entry) => entry.uid === uid);

  if (card === undefined) {
    const empty = document.createElement('p');
    empty.className = 'deck-empty';
    empty.textContent = `Slot ${slot + 1} — empty`;
    wrapper.append(empty);
    return wrapper;
  }

  // The arrows, so a deck can be judged on its reach and spread rather than on five names.
  wrapper.append(arrowPreviewCanvas(card.arrows, { size: 48 }));

  const name = document.createElement('p');
  name.className = 'deck-name';
  name.textContent = figureById(card.figureId).name;

  const code = document.createElement('p');
  code.className = 'deck-code';
  code.textContent = `${statCode(card)} · ${describeArrows(card.arrows)}`;
  code.title = growthLine(card);

  const warning = slotWarning(card);
  if (warning !== null) {
    const note = document.createElement('p');
    note.className = 'deck-warning';
    note.textContent = warning;
    wrapper.append(name, code, note);
  } else {
    wrapper.append(name, code);
  }

  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'deck-clear';
  clear.textContent = `Clear slot ${slot + 1}`;
  clear.addEventListener('click', () => {
    callbacks.onSelect(slot, null);
  });
  wrapper.append(clear);
  return wrapper;
}

/**
 * Picks a deck from the collection without any input.
 *
 * Deliberately simple rather than clever: take the five highest-collector-point cards. Nothing about
 * the scoring is meant to be good deck-building, and a player who disagrees can simply pick cards
 * by hand — but "Auto-fill" should never produce something unusable.
 */
export function suggestDeck(save: SaveData, count: number = DECK_SIZE): number[] {
  return [...save.collection]
    .sort((a, b) => b.atk + b.pdef + b.mdef - (a.atk + a.pdef + a.mdef) || a.uid - b.uid)
    .slice(0, count)
    .map((card) => card.uid);
}
