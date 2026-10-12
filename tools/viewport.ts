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

import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium, devices, type Browser } from 'playwright';
import {
  MIN_TARGET_PX,
  type LayoutReport,
  type Screen as ProbeScreen,
} from '../src/ui/layoutProbe.ts';
import { checkLayout } from './layoutGate.ts';

const ROOT = process.cwd();
/** `--check` turns the report into a gate. The measurements and the written file are identical. */
const CHECK = process.argv.includes('--check');

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
  // The tightest landscape phone there is: 667x375 leaves the board and the side column barely
  // 390px between them, and is where the mode buttons first come close to wrapping.
  { label: 'small landscape', width: 667, height: 375, touch: true, dpr: 2 },
  // A landscape phone with a keyboard or a split view open. This is the size that catches the
  // landscape board overrunning its row: at 320px tall the chrome leaves the board less room than
  // the width budget allows, and without the `aspect-ratio` backstop the canvas paints over the
  // status line. It is in the matrix because two separate mutations survived every other size.
  { label: 'short landscape', width: 812, height: 320, touch: true, dpr: 3 },
  { label: 'iPad portrait', width: 768, height: 1024, touch: true, dpr: 2 },
  { label: 'laptop', width: 1280, height: 720, touch: false, dpr: 1 },
  { label: 'desktop', width: 1440, height: 900, touch: false, dpr: 2 },
];

/** Playwright device names, used for `userAgent` so touch-specific behaviour is realistic. */
const UA_FOR: Readonly<Record<string, keyof typeof devices>> = {
  'phone landscape': 'iPhone 13',
  'small landscape': 'iPhone SE',
  'short landscape': 'iPhone X, keyboard open',
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
  /** One report per screen. `match` is the board; the other two are the screens players leave it for. */
  readonly reports: Partial<Record<ProbeScreen, LayoutReport>>;
  readonly failure: string | null;
}

/** The buttons that get us to each screen, in the order they are visited. */
const SCREENS: readonly { readonly screen: ProbeScreen; readonly trigger: string }[] = [
  { screen: 'collection', trigger: '#toggle-collection' },
  { screen: 'rules', trigger: '#toggle-rules' },
];

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
    const readReport = async (): Promise<LayoutReport | null> =>
      page.evaluate<LayoutReport | null>(
        () => (globalThis as unknown as { __layoutReport?: LayoutReport }).__layoutReport ?? null,
      );

    const reports: Partial<Record<ProbeScreen, LayoutReport>> = {};
    const first = await readReport();
    if (first !== null) reports[first.screen] = first;

    // The other two screens, by pressing the same button a player presses.
    //
    // This is stage M8's lesson made mechanical: for the whole project the harness measured one
    // screen, and the two it never opened are the two nobody had looked at below 640px. The probe
    // re-publishes on any DOM mutation and toggling `hidden` is one, so each screen is measured
    // where the player reaches it rather than by poking at internals.
    for (const { screen, trigger } of SCREENS) {
      await page.click(trigger);
      // Wait for the screen we asked for rather than a fixed delay — the same rule the touch tool
      // learned the hard way twice.
      await page.waitForFunction(
        (wanted) => {
          const report = (globalThis as unknown as { __layoutReport?: { screen?: string } })
            .__layoutReport;
          return report?.screen === wanted;
        },
        screen,
        { timeout: 10_000 },
      );
      const report = await readReport();
      if (report !== null) reports[report.screen] = report;
    }
    // Back to the board, so the detail table's primary report is the one a player starts on.
    await page.click('#toggle-collection');

    return { viewport, reports, failure: problems.length > 0 ? problems.join('; ') : null };
  } catch (error) {
    return {
      viewport,
      reports: {},
      failure: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await context.close();
  }
}

