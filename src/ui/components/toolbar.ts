/**
 * The mode bar and settings controls (PLAN.md §6, Stage 10).
 *
 * The bar across the top of the page carries everything that is not the board: which of the three
 * modes you are in, which opponent you are facing, and the two preferences that must be reachable
 * without a menu — sound and motion.
 *
 * Two things it deliberately does not do. It does not hide settings behind a mode: audio and motion
 * are accessibility and comfort settings, and the people who need them are exactly the people least
 * likely to find a submenu. And it does not let a mode be selected when it cannot run — a disabled
 * button with a stated reason is more useful than one that fails when pressed, because the failure
 * would be at least thirty seconds later.
 */

import { MODE_ORDER, MODES, blockedReason, type Mode, type ModeId } from '../../game/modes.ts';
import { PERSONALITIES } from '../../ai/personalities.ts';
import type { Settings } from '../../game/save.ts';

export interface ToolbarCallbacks {
  readonly onMode: (mode: ModeId) => void;
  readonly onOpponent: (id: string) => void;
  readonly onSettings: (patch: Partial<Settings>) => void;
}

export interface ToolbarState {
  readonly mode: ModeId;
  readonly opponent: string;
  readonly settings: Settings;
  readonly collectionSize: number;
  /** True when the opponent's seat is a person, so the picker should be hidden. */
  readonly opponentIsComputer: boolean;
  /** Set when audio is unavailable at all, so the toggle explains itself rather than lying. */
  readonly audioAvailable: boolean;
}

/** Builds the mode bar. */
export function renderToolbar(
  container: HTMLElement,
  state: ToolbarState,
  callbacks: ToolbarCallbacks,
): void {
  container.textContent = '';

  const modes = document.createElement('div');
  modes.className = 'mode-bar';
  modes.setAttribute('role', 'group');
  modes.setAttribute('aria-label', 'Game mode');

  for (const id of MODE_ORDER) {
    const mode = MODES[id];
    const reason = blockedReason(mode, state.collectionSize);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mode-button';
    button.dataset['mode'] = id;
    button.setAttribute('aria-pressed', String(state.mode === id));
    button.disabled = reason !== null;
    button.title = reason ?? mode.blurb;
    button.textContent = mode.name;

    const detail = document.createElement('span');
    detail.className = 'mode-blurb';
    detail.textContent = reason ?? mode.blurb;
    modes.append(button, detail);
    // One button per mode, each paired with its own description for screen readers.
    button.setAttribute('aria-label', `${mode.name}. ${button.title}`);
    button.addEventListener('click', () => {
      callbacks.onMode(id);
    });
  }
  container.append(modes);

  if (state.opponentIsComputer) {
    container.append(opponentPicker(state, callbacks));
  }

  container.append(settingsToggles(state, callbacks));
}

function opponentPicker(state: ToolbarState, callbacks: ToolbarCallbacks): HTMLElement {
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

function settingsToggles(state: ToolbarState, callbacks: ToolbarCallbacks): HTMLElement {
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

/** A one-line summary of the mode, shown under the board. */
export function describeMode(mode: Mode, detail: string | null): string {
  const parts = [`${mode.name} — ${mode.blurb}`];
  if (detail !== null) parts.push(detail);
  return parts.join(' ');
}
