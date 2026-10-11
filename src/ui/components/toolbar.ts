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
import { renderMenu } from './menu.ts';
import type { Settings } from '../../game/save.ts';

export interface ToolbarCallbacks {
  readonly onMode: (mode: ModeId) => void;
  readonly onOpponent: (id: string) => void;
  readonly onSettings: (patch: Partial<Settings>) => void;
  /** True below the breakpoint, where the settings collapse behind a button (MOBILE.md M4). */
  readonly collapsible: boolean;
  readonly menuOpen: boolean;
  readonly onMenuToggle: (open: boolean) => void;
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

  // The opponent picker, the preferences and the collection's progress moved to `menu.ts` at stage
  // M4. On a wide screen they render in place, exactly where they were; below the breakpoint they
  // collapse behind a single button, because the bar measured 141px tall on a 320px phone and 104px
  // from 360 to 560.
  const host = document.createElement('div');
  host.className = 'settings-host';
  container.append(host);

  renderMenu(
    host,
    {
      collapsible: callbacks.collapsible,
      open: callbacks.menuOpen,
      showOpponent: state.opponentIsComputer,
      opponent: state.opponent,
      settings: state.settings,
      audioAvailable: state.audioAvailable,
      collectionSize: state.collectionSize,
      requiredForMode: MODES.match.requiresCollection,
    },
    {
      onOpponent: callbacks.onOpponent,
      onSettings: callbacks.onSettings,
      onToggle: callbacks.onMenuToggle,
    },
  );
}

/** A one-line summary of the mode, shown under the board. */
export function describeMode(mode: Mode, detail: string | null): string {
  const parts = [`${mode.name} — ${mode.blurb}`];
  if (detail !== null) parts.push(detail);
  return parts.join(' ');
}
