/**
 * The battle-order chooser (PLAN.md §1.7, §6 Stage 7).
 *
 * §1.7 promises the player a choice of battle order, and the original gives it without ever
 * explaining the consequences. This screen shows every contested card **with the odds against it**,
 * because that is the information a decision actually needs: a 20% fight is worth taking only when
 * the alternative is worse.
 *
 * `battleChoices()` in the controller does the work and is testable without a DOM; this file only
 * paints it.
 */

import type { BattleChoice } from '../app.ts';

/** Formats a probability as a percentage a player can read at a glance. */
export function percentLabel(probability: number): string {
  return `${Math.round(probability * 100)}%`;
}

/** A plain-English verdict, so the number is not the only signal. */
export function verdict(probability: number): string {
  if (probability >= 0.75) return 'a strong fight';
  if (probability >= 0.55) return 'favoured';
  if (probability >= 0.45) return 'a coin flip';
  if (probability >= 0.25) return 'unfavourable';
  return 'a losing fight';
}

/** Builds the chooser DOM and wires each option to `onChoose`. */
export function renderBattlePicker(
  container: HTMLElement,
  choices: readonly BattleChoice[],
  onChoose: (cell: BattleChoice['cell']) => void,
): void {
  container.textContent = '';
  container.hidden = choices.length === 0;
  if (choices.length === 0) return;

  container.setAttribute('role', 'group');
  container.setAttribute('aria-label', 'Choose which card to fight first');

  const heading = document.createElement('h2');
  heading.className = 'picker-heading';
  heading.textContent =
    choices.length === 1
      ? 'One card points back — fight it'
      : 'Several cards point back — choose one';
  container.append(heading);

  const list = document.createElement('div');
  list.className = 'picker-list';

  for (const choice of choices) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'picker-option';
    button.setAttribute('data-cell', String(choice.cell));
    button.setAttribute(
      'aria-label',
      `Fight ${choice.defender.name}, ${choice.defender.statCode}. You win ${percentLabel(choice.probability)} of the time, ${verdict(choice.probability)}.`,
    );

    const names = document.createElement('span');
    names.className = 'picker-names';
    names.textContent = `${choice.attacker.name}  vs  ${choice.defender.name}`;

    const codes = document.createElement('span');
    codes.className = 'picker-codes';
    codes.textContent = `${choice.attacker.statCode}  vs  ${choice.defender.statCode}`;

    const odds = document.createElement('span');
    odds.className = 'picker-odds';
    odds.textContent = `${percentLabel(choice.probability)} — ${verdict(choice.probability)}`;

    const arrows = document.createElement('span');
    arrows.className = 'picker-arrows';
    // Arrow counts matter: the loser's arrows decide the combo, so a heavily armed defender is
    // worse to fight than its numbers alone suggest.
    arrows.textContent = `their ${choice.defender.arrowCount} arrows combo on a loss`;

    button.append(names, codes, odds, arrows);
    button.addEventListener('click', () => {
      onChoose(choice.cell);
    });
    list.append(button);
  }

  container.append(list);
}
