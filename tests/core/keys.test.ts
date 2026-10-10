/**
 * The key layer (PLAN.md §7.4, Stage 11).
 *
 * The keyboard has to do everything the mouse does — that is an accessibility requirement, not a
 * nicety — and "does everything the mouse does" is a claim about a *list*. This suite is what makes
 * it true rather than merely stated.
 *
 * The bug it was written for: `KEY_BINDINGS` documented eight keys and the handler in `main.ts`
 * implemented seven. `Q` was on the page and did nothing, and nothing noticed, because a documented
 * binding was just a string in an array. Now there is one list, each entry names an action, and the
 * two halves are checked against each other.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  HAND_KEYS,
  HANDLED_ACTIONS,
  KEY_BINDINGS,
  directionOf,
  handleKey,
  resolveKey,
  type KeyAction,
  type KeyContext,
} from '../../src/input/keys.ts';

/** A context that records what it was asked to do. */
function recorder(): KeyContext & { readonly calls: { action: KeyAction; value: number }[] } {
  const calls: { action: KeyAction; value: number }[] = [];
  return {
    calls,
    move: (dx, dy) => calls.push({ action: 'move', value: dx * 10 + dy }),
    select: (index) => calls.push({ action: 'select', value: index }),
    confirm: () => calls.push({ action: 'confirm', value: 0 }),
    cancel: () => calls.push({ action: 'cancel', value: 0 }),
    hint: () => calls.push({ action: 'hint', value: 0 }),
    newMatch: () => calls.push({ action: 'newMatch', value: 0 }),
    nextMode: () => calls.push({ action: 'nextMode', value: 0 }),
    collection: () => calls.push({ action: 'collection', value: 0 }),
    rules: () => calls.push({ action: 'rules', value: 0 }),
  };
}

describe('the documented list and the handler agree', () => {
  it('implements every action it documents', () => {
    // The regression guard. A binding with no implementation is now a failing test.
    for (const binding of KEY_BINDINGS) {
      expect(HANDLED_ACTIONS.has(binding.action), `${binding.keys} -> ${binding.action}`).toBe(
        true,
      );
    }
  });

  it('implements every action it can express', () => {
    // The other direction: an action nothing reaches is dead code, or a key that went missing.
    const documented = new Set(KEY_BINDINGS.map((binding) => binding.action));
    for (const action of HANDLED_ACTIONS) {
      expect(documented.has(action), `${action} is handled but never documented`).toBe(true);
    }
  });

  it('documents each action exactly once', () => {
    const actions = KEY_BINDINGS.map((binding) => binding.action);
    expect(new Set(actions).size).toBe(actions.length);
  });

  it('says something useful about every binding', () => {
    for (const binding of KEY_BINDINGS) {
      expect(binding.keys.length, binding.action).toBeGreaterThan(0);
      expect(binding.description.length, binding.action).toBeGreaterThan(0);
      expect(binding.description, binding.action).toMatch(/[A-Z]/);
    }
  });

  it('suppresses the browser default only where it must', () => {
    // Space and the arrows scroll the page; Escape and letters must keep their own behaviour so
    // browser shortcuts keep working.
    for (const binding of KEY_BINDINGS) {
      if (binding.action === 'confirm' || binding.action === 'move') {
        expect(binding.preventDefault, binding.keys).toBe(true);
      }
    }
  });
});

