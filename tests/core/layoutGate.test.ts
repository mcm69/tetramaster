/**
 * The layout gate's rules (MOBILE.md stage M9).
 *
 * The gate is a pure function of measurements precisely so that this file can exist. A gate whose
 * rules can only be checked by launching a browser is a gate nobody checks the rules of — which is
 * how "the gate exists" stays a claim long after it has landed.
 *
 * Every rule is tested by *constructing* the failure it exists to catch, rather than by mutating a
 * stylesheet and re-measuring. That is the same discipline as the rest of the project and it is
 * cheaper, but the mutations below are still run against the real harness at the end of the stage:
 * a rule can be right about its inputs and wrong about the page.
 */

import { describe, expect, it } from 'vitest';
import {
  BOARD_CELL_RATIO,
  KNOWN_LIMITATIONS,
  MIN_BOARD_PX,
  checkLayout,
  unmeasured,
} from '../../tools/layoutGate.ts';
import { MIN_TARGET_PX, type LayoutReport } from '../../src/ui/layoutProbe.ts';

/** A passing report, which each test then breaks in exactly one way. */
function goodReport(over: Partial<LayoutReport> = {}): LayoutReport {
  const touch = {
    boardTouchAction: 'manipulation',
    handTouchAction: 'none',
    controlsSelectable: false,
    proseSelectable: true,
    minTargetReached: true,
  };
  return {
    viewport: { width: 390, height: 844 },
    board: { x: 20, y: 60, width: 350, height: 350, right: 370, bottom: 410 },
    hand: { x: 20, y: 600, width: 350, height: 100, right: 370, bottom: 700 },
    boardFullyVisible: true,
    handFullyVisible: true,
    boardAndHandVisible: true,
    horizontalOverflow: 0,
    pageOverflowPx: 0,
    chromeHeight: 100,
    interactive: 12,
    tooSmall: [],
    overlaps: [],
    screen: 'match',
    touch,
    ...over,
  } as LayoutReport;
}

/**
 * A complete measurement row.
 *
 * The two secondary screens are filled in with passing reports unless a test says otherwise, because
 * `checkLayout` fails any screen it was not given — which is correct, and means a test that only
 * means to break the board would otherwise see two unrelated failures alongside its own.
 */
const rows = (
  reports: Partial<Record<string, LayoutReport>>,
): { reports: Partial<Record<string, LayoutReport>>; viewport: { label: string } }[] => [
  {
    viewport: { label: 'test' },
    reports: {
      collection: goodReport({ board: null, boardFullyVisible: false, screen: 'collection' }),
      rules: goodReport({ board: null, boardFullyVisible: false, screen: 'rules' }),
      ...reports,
    },
  },
];

