/**
 * The settings disclosure (MOBILE.md, stage M4).
 *
 * ## Why a disclosure and not a menu
 *
 * The plan called this an "overflow menu", and the word menu is wrong for what is inside it. The
 * panel holds a `<select>` and two checkboxes — widgets with their own focus behaviour and their own
 * keys. `role="menu"` promises arrow-key roving focus and an item-per-command model, and would then
 * be a lie that assistive technology acts on. What this actually is, and what ARIA calls it, is a
 * **disclosure**: a button with `aria-expanded` that shows and hides a group of controls.
 *
 * ## Why the preference toggles are in here at all
 *
 * `toolbar.ts` opens with a written principle:
 *
 * > *"It does not hide settings behind a mode: audio and motion are accessibility and comfort
 * > settings, and the people who need them are exactly the people least likely to find a submenu."*
 *
 * Putting them in a submenu bends that, so the decision was left open in MOBILE.md §5.4 pending a
 * measurement. The measurement settled it, and not the way the principle would have predicted:
 *
 * | width | toolbar height | rows |
 * |---|---|---|
 * | 320 | 141px | 3 |
 * | 360–560 | 104px | 3 |
 * | 768 | 65px | 3 |
 * | 1024 | 34px | 1 |
 *
 * Leaving the two 19px checkboxes inline saves nothing at all below 768px, because the opponent
 * `<select>` and the mode bar already fill two rows and the toggles simply take a third. The row they
 * occupy *is* the row the panel would have freed. So the principle yields to the arithmetic here, and
 * the compromise that keeps most of it is `markedOnTrigger`: when either preference is off its
 * default the trigger says so, so a player who needs it can see at a glance that it is set without
 * opening anything.
 *
 * ## Behaviour
 *
 * Collapsed by default when collapsible, and open by default when not — on a wide screen the panel
 * is simply part of the bar and there is nothing to open. Escape closes and returns focus to the
 * trigger. A click outside closes. Opening moves focus into the panel, so a keyboard user is not left
 * at the top of the document with no idea the panel appeared.
 */

import { PERSONALITIES } from '../../ai/personalities.ts';
import type { Settings } from '../../game/save.ts';

export interface MenuCallbacks {
  readonly onOpponent: (id: string) => void;
  readonly onSettings: (patch: Partial<Settings>) => void;
  /** Called whenever the panel opens or closes, so the host can re-render if it needs to. */
  readonly onToggle?: (open: boolean) => void;
}

export interface MenuState {
  /** True below the breakpoint, where the panel collapses behind a button. */
  readonly collapsible: boolean;
  readonly open: boolean;
  readonly opponent: string;
  readonly settings: Settings;
  /** False when the browser has no Web Audio, so the toggle can explain itself rather than lie. */
  readonly audioAvailable: boolean;
  /** Cards owned, shown so the collection's progress is one tap away rather than two screens off. */
  readonly collectionSize: number;
  /** Cards needed before a mode unlocks. */
  readonly requiredForMode: number;
  /** False in hotseat, where the second seat is a person and there is no opponent to pick. */
  readonly showOpponent: boolean;
}

export const TRIGGER_ID = 'settings-trigger';
export const PANEL_ID = 'settings-panel';

/** Builds the trigger and the panel. `container` is emptied first. */
export function renderMenu(
  container: HTMLElement,
  state: MenuState,
  callbacks: MenuCallbacks,
): void {
  container.textContent = '';
  container.className = 'settings-menu';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.id = TRIGGER_ID;
  trigger.className = 'menu-trigger';
  trigger.setAttribute('aria-controls', PANEL_ID);
  trigger.setAttribute('aria-expanded', String(state.open));
  trigger.hidden = !state.collapsible;

  const mark = needsAttention(state);
  trigger.classList.toggle('is-marked', mark);
  // The visible word stays "Settings" whatever the state; the dot and this line carry the news, so
  // the button does not change width as preferences are toggled and shove the bar around.
  const triggerText = document.createElement('span');
  triggerText.textContent = 'Settings';
  trigger.append(triggerText);
  trigger.title = mark
    ? 'Settings. Some preferences differ from their defaults.'
    : 'Settings: opponent, sound and motion.';

  const panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.className = 'menu-panel';
  panel.hidden = state.collapsible && !state.open;

  trigger.addEventListener('click', () => {
    callbacks.onToggle?.(!state.open);
  });

  panel.append(
    // Nothing to pick against when the other seat is a person, so the picker is omitted rather than
    // rendered disabled — the same reasoning `renderToolbar` used before this moved.
    ...(state.showOpponent ? [opponentPicker(state, callbacks)] : []),
    settingsToggles(state, callbacks),
    collectionNote(state),
  );

  // Escape closes and puts focus back where it came from, so the keyboard is not stranded.
  panel.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    callbacks.onToggle?.(false);
    document.getElementById(TRIGGER_ID)?.focus();
  });

  container.append(trigger, panel);
}

