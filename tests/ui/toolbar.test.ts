/**
 * The mode bar, settings toggles and accessibility plumbing (PLAN.md §6, Stage 10).
 *
 * These are the controls a player reaches for when something is wrong — the sound is unbearable,
 * the animation is making them ill, the board is unreadable. So the assertions are mostly about
 * *honesty*: a toggle must not claim to do something it cannot, and a disabled control must say why
 * rather than simply refusing.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { describeMode, renderToolbar } from '../../src/ui/components/toolbar.ts';
import { MODES } from '../../src/game/modes.ts';
import { DEFAULT_SETTINGS, type Settings } from '../../src/game/save.ts';
import {
  Announcer,
  boardDescription,
  prefersReducedMotion,
  seatLabels,
  watchReducedMotion,
} from '../../src/ui/accessibility.ts';
import type { ModeId } from '../../src/game/modes.ts';

/**
 * Callbacks with the disclosure fields filled in.
 *
 * The defaults describe a wide screen: not collapsible, and open, which renders the panel exactly
 * where it used to sit. Tests about the collapsed state pass their own.
 */
function callbacks(overrides: Partial<Parameters<typeof renderToolbar>[2]> = {}) {
  return {
    onMode: () => {},
    onOpponent: () => {},
    onSettings: () => {},
    collapsible: false,
    menuOpen: true,
    onMenuToggle: () => {},
    ...overrides,
  };
}

function mount(): HTMLElement {
  const host = document.createElement('div');
  document.body.append(host);
  return host;
}

function state(overrides: Partial<Parameters<typeof renderToolbar>[1]> = {}) {
  return {
    mode: 'match' as ModeId,
    opponent: 'vivi',
    settings: DEFAULT_SETTINGS,
    collectionSize: 12,
    opponentIsComputer: true,
    audioAvailable: true,
    ...overrides,
  };
}

beforeEach(() => {
  document.body.textContent = '';
});

describe('the mode bar', () => {
  it('offers every mode, and marks the current one', () => {
    const host = mount();
    renderToolbar(host, state(), {
      onMode: () => {},
      onOpponent: () => {},
      onSettings: () => {},
      collapsible: false,
      menuOpen: true,
      onMenuToggle: () => {},
    });
    const buttons = host.querySelectorAll<HTMLButtonElement>('button.mode-button');
    expect(buttons).toHaveLength(3);
    expect(buttons[0]?.getAttribute('aria-pressed')).toBe('true');
    expect(buttons[1]?.getAttribute('aria-pressed')).toBe('false');
  });

  it('reports the chosen mode', () => {
    const host = mount();
    const chosen: ModeId[] = [];
    renderToolbar(host, state(), {
      ...callbacks({ onMode: (id) => chosen.push(id) }),
    });
    for (const button of host.querySelectorAll<HTMLButtonElement>('button.mode-button')) {
      button.click();
    }
    expect(chosen).toEqual(['match', 'tournament', 'hotseat']);
  });

  it('disables a mode the player cannot enter, and says why', () => {
    const host = mount();
    const chosen: ModeId[] = [];
    renderToolbar(host, state({ collectionSize: 2 }), {
      ...callbacks({ onMode: (id) => chosen.push(id) }),
    });
    const buttons = host.querySelectorAll<HTMLButtonElement>('button.mode-button');
    for (const button of buttons) expect(button.disabled).toBe(true);
    expect(buttons[0]?.title).toMatch(/at least 5 cards/);
    // And pressing one anyway does nothing.
    buttons[0]?.click();
    expect(chosen).toEqual([]);
  });

  it('gives every button an accessible name with its reason', () => {
    const host = mount();
    renderToolbar(host, state({ collectionSize: 1 }), {
      onMode: () => {},
      onOpponent: () => {},
      onSettings: () => {},
      collapsible: false,
      menuOpen: true,
      onMenuToggle: () => {},
    });
    expect(host.querySelector('button.mode-button')?.getAttribute('aria-label')).toMatch(
      /at least 5 cards/,
    );
  });
});

