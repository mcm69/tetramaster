/**
 * A layout probe: what the page actually measures, not what it was told to expect.
 *
 * ## Why this exists
 *
 * jsdom has no layout engine. `getBoundingClientRect()` returns zeros there, so no unit test in this
 * project can say whether the board fits on a phone — every sizing claim available to us has been
 * arithmetic by the author. That gap has already cost this codebase four bugs in a row (sound firing
 * at the end of the match, hotseat unwired, the computer playing hotseat's second seat, and an
 * animation system that had never rendered a frame), all in seams that headless tests could not see.
 *
 * This module measures the real thing in a real browser. It has two consumers, deliberately sharing
 * one implementation rather than two copies of the same arithmetic:
 *
 *  - `tools/viewport.ts` navigates with `?debug=layout` and reads `window.__layoutReport`.
 *  - a person on a real device opens the same URL and reads the overlay, which is the only honest
 *    check available for hardware-specific behaviour like safe areas and URL-bar collapse.
 *
 * ## What it deliberately does not do
 *
 * It does not assert. Stage M0 of `MOBILE.md` is a *measuring instrument*: today's layout does not
 * fit a phone, so anything that failed here would leave every later stage red for the wrong reason.
 * Assertions arrive with the gate at M9, once the layout is fixed.
 *
 * It is inert without the query parameter. `main.ts` calls `installLayoutProbe` unconditionally and
 * this returns immediately, so the cost of carrying it is one branch.
 */

/** A rectangle in CSS pixels, rounded so the output is stable and diffable. */
export interface ProbeRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly right: number;
  readonly bottom: number;
}

/** An interactive element small enough to be hard to hit with a thumb. */
export interface ProbeTarget {
  readonly label: string;
  readonly width: number;
  readonly height: number;
}

/** Two things painted on top of each other, which no amount of "is it on screen" can detect. */
export interface ProbeOverlap {
  readonly a: string;
  readonly b: string;
  /** How much they intersect, in CSS pixels squared. */
  readonly area: number;
}

export interface LayoutReport {
  /** The layout viewport: what the document believes it has. */
  readonly viewport: { readonly width: number; readonly height: number };
  /**
   * The *visible* viewport, which is smaller on a phone whenever the URL bar is showing. Null where
   * `visualViewport` is unsupported — which is itself worth knowing.
   */
  readonly visualViewport: { readonly width: number; readonly height: number } | null;
  readonly devicePixelRatio: number;
  readonly scrollWidth: number;
  readonly clientWidth: number;
  /** Positive when the document can be scrolled sideways. Should always be zero. */
  readonly horizontalOverflow: number;
  readonly board: ProbeRect | null;
  /** True when the board's whole rect is inside the visible viewport. */
  readonly boardFullyVisible: boolean;
  /** The hand tray, which has to be on screen with the board for a move to be playable. */
  readonly hand: ProbeRect | null;
  readonly handFullyVisible: boolean;
  /**
   * The two things a player needs at once. MOBILE.md stage M2 is defined by this pair being
   * visible without scrolling, which no earlier measurement could express.
   */
  readonly boardAndHandVisible: boolean;
  /** Vertical space consumed by everything that is not the board, in CSS pixels. */
  readonly chromeHeight: number;
  /** Interactive elements measured, and how many of them are under the touch minimum. */
  readonly interactive: number;
  readonly tooSmall: readonly ProbeTarget[];
  /**
   * Pairs of visible elements that overlap.
   *
   * Added after stage M2 shipped a page that the harness reported as entirely healthy while a
   * screenshot showed the board painted across the toolbar and the hand tray. Every measurement here
   * was *containment* — is this element inside the viewport — and every one of them was true. A page
   * can be entirely inside the viewport and still be visibly broken, so the probe now asks the other
   * question too.
   */
  readonly overlaps: readonly ProbeOverlap[];
}

/**
 * The elements whose positions matter to each other, by selector.
 *
 * Deliberately a short, fixed list rather than "everything": a full sweep would report every
 * legitimately-nested pair (a card's frame and its art) and bury the real answer in noise.
 */
const OVERLAP_WATCH: readonly { readonly selector: string; readonly label: string }[] = [
  { selector: '.board-slot', label: 'board slot' },
  // The canvas itself, not just its wrapper. The board overran *its own slot* and painted across
  // the toolbar, and a sibling-only watch list reported a clean page: the shrunken slot did not
  // intersect anything, because the thing escaping was its child.
  { selector: '#board', label: 'board canvas' },
  { selector: '#toolbar', label: 'toolbar' },
  { selector: '.toolbar', label: 'controls' },
  { selector: '.status', label: 'status' },
  { selector: '#hand', label: 'hand' },
  { selector: '.hint', label: 'hint' },
  { selector: '.keys', label: 'key legend' },
  { selector: '.mode-note', label: 'mode note' },
  { selector: '#picker:not([hidden])', label: 'battle picker' },
];

export interface ProbeOptions {
  /** The smallest an interactive target should be, in CSS pixels. */
  readonly minTarget?: number;
  /** Elements that should count as interactive. */
  readonly selector?: string;
}

