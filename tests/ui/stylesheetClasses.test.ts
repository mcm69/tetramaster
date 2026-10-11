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
