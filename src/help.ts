import { controlGroups } from './controls.ts';
import type { ControlGroup } from './controls.ts';
import { element } from './dom.ts';
import { takesTyping } from './keys.ts';

function renderGroup({ title, note, controls }: ControlGroup): HTMLElement {
  const section = element('section', undefined, 'help-group');
  section.append(element('h3', title));
  if (note) section.append(element('p', note, 'help-note'));
  const list = element('dl', undefined, 'help-list');
  for (const { keys, does } of controls) {
    const term = element('dt');
    // "or" between the ways is for a screen reader; on screen the keys stand apart.
    keys.forEach((key, index) => term.append(...index ? [element('span', ' or ', 'sr-only')] : [], element('kbd', key)));
    list.append(term, element('dd', does));
  }
  section.append(list);
  return section;
}

/**
 * The "?" control for the header and the dialog it opens, which lists controls.ts. A modal dialog: the focus goes in,
 * stays in, and goes back where it was when Escape or the control closes it. A click outside closes it too, leaving
 * the focus to what was clicked. Its keys are its own while it is open, so a walk does not move the page under it and
 * the popup's Escape is not taken with its own.
 */
export function createHelp() {
  const button = element('button', '?', 'control help-toggle');
  button.type = 'button';
  button.title = 'Mouse and keyboard (?)';
  button.setAttribute('aria-label', 'Mouse and keyboard');
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', 'help');

  const dialog = element('section', undefined, 'help-dialog');
  dialog.id = 'help';
  dialog.hidden = true;
  dialog.tabIndex = -1;
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'help-title');
  const title = element('div', undefined, 'popup-title');
  const heading = element('h2', 'Mouse and keyboard');
  heading.id = 'help-title';
  const closeButton = element('button', '×');
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', 'Close');
  closeButton.onclick = () => close();
  title.append(heading, closeButton);
  dialog.append(title, ...controlGroups.map(renderGroup));
  document.body.append(dialog);

  let returnTo: HTMLElement | undefined;

  function open() {
    if (!dialog.hidden) return;
    // Nothing had the focus, as after a click on no control: the control that opens it is where it goes back to.
    const active = document.activeElement;
    returnTo = active instanceof HTMLElement && active !== document.body ? active : button;
    dialog.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    // The dialog itself, so its name is read first and the arrows scroll it.
    dialog.focus({ preventScroll: true });
  }

  function close(returnFocus = true) {
    if (dialog.hidden) return;
    dialog.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (returnFocus) (returnTo?.isConnected ? returnTo : button).focus({ preventScroll: true });
    returnTo = undefined;
  }

  /** Tab wraps within the dialog. */
  function keepFocus(event: KeyboardEvent) {
    const stops = [...dialog.querySelectorAll<HTMLElement>('button, a[href]')];
    const active = document.activeElement;
    const leaving = event.shiftKey ? active === stops[0] || active === dialog : active === stops.at(-1);
    if (!leaving) return;
    event.preventDefault();
    (event.shiftKey ? stops.at(-1) : stops[0])?.focus();
  }

  dialog.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key === 'Escape' || (event.key === '?' && !event.ctrlKey && !event.altKey && !event.metaKey)) {
      event.preventDefault();
      close();
    } else if (event.key === 'Tab') keepFocus(event);
  });
  button.onclick = () => { if (dialog.hidden) open(); else close(); };
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.key !== '?' || event.ctrlKey || event.altKey || event.metaKey || takesTyping(document.activeElement)) return;
    event.preventDefault();
    open();
  });
  document.addEventListener('pointerdown', event => {
    const target = event.target as Node;
    if (!dialog.hidden && !dialog.contains(target) && !button.contains(target)) close(false);
  });
  // Focus sent outside some other way than a click, which closes it, is brought back.
  document.addEventListener('focusin', event => {
    if (!dialog.hidden && !dialog.contains(event.target as Node)) dialog.focus({ preventScroll: true });
  });

  return { button, open, close, get isOpen() { return !dialog.hidden; } };
}
