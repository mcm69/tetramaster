/**
 * Viewport measurement (MOBILE.md, stage M0).
 *
 * ## What this is
 *
 * A measuring instrument, not a gate. It opens the built page in a real browser at a matrix of device
 * sizes and writes down what the layout actually does — board size, whether it fits, how much
 * sideways overflow there is, how tall the chrome around the board is, and which controls are too
 * small to hit with a thumb. The output is `MOBILE-baseline.md`.
 *
 * ## Why it does not fail
 *
 * Today's layout does not fit on a phone: `MIN_VIEWPORT` floors the board at 420×420 CSS px, so it
 * overflows anything narrower. A tool that asserted would therefore be red on arrival and would stay
 * red for reasons that have nothing to do with whichever stage is being worked on. Assertions arrive
 * with the gate at M9, once the layout is fixed. Until then this reports and exits 0.
 *
 * ## Why it reads the app's own probe
 *
 * `page.evaluate` cannot import from `src/`, so a self-contained copy of the measurement would be a
 * second implementation that could disagree with the first. Instead the page publishes its report on
 * `window.__layoutReport` (see `src/ui/layoutProbe.ts`) and this only reads it. One implementation,
 * used by the tool and by a person holding a real device.
 */

import { existsSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium, devices, type Browser } from 'playwright';
import { MIN_TARGET_PX, type LayoutReport } from '../src/ui/layoutProbe.ts';

const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');
const OUT = join(ROOT, 'MOBILE-baseline.md');
const PORT = 8123;

/**
 * The matrix. Portrait phones first, because portrait is the design target (MOBILE.md §2), then
 * landscape and tablet, then desktop so the change cannot quietly regress what already works.
 *
 * `iphone` is used only for its touch/dpr characteristics; the viewport is set explicitly so the
 * numbers are comparable row to row.
 */
interface Viewport {
  readonly label: string;
  readonly width: number;
  readonly height: number;
  readonly touch: boolean;
  readonly dpr: number;
}

const MATRIX: readonly Viewport[] = [
  { label: 'iPhone SE (1st gen)', width: 320, height: 568, touch: true, dpr: 2 },
  { label: 'small Android', width: 360, height: 640, touch: true, dpr: 3 },
  { label: 'iPhone SE (2nd/3rd)', width: 375, height: 667, touch: true, dpr: 2 },
  { label: 'iPhone 12/13/14', width: 390, height: 844, touch: true, dpr: 3 },
  { label: 'iPhone XR/11', width: 414, height: 896, touch: true, dpr: 2 },
  { label: 'phone landscape', width: 844, height: 390, touch: true, dpr: 3 },
  { label: 'iPad portrait', width: 768, height: 1024, touch: true, dpr: 2 },
  { label: 'laptop', width: 1280, height: 720, touch: false, dpr: 1 },
  { label: 'desktop', width: 1440, height: 900, touch: false, dpr: 2 },
];

/** Playwright device names, used for `userAgent` so touch-specific behaviour is realistic. */
const UA_FOR: Readonly<Record<string, keyof typeof devices>> = {
  'phone landscape': 'iPhone 13',
};

const MIME: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.map': 'application/json',
  '.json': 'application/json',
};

/** A static server for `dist/`. Small enough to keep the tool dependency-free apart from Playwright. */
function serveDist(): Promise<Server> {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    // `normalize` plus the prefix check keeps `..` from escaping `dist/`.
    const relative = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    let file = join(DIST, relative);
    if (!file.startsWith(DIST)) {
      response.writeHead(403).end('forbidden');
      return;
    }
    if (relative === '/' || !existsSync(file)) file = join(DIST, 'index.html');
    void readFile(file)
      .then((body) => {
        response.writeHead(200, {
          'content-type': MIME[extname(file)] ?? 'application/octet-stream',
        });
        response.end(body);
      })
      .catch(() => {
        response.writeHead(404).end('not found');
      });
  });
  return new Promise((resolve) => {
    server.listen(PORT, () => {
      resolve(server);
    });
  });
}

interface Row {
  readonly viewport: Viewport;
  readonly report: LayoutReport | null;
  readonly failure: string | null;
}

