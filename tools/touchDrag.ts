/**
 * Drives real touch gestures against the built game (MOBILE.md stage M6).
 *
 * Not a unit test and not part of `npm run verify`. `tools/viewport.ts` already serves `dist/` to
 * Playwright; this adds the one thing a headless suite structurally cannot do — dispatch genuine
 * touch input through CDP and watch what the board does.
 *
 * Pointer events synthesised from `page.evaluate` would prove nothing: that would test the handler
 * against events the test wrote itself, and not whether the *browser* sends them, in what order, or
 * whether a stray `click` follows a drag. Every check below failed at least once before it passed,
 * and the failures were the point.
 */
import { chromium, type CDPSession, type Page } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const DIST = join(process.cwd(), 'dist');
const MIME: Readonly<Record<string, string>> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.map': 'application/json',
};

const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname));
  const file = path === '/' ? join(DIST, 'index.html') : join(DIST, path);
  readFile(file)
    .then((body) => {
      res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    })
    // A missing file is a 404, not a crash: a tool that dies on an unrelated asset is a tool people
    // stop running.
    .catch(() => {
      res.writeHead(404).end('not found');
    });
});
await new Promise<void>((resolve) => server.listen(8171, resolve));

interface Point {
  x: number;
  y: number;
}

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  hasTouch: true,
  isMobile: true,
});
const page: Page = await context.newPage();
const cdp: CDPSession = await context.newCDPSession(page);
await page.goto('http://localhost:8171/');
await page.waitForSelector('#hand button.hand-card');

function send(
  type: 'touchStart' | 'touchMove' | 'touchEnd',
  points: readonly Point[] = [],
): Promise<unknown> {
  return cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p) => ({ ...p })) });
}

/** A finger down, a series of intermediate moves — a real drag is never one jump — then up. */
async function touchDrag(from: Point, to: Point, steps = 12): Promise<void> {
  await send('touchStart', [from]);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await send('touchMove', [{ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }]);
  }
  await send('touchEnd');
}

async function touchTap(at: Point): Promise<void> {
  await send('touchStart', [at]);
  await send('touchEnd');
}

interface Geometry {
  readonly card: Point;
  readonly cell: Point;
}

/** The centre of hand card `index` and of board cell `cell`, in client pixels. */
async function points(index: number, cell: number): Promise<Geometry> {
  return page.evaluate(
    ([i, c]: readonly [number, number]) => {
      const card = document.querySelectorAll('#hand .hand-card')[i];
      const canvas = document.querySelector<HTMLCanvasElement>('#board');
      if (card === undefined || canvas === null) throw new Error(`no card ${i} or no canvas`);
      const cr = card.getBoundingClientRect();
      const br = canvas.getBoundingClientRect();
      const size = br.width / 4;
      return {
        card: { x: cr.left + cr.width / 2, y: cr.top + cr.height / 2 },
        cell: {
          x: br.left + (c % 4) * size + size / 2,
          y: br.top + Math.floor(c / 4) * size + size / 2,
        },
      };
    },
    [index, cell] as const,
  );
}

/**
 * Which squares the board is currently painting as playable.
 *
 * Read from the rendered pixels rather than from the app's internals, so it asks the question a
 * player asks — "which squares look playable?" — and fails loudly if the highlight and the rules
 * ever disagree.
 */
async function legalCells(): Promise<number[]> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#board');
    if (canvas === null) throw new Error('no canvas');
    const ctx = canvas.getContext('2d');
    if (ctx === null) throw new Error('no 2d context');
    const size = canvas.width / 4;
    const found: number[] = [];
    for (let cell = 0; cell < 16; cell++) {
      const x = Math.floor((cell % 4) * size + size / 2);
      const y = Math.floor(Math.floor(cell / 4) * size + size / 2);
      const px = ctx.getImageData(x, y, 1, 1).data;
      const r = px[0] ?? 0;
      const g = px[1] ?? 0;
      const b = px[2] ?? 0;
      // `cellLegal` is #1f2a3d. Sampled with a tolerance because the square's centre can carry a card
      // drawn over it, and a test that breaks when the art moves is a test about the art.
      if (Math.abs(r - 0x1f) < 14 && Math.abs(g - 0x2a) < 14 && Math.abs(b - 0x3d) < 14)
        found.push(cell);
    }
    return found;
  });
}

/**
 * Polls until `read` returns something satisfying `done`, or gives up.
 *
 * Fixed sleeps are the wrong tool here and were the wrong tool twice: a placement starts an
 * animation, so the tray re-renders some frames later, and a test that samples too early sees the
 * *old* board and calls it a failure. Every wait below is on the thing being asserted.
 */
async function until<T>(
  read: () => Promise<T>,
  done: (value: T) => boolean,
  what: string,
): Promise<T> {
  const deadline = Date.now() + 5000;
  for (;;) {
    const value = await read();
    if (done(value)) return value;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await page.waitForTimeout(60);
  }
}

/**
 * Records every click the page sees, so a drag can be checked for the one it must not produce.
 *
 * There is no guard against a drag placing twice, because Chrome does not emit a compatibility
 * `click` once a touch has travelled past the slop threshold — so the follow-up the tap handler
 * would have double-counted never arrives. That is an assumption about browser behaviour, and this
 * turns it into a checked fact: if an engine ever does emit one, this fails and the guard gets
 * written for a reason rather than on suspicion.
 */
