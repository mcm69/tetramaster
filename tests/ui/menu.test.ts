/**
 * The settings disclosure (MOBILE.md, stage M4).
 *
 * ## Why this needs tests at all
 *
 * It is a disclosure, so the interesting behaviour is all in the transitions: does `aria-expanded`
 * agree with what is on screen, does Escape put focus back where it came from, does a click outside
 * close it, and does a listener survive a re-render. All of it is DOM-only and all of it is in jsdom.
 *
 * The one thing jsdom cannot do is the breakpoint — `matchMedia` does not exist — so the collapsed
 * state is driven through `MenuState.collapsible` directly, which is the same flag `main.ts` derives
 * from `matchMedia`. The harness covers the breakpoint itself.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  PANEL_ID,
  TRIGGER_ID,
  closeOnOutsideClick,
  focusFirstControl,
  needsAttention,
  renderMenu,
  type MenuState,
} from '../../src/ui/components/menu.ts';
import type { Settings } from '../../src/game/save.ts';

function mount(): HTMLElement {
  document.body.textContent = '';
  const host = document.createElement('div');
  document.body.append(host);
  return host;
}

/** Settings with two fields changed, rather than a partial object forced through a cast. */
function settings(over: Partial<Settings> = {}): Settings {
  return { audio: false, volume: 0.6, reduceMotion: null, mode: 'match', ...over };
}

function state(overrides: Partial<MenuState> = {}): MenuState {
  return {
    collapsible: true,
    open: false,
    showOpponent: true,
    opponent: 'vivi',
    settings: settings(),
    audioAvailable: true,
    collectionSize: 12,
    requiredForMode: 5,
    ...overrides,
  };
}

function trigger(): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>(`#${TRIGGER_ID}`);
}

function panel(): HTMLElement | null {
  return document.querySelector<HTMLElement>(`#${PANEL_ID}`);
}

/** Renders, then applies the toggles the way `main.ts` does: re-render from new state. */
function render(host: HTMLElement, toggles: { open: boolean }[], s = state()): void {
  for (const toggle of toggles) {
    renderMenu(
      host,
      { ...s, open: toggle.open },
      { onOpponent: () => {}, onSettings: () => {}, onToggle: () => {} },
    );
  }
}

beforeEach(() => {
  document.body.textContent = '';
});

describe('when it can collapse', () => {
  it('starts closed, with the button saying so', () => {
    const host = mount();
    renderMenu(host, state(), { onOpponent: () => {}, onSettings: () => {}, onToggle: () => {} });

    expect(trigger()?.hidden).toBe(false);
    expect(trigger()?.getAttribute('aria-expanded')).toBe('false');
    expect(panel()?.hidden).toBe(true);
    expect(trigger()?.getAttribute('aria-controls')).toBe(PANEL_ID);
  });

  it('opens, and the two agree', () => {
    const host = mount();
    render(host, [{ open: false }, { open: true }]);

    expect(trigger()?.getAttribute('aria-expanded')).toBe('true');
    expect(panel()?.hidden).toBe(false);
  });

  it('closes on Escape and hands focus back to the trigger', () => {
    const host = mount();
    let open = true;
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });

    const render2 = (): void => {
      renderMenu(host, state({ open }), {
        onOpponent: () => {},
        onSettings: () => {},
        onToggle: (next) => {
          open = next;
          render2();
        },
      });
    };
    render2();
    expect(panel()?.hidden).toBe(false);

    trigger()?.focus();
    panel()?.dispatchEvent(escape);

    expect(open).toBe(false);
    expect(panel()?.hidden).toBe(true);
    expect(document.activeElement).toBe(trigger());
  });

  it('closes on a click outside, and not on a click inside', () => {
    // The menu is rendered first, deliberately. The first version of this test never rendered it,
    // so `host` was empty, the optional-chained dispatch did nothing, and the assertion passed
    // against a listener that had been attached to an empty element — a green test for a component
    // that was never in the document.
    const host = mount();
    renderMenu(host, state({ open: true }), {
      onOpponent: () => {},
      onSettings: () => {},
      onToggle: () => {},
    });
    const insideControl = host.querySelector('#toggle-audio');
    if (insideControl === null) throw new Error('the panel was not rendered');
    expect(panel()?.hidden).toBe(false);

    let open = true;
    let closes = 0;
    const dispose = closeOnOutsideClick(
      host,
      () => open,
      () => {
        open = false;
        closes++;
      },
    );

    insideControl.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(closes, 'a click inside the panel closed it').toBe(0);

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(closes, 'a click outside did not close it').toBe(1);

    // And again once already closed: nothing to close, so nothing happens.
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(closes).toBe(1);
    dispose();
  });

  it('stops listening once torn down', () => {
    // `main.ts` re-renders the toolbar on every settings change and every match. A listener that
    // outlives its panel would go on closing *later* panels, which is the sort of bug that only
    // shows up after the tenth match.
    const host = mount();
    let closes = 0;
    const dispose = closeOnOutsideClick(
      host,
      () => true,
      () => {
        closes++;
      },
    );
    dispose();
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(closes).toBe(0);
  });

  it('moves focus into the panel when it opens', () => {
    const host = mount();
    renderMenu(host, state({ open: true }), {
      onOpponent: () => {},
      onSettings: () => {},
      onToggle: () => {},
    });
    focusFirstControl(panel() as HTMLElement);
    expect(document.activeElement?.tagName).toBe('SELECT');
  });
});