async function measure(browser: Browser, viewport: Viewport): Promise<Row> {
  const device = UA_FOR[viewport.label];
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.dpr,
    hasTouch: viewport.touch,
    // Deliberately NOT `isMobile: true`.
    //
    // With mobile emulation on, Chromium honours `width=device-width` and then *expands the layout
    // viewport to absorb overflowing content*: asked for 320px it reported 370, and the 50px of
    // overflow it absorbed never appeared in the measurement. That is precisely the overflow this
    // tool exists to find, so the emulation was hiding the thing it was installed to look for.
    // `hasTouch` alone keeps touch events real; the layout being measured is ordinary CSS.
    isMobile: false,
    userAgent: device === undefined ? undefined : devices[device]?.userAgent,
  });
  try {
    const page = await context.newPage();
    const problems: string[] = [];
    page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));
    await page.goto(`http://localhost:${PORT}/?debug=layout`, { waitUntil: 'load' });
    // Wait for the parts of the page that JavaScript builds. Without this the tool measures a page
    // that has not finished rendering, which reported 2 controls on the first run.
    await page.waitForSelector('#hand button.hand-card', { timeout: 10_000 });
    await page.waitForSelector('#toolbar .mode-button', { timeout: 10_000 });
    await page.waitForFunction(
      (minimum) => {
        const report = (globalThis as unknown as { __layoutReport?: { interactive?: number } })
          .__layoutReport;
        return report !== undefined && (report.interactive ?? 0) >= minimum;
      },
      8,
      { timeout: 10_000 },
    );
    const report = await page.evaluate<LayoutReport | null>(() => {
      return (globalThis as unknown as { __layoutReport?: LayoutReport }).__layoutReport ?? null;
    });
    return { viewport, report, failure: problems.length > 0 ? problems.join('; ') : null };
  } catch (error) {
    return {
      viewport,
      report: null,
      failure: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await context.close();
  }
}

function summarise(rows: readonly Row[]): string[] {
  const lines: string[] = [];
  for (const row of rows) {
    const { viewport, failure } = row;
    const r = row.report;
    const head = `## ${viewport.label} — ${viewport.width}×${viewport.height}${viewport.touch ? ' (touch)' : ''}`;
    lines.push(head, '');
    if (r === null) {
      lines.push(`**Could not measure.** ${failure ?? 'unknown error'}`, '');
      continue;
    }
    const board = r.board;
    const tooSmall = r.tooSmall;
    lines.push(
      '| | |',
      '|---|---|',
      `| requested viewport | ${viewport.width}×${viewport.height} |`,
      // `window.innerWidth` is not the requested width once content overflows, and the difference is
      // exactly the kind of thing this tool exists to notice. Both numbers, always.
      `| reported viewport | ${r.viewport.width}×${r.viewport.height} |`,
      `| board | ${board === null ? '**not found**' : `${board.width}×${board.height} at (${board.x}, ${board.y})`} |`,
      `| fully visible | ${r.boardFullyVisible ? 'yes' : '**NO**'} |`,
      `| hand tray | ${r.hand === null ? '**not found**' : `${r.hand.width}×${r.hand.height} at (${r.hand.x}, ${r.hand.y})`} |`,
      `| hand visible | ${r.handFullyVisible ? 'yes' : '**NO**'} |`,
      `| board and hand together | ${r.boardAndHandVisible ? 'yes' : '**NO**'} |`,
      `| sideways overflow | ${r.horizontalOverflow === 0 ? 'none' : `**${r.horizontalOverflow}px**`} |`,
      `| chrome (everything but the board) | ${r.chromeHeight}px |`,
      `| page height | ${r.viewport.height}${r.pageOverflowPx > 0 ? ` — **${r.pageOverflowPx}px taller than the screen**` : ' — fits vertically'} |`,
      `| overlapping regions | ${r.overlaps.length === 0 ? 'none' : `**${r.overlaps.map((o) => `${o.a} / ${o.b} (${o.area}px²)`).join(', ')}**`} |`,
      `| targets under ${MIN_TARGET_PX}px | ${tooSmall.length} of ${r.interactive} |`,
      `| board touch-action | ${r.touch.boardTouchAction} |`,
      `| hand touch-action | ${r.touch.handTouchAction} |`,
      `| prose selectable | ${r.touch.proseSelectable ? 'yes' : '**no**'} |`,
      '',
    );
    if (tooSmall.length > 0) {
      lines.push('Controls too small to tap comfortably:', '');
      for (const target of tooSmall) {
        lines.push(`- \`${target.label}\` — ${target.width}×${target.height}`);
      }
      lines.push('');
    }
    if (failure !== null) lines.push(`Page errors: ${failure}`, '');
  }
  return lines;
}