/** The default touch-target floor. 44px is the smallest reliably hittable square on a phone. */
export const MIN_TARGET_PX = 44;

const DEFAULT_SELECTOR = 'button, select, input, a[href], [tabindex]:not([tabindex="-1"])';

/** Measures the layout. Pure with respect to the arguments: it reads, and changes nothing. */
export function collectLayout(
  doc: Document,
  view: Window,
  options: ProbeOptions = {},
): LayoutReport {
  const minTarget = options.minTarget ?? MIN_TARGET_PX;
  const selector = options.selector ?? DEFAULT_SELECTOR;

  const rectOf = (element: Element): ProbeRect => {
    const box = element.getBoundingClientRect();
    return {
      x: round(box.x),
      y: round(box.y),
      width: round(box.width),
      height: round(box.height),
      right: round(box.right),
      bottom: round(box.bottom),
    };
  };

  const canvas = doc.querySelector('#board');
  const board = canvas === null ? null : rectOf(canvas);
  const handElement = doc.querySelector('#hand');
  const hand = handElement === null ? null : rectOf(handElement);

  const visibleHeight = view.visualViewport?.height ?? view.innerHeight;
  const visibleWidth = view.visualViewport?.width ?? view.innerWidth;

  // A checkbox inside a `<label>` is measured by its label, not by the 13px box the browser draws.
  // Tapping the label toggles it, so the label is the target a thumb aims at — and counting the
  // bare input would make every preference toggle a permanent false positive in the M9 gate.
  const effective = (element: Element): Element => {
    if (element.tagName.toLowerCase() !== 'input') return element;
    const owner = element.closest('label');
    return owner ?? element;
  };

  const elements = [...doc.querySelectorAll(selector)];
  const tooSmall = elements
    .map((element) => ({ element: effective(element), box: rectOf(effective(element)) }))
    // Off-screen elements (a hidden panel's children) are not taps anyone can make.
    .filter(({ box }) => box.width > 0 && box.height > 0)
    .filter(({ box }) => box.width < minTarget || box.height < minTarget)
    .map(({ element, box }) => ({
      label: labelFor(element),
      width: box.width,
      height: box.height,
    }));

  // `body` is the scroller now (the viewport is `overflow: hidden`), and a documentElement's
  // scrollHeight says nothing about what is inside it. Measured the wrong way, a 1280x720 window
  // reported a page height of 720 while the hand tray sat 67px below the bottom edge.
  const scrollHeight = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight);
  const scrollWidth = Math.max(doc.documentElement.scrollWidth, doc.body.scrollWidth);

  // Overlap between the regions that are laid out as siblings. `#hand`'s children are excluded: they
  // are meant to sit inside it.
  const watched = OVERLAP_WATCH.map(({ selector, label }) => {
    const element = doc.querySelector(selector);
    const box = element === null ? null : rectOf(element);
    return {
      label,
      element,
      box: box === null || box.width === 0 || box.height === 0 ? null : box,
    };
  }).filter(
    (entry): entry is { label: string; element: Element; box: ProbeRect } => entry.box !== null,
  );

  const overlaps: ProbeOverlap[] = [];
  for (let i = 0; i < watched.length; i++) {
    for (let j = i + 1; j < watched.length; j++) {
      const first = watched[i] as { label: string; element: Element; box: ProbeRect };
      const second = watched[j] as { label: string; element: Element; box: ProbeRect };
      // The canvas lives inside the slot and always intersects it; that is containment, not
      // collision. Only *sibling* intersections are faults.
      if (first.element.contains(second.element) || second.element.contains(first.element)) {
        continue;
      }
      const w = Math.min(first.box.right, second.box.right) - Math.max(first.box.x, second.box.x);
      const h = Math.min(first.box.bottom, second.box.bottom) - Math.max(first.box.y, second.box.y);
      if (w > 1 && h > 1) {
        overlaps.push({ a: first.label, b: second.label, area: Math.round(w * h) });
      }
    }
  }

  return {
    viewport: { width: round(view.innerWidth), height: round(view.innerHeight) },
    // `visualViewport` is absent in some browsers and null-typed elsewhere; both mean "no".
    visualViewport:
      view.visualViewport === null
        ? null
        : {
            width: round(view.visualViewport.width),
            height: round(view.visualViewport.height),
          },
    devicePixelRatio: round(view.devicePixelRatio || 1),
    scrollWidth,
    clientWidth: doc.documentElement.clientWidth,
    horizontalOverflow: Math.max(0, scrollWidth - doc.documentElement.clientWidth),
    board,
    boardFullyVisible: within(board, visibleWidth, visibleHeight),
    hand,
    handFullyVisible: within(hand, visibleWidth, visibleHeight),
    boardAndHandVisible:
      within(board, visibleWidth, visibleHeight) && within(hand, visibleWidth, visibleHeight),
    chromeHeight: board === null ? scrollHeight : Math.max(0, scrollHeight - board.height),
    interactive: elements.length,
    tooSmall,
    overlaps,
  };
}

