/**
 * The rules screen, tied to the specification (PLAN.md §1, §6 Stage 10).
 *
 * The test that matters is the first one. The rules screen is generated from `RULES`, and this suite
 * asserts that `RULES` covers exactly the §1 headings in `PLAN.md`. Without it the screen would be
 * documentation that could silently fall behind the implementation — and confidently wrong
 * documentation is worse than none at all.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { RULES, ruleIds, ruleText } from '../../src/ui/screens/rules.ts';
import { renderRules } from '../../src/ui/screens/rulesView.ts';

/** The §1 headings, parsed out of the plan exactly as `tools/rules-audit.ts` parses them. */
function planRuleIds(): string[] {
  const plan = readFileSync(resolve(process.cwd(), 'PLAN.md'), 'utf8');
  const ids: string[] = [];
  for (const line of plan.split('\n')) {
    const match = /^###\s+(1\.\d+)\s+.*\S\s*$/.exec(line);
    if (match?.[1] !== undefined) ids.push(match[1]);
  }
  return ids;
}

function mount(): HTMLElement {
  const host = document.createElement('div');
  document.body.append(host);
  return host;
}

beforeEach(() => {
  document.body.textContent = '';
});

/** The button whose label starts with `prefix`. */
function findButton(host: HTMLElement, prefix: string): HTMLButtonElement {
  const found = [...host.querySelectorAll('button')].find((button) =>
    button.textContent.startsWith(prefix),
  );
  if (found === undefined) throw new Error(`no button labelled ${prefix}`);
  return found;
}

describe('staying in step with the specification', () => {
  it('covers exactly the §1 sections in PLAN.md, no more and no fewer', () => {
    // The whole point of this screen. Add a rule to the spec and this fails until it is written up.
    expect(ruleIds()).toEqual(planRuleIds());
  });

  it('lists every section in ascending order', () => {
    const ids = ruleIds();
    expect(ids).toEqual([...ids].sort());
  });

  it('gives every section a title, a summary and at least one rule', () => {
    for (const section of RULES) {
      expect(section.title.length, section.id).toBeGreaterThan(0);
      expect(section.summary.length, section.id).toBeGreaterThan(0);
      expect(section.bullets.length, section.id).toBeGreaterThan(0);
      for (const bullet of section.bullets) {
        expect(bullet.text.length, section.id).toBeGreaterThan(0);
      }
    }
  });

  it('flags the surprises, which is the part players get wrong', () => {
    const caveats = RULES.flatMap((section) =>
      section.bullets.filter((bullet) => bullet.caveat !== undefined).map((b) => b.caveat ?? ''),
    );
    // Ties going to the defender, the wasted stat point, arrows that cannot threaten you, and the
    // discard glitch are the four things a player will otherwise believe are bugs.
    expect(caveats.length).toBeGreaterThanOrEqual(4);
    expect(caveats.join(' ')).toMatch(/tie/i);
    expect(caveats.join(' ')).toMatch(/reroll|maxed/i);
    expect(caveats.join(' ')).toMatch(/discard/i);
  });
});

describe('rendering', () => {
  it('renders one block per rule, tagged with its id', () => {
    const host = mount();
    renderRules(host, () => {});
    const blocks = host.querySelectorAll('.rules-section');
    expect(blocks).toHaveLength(RULES.length);
    expect(blocks[0]?.getAttribute('data-rule')).toBe(RULES[0]?.id);
  });

  it('shows every bullet as text', () => {
    const host = mount();
    renderRules(host, () => {});
    const bullets = host.querySelectorAll('.rules-bullet');
    const total = RULES.reduce((sum, section) => sum + section.bullets.length, 0);
    expect(bullets).toHaveLength(total);
  });

  it('styles caveats apart from ordinary rules', () => {
    const host = mount();
    renderRules(host, () => {});
    const caveats = host.querySelectorAll('.rules-caveat');
    const expected = RULES.reduce(
      (sum, section) => sum + section.bullets.filter((b) => b.caveat !== undefined).length,
      0,
    );
    expect(caveats).toHaveLength(expected);
  });

  it('closes when asked', () => {
    const host = mount();
    let closed = false;
    renderRules(host, () => {
      closed = true;
    });
    findButton(host, 'Close').click();
    expect(closed).toBe(true);
  });

  it('reports honestly when the clipboard is unavailable', async () => {
    const host = mount();
    renderRules(host, () => {});
    const copy = findButton(host, 'Copy');
    copy.click();
    // jsdom has no clipboard; the point is that it says so instead of failing silently.
    await Promise.resolve();
    await Promise.resolve();
    expect(copy.textContent).not.toBe('Copy as text');
  });

  it('clears whatever was in the container first', () => {
    const host = mount();
    host.textContent = 'stale content';
    renderRules(host, () => {});
    expect(host.textContent).not.toContain('stale content');
  });
});

describe('the plain-text copy', () => {
  it('includes every section, id and title', () => {
    const text = ruleText();
    for (const section of RULES) {
      expect(text, section.id).toContain(`${section.id} ${section.title}`);
    }
  });

  it('includes every bullet, and the caveats', () => {
    const text = ruleText();
    for (const section of RULES) {
      for (const bullet of section.bullets) {
        expect(text, bullet.text.slice(0, 30)).toContain(bullet.text);
      }
    }
    expect(text).toContain('Would you like to discard?');
  });
});