/** The rows of the per-screen table, minus the ones that are only true of the board. */
function screenRows(r: LayoutReport, viewport: Viewport): string[] {
  const board = r.board;
  return [
    `| requested viewport | ${viewport.width}×${viewport.height} |`,
    // `window.innerWidth` is not the requested width once content overflows, and the difference is
    // exactly the kind of thing this tool exists to notice. Both numbers, always.
    `| reported viewport | ${r.viewport.width}×${r.viewport.height} |`,
    `| board | ${board === null ? 'hidden' : `${board.width}×${board.height} at (${board.x}, ${board.y})`} |`,
    `| fully visible | ${r.boardFullyVisible ? 'yes' : '**NO**'} |`,
    `| hand tray | ${r.hand === null ? 'hidden' : `${r.hand.width}×${r.hand.height} at (${r.hand.x}, ${r.hand.y})`} |`,
    `| hand visible | ${r.handFullyVisible ? 'yes' : '**NO**'} |`,
    `| board and hand together | ${r.boardAndHandVisible ? 'yes' : '**NO**'} |`,
    `| sideways overflow | ${r.horizontalOverflow === 0 ? 'none' : `**${r.horizontalOverflow}px**`} |`,
    `| chrome (everything but the board) | ${r.chromeHeight}px |`,
    `| page height | ${r.viewport.height}${r.pageOverflowPx > 0 ? ` — **${r.pageOverflowPx}px taller than the screen**` : ' — fits vertically'} |`,
    `| overlapping regions | ${r.overlaps.length === 0 ? 'none' : `**${r.overlaps.map((o) => `${o.a} / ${o.b} (${o.area}px²)`).join(', ')}**`} |`,
    `| targets under ${MIN_TARGET_PX}px | ${r.tooSmall.length} of ${r.interactive} |`,
    `| board touch-action | ${r.touch.boardTouchAction} |`,
    `| hand touch-action | ${r.touch.handTouchAction} |`,
    `| prose selectable | ${r.touch.proseSelectable ? 'yes' : '**no**'} |`,
  ];
}

function summarise(rows: readonly Row[]): string[] {
  const lines: string[] = [];
  for (const row of rows) {
    const { viewport, failure } = row;
    const r = row.reports['match'];
    const head = `## ${viewport.label} — ${viewport.width}×${viewport.height}${viewport.touch ? ' (touch)' : ''}`;
    lines.push(head, '');
    if (r === undefined) {
      lines.push(`**Could not measure.** ${failure ?? 'unknown error'}`, '');
      continue;
    }
    lines.push('### board', '', '| | |', '|---|---|', ...screenRows(r, viewport), '');
    if (r.tooSmall.length > 0) {
      lines.push('Controls too small to tap comfortably:', '');
      for (const target of r.tooSmall) {
        lines.push(`- \`${target.label}\` — ${target.width}×${target.height}`);
      }
      lines.push('');
    }
    for (const screen of ['collection', 'rules'] as const) {
      const secondary = row.reports[screen];
      if (secondary === undefined) continue;
      const small = secondary.tooSmall;
      lines.push(`### ${screen}`, '', '| | |', '|---|---|', ...screenRows(secondary, viewport), '');
      if (small.length > 0) {
        lines.push('Controls too small to tap comfortably:', '');
        for (const target of small) {
          lines.push(`- \`${target.label}\` — ${target.width}×${target.height}`);
        }
        lines.push('');
      }
    }
    if (failure !== null) lines.push(`Page errors: ${failure}`, '');
  }
  return lines;
}

/**
 * The faults on one screen.
 *
 * Split by what each check is *about*. "Board not fully visible" is a real statement about a board
 * nobody is looking at when the collection screen is open, so the board checks are asked only of the
 * board. Everything else — sideways overflow, undersized targets, overlapping regions, text that
 * cannot be selected — is about the page as a whole and is asked of every screen.
 *
 * Vertical overflow is asked only of the board too, and only because the collection and rules
 * screens are *meant* to scroll: the collection has a deck and a catalogue, and the rules are 3000px
 * of prose. Demanding they fit would be demanding they not exist.
 */