/** A short human name for an element, so a report names buttons rather than counting them. */
function labelFor(element: Element): string {
  const aria = element.getAttribute('aria-label');
  const id = element.id === '' ? '' : `#${element.id}`;
  const classes = element.getAttribute('class') ?? '';
  const name = element.getAttribute('name') ?? '';
  const tag = element.tagName.toLowerCase();
  const text = element.textContent.trim().replace(/\s+/g, ' ').slice(0, 28);
  const parts = [tag, id, classes.split(/\s+/).filter(Boolean).join('.'), name, aria, text];
  return parts.filter((part) => part !== '').join(' ');
}

/** True when the rect exists and lies wholly inside the visible viewport. */
function within(rect: ProbeRect | null, width: number, height: number): boolean {
  if (rect === null) return false;
  return (
    rect.y >= -1 && rect.bottom <= height + 1 && rect.width <= width + 1 && rect.right <= width + 1
  );
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Renders a report as the fixed lines `MOBILE-baseline.md` records. */
export function formatReport(report: LayoutReport): string[] {
  const lines: string[] = [];
  const vv = report.visualViewport;
  lines.push(
    `viewport ${report.viewport.width}x${report.viewport.height}` +
      (vv ? `  visual ${vv.width}x${vv.height}` : '  visualViewport: unsupported') +
      `  dpr ${report.devicePixelRatio}`,
  );
  lines.push(
    `scrollWidth ${report.scrollWidth} / clientWidth ${report.clientWidth}` +
      `  ->  sideways overflow ${report.horizontalOverflow}px`,
  );
  const board = report.board;
  lines.push(
    board === null
      ? 'board: NOT FOUND'
      : `board ${board.width}x${board.height} at (${board.x}, ${board.y})` +
          `  bottom ${board.bottom}  fully visible: ${report.boardFullyVisible ? 'yes' : 'NO'}`,
  );
  lines.push(
    `hand ${report.handFullyVisible ? 'visible' : 'BELOW THE FOLD'}` +
      `   board and hand together: ${report.boardAndHandVisible ? 'yes' : 'NO'}`,
  );
  const overlaps = report.overlaps;
  lines.push(
    overlaps.length === 0
      ? 'overlaps: none'
      : `overlaps: **${overlaps.length}**  ${overlaps.map((o) => `${o.a} / ${o.b} (${o.area}px²)`).join(', ')}`,
  );
  lines.push(`chrome ${report.chromeHeight}px (everything that is not the board)`);
  const tooSmall = report.tooSmall;
  lines.push(
    `targets under ${MIN_TARGET_PX}px: ${tooSmall.length} of ${report.interactive}` +
      (tooSmall.length === 0
        ? ''
        : `  ->  ${tooSmall.map((t) => `${t.label} ${t.width}x${t.height}`).join(', ')}`),
  );
  return lines;
}

/**
 * Installs the probe when `?debug=layout` is present, and does nothing otherwise.
 *
 * The report is published on `window.__layoutReport` for `tools/viewport.ts` to read, and drawn as an
 * overlay for a person holding the actual device — the URL bar, the notch and the home indicator are
 * three things no desktop browser will ever reproduce faithfully.
 */
export function installLayoutProbe(view: Window, doc: Document): void {
  if (!view.location.search.includes('debug=layout')) return;

  const overlay = doc.createElement('pre');
  overlay.id = 'layout-probe';
  overlay.setAttribute('aria-hidden', 'true');
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0 auto auto 0',
    zIndex: '9999',
    margin: '0',
    padding: '0.5rem',
    maxWidth: '100%',
    overflow: 'auto',
    maxHeight: '100vh',
    background: 'rgba(0,0,0,0.82)',
    color: '#9ef5b5',
    font: '11px/1.45 ui-monospace, Menlo, monospace',
    whiteSpace: 'pre-wrap',
    pointerEvents: 'none',
  } satisfies Partial<CSSStyleDeclaration>);

  const publish = (): void => {
    const report = collectLayout(doc, view);
    (view as unknown as { __layoutReport?: LayoutReport }).__layoutReport = report;
    overlay.textContent = formatReport(report).join('\n');
  };

  doc.body.append(overlay);
  publish();

  // The toolbar and the hand tray are built by JavaScript after load, so a report taken at `load`
  // measured a page that did not exist yet: the first run of this tool found 2 controls on the page
  // because the other 11 had not been rendered. Anything that changes the layout — those renders,
  // a font arriving, the URL bar collapsing — re-measures, debounced to one per frame.
  let queued = false;
  const schedule = (): void => {
    if (queued) return;
    queued = true;
    view.requestAnimationFrame(() => {
      queued = false;
      publish();
    });
  };
  const observer = new MutationObserver(schedule);
  observer.observe(doc.body, { childList: true, subtree: true, attributes: true });
  // The URL bar collapsing and an orientation change both move the visible viewport without moving
  // `window.innerHeight` in a way a listener can trust, so re-measure on both.
  view.addEventListener('resize', schedule);
  view.addEventListener('orientationchange', schedule);
}