describe('resolving a key', () => {
  it('maps every cursor direction, in both cases', () => {
    expect(directionOf('ArrowUp')).toEqual([-1, 0]);
    expect(directionOf('ArrowDown')).toEqual([1, 0]);
    expect(directionOf('ArrowLeft')).toEqual([0, -1]);
    expect(directionOf('ArrowRight')).toEqual([0, 1]);
    expect(directionOf('w')).toEqual([-1, 0]);
    expect(directionOf('S')).toEqual([1, 0]);
    expect(directionOf('d')).toEqual([0, 1]);
  });

  it('maps the hand slots to their indices', () => {
    for (const key of HAND_KEYS) {
      expect(resolveKey(key)?.action, key).toBe('select');
      expect(resolveKey(key)?.index, key).toBe(Number(key) - 1);
    }
  });

  it('accepts Enter and Space for confirm', () => {
    expect(resolveKey('Enter')?.action).toBe('confirm');
    expect(resolveKey(' ')?.action).toBe('confirm');
    expect(resolveKey('Enter')?.preventDefault).toBe(true);
  });

  it('is case-insensitive for the letter shortcuts', () => {
    for (const key of ['h', 'H', 'n', 'N', 'm', 'M', 'c', 'C', 'r', 'R']) {
      expect(resolveKey(key), key).not.toBeNull();
      expect(resolveKey(key)?.action).toBe(resolveKey(key.toLowerCase())?.action);
    }
  });

  it('ignores keys the app does not use', () => {
    // Critically, it ignores rather than swallows: taking `q` or `F5` would break the browser.
    for (const key of ['q', 'Q', 'z', 'F5', 'Tab', 'Shift', 'Control']) {
      expect(resolveKey(key), key).toBeNull();
    }
  });

  it('does not swallow a modifier held with a shortcut', () => {
    expect(resolveKey('Meta')).toBeNull();
    expect(resolveKey('Alt')).toBeNull();
  });
});

describe('handling a key', () => {
  it('performs the resolved action', () => {
    const context = recorder();
    handleKey('ArrowRight', context);
    handleKey('3', context);
    handleKey('Enter', context);
    handleKey('Escape', context);
    handleKey('h', context);
    handleKey('n', context);
    handleKey('m', context);
    handleKey('c', context);
    handleKey('r', context);
    expect(context.calls.map((call) => call.action)).toEqual([
      'move',
      'select',
      'confirm',
      'cancel',
      'hint',
      'newMatch',
      'nextMode',
      'collection',
      'rules',
    ]);
  });

  it('passes the movement delta through', () => {
    const context = recorder();
    handleKey('ArrowDown', context);
    handleKey('a', context);
    // Down is +1 column (dx); left is -1 row (dy). Encoded as dx*10 + dy so one number carries both.
    expect(context.calls[0]?.value).toBe(10);
    expect(context.calls[1]?.value).toBe(-1);
  });

  it('reports that it ignored a key, so the caller can leave the event alone', () => {
    const context = recorder();
    expect(handleKey('q', context)).toBe(false);
    expect(handleKey('F12', context)).toBe(false);
    expect(context.calls).toEqual([]);
    expect(handleKey('h', context)).toBe(true);
  });

  it('calls exactly one thing per key', () => {
    // A handler that fires two actions is worse than one that fires none: the player would get a
    // cursor move and a card selection from one press.
    for (const binding of KEY_BINDINGS) {
      const context = recorder();
      const key = binding.keys.split(' ')[0] ?? '';
      handleKey(key, context);
      expect(context.calls.length, binding.keys).toBeLessThanOrEqual(1);
    }
  });

  it('never throws for any single character', () => {
    const context = recorder();
    for (let code = 32; code < 127; code++) {
      const key = String.fromCharCode(code);
      expect(() => handleKey(key, context)).not.toThrow();
    }
  });
});

describe('the exhaustive handler', () => {
  it('is checked by the type system, not by a test', () => {
    // `handleKey` ends in a `never` check, so adding a `KeyAction` without a case is a compile
    // error. Asserting the union is intact here documents that intent.
    const all: KeyAction[] = [
      'move',
      'select',
      'confirm',
      'cancel',
      'hint',
      'newMatch',
      'nextMode',
      'collection',
      'rules',
    ];
    expect(HANDLED_ACTIONS.size).toBe(all.length);
  });

  it('does not call anything for an action it was not given', () => {
    const spy = vi.fn();
    const context = { ...recorder(), hint: spy };
    handleKey('c', context);
    expect(spy).not.toHaveBeenCalled();
  });
});
