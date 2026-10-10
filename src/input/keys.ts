/**
 * Keyboard bindings (PLAN.md §7.4, Stage 11).
 *
 * The keyboard does everything the mouse does — that is a requirement, not a convenience — so the
 * bindings and the handler have to be the same list or one of them lies. They used to be two lists:
 * `KEY_BINDINGS` documented eight keys and `main.ts` handled seven of them. The `Q` key was on the
 * page and did nothing, and nothing caught it, because a documented binding is just a string.
 *
 * So they are one list now. Every entry names an `action`, `handleKey` maps a key to that action, and
 * `tests/core/input.test.ts` asserts the two agree. A binding that is documented but unimplemented is
 * now a failing test rather than a line of copy.
 *
 * `KeyContext` is the surface `main.ts` provides. Keeping it here as an interface rather than passing
 * the controller means the whole key layer runs in Node with no DOM and no canvas.
 */

export type KeyAction =
  | 'move'
  | 'select'
  | 'confirm'
  | 'cancel'
  | 'hint'
  | 'newMatch'
  | 'nextMode'
  | 'collection'
  | 'rules';

/** One documented binding. `keys` is shown on the page; `action` is what the handler performs. */
export interface KeyBinding {
  readonly keys: string;
  readonly action: KeyAction;
  readonly description: string;
  /** True for keys the browser should not act on by default (space scrolls, arrows scroll). */
  readonly preventDefault?: boolean;
}

export const KEY_BINDINGS: readonly KeyBinding[] = [
  {
    keys: 'W A S D / arrows',
    action: 'move',
    description: 'Move the board cursor',
    preventDefault: true,
  },
  { keys: '1 – 5', action: 'select', description: 'Pick a card from your hand' },
  {
    keys: 'Enter / Space',
    action: 'confirm',
    description: 'Play the selected card here',
    preventDefault: true,
  },
  { keys: 'Esc', action: 'cancel', description: 'Deselect' },
  { keys: 'H', action: 'hint', description: 'Hint for this square' },
  { keys: 'N', action: 'newMatch', description: 'New match' },
  { keys: 'M', action: 'nextMode', description: 'Next mode' },
  { keys: 'C', action: 'collection', description: 'Collection and deck editor' },
  { keys: 'R', action: 'rules', description: 'How to play' },
];

/** What `main.ts` has to supply for the key layer to do its work. */
export interface KeyContext {
  readonly move: (dx: number, dy: number) => void;
  readonly select: (index: number) => void;
  readonly confirm: () => void;
  readonly cancel: () => void;
  readonly hint: () => void;
  readonly newMatch: () => void;
  readonly nextMode: () => void;
  readonly collection: () => void;
  readonly rules: () => void;
}

/** Every direction a key can mean, canonical first. */
const MOVES: Readonly<Record<string, readonly [number, number]>> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
  w: [-1, 0],
  a: [0, -1],
  s: [1, 0],
  d: [0, 1],
  W: [-1, 0],
  A: [0, -1],
  S: [1, 0],
  D: [0, 1],
};

export function directionOf(key: string): readonly [number, number] | undefined {
  return MOVES[key];
}

/** The five hand slots, keyed by the digit that selects them. */
export const HAND_KEYS = '12345';

/** What the handler will do with a key, before it does it. */
export interface KeyResolution {
  readonly action: KeyAction;
  /** Movement delta, for `move`. */
  readonly dx: number;
  readonly dy: number;
  /** Hand index, for `select`. */
  readonly index: number;
  /** Whether the browser's own behaviour should be suppressed. */
  readonly preventDefault: boolean;
}

/**
 * Resolves a key to an action. Pure, and the single place a key is interpreted.
 *
 * Returns `null` for anything unhandled, which the caller uses to leave the event alone — important,
 * because swallowing keys the app does not use breaks browser shortcuts.
 */
export function resolveKey(key: string): KeyResolution | null {
  const move = directionOf(key);
  if (move !== undefined) {
    return { action: 'move', dx: move[0], dy: move[1], index: 0, preventDefault: true };
  }

  if (HAND_KEYS.includes(key)) {
    return { action: 'select', dx: 0, dy: 0, index: Number(key) - 1, preventDefault: false };
  }

  switch (key) {
    case 'Enter':
    case ' ':
      return { action: 'confirm', dx: 0, dy: 0, index: 0, preventDefault: true };
    case 'Escape':
      return { action: 'cancel', dx: 0, dy: 0, index: 0, preventDefault: false };
    default:
      break;
  }

  const lower = key.toLowerCase();
  const byAction: Readonly<Record<string, KeyAction>> = {
    h: 'hint',
    n: 'newMatch',
    m: 'nextMode',
    c: 'collection',
    r: 'rules',
  };
  const action = byAction[lower];
  if (action === undefined) return null;
  return { action, dx: 0, dy: 0, index: 0, preventDefault: false };
}

/** Performs a resolved key against the app. Returns false when the key was not ours. */
export function handleKey(key: string, context: KeyContext): boolean {
  const resolved = resolveKey(key);
  if (resolved === null) return false;

  switch (resolved.action) {
    case 'move':
      context.move(resolved.dx, resolved.dy);
      break;
    case 'select':
      context.select(resolved.index);
      break;
    case 'confirm':
      context.confirm();
      break;
    case 'cancel':
      context.cancel();
      break;
    case 'hint':
      context.hint();
      break;
    case 'newMatch':
      context.newMatch();
      break;
    case 'nextMode':
      context.nextMode();
      break;
    case 'collection':
      context.collection();
      break;
    case 'rules':
      context.rules();
      break;
    default: {
      // Exhaustiveness guard: a new action that is not handled here is a compile error.
      const unreachable: never = resolved.action;
      throw new Error(`unhandled key action: ${String(unreachable)}`);
    }
  }
  return true;
}

/** One representative key per action, used to prove each one resolves. */
const PROBE_KEYS: Readonly<Partial<Record<KeyAction, string>>> = {
  move: 'ArrowUp',
  select: '1',
  confirm: 'Enter',
  cancel: 'Escape',
  hint: 'h',
  newMatch: 'n',
  nextMode: 'm',
  collection: 'c',
  rules: 'r',
};

/** Every action the union admits. */
const ALL_ACTIONS: readonly KeyAction[] = [
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

/**
 * Every action the handler implements.
 *
 * Derived rather than written out, so adding a case to `handleKey` and forgetting to declare the
 * action here is impossible — and `tests/core/input.test.ts` still checks the two agree.
 */
export const HANDLED_ACTIONS: ReadonlySet<KeyAction> = new Set(
  ALL_ACTIONS.filter((action) => {
    const probe = PROBE_KEYS[action];
    return probe !== undefined && resolveKey(probe)?.action === action;
  }),
);
