import { docLabel, sourceHref } from './data.ts';
import type { Site } from './data.ts';
import { element, externalLink, link, scrollToNode } from './dom.ts';
import type { HighlightedLine, HighlightedToken } from './highlight.ts';
import type { SourcePane } from './source-pane.ts';
import type { Document } from './types.ts';
import { valueRowLabel } from './values.ts';
import type { ValueRow } from './values.ts';

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

  /** The name and the close button: what any popup opens with. */
  function open(name: string, opener: HTMLElement) {
    close();
    openerNode = opener;
    const panel = element('section', undefined, 'avp-popup');
    popup = panel;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', name);
    const title = element('div', undefined, 'popup-title');
    title.append(element('strong', name));
    const closeButton = element('button', '×');
    closeButton.setAttribute('aria-label', 'Close');
    closeButton.onclick = () => close(true);
    title.append(closeButton);
    panel.append(title);
    return { panel, closeButton };
  }

  function place(panel: HTMLElement, closeButton: HTMLElement, opener: HTMLElement) {
    document.body.append(panel);
    const bounds = opener.getBoundingClientRect();
    const size = panel.getBoundingClientRect();
    panel.style.left = `${Math.max(12, Math.min(bounds.left, innerWidth - size.width - 12))}px`;
    panel.style.top = `${Math.max(12, Math.min(bounds.bottom + 8, innerHeight - size.height - 12))}px`;
    closeButton.focus({ preventScroll: true });
  }

  /** A value table's name: what its number is of, and the table around it, whose rows go to the source too. */
  function showValue(row: ValueRow, { doc, opener, documentPane }: PopupRequest) {
    const { panel, closeButton } = open(row.name, opener);
    panel.dataset.value = row.name;
    const { table } = row;
    const of = element('p', `${valueRowLabel(table.kind)} ${row.value} of `);
    if (table.avp?.avp) {
      if (table.avp.target) of.append(link(table.avp.avp, { ...table.avp.target, name: table.avp.avp }));
      else of.append(table.avp.avp);
    }
    if (table.featureListId !== null) of.append(` · list ${table.featureListId}`);
    if (table.application) of.append(` · ${table.application}`);
    if (row.mark) of.append(` · ${row.mark}`);
    panel.append(of);
    const source = element('p', 'Source: ');
    const where = `${row.position.section}${row.position.page ? ` · p. ${row.position.page}` : ''}`;
    if (pane.canShow()) {
      const button = element('button', where, 'usage-link source-link');
      button.onclick = () => {
        pane.setVisible(true);
        pane.show(table.rows[active].position, doc, true);
      };
      source.append(button);
    } else {
      const href = sourceHref(doc, row.position, site.mode);
      if (href) source.append(externalLink(where, href.href));
      else source.append(where);
    }
    panel.append(source);
    const actions = element('div', undefined, 'popup-actions');
    const count = element('span');
    const previous = element('button', 'Previous', 'control');
    const next = element('button', 'Next', 'control');
    actions.append(count, previous, next);
    panel.append(actions);
    const list = element('div', undefined, 'usage-list');
    const buttons: HTMLButtonElement[] = [];
    let active = table.rows.indexOf(row);
    const nameNode = (index: number) => documentPane.querySelector<HTMLElement>(`[data-line="${table.rows[index].line}"] .value-name`);
    const mark = (index: number) => {
      active = index;
      count.textContent = `Row ${active + 1}/${table.rows.length}`;
      for (const node of documentPane.querySelectorAll('.avp-current')) node.classList.remove('avp-current');
      nameNode(active)?.classList.add('avp-current');
      for (const button of buttons) button.removeAttribute('aria-current');
      buttons[active].setAttribute('aria-current', 'location');
      if (pane.isOpen()) pane.show(table.rows[active].position, doc, true);
    };
    const select = (index: number) => {
      mark((index + table.rows.length) % table.rows.length);
      const node = nameNode(active);
      if (node) scrollToNode(documentPane, node, 24);
    };
    previous.onclick = () => select(active - 1);
    next.onclick = () => select(active + 1);
    table.rows.forEach((item, index) => {
      const button = element('button', `${item.value} · ${item.name}${item.mark ? ` · ${item.mark}` : ''}`, 'usage-link');
      button.onclick = () => select(index);
      buttons.push(button);
      list.append(button);
    });
    const rows = element('div', undefined, 'usage-details');
    rows.append(element('div', `Table (${table.rows.length})`), list);
    panel.append(rows);
    mark(active);
    place(panel, closeButton, opener);
    buttons[active].scrollIntoView?.({ block: 'nearest' });
  }

  function show(request: PopupRequest) {
    const { token, doc, lines, opener, documentPane } = request;
    if (token.valueRow) { showValue(token.valueRow, request); return; }
    const name = token.avp!;
    const { panel, closeButton } = open(name, opener);
    const lineOf = (node: Element) => node.closest<HTMLElement>('.dad-line')!;
    const seen = new Set<Element>();
    const occurrences = [...documentPane.querySelectorAll<HTMLElement>('[data-avp]')].filter(node => {
      if (node.dataset.avp !== name || seen.has(lineOf(node))) return false;
      seen.add(lineOf(node));
      return true;
    });
    let active = Math.max(0, occurrences.findIndex(node => lineOf(node) === lineOf(opener)));
    panel.dataset.avp = name;
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
    const previous = element('button', 'Previous', 'control');
    const next = element('button', 'Next', 'control');
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
    place(panel, closeButton, opener);
  }

  return { show, close };
}
