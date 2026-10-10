/**
 * The rules screen (PLAN.md §6, Stage 10).
 *
 * Renders `RULES` as a definition list. Pure presentation — every fact lives in `rules.ts` beside
 * the section it describes, so a correction is made in one place.
 *
 * The caveats are styled apart deliberately. Most of what makes Tetra Master confusing is a handful
 * of genuine surprises — ties going to the defender, wasted stat points, arrows that do not threaten
 * you — and burying them in a wall of equally-weighted text is how players end up convinced the
 * rules are arbitrary.
 */

import { RULES, ruleText, type RuleSection } from './rules.ts';

/** Builds the rules screen. */
export function renderRules(container: HTMLElement, onClose: () => void): void {
  container.textContent = '';

  const heading = document.createElement('p');
  heading.className = 'rules-heading';
  heading.textContent = 'How Tetra Master works';
  container.append(heading);

  const list = document.createElement('dl');
  list.className = 'rules-list';

  for (const section of RULES) {
    list.append(sectionBlock(section));
  }
  container.append(list);

  const actions = document.createElement('div');
  actions.className = 'rules-actions';

  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'rematch';
  copy.textContent = 'Copy as text';
  copy.addEventListener('click', () => {
    void copyRules(copy);
  });
  actions.append(copy);

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'rematch';
  close.textContent = 'Close (R)';
  close.addEventListener('click', () => {
    onClose();
  });
  actions.append(close);

  container.append(actions);
}

function sectionBlock(section: RuleSection): HTMLElement {
  const wrapper = document.createElement('section');
  wrapper.className = 'rules-section';
  wrapper.dataset['rule'] = section.id;

  const title = document.createElement('dt');
  title.className = 'rules-title';
  title.textContent = `${section.id} · ${section.title}`;
  wrapper.append(title);

  const summary = document.createElement('dd');
  summary.className = 'rules-summary';
  summary.textContent = section.summary;
  wrapper.append(summary);

  const list = document.createElement('dd');
  list.className = 'rules-bullets';
  for (const bullet of section.bullets) {
    const item = document.createElement('p');
    item.className = 'rules-bullet';
    item.textContent = bullet.text;
    list.append(item);
    if (bullet.caveat !== undefined) {
      const caveat = document.createElement('p');
      caveat.className = 'rules-caveat';
      caveat.textContent = bullet.caveat;
      list.append(caveat);
    }
  }
  wrapper.append(list);

  return wrapper;
}
/**
 * Puts the whole rules sheet on the clipboard.
 *
 * Clipboard access is refused often enough — no permission, insecure context, no `navigator` at all —
 * that the button reports what actually happened instead of silently doing nothing.
 */
async function copyRules(button: HTMLButtonElement): Promise<void> {
  // The DOM lib types `clipboard` as always present, so absence has to be checked at runtime.
  const clipboard = (globalThis as { navigator?: { clipboard?: Clipboard } }).navigator?.clipboard;
  if (clipboard === undefined) {
    button.textContent = 'Clipboard unavailable';
    return;
  }
  try {
    await clipboard.writeText(ruleText());
    button.textContent = 'Copied';
  } catch {
    button.textContent = 'Copy blocked by the browser';
  }
}
