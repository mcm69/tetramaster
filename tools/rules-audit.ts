/**
 * Rule traceability audit (PLAN.md §9.2, signal 1 — the project's primary coverage metric).
 *
 * Line coverage cannot tell you a rule is implemented correctly: an engine can execute every
 * branch and still invert the combo cascade. So every rule paragraph in PLAN.md §1 must be
 * claimed by at least one test, and tests claim a rule by tagging their name:
 *
 *     it('[§1.7] combo from loser captures targets without battle', ...)
 *
 * This tool parses the `### 1.x` headings out of PLAN.md, greps tests/ for each tag, and exits
 * non-zero listing every unclaimed rule. Adding a rule to §1 without adding a test is therefore a
 * build failure rather than a code-review opinion.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const PLAN_PATH = join(ROOT, 'PLAN.md');
const TESTS_DIR = join(ROOT, 'tests');

const SOURCE_FILES = ['.ts', '.tsx'];

interface RuleSection {
  id: string;
  title: string;
}

/**
 * Rules not yet implemented, mapped to the stage that implements them (PLAN.md §6).
 *
 * A pending rule is a promise, not an exemption: implementing a rule means deleting its entry
 * here, at which point it MUST carry a tagged test or this tool fails hard. That keeps the gate
 * meaningful without leaving `npm run verify` red for the eight stages before the rules exist.
 *
 * `--strict` fails while any entry remains; CI switches to it once Stage 11 lands.
 */
const PENDING: Record<string, number> = {
  '1.1': 5, // match setup — blocked cells, coin flip, deal
  '1.2': 2, // card anatomy — arrows, stats, figures
  '1.3': 1, // stat intervals — hex digits to ranges
  '1.4': 3, // only the placed card attacks
  '1.5': 3, // arrow takedown
  '1.6': 4, // card battle math
  '1.7': 4, // combos and multiple battles
  '1.8': 9, // stat growth and type evolution
  '1.9': 9, // collector level
};

const STRICT = process.argv.includes('--strict');

function parseRuleSections(plan: string): RuleSection[] {
  const sections: RuleSection[] = [];
  // Level-3 headings inside "## 1. Rule Specification": `### 1.3 Stat digits are intervals...`
  for (const line of plan.split('\n')) {
    const match = /^###\s+(1\.\d+)\s+(.*\S)\s*$/.exec(line);
    if (match?.[1] && match[2]) {
      sections.push({ id: match[1], title: match[2] });
    }
  }
  return sections;
}

function collectTestFiles(dir: string, acc: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectTestFiles(full, acc);
    } else if (SOURCE_FILES.some((ext) => entry.endsWith(ext))) {
      acc.push(full);
    }
  }
  return acc;
}

function main(): void {
  const plan = readFileSync(PLAN_PATH, 'utf8');
  const sections = parseRuleSections(plan);

  if (sections.length === 0) {
    console.error(
      'rules-audit: found no `### 1.x` rule sections in PLAN.md — did the format change?',
    );
    process.exit(1);
  }

  const testFiles = collectTestFiles(TESTS_DIR);
  if (testFiles.length === 0) {
    console.error('rules-audit: no test files found under tests/');
    process.exit(1);
  }

  const tests = testFiles.map((f) => ({ file: relative(ROOT, f), text: readFileSync(f, 'utf8') }));

  const claimedBy = new Map<string, { file: string; count: number }[]>();
  for (const section of sections) claimedBy.set(section.id, []);

  // Any [§1.x] tag anywhere in a test file counts, including inside `describe` blocks.
  const tagPattern = /\[§(1\.\d+)\]/g;
  for (const test of tests) {
    for (const match of test.text.matchAll(tagPattern)) {
      const id = match[1];
      if (!id) continue;
      const hits = claimedBy.get(id);
      if (!hits) continue; // tag refers to a section that no longer exists; reported separately
      const existing = hits.find((h) => h.file === test.file);
      if (existing) existing.count++;
      else hits.push({ file: test.file, count: 1 });
    }
  }

  let staleTags = 0;
  for (const test of tests) {
    for (const match of test.text.matchAll(tagPattern)) {
      const id = match[1];
      if (id && !claimedBy.has(id)) {
        console.warn(
          `rules-audit: stale tag [§${id}] in ${test.file} — no such rule section in PLAN.md`,
        );
        staleTags++;
      }
    }
  }

  console.log(`\nRule traceability — ${sections.length} rules in PLAN.md §1\n`);
  let untested = 0;
  let stillPending = 0;
  for (const section of sections) {
    const hits = claimedBy.get(section.id) ?? [];
    const total = hits.reduce((sum, h) => sum + h.count, 0);

    if (hits.length > 0) {
      const files = hits.map((h) => `${h.file} (${h.count})`).join(', ');
      console.log(`  ✓ §${section.id} ${section.title} — ${total} tagged test(s) in ${files}`);
      continue;
    }

    const pendingStage = PENDING[section.id];
    if (pendingStage !== undefined) {
      stillPending++;
      console.log(
        `  ~ §${section.id} ${section.title} — PENDING (Stage ${pendingStage}), not yet implemented`,
      );
      continue;
    }

    untested++;
    console.log(`  ✗ §${section.id} ${section.title}`);
    console.log(`      UNTESTED — add a test named: it('[§${section.id}] ...')`);
  }

  const covered = sections.length - untested - stillPending;
  console.log(`\n  ${covered} traced · ${stillPending} pending · ${untested} untested.`);

  if (untested > 0) {
    console.error(
      `\nrules-audit FAILED: ${untested} rule(s) are implemented but have no tagged test. ` +
        `Line coverage cannot substitute for this — see PLAN.md §9.2.\n`,
    );
    process.exit(1);
  }

  if (staleTags > 0) {
    console.error(`\nrules-audit FAILED: ${staleTags} stale tag(s).\n`);
    process.exit(1);
  }

  if (STRICT && stillPending > 0) {
    console.error(
      `\nrules-audit FAILED (--strict): ${stillPending} rule(s) still pending implementation.\n`,
    );
    process.exit(1);
  }

  const suffix =
    stillPending > 0 && !STRICT
      ? ` ${stillPending} rule(s) still pending — run with --strict to enforce.`
      : '';
  console.log(`rules-audit OK${STRICT ? ' (strict)' : ''}.${suffix}\n`);
}

main();