describe('when it cannot', () => {
  it('is just part of the bar: no button, and the panel always visible', () => {
    const host = mount();
    renderMenu(host, state({ collapsible: false, open: false }), {
      onOpponent: () => {},
      onSettings: () => {},
      onToggle: () => {},
    });

    // Nothing to press, so nothing may be hidden — the panel is where the settings always were.
    expect(trigger()?.hidden).toBe(true);
    expect(panel()?.hidden).toBe(false);
  });
});

describe('what is inside', () => {
  it('holds the opponent, both preferences and the collection', () => {
    const host = mount();
    renderMenu(host, state({ open: true }), {
      onOpponent: () => {},
      onSettings: () => {},
      onToggle: () => {},
    });

    expect(host.querySelector('select.opponent-select')).not.toBeNull();
    expect(host.querySelector('#toggle-audio')).not.toBeNull();
    expect(host.querySelector('#toggle-motion')).not.toBeNull();
    expect(host.querySelector('.menu-note')?.textContent).toContain('12');
  });

  it('omits the opponent picker when the other seat is a person', () => {
    const host = mount();
    renderMenu(host, state({ open: true, showOpponent: false }), {
      onOpponent: () => {},
      onSettings: () => {},
      onToggle: () => {},
    });
    expect(host.querySelector('select.opponent-select')).toBeNull();
    expect(host.querySelector('#toggle-audio')).not.toBeNull();
  });

  it('still reports the preferences when the opponent is not a picker', () => {
    const host = mount();
    renderMenu(host, state({ showOpponent: false }), {
      onOpponent: () => {},
      onSettings: () => {},
      onToggle: () => {},
    });
    expect(host.querySelector('.menu-note')?.textContent).toContain('cards collected');
  });

  it('reports changes through the callbacks', () => {
    const host = mount();
    const settings: Partial<Settings>[] = [];
    const opponents: string[] = [];
    renderMenu(host, state({ open: true }), {
      onOpponent: (id) => opponents.push(id),
      onSettings: (patch) => settings.push(patch),
      onToggle: () => {},
    });

    const audio = host.querySelector<HTMLInputElement>('#toggle-audio');
    if (audio === null) throw new Error('no toggle');
    audio.checked = true;
    audio.dispatchEvent(new Event('change'));
    expect(settings).toEqual([{ audio: true }]);

    const select = host.querySelector<HTMLSelectElement>('select.opponent-select');
    if (select === null) throw new Error('no select');
    select.value = 'gil';
    select.dispatchEvent(new Event('change'));
    expect(opponents).toHaveLength(1);
  });
});

describe("the marker that keeps toolbar.ts's principle alive", () => {
  it('is off when both preferences are at their defaults', () => {
    expect(needsAttention(state())).toBe(false);
    expect(
      needsAttention(state({ settings: settings({ audio: false, reduceMotion: null }) })),
    ).toBe(false);
    expect(needsAttention(state({ settings: settings({ reduceMotion: false }) }))).toBe(false);
  });

  it('is on when either is off its default', () => {
    expect(needsAttention(state({ settings: settings({ audio: true }) }))).toBe(true);
    expect(needsAttention(state({ settings: settings({ reduceMotion: true }) }))).toBe(true);
  });

  it('reaches the button, so the state is visible without opening anything', () => {
    const host = mount();
    renderMenu(host, state({ settings: { reduceMotion: true } as Settings }), {
      onOpponent: () => {},
      onSettings: () => {},
      onToggle: () => {},
    });
    expect(trigger()?.classList.contains('is-marked')).toBe(true);
    // And the word on the button does not change, so the bar does not reflow as settings are toggled.
    expect(trigger()?.textContent).toBe('Settings');
  });
});
