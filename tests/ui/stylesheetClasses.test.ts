/**
 * Every class the stylesheet names must be a class something actually renders.
 *
 * This exists because of a real bug, and the bug is invisible to every other check in the project.
 * `toolbar.ts` created the menu's container with `className = 'settings-host'`, and `renderMenu`
 * overwrote it one line later with `'settings-menu'`. The stylesheet's `display: contents` rule was
 * written against `.settings-host`, so it matched nothing, the container stayed an ordinary flex
 * item, and opening the menu pushed the Settings button down onto a second row. No unit test failed:
 * jsdom has no layout, and the button was present, enabled and correctly labelled throughout.
 *
 * So this is checked statically instead — the one way it can be caught without a browser.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Vitest runs from the project root, as `tools/*.ts` do. */
const ROOT = process.cwd();

/**
 * Every `.ts` file under `dir`, concatenated.
 *
 * Deliberately not written with `flatMap`: it flattens arrays but leaves strings whole, so a
 * recursive helper that returns `string` hands each level's *file contents* back to the caller as if
 * they were paths, and the next `readFileSync` fails on a 300KB "filename". Two steps — collect
 * paths, then read them — keeps the return type honest at every level.
 */
function allTypeScript(dir: string): string {
  const sources = readdirSync(dir).map((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return allTypeScript(full);
    return full.endsWith('.ts') ? readFileSync(full, 'utf8') : '';
  });
  return sources.join('\n');
}

const page = readFileSync(join(ROOT, 'index.html'), 'utf8');
const styleSheet = page.slice(page.indexOf('<style>'), page.indexOf('</style>'));

/**
 * Selector text: the stylesheet with comments removed and every declaration block dropped.
 *
 * Comments go first and for a specific reason — prose mentions `MOBILE.md` and `main.ts`, and a
 * naive scan reads those as classes `md` and `ts`. Declaration blocks go because property values
 * are full of punctuation that resembles nothing useful and occasionally resembles this.
 */
function selectors(): string {
  return styleSheet.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{[^{}]*\}/g, '');
}

