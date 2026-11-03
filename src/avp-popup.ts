import { docLabel } from './data.ts';
import type { Site } from './data.ts';
import { element, link, scrollToNode } from './dom.ts';
import type { HighlightedLine, HighlightedToken } from './highlight.ts';
import type { SourcePane } from './source-pane.ts';
import type { Document } from './types.ts';

export interface PopupRequest {
  token: HighlightedToken;
  doc: Document;
  lines: HighlightedLine[];
  opener: HTMLElement;
  documentPane: HTMLElement;
}

export type AvpPopup = ReturnType<typeof createAvpPopup>;

export function createAvpPopup(site: Site, pane: SourcePane) {
  let popup: HTMLElement | undefined;
  let openerNode: HTMLElement | undefined;

  function close(returnFocus = false) {
    if (!popup) return;
    popup.remove();
    popup = undefined;
    for (const node of document.querySelectorAll('.avp-current')) node.classList.remove('avp-current');
    if (returnFocus && openerNode?.isConnected) openerNode.focus({ preventScroll: true });
    openerNode = undefined;
  }

  document.addEventListener('keydown', event => { if (event.key === 'Escape') close(true); });
  document.addEventListener('pointerdown', event => {
    if (popup && !popup.contains(event.target as Node)) close();
  });

  function show({ token, doc, lines, opener, documentPane }: PopupRequest) {
    close();
    openerNode = opener;
    const name = token.avp!;
    const lineOf = (node: Element) => node.closest<HTMLElement>('.dad-line')!;
    const seen = new Set<Element>();
    const occurrences = [...documentPane.querySelectorAll<HTMLElement>('[data-avp]')].filter(node => {
      if (node.dataset.avp !== name || seen.has(lineOf(node))) return false;
      seen.add(lineOf(node));
      return true;
    });
    let active = Math.max(0, occurrences.findIndex(node => lineOf(node) === lineOf(opener)));
    const panel = element('section', undefined, 'avp-popup');
    popup = panel;
    panel.dataset.avp = name;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', name);
    const title = element('div', undefined, 'popup-title');
    title.append(element('strong', name));
    const closeButton = element('button', '×');
    closeButton.setAttribute('aria-label', 'Close');
    closeButton.onclick = () => close(true);
    title.append(closeButton);
    panel.append(title);
    const definition = token.target && site.summary(token.target.document);
    if (token.target && definition) {
      const row = element('p', 'Definition: ');
      const anchor = link(`${docLabel(definition)}${token.target.section ? ` · ${token.target.section}` : ''}`, { ...token.target, name });
      anchor.className = 'definition-link';
      row.append(anchor);
      panel.append(row);
    }
    const actions = element('div', undefined, 'popup-actions');
    const count = element('span', `.dad ${active + 1}/${occurrences.length}`);
    const previous = element('button', 'Previous');
    const next = element('button', 'Next');
    actions.append(count, previous, next);
    panel.append(actions);
    const list = element('div', undefined, 'usage-list');
    const buttons: HTMLButtonElement[] = [];
    const select = (index: number) => {
      if (!occurrences.length) return;
      active = (index + occurrences.length) % occurrences.length;
      count.textContent = `.dad ${active + 1}/${occurrences.length}`;
      for (const node of occurrences) node.classList.remove('avp-current');
      for (const button of buttons) button.removeAttribute('aria-current');
      const node = occurrences[active];
      node.classList.add('avp-current');
      buttons[active].setAttribute('aria-current', 'location');
      scrollToNode(documentPane, node, 24);
      const line = lineOf(node);
      const position = doc.sections.find(section => section.section === line.dataset.section);
      const row = lines[Number(line.dataset.line)].tokens.find(token => token.avp === name && token.source?.row)?.source;
      if (position && pane.isOpen()) pane.show(row ?? { ...position, name, exact: true, occurrence: true }, doc, true);
    };
    previous.onclick = () => select(active - 1);
    next.onclick = () => select(active + 1);
    occurrences.forEach((node, index) => {
      const line = lineOf(node);
      const text = lines[Number(line.dataset.line)].tokens.filter(token => !token.kind).map(token => token.text).join('').trim();
      const button = element('button', `${line.dataset.section ?? ''} · ${text}`, 'usage-link');
      button.title = button.textContent!;
      button.onclick = () => select(index);
      if (index === active) button.setAttribute('aria-current', 'location');
      buttons.push(button);
      list.append(button);
    });
    const usages = element('div', undefined, 'usage-details');
    usages.append(element('div', `Mentions (${occurrences.length})`), list);
    panel.append(usages);
    document.body.append(panel);
    const bounds = opener.getBoundingClientRect();
    const size = panel.getBoundingClientRect();
    panel.style.left = `${Math.max(12, Math.min(bounds.left, innerWidth - size.width - 12))}px`;
    panel.style.top = `${Math.max(12, Math.min(bounds.bottom + 8, innerHeight - size.height - 12))}px`;
    closeButton.focus({ preventScroll: true });
  }

  return { show, close };
}