describe('the opponent picker', () => {
  it('groups opponents by difficulty', () => {
    const host = mount();
    renderToolbar(host, state(), {
      onMode: () => {},
      onOpponent: () => {},
      onSettings: () => {},
      collapsible: false,
      menuOpen: true,
      onMenuToggle: () => {},
    });
    const groups = host.querySelectorAll('optgroup');
    expect([...groups].map((g) => g.label)).toEqual(['casual', 'steady', 'sharp']);
    expect(host.querySelectorAll('option').length).toBeGreaterThanOrEqual(9);
  });

  it('selects the current opponent', () => {
    const host = mount();
    renderToolbar(host, state({ opponent: 'kuja' }), {
      onMode: () => {},
      onOpponent: () => {},
      onSettings: () => {},
      collapsible: false,
      menuOpen: true,
      onMenuToggle: () => {},
    });
    const select = host.querySelector<HTMLSelectElement>('select.opponent-select');
    expect(select?.value).toBe('kuja');
  });

  it('falls back to a real opponent when the save names one that no longer exists', () => {
    const host = mount();
    renderToolbar(host, state({ opponent: 'someone-removed' }), {
      onMode: () => {},
      onOpponent: () => {},
      onSettings: () => {},
      collapsible: false,
      menuOpen: true,
      onMenuToggle: () => {},
    });
    const select = host.querySelector<HTMLSelectElement>('select.opponent-select');
    expect(select?.value).not.toBe('');
    expect(select?.value).not.toBe('someone-removed');
  });

  it('reports a change', () => {
    const host = mount();
    const picked: string[] = [];
    renderToolbar(host, state(), callbacks({ onOpponent: (id) => picked.push(id) }));
    const select = host.querySelector<HTMLSelectElement>('select.opponent-select');
    if (select === null) throw new Error('no select');
    select.value = 'gil';
    select.dispatchEvent(new Event('change'));
    expect(picked).toEqual(['gil']);
  });

  it('is hidden in hotseat, where there is no opponent to pick', () => {
    const host = mount();
    renderToolbar(host, state({ mode: 'hotseat', opponentIsComputer: false }), {
      onMode: () => {},
      onOpponent: () => {},
      onSettings: () => {},
      collapsible: false,
      menuOpen: true,
      onMenuToggle: () => {},
    });
    expect(host.querySelector('select.opponent-select')).toBeNull();
  });
});

describe('the settings toggles', () => {
  it('shows sound off by default', () => {
    const host = mount();
    renderToolbar(host, state(), {
      onMode: () => {},
      onOpponent: () => {},
      onSettings: () => {},
      collapsible: false,
      menuOpen: true,
      onMenuToggle: () => {},
    });
    const audio = host.querySelector<HTMLInputElement>('#toggle-audio');
    expect(audio?.checked).toBe(false);
  });

  it('reflects the stored settings', () => {
    const host = mount();
    const on: Settings = { ...DEFAULT_SETTINGS, audio: true, reduceMotion: true };
    renderToolbar(host, state({ settings: on }), {
      onMode: () => {},
      onOpponent: () => {},
      onSettings: () => {},
      collapsible: false,
      menuOpen: true,
      onMenuToggle: () => {},
    });
    expect(host.querySelector<HTMLInputElement>('#toggle-audio')?.checked).toBe(true);
    expect(host.querySelector<HTMLInputElement>('#toggle-motion')?.checked).toBe(true);
  });

  it('reports changes', () => {
    const host = mount();
    const patches: Partial<Settings>[] = [];
    renderToolbar(host, state(), callbacks({ onSettings: (patch) => patches.push(patch) }));
    const audio = host.querySelector<HTMLInputElement>('#toggle-audio');
    const motion = host.querySelector<HTMLInputElement>('#toggle-motion');
    if (audio === null || motion === null) throw new Error('missing toggles');

    audio.checked = true;
    audio.dispatchEvent(new Event('change'));
    motion.checked = true;
    motion.dispatchEvent(new Event('change'));
    expect(patches).toEqual([{ audio: true }, { reduceMotion: true }]);
  });

  it('explains itself when the browser has no audio at all', () => {
    const host = mount();
    renderToolbar(host, state({ audioAvailable: false }), {
      onMode: () => {},
      onOpponent: () => {},
      onSettings: () => {},
      collapsible: false,
      menuOpen: true,
      onMenuToggle: () => {},
    });
    const audio = host.querySelector<HTMLInputElement>('#toggle-audio');
    expect(audio?.disabled).toBe(true);
    expect(audio?.closest('label')?.title).toMatch(/no Web Audio/);
  });

  it('uses checkboxes, because the state really is binary', () => {
    const host = mount();
    renderToolbar(host, state(), {
      onMode: () => {},
      onOpponent: () => {},
      onSettings: () => {},
      collapsible: false,
      menuOpen: true,
      onMenuToggle: () => {},
    });
    for (const input of host.querySelectorAll('input')) {
      expect(input.type).toBe('checkbox');
    }
  });
});