/**
 * Closes the panel on a click anywhere outside it.
 *
 * Returns a teardown, because a listener that outlives its panel would close a *later* panel too.
 * `main.ts` is re-rendered on every mode change and every match, so a leaked listener here is a
 * growing pile of them.
 */
export function closeOnOutsideClick(
  container: HTMLElement,
  isOpen: () => boolean,
  close: () => void,
): () => void {
  const onPointerDown = (event: Event): void => {
    if (!isOpen()) return;
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (container.contains(target)) return;
    close();
  };
  document.addEventListener('pointerdown', onPointerDown, true);
  return () => {
    document.removeEventListener('pointerdown', onPointerDown, true);
  };
}

/** Moves focus into the panel when it opens, so the keyboard follows the eye. */
export function focusFirstControl(panel: HTMLElement): void {
  const first = panel.querySelector<HTMLElement>('select, input, button');
  first?.focus();
}

/** True when a preference is off its default, which is what the trigger's dot means. */
export function needsAttention(state: MenuState): boolean {
  // `reduceMotion` is `boolean | null` — null means "follow the system" — so it needs the
  // comparison. `audio` is a plain boolean and needs none.
  return state.settings.reduceMotion === true || state.settings.audio;
}

function opponentPicker(state: MenuState, callbacks: MenuCallbacks): HTMLElement {
  const wrap = document.createElement('label');
  wrap.className = 'toolbar-field';
  wrap.textContent = 'Opponent';

  const select = document.createElement('select');
  select.className = 'opponent-select';
  // An opponent id from an older save may name someone who no longer exists; fall back to a real one
  // rather than rendering an empty picker.
  const known = PERSONALITIES.some((personality) => personality.id === state.opponent);
  const current = known ? state.opponent : (PERSONALITIES[0]?.id ?? 'vivi');
  for (const difficulty of ['casual', 'steady', 'sharp'] as const) {
    const group = document.createElement('optgroup');
    group.label = difficulty;
    for (const personality of PERSONALITIES.filter((p) => p.difficulty === difficulty)) {
      const option = document.createElement('option');
      option.value = personality.id;
      option.textContent = `${personality.name} · ${personality.taunt}`;
      if (personality.id === state.opponent) option.selected = true;
      group.append(option);
    }
    select.append(group);
  }
  select.value = current;

  select.addEventListener('change', () => {
    callbacks.onOpponent(select.value);
  });
  wrap.append(select);
  return wrap;
}

function settingsToggles(state: MenuState, callbacks: MenuCallbacks): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'toolbar-toggles';

  wrap.append(
    toggle({
      id: 'audio',
      label: 'Sound',
      checked: state.settings.audio,
      disabled: !state.audioAvailable,
      hint: state.audioAvailable
        ? 'Off by default. Every sound is synthesised; nothing is played until you ask for it.'
        : 'This browser has no Web Audio support.',
      onChange: (on) => {
        callbacks.onSettings({ audio: on });
      },
    }),
  );

  wrap.append(
    toggle({
      id: 'motion',
      label: 'Reduce motion',
      checked: state.settings.reduceMotion === true,
      hint: 'Cards change instantly instead of sliding. Follows your system setting until you change it here.',
      onChange: (on) => {
        callbacks.onSettings({ reduceMotion: on });
      },
    }),
  );

  return wrap;
}

function collectionNote(state: MenuState): HTMLElement {
  const note = document.createElement('p');
  note.className = 'menu-note';
  const held = state.collectionSize;
  note.textContent =
    held >= state.requiredForMode
      ? `${held} cards collected`
      : `${held} of ${state.requiredForMode} cards collected — modes unlock at ${state.requiredForMode}`;
  return note;
}

interface ToggleSpec {
  readonly id: string;
  readonly label: string;
  readonly checked: boolean;
  readonly disabled?: boolean;
  readonly hint: string;
  readonly onChange: (on: boolean) => void;
}

/** A labelled checkbox. A checkbox, not a button: the pressed state is genuinely binary. */
function toggle(spec: ToggleSpec): HTMLElement {
  const label = document.createElement('label');
  label.className = 'toolbar-toggle';
  label.title = spec.hint;

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.id = `toggle-${spec.id}`;
  input.checked = spec.checked;
  if (spec.disabled === true) input.disabled = true;
  input.addEventListener('change', () => {
    spec.onChange(input.checked);
  });

  const text = document.createElement('span');
  text.textContent = spec.label;

  label.append(input, text);
  return label;
}