/** The headline facts, so the summary at the top of the document is readable without scrolling. */
function verdicts(rows: readonly Row[]): string[] {
  return rows.map((row) => {
    const name = `${row.viewport.label} (${row.viewport.width}×${row.viewport.height})`;
    if (row.report === null)
      return `- **${name}** — could not measure: ${row.failure ?? 'unknown'}`;
    const r = row.report;
    const faults: string[] = [];
    if (r.pageOverflowPx > 0) faults.push(`page ${r.pageOverflowPx}px too tall`);
    if (!r.boardFullyVisible) faults.push('board not fully visible');
    if (!r.handFullyVisible) faults.push('hand tray below the fold');
    else if (!r.boardAndHandVisible) faults.push('board and hand not visible together');
    if (r.horizontalOverflow > 0) faults.push(`${r.horizontalOverflow}px sideways overflow`);
    if (r.tooSmall.length > 0)
      faults.push(`${r.tooSmall.length} control(s) under ${MIN_TARGET_PX}px`);
    if (r.overlaps.length > 0)
      faults.push(
        `${r.overlaps.length} overlapping region(s): ${r.overlaps.map((o) => `${o.a}/${o.b}`).join(', ')}`,
      );
    if (r.touch.boardTouchAction === 'none') faults.push('board blocks pinch-zoom');
    if (r.touch.handTouchAction !== 'none')
      faults.push('hand cards allow panning, so a drag would scroll the page');
    if (r.touch.controlsSelectable) faults.push('controls are text-selectable');
    if (!r.touch.proseSelectable) faults.push('the rules screen is not selectable');
    return faults.length === 0 ? `- **${name}** — fits.` : `- **${name}** — ${faults.join(', ')}.`;
  });
}

function render(rows: readonly Row[]): string {
  return [
    '# Mobile baseline',
    '',
    '<!-- Generated by `npm run viewport` (MOBILE.md, stage M0). Do not edit by hand. -->',
    '',
    `Touch-target floor: ${MIN_TARGET_PX}px. Generated against \`dist/\`, so run \`npm run build\` first`,
    'if the source has changed.',
    '',
    'This file is a **measurement**, not a pass/fail gate — the layout is known not to fit yet, and a',
    'gate would be red for the wrong reason at every stage. See MOBILE.md stage M9.',
    '',
    '## Summary',
    '',
    ...verdicts(rows),
    '',
    '## Detail',
    '',
    ...summarise(rows),
  ].join('\n');
}

async function main(): Promise<void> {
  if (!existsSync(join(DIST, 'index.html'))) {
    process.stderr.write('dist/index.html is missing. Run `npm run build` first.\n');
    process.exit(1);
  }

  const server = await serveDist();
  const browser = await chromium.launch();
  let rows: Row[];
  try {
    rows = [];
    for (const viewport of MATRIX) rows.push(await measure(browser, viewport));
  } finally {
    await browser.close();
    server.close();
  }

  writeFileSync(OUT, `${render(rows)}\n`);
  process.stdout.write(`${formatReport(rows[0]?.report ?? null)}\n`);
  process.stdout.write(`\nWrote ${OUT}\n`);
  for (const line of verdicts(rows)) process.stdout.write(`${line}\n`);
}

function formatReport(report: LayoutReport | null): string {
  if (report === null) return 'no measurements';
  const board = report.board;
  return [
    `viewport ${report.viewport.width}x${report.viewport.height} dpr ${report.devicePixelRatio}`,
    `board ${board === null ? 'not found' : `${board.width}x${board.height}`}`,
    `visible: ${report.boardFullyVisible ? 'yes' : 'NO'}  overflow: ${report.horizontalOverflow}px`,
  ].join('  |  ');
}

await main();
