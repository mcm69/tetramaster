/**
 * Accessibility plumbing (PLAN.md §6, Stage 10).
 *
 * Three things live here, each of which is easy to get subtly wrong and awkward to test through the
 * DOM:
 *
 * **Reduced motion.** `prefers-reduced-motion` is not a one-time read. It can change while the page
 * is open — someone toggling the OS setting should not have to reload — so this exposes a watch.
 * Note what it controls: *animation only*. Nothing here disables the arena's own logic, because
 * reduced motion means "do not make me move things", not "remove the feature".
 *
 * **Announcements.** The board is a canvas, which is opaque to a screen reader, so the turn and the
 * result have to be mirrored into a live region. Two details matter and are easy to lose: the region
 * must already exist in the DOM before the first update, or the reader never registers it, and
 * identical consecutive text must still be announced — so an incrementing counter is appended and
 * then stripped, which forces a change without changing the words.
 *
 * **Ownership without colour.** Colour-blind players cannot tell the two sides apart by tint. The
 * renderer already draws a distinct corner shape per seat (§7); this module owns the matching text
 * so a screen-reader user gets the same distinction, and there is one source of truth for the label.
 */

import type { Owner } from '../core/types.ts';

export type MotionListener = (reduced: boolean) => void;

const QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Whether the player has asked for reduced motion.
 *
 * Returns false where `matchMedia` is missing — Node, and older browsers — so callers need no guard.
 */
export function prefersReducedMotion(): boolean {
  return matchReducedMotion()?.matches === true;
}

/** `matchMedia` where it exists, null where it does not — Node, and very old browsers. */
function matchReducedMotion(): MediaQueryList | null {
  return matchQuery(QUERY);
}

/**
 * `matchMedia` for an arbitrary query, or null where it is unavailable.
 *
 * Exported because `main.ts` needs the same question answered for the layout breakpoint, and jsdom
 * has no `matchMedia` at all — so a second hand-rolled guard would be a second place to get it wrong.
 */
export function matchQuery(query: string): MediaQueryList | null {
  try {
    return (
      (globalThis as { matchMedia?: (q: string) => MediaQueryList }).matchMedia?.(query) ?? null
    );
  } catch {
    return null;
  }
}

/**
 * Watches the preference and calls back immediately and on every change.
 *
 * Returns an unsubscribe function. `MediaQueryList.addEventListener` has been the API since Safari
 * 14; where it is missing the preference is still read once, which is the part that matters — the
 * game just will not notice the setting changing mid-session.
 */
export function watchReducedMotion(listener: MotionListener): () => void {
  const query = matchReducedMotion();
  if (query === null) return () => {};

  const handler = (event: MediaQueryListEvent): void => {
    listener(event.matches);
  };
  listener(query.matches);

  if (typeof query.addEventListener !== 'function') return () => {};
  query.addEventListener('change', handler);
  return () => {
    query.removeEventListener('change', handler);
  };
}

/**
 * Writes to an `aria-live` region in a way that is actually read out.
 *
 * The region must exist before the first call. Repeating the same string is otherwise treated as no
 * change and silently dropped, which matters for a turn counter that says the same thing twice.
 */
export class Announcer {
  private last = '';
  private nonce = 0;
  private readonly region: HTMLElement;

  constructor(region: HTMLElement) {
    this.region = region;
  }

  /** Announces `text`, forcing a re-read even when it matches the previous message. */
  say(text: string): void {
    if (text === this.last) {
      // A zero-width space is invisible and reads as nothing, but it makes the string differ so the
      // live region registers a change rather than treating it as a no-op.
      this.nonce += 1;
      this.region.textContent = text + String.fromCharCode(0x200b).repeat(this.nonce % 2);
      return;
    }
    this.last = text;
    this.nonce = 0;
    this.region.textContent = text;
  }
}

/** The seat names a player sees and hears. Deliberately not "P1"/"P2". */
export const SEAT_LABEL: Readonly<Record<Owner, string>> = {
  player: 'Player 1',
  ai: 'Player 2',
};

/** What the two seats are called in the current mode. */
export function seatLabels(opponentIsComputer: boolean): Record<Owner, string> {
  return opponentIsComputer
    ? { player: 'You', ai: 'Opponent' }
    : { player: SEAT_LABEL.player, ai: SEAT_LABEL.ai };
}

/**
 * A one-line description of the board for a screen reader.
 *
 * Sixteen cells is small enough to read out whole, and doing so is the difference between a usable
 * board and a decorative rectangle. Blocked cells and empty cells are named explicitly rather than
 * left blank, so the count is unambiguous.
 */
export function boardDescription(
  cells: readonly ({ readonly owner: Owner; readonly name: string } | null)[],
  blocked: readonly boolean[],
  labels: Record<Owner, string>,
): string {
  const owned = cells
    .map((card, index) => (card === null ? null : { index, owner: card.owner, name: card.name }))
    .filter((entry): entry is { index: number; owner: Owner; name: string } => entry !== null);

  if (owned.length === 0) return 'The board is empty.';

  const counts = new Map<Owner, number>();
  for (const card of owned) counts.set(card.owner, (counts.get(card.owner) ?? 0) + 1);
  const tally = [...counts].map(([owner, count]) => `${labels[owner]} ${count}`).join(', ');

  const blockedCount = blocked.filter(Boolean).length;
  const blockedNote = blockedCount === 0 ? '' : ` ${blockedCount} cells blocked.`;
  return `${tally}.${blockedNote}`;
}