async function recordClicks(): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { __clicks: string[] }).__clicks = [];
    document.addEventListener(
      'click',
      (e) => {
        const el = e.target as Element | null;
        (window as unknown as { __clicks: string[] }).__clicks.push(el?.id || el?.className || '?');
      },
      true,
    );
  });
}

const clicksSince = (): Promise<string[]> =>
  page.evaluate(() => (window as unknown as { __clicks: string[] }).__clicks);

const handCount = (): Promise<number> => page.locator('#hand .hand-card').count();

/** Waits until the board has actually been painted — a fresh page is blank for a frame or two. */
const paintedBoard = (): Promise<number[]> =>
  until(legalCells, (cells) => cells.length > 0, 'the board to paint a playable square');
const pressed = (i: number): Promise<string | null> =>
  page.locator('#hand .hand-card').nth(i).getAttribute('aria-pressed');

const results: string[] = [];
const check = (name: string, pass: boolean, detail = ''): void => {
  results.push(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

/**
 * A clean board with the player's turn to move.
 *
 * Every section reloads. Placing a card ends the player's turn and hands it to the AI, so a section
 * that inherits the previous one's board spends its first few seconds waiting for the opponent
 * rather than testing the gesture — and one that waits can be waiting on the wrong thing without
 * saying so.
 */
async function freshBoard(): Promise<number[]> {
  await page.reload();
  await page.waitForSelector('#hand button.hand-card');
  return paintedBoard();
}

// ── 1. tap-tap, before any drag has been available ─────────────────────────────────────────────
let p = await points(0, 0);
await touchTap(p.card);
const picked = await until(
  () => pressed(0),
  (v) => v === 'true',
  'the card to be selected',
);
check('tap selects the card', picked === 'true');
check(
  'tap places nothing on its own',
  (await handCount()) === 5,
  `${await handCount()} cards in hand`,
);

p = await points(0, (await paintedBoard())[0] ?? 0);
await touchTap(p.cell);
const afterTapTap = await until(handCount, (n) => n === 4, 'the tray to lose a card');
check('tap-tap places a card', afterTapTap === 4, `${afterTapTap} cards in hand`);

// ── 2. the click recorder can record a click ───────────────────────────────────────────────────
// Checked first, on its own board, because "a drag emits no click" is equally satisfied by a
// recorder that never fires. If this fails, the drag check below proves nothing.
let legal = await freshBoard();
await recordClicks();
p = await points(0, legal[0] ?? 0);
await touchTap(p.card);
await until(
  () => pressed(0),
  (v) => v === 'true',
  'the card to be picked up',
);
const tapClicks = await clicksSince();
check(
  'a tap does emit a click, so the recorder works',
  tapClicks.length >= 1,
  tapClicks.length === 0
    ? 'nothing recorded — the drag check below is vacuous'
    : tapClicks.join(', '),
);

// ── 3. drag to a legal square places exactly one card ─────────────────────────────────────────
legal = await freshBoard();
check('the board paints some squares as playable', legal.length > 0, `cells ${legal.join(',')}`);
p = await points(0, legal[0] ?? 0);
const before = await handCount();
await recordClicks();
await touchDrag(p.card, p.cell);
const afterDrag = await until(handCount, (n) => n <= before - 1, 'the tray to lose a card');
check('drag places one card', afterDrag === before - 1, `${before} -> ${afterDrag} cards in hand`);
check(
  'drag did not also place via a stray click',
  afterDrag === before - 1,
  afterDrag === before - 2 ? 'lost two cards — a click followed the drag' : 'exactly one',
);
const strayClicks = await clicksSince();
check(
  'a touch drag emits no click at all',
  strayClicks.length === 0,
  strayClicks.length > 0 ? `clicked ${strayClicks.join(', ')}` : 'none',
);

// ── 4. dropping on a square that cannot take the card puts it back down ────────────────────────
legal = await freshBoard();
const blocked = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].find(
  (cell) => !legal.includes(cell),
);
check('some square is unplayable to aim at', blocked !== undefined, `cell ${String(blocked)}`);
if (blocked !== undefined) {
  const g = await points(0, blocked);
  await touchTap(g.card);
  await until(
    () => pressed(0),
    (v) => v === 'true',
    'the card to be picked up',
  );
  const heldBefore = await handCount();
  await touchDrag(g.card, g.cell);
  await until(
    () => pressed(0),
    (v) => v === 'false',
    'the dropped card to be put back down',
  );
  check('dropping on an unplayable square places nothing', (await handCount()) === heldBefore);
  // And the card is no longer held, so the next tap starts from a clean tray.
  check('dropping on an unplayable square puts the card down', (await pressed(0)) === 'false');
}

// ── 5. a press that never travels is still a tap ───────────────────────────────────────────────
legal = await freshBoard();
const g = await points(0, legal[0] ?? 0);
await touchTap(g.card);
await until(
  () => pressed(0),
  (v) => v === 'true',
  'the card to be picked up',
);
const held = await handCount();
await send('touchStart', [g.card]);
await send('touchMove', [{ x: g.card.x + 3, y: g.card.y - 2 }]);
await send('touchEnd');
// Three pixels of wobble. Nothing about the tray may change, and the card stays picked up.
await page.waitForTimeout(250);
check(
  'a 3px wobble is a tap, not a drag',
  (await handCount()) === held,
  `${await handCount()} cards`,
);
check('and it left the card selected', (await pressed(0)) === 'true');

console.log(results.join('\n'));
await browser.close();
server.close();
process.exit(results.some((line) => line.startsWith('FAIL')) ? 1 : 0);