function faultsFor(r: LayoutReport): string[] {
  const faults: string[] = [];
  const onBoard = r.screen === 'match';
  // Labelled only when it is not the board. "8px sideways overflow" appearing twice in one line,
  // once for the collection and once for the rules, is a fault nobody can act on.
  const say = (text: string): void => {
    faults.push(onBoard ? text : `${r.screen}: ${text}`);
  };

  if (onBoard) {
    if (r.pageOverflowPx > 0) faults.push(`page ${r.pageOverflowPx}px too tall`);
    if (!r.boardFullyVisible) faults.push('board not fully visible');
    if (!r.handFullyVisible) faults.push('hand tray below the fold');
    else if (!r.boardAndHandVisible) faults.push('board and hand not visible together');
  }
  if (r.horizontalOverflow > 0) say(`${r.horizontalOverflow}px sideways overflow`);
  if (r.tooSmall.length > 0) say(`${r.tooSmall.length} control(s) under ${MIN_TARGET_PX}px`);
  if (r.overlaps.length > 0)
    say(
      `${r.overlaps.length} overlapping region(s): ${r.overlaps.map((o) => `${o.a}/${o.b}`).join(', ')}`,
    );
  if (onBoard) {
    if (r.touch.boardTouchAction === 'none') faults.push('board blocks pinch-zoom');
    if (r.touch.handTouchAction !== 'none')
      faults.push('hand cards allow panning, so a drag would scroll the page');
  }
  if (r.touch.controlsSelectable && r.screen === 'match')
    faults.push('controls are text-selectable');
  // The rules screen is the prose. Not being able to select prose is a defect on every screen, and
  // this is the one screen where anyone is actually trying to read some.
  if (!r.touch.proseSelectable) say('prose is not selectable');
  return faults;
}

/** The headline facts, so the summary at the top of the document is readable without scrolling. */
function verdicts(rows: readonly Row[]): string[] {
  return rows.map((row) => {
    const name = `${row.viewport.label} (${row.viewport.width}×${row.viewport.height})`;
    const reports = Object.values(row.reports);
    if (reports.length === 0)
      return `- **${name}** — could not measure: ${row.failure ?? 'unknown'}`;
    const faults = reports.flatMap(faultsFor);
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

/** The newest source file, so a stale `dist/` can be detected rather than measured. */
function newestSourceMtime(dir: string): number {
  let newest = statSync(join(ROOT, 'index.html')).mtimeMs;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    newest = statSync(full).isDirectory()
      ? Math.max(newest, newestSourceMtime(full))
      : Math.max(newest, statSync(full).mtimeMs);
  }
  return newest;
}

/**
 * Refuses to measure a build that is older than its sources.
 *
 * This tool serves `dist/`, so it reports on whatever was last built — not on what is in the
 * working tree. That has now produced **four separate rounds of confident nonsense**: a reverted
 * mutation, a mistyped anchor in an untyped tool, and two batches of layout changes measured against
 * a bundle that had never been rebuilt. Every one of them read as "no problems found".
 *
 * `npm run viewport` and `npm run layout` build first, which is why it only ever happens when the
 * script is invoked directly — which is exactly when you are debugging it.
 */
function refuseStaleBuild(): void {
  const built = statSync(join(DIST, 'index.html')).mtimeMs;
  const source = newestSourceMtime(join(ROOT, 'src'));
  if (built >= source) return;
  process.stderr.write(
    'dist/ is older than the sources. This tool measures the build, not the working tree.\n' +
      'Run `npm run layout` (or `npm run build`) first.\n',
  );
  process.exit(1);
}

async function main(): Promise<void> {
  if (!existsSync(join(DIST, 'index.html'))) {
    process.stderr.write('dist/index.html is missing. Run `npm run build` first.\n');
    process.exit(1);
  }
  refuseStaleBuild();

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
  process.stdout.write(`${formatReport(rows[0]?.reports['match'] ?? null)}\n`);
  process.stdout.write(`\nWrote ${OUT}\n`);
  for (const line of verdicts(rows)) process.stdout.write(`${line}\n`);

  // Stage M9. Until this point the harness only reported, which is exactly what MOBILE.md section
  // 5.1 planned for: a gate cannot land before the layout works. With `--check` the same
  // measurements are asserted and the process exits non-zero, which is what makes this a gate
  // rather than an instrument.
  if (!CHECK) return;

  const { failures, noted } = checkLayout(rows);
  if (noted.length > 0) {
    process.stdout.write(`\nKnown limitations (reported, not failing) — ${noted.length}:`);
    for (const note of noted) process.stdout.write(`\n  - ${note.screen}: ${note.rule}`);
    process.stdout.write('\n');
  }
  if (failures.length === 0) {
    process.stdout.write(
      `\nLayout gate: OK — ${rows.length} viewports x 3 screens, ${rows.length * 3} measurements.\n`,
    );
    return;
  }
  process.stdout.write(`\nLayout gate: ${failures.length} FAILURE(S)\n`);
  for (const failure of failures) {
    process.stdout.write(`  [${failure.rule}] ${failure.screen}: ${failure.detail}\n`);
  }
  process.exitCode = 1;
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