describe('stylesheet classes', () => {
  const declared = [
    ...new Set([...selectors().matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]!)),
  ].sort();
  const source = allTypeScript(join(ROOT, 'src'));

  it('finds the stylesheet, or everything below passes for the wrong reason', () => {
    expect(existsSync(join(ROOT, 'index.html'))).toBe(true);
    expect(declared.length).toBeGreaterThan(40);
  });

  it('names only classes that something renders', () => {
    // Everywhere a class could legitimately come from: the page's own markup and scripts, plus
    // every class any component assigns at runtime.
    const corpus = `${page.slice(page.indexOf('</style>'))}\n${source}`;

    // Substring, not word boundary: several classes are assembled by template literal —
    // `hand-arrows${arrowCount === 0 ? ' is-dead' : ''}` — so no single line holds them whole. The
    // cost of that looseness is that a class merely named in a string elsewhere would satisfy this,
    // which is a far smaller failure than a rule that silently matches nothing.
    const neverRendered = declared.filter((className) => !corpus.includes(className));

    expect(neverRendered).toEqual([]);
  });

  /**
   * Every child of `<body>` must have a place in the landscape grid, or be gone from it.
   *
   * Stage M7 turned the body into a grid for landscape and placed seven of its fourteen children.
   * The other seven were auto-placed, and grid's implicit rows put two of them in the one cell
   * nobody named: a 300px-tall results panel landed above the board and crushed it to 6px, and the
   * collection screen landed in the board's own column, 270px wide and 38px too tall.
   *
   * Nothing caught either. The viewport harness measures a fresh page, where both are `hidden`, and
   * a person only reaches them by playing a whole match — which is exactly how this was found.
   *
   * A child is accounted for if the landscape block places it (`grid-area`, `grid-column`), or
   * removes it (`display: none`), or is the screen-reader-only live region, which is taken out of
   * flow by `position: absolute` and is not a grid item at all.
   */
  it('gives every body child a place in the landscape grid', () => {
    // From the landscape block to the *end* of the stylesheet, not to the next media query. A child
    // can be removed from a landscape layout by a rule in a different block — `.mode-note` and
    // `.keys` are hidden by `max-height: 760px`, not by the landscape block — and stopping at the
    // first `@media` boundary reported four children as unplaced that the page has already dealt with.
    const landscape = styleSheet.slice(styleSheet.indexOf('@media (orientation: landscape)'));

    /**
     * The direct children of `<body>`, in order.
     *
     * Depth-tracked rather than regex-matched, because the first version of this matched *every* tag in
     * the page and cheerfully reported the two `rematch` buttons inside the navigation toolbar as
     * unplaced body children — a test failing about elements it was never meant to be looking at, which
     * is worse than no test.
     */
    function bodyChildren(): { tag: string; id: string; className: string }[] {
      const inner = page
        .slice(page.indexOf('<body'), page.indexOf('</body>'))
        .replace(/^<body[^>]*>/, '');
      const voids = ['br', 'img', 'input', 'hr', 'meta', 'link'];
      const found: { tag: string; id: string; className: string }[] = [];
      let depth = 0;
      // Every capture group defaults, because `noUncheckedIndexedAccess` types them all as possibly
      // undefined and the defaults are what the code below already assumed.
      for (const [, closing = '', tag = '', attrs = '', selfClose = ''] of inner.matchAll(
        /<(\/?)(\w+)([^>]*?)(\/?)>/g,
      )) {
        if (closing === '/') {
          depth -= 1;
          continue;
        }
        if (depth === 0) {
          found.push({
            tag,
            id: /id="([^"]+)"/.exec(attrs)?.[1] ?? '',
            className: /class="([^"]+)"/.exec(attrs)?.[1] ?? '',
          });
        }
        if (selfClose === '/' || voids.includes(tag.toLowerCase())) continue;
        depth += 1;
      }
      return found;
    }

    const children = bodyChildren();
    expect(children.length).toBeGreaterThan(10);

    /**
     * Every rule in the block, as `selector` and `declarations`.
     *
     * Matched on plain substrings rather than a compiled pattern: building a `RegExp` from a
     * selector means escaping `#`, `.` and `[`, and three layers of escaping in a test is three
     * chances to write a test that matches nothing and passes. Splitting on braces cannot do that.
     */
    const rules = [...landscape.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(
      ([, selector = '', body = '']) => ({ selector, body }),
    );
    expect(rules.length).toBeGreaterThan(5);

    const namesOf = (child: { tag: string; id: string; className: string }): string[] =>
      // `child.id` is genuinely absent on a child with no id, so the filter is a type guard rather
      // than a length test — a length test on `undefined` throws, and throws in a helper reads as a
      // broken test rather than a missing id.
      [child.id, ...child.className.split(/\s+/)].filter(
        (n): n is string => typeof n === 'string' && n.length > 0,
      );

    const rulesFor = (child: { tag: string; id: string; className: string }) => {
      // Falls back to the tag when there is no id or class. `h1` is both hidden and unplaced in
      // landscape, and a name-only match found no rules for it at all — which read as "unplaced"
      // when the truth was "never looked at".
      const names = namesOf(child);
      if (names.length === 0) {
        return rules.filter((rule) => new RegExp(`(^|[\\s,>])${child.tag}\\b`).test(rule.selector));
      }
      return rules.filter((rule) =>
        names.some((n) => rule.selector.includes(`#${n}`) || rule.selector.includes(`.${n}`)),
      );
    };

    const unplaced = children.filter((child) => {
      // Taken out of flow by `position: absolute`, so it is not a grid item and needs no area, and a
      // `<script>` is not a layout element whatever it is.
      if (child.className.split(/\s+/).includes('sr-only')) return false;
      if (child.tag === 'script') return false;
      const own = rulesFor(child);
      const placed = own.some((rule) => /grid-(area|column)/.test(rule.body));
      const removed = own.some((rule) => /display:\s*none/.test(rule.body));
      return !placed && !removed;
    });

    expect(unplaced.map((c) => c.id || c.className || c.tag)).toEqual([]);
  });

  /**
   * The specific regression, kept separately because the general check above would also pass if the
   * wrapper were renamed consistently and `display: contents` dropped from both — a different layout
   * bug with the same visible symptom.
   */
  it('keeps the Settings button on the mode bar when the panel opens', () => {
    const contents = [...styleSheet.matchAll(/\.settings-menu\s*\{[^}]*display:\s*contents/g)];
    expect(contents.length).toBeGreaterThan(0);

    // The class `renderMenu` actually puts on the container. If this ever moves back to the class
    // the caller sets, the rule above is dead again and the button drops a row when the panel opens.
    expect(source).toContain("container.className = 'settings-menu'");
    // And the caller must not set a competing class, which is what started this.
    expect(source).not.toContain("host.className = 'settings-host'");
  });
});