describe('the layout gate', () => {
  it('passes a layout that meets every rule', () => {
    expect(checkLayout(rows({ match: goodReport() })).failures).toEqual([]);
  });

  describe('assertion 1: nothing sideways', () => {
    it('fails on sideways overflow', () => {
      const result = checkLayout(rows({ match: goodReport({ horizontalOverflow: 9 }) }));
      expect(result.failures.map((f) => f.rule)).toContain('no sideways overflow');
      expect(result.failures.find((f) => f.rule === 'no sideways overflow')?.detail).toBe('9px');
    });

    it('fails on the collection screen too, not only on the board', () => {
      // The rule is about the page, and the collection screen is where the overflow actually was.
      const result = checkLayout(
        rows({ match: goodReport(), collection: goodReport({ horizontalOverflow: 19 }) }),
      );
      expect(result.failures.find((f) => f.rule === 'no sideways overflow')?.screen).toBe(
        'collection',
      );
    });
  });

  describe('assertion 2: no target under 44px', () => {
    it('fails and names the targets', () => {
      const report = goodReport({
        tooSmall: [{ label: 'button clear', width: 26, height: 26 }],
      });
      const result = checkLayout(rows({ match: report }));
      const failure = result.failures.find((f) => f.rule.includes(String(MIN_TARGET_PX)));
      expect(failure?.detail).toBe('button clear 26x26');
    });

    it('passes a report with no undersized targets', () => {
      expect(checkLayout(rows({ match: goodReport({ tooSmall: [] }) })).failures).toEqual([]);
    });
  });

  describe('assertion 3: the board inside the viewport', () => {
    it('fails when the board is not fully visible', () => {
      const result = checkLayout(rows({ match: goodReport({ boardFullyVisible: false }) }));
      expect(result.failures.map((f) => f.rule)).toContain('board inside the viewport');
    });

    it('says where its bottom ended up', () => {
      const report = goodReport({ boardFullyVisible: false });
      expect(
        checkLayout(rows({ match: report })).failures.find(
          (f) => f.rule === 'board inside the viewport',
        )?.detail,
      ).toContain('410 of 844');
    });

    it('does not ask about a board that is not on screen', () => {
      // The collection screen has no board, and "board inside the viewport" is a true statement
      // about nothing at all there.
      const report = goodReport({ board: null, boardFullyVisible: false, screen: 'collection' });
      expect(checkLayout(rows({ match: goodReport(), collection: report })).failures).toEqual([]);
    });
  });

  describe('assertion 4: the board is big enough to play', () => {
    it('fails a board that fits but cannot be played on', () => {
      // 180px square: fully visible, no overflow, no small targets — and 40px cells.
      const small = goodReport({
        board: { x: 100, y: 100, width: 180, height: 180, right: 280, bottom: 280 },
      });
      const failure = checkLayout(rows({ match: small })).failures.find((f) =>
        f.rule.includes('tall'),
      );
      expect(failure).toBeDefined();
      expect(failure?.detail).toContain('px cells');
    });

    it('derives its floor from the 44px target rather than picking a number', () => {
      // The floor is not a taste call: it is the board size at which a square reaches the same 44px
      // minimum every other control has. Changing MIN_TARGET_PX moves it.
      expect(MIN_BOARD_PX).toBe(Math.ceil(MIN_TARGET_PX / BOARD_CELL_RATIO));
      expect(MIN_BOARD_PX * BOARD_CELL_RATIO).toBeGreaterThanOrEqual(MIN_TARGET_PX);
      expect((MIN_BOARD_PX - 1) * BOARD_CELL_RATIO).toBeLessThan(MIN_TARGET_PX);
    });

    it('passes a board exactly at the floor', () => {
      const report = goodReport({
        board: {
          x: 0,
          y: 0,
          width: MIN_BOARD_PX,
          height: MIN_BOARD_PX,
          right: MIN_BOARD_PX,
          bottom: MIN_BOARD_PX,
        },
      });
      expect(checkLayout(rows({ match: report })).failures).toEqual([]);
    });
  });

  describe('things that are reported but never fail', () => {
    it('does not fail a layout whose page is taller than the screen', () => {
      // The collection and rules screens must scroll; the plan does not assert page height anywhere.
      const tall = goodReport({ pageOverflowPx: 240, screen: 'collection' });
      expect(checkLayout(rows({ match: goodReport(), collection: tall })).failures).toEqual([]);
    });

    it('notes the desktop hand tray rather than failing on it', () => {
      const desktop = goodReport({
        viewport: { width: 1280, height: 720 },
        handFullyVisible: false,
        boardAndHandVisible: false,
      });
      const result = checkLayout(rows({ match: desktop }));
      expect(result.failures).toEqual([]);
      expect(result.noted.map((n) => n.rule)).toContain('hand tray below the fold on desktop');
      // The viewport is the *label*, not the detail: two notes about two sizes have to be two lines
      // a reader can tell apart, and the first version printed the same sentence twice.
      expect(result.noted[0]?.screen).toBe('match at 1280x720');
      expect(result.noted.map((n) => n.screen)).not.toContain(result.noted[1]?.screen ?? 'x');
    });

    it('stays quiet about it when the tray is visible', () => {
      const fine = goodReport({ viewport: { width: 1440, height: 900 } });
      expect(checkLayout(rows({ match: fine })).noted).toEqual([]);
    });

    it('does not mistake a phone for a desktop', () => {
      // A phone with the tray below the fold is a fault, not a known limitation, and is reported by
      // the harness verdict rather than here — this test pins that the note is width-gated.
      const phone = goodReport({ handFullyVisible: false, viewport: { width: 390, height: 844 } });
      expect(checkLayout(rows({ match: phone })).noted).toEqual([]);
    });

    it('describes every limitation it knows about', () => {
      for (const limitation of KNOWN_LIMITATIONS) {
        expect(limitation.detail.length).toBeGreaterThan(40);
      }
    });
  });

  it('fails when a screen could not be measured at all', () => {
    // A gate that silently passes on a *missing* measurement is not a gate. If the harness stops
    // opening the collection screen, "nothing to check" must not read as "nothing wrong".
    const result = checkLayout([{ reports: {}, viewport: { label: 'phone' } }]);
    expect(result.failures.map((f) => f.rule)).toEqual([
      'every screen measured',
      'every screen measured',
      'every screen measured',
    ]);
    expect(result.failures.map((f) => f.screen)).toEqual([
      'phone match',
      'phone collection',
      'phone rules',
    ]);
    expect(unmeasured([{ reports: {}, viewport: { label: 'phone' } }])).toHaveLength(3);
  });

  it('says nothing is missing when all three screens were measured', () => {
    const full = {
      viewport: { label: 'phone' },
      reports: {
        match: goodReport(),
        collection: goodReport({ board: null }),
        rules: goodReport({ board: null }),
      },
    };
    expect(checkLayout([full]).failures.filter((f) => f.rule === 'every screen measured')).toEqual(
      [],
    );
  });

  it('reports every broken rule, not just the first', () => {
    const report = goodReport({
      horizontalOverflow: 9,
      boardFullyVisible: false,
      board: { x: 0, y: 700, width: 100, height: 100, right: 100, bottom: 800 },
      tooSmall: [{ label: 'x', width: 10, height: 10 }],
    });
    expect(
      checkLayout(rows({ match: report }))
        .failures.map((f) => f.rule)
        .sort(),
    ).toEqual([
      'board at least 199px tall',
      'board inside the viewport',
      'no sideways overflow',
      'no target under 44px',
    ]);
  });
});