describe('mode description', () => {
  it('names the mode and adds any detail given', () => {
    expect(describeMode(MODES.match, null)).toMatch(/^Match —/);
    expect(describeMode(MODES.tournament, 'Counter-deck built around 62%')).toMatch(/62%/);
  });
});

describe('reduced motion', () => {
  it('reads the preference', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('reduced-motion'),
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    expect(prefersReducedMotion()).toBe(true);
    vi.unstubAllGlobals();
  });

  it('defaults to false where matchMedia does not exist', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(prefersReducedMotion()).toBe(false);
    vi.unstubAllGlobals();
  });

  it('reports immediately and on every change', () => {
    const listeners: ((event: MediaQueryListEvent) => void)[] = [];
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: (_type: string, handler: (event: MediaQueryListEvent) => void) =>
        listeners.push(handler),
      removeEventListener: () => {
        listeners.length = 0;
      },
    }));

    const seen: boolean[] = [];
    const stop = watchReducedMotion((reduced) => seen.push(reduced));
    expect(seen).toEqual([false]);

    listeners[0]?.({ matches: true } as MediaQueryListEvent);
    expect(seen).toEqual([false, true]);

    stop();
    vi.unstubAllGlobals();
  });

  it('unsubscribes cleanly', () => {
    let removed = false;
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => {
        removed = true;
      },
    }));
    watchReducedMotion(() => {})();
    expect(removed).toBe(true);
    vi.unstubAllGlobals();
  });

  it('does nothing at all where matchMedia is missing', () => {
    vi.stubGlobal('matchMedia', undefined);
    const seen: boolean[] = [];
    expect(() => {
      watchReducedMotion((r) => seen.push(r))();
    }).not.toThrow();
    expect(seen).toEqual([]);
    vi.unstubAllGlobals();
  });
});

describe('announcements', () => {
  it('writes the message into the live region', () => {
    const host = mount();
    const announcer = new Announcer(host);
    announcer.say('Your turn.');
    expect(host.textContent).toBe('Your turn.');
  });

  it('re-announces an identical message, which a live region would otherwise drop', () => {
    const host = mount();
    const announcer = new Announcer(host);
    announcer.say('Your turn.');
    const first = host.textContent;
    announcer.say('Your turn.');
    expect(host.textContent).not.toBe(first);
    // The extra character is a zero-width space: invisible, and audible as nothing.
    expect(host.textContent.replace(/\u200b/g, '')).toBe('Your turn.');
  });

  it('settles back to the plain text once the message changes', () => {
    const host = mount();
    const announcer = new Announcer(host);
    announcer.say('A');
    announcer.say('A');
    announcer.say('B');
    expect(host.textContent).toBe('B');
  });
});

describe('describing the board', () => {
  const labels = seatLabels(true);

  it('says so when the board is empty', () => {
    expect(boardDescription([], [], labels)).toBe('The board is empty.');
  });

  it('counts the cards each seat holds', () => {
    const cells = [
      { owner: 'player' as const, name: 'Sandman' },
      { owner: 'ai' as const, name: 'Gil' },
      null,
      { owner: 'player' as const, name: 'Vivi' },
    ];
    expect(boardDescription(cells, [false, false, false, false], labels)).toMatch(
      /You 2, Opponent 1/,
    );
  });

  it('names blocked cells rather than leaving the count ambiguous', () => {
    const cells = [{ owner: 'player' as const, name: 'Sandman' }];
    expect(boardDescription(cells, [true, false, true, false], labels)).toMatch(/2 cells blocked/);
    expect(boardDescription(cells, [false, false, false, false], labels)).not.toMatch(/blocked/);
  });

  it('uses neutral seat names in hotseat', () => {
    const hotseat = seatLabels(false);
    expect(hotseat.player).toBe('Player 1');
    expect(hotseat.ai).toBe('Player 2');
    // "You" would be wrong with two people at one keyboard.
    expect(hotseat.player).not.toBe('You');
  });
});
