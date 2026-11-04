import { namePlaces, placeRoute } from './avp-places.ts';
import type { Place } from './avp-places.ts';
import { sourceHref } from './data.ts';
import type { Site } from './data.ts';
import { counted, element, externalLink, link } from './dom.ts';
import type { HighlightedLine, HighlightedToken } from './highlight.ts';
import type { SourcePane } from './source-pane.ts';
import type { Document } from './types.ts';
import { valueRowLabel } from './values.ts';
import type { ValueRow } from './values.ts';

export interface PopupRequest {
  token: HighlightedToken;
  doc: Document;
  /** The view is of the raw text, whose lines `lines` are. */
  raw: boolean;
  lines: HighlightedLine[];
  opener: HTMLElement;
  documentPane: HTMLElement;
  /** Keeps the place a walk through the list is about to leave. */
  recordJump(): void;
  /** Goes to a node a walk through the list lands on. */
  jumpTo(node: HTMLElement): void;
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

  /** The heading and the close button: what any popup opens with. */
  function open(heading: string, opener: HTMLElement) {
    close();
    openerNode = opener;
    const panel = element('section', undefined, 'avp-popup');
    popup = panel;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', heading);
    const title = element('div', undefined, 'popup-title');
    title.append(element('strong', heading));
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
    // Below the name, or above it where it would otherwise be covered.
    const below = bounds.bottom + 8;
    const above = bounds.top - size.height - 8;
    const top = below + size.height <= innerHeight - 12 ? below : above >= 12 ? above : innerHeight - size.height - 12;
    panel.style.top = `${Math.max(12, top)}px`;
    closeButton.focus({ preventScroll: true });
  }

  /**
   * A target of a name and the two ways to it: both panels, then the pane alone. Each is there only if the place is in
   * that medium. With no way to it in the pane, its label is the publisher's copy at that place, if there is one.
   */
  function placeRow(label: string, className: string, place: Place, { doc, raw }: PopupRequest) {
    const summary = site.summary(place.document);
    if (!summary) return undefined;
    const section = place.position?.section ?? place.target?.section ?? '';
    const where = place.document === doc.id ? section : [site.label(summary), section].filter(Boolean).join(' · ');
    const row = element('div', undefined, `popup-place ${className}`);
    row.append(element('span', `${label}:`));
    const inPane = pane.shows(summary);
    const href = !inPane && place.position ? sourceHref(doc, place.position, site.mode) : null;
    const whereNode = href ? externalLink(where, href.href) : element('span', where);
    whereNode.classList.add('place-where');
    row.append(whereNode);
    if (place.target) {
      const anchor = element('a', 'Jump to', 'control view-action');
      anchor.href = placeRoute(place, doc, raw);
      anchor.title = inPane ? 'Moves the text on the left and the source pane on the right' : 'Moves the text to this place';
      row.append(anchor);
    }
    if (inPane) {
      const button = element('button', 'Show on the right', 'control pane-action');
      button.type = 'button';
      button.title = 'Moves only the source pane on the right, and opens it if it is hidden';
      button.onclick = () => void pane.showPlace(place, doc).catch(console.error);
      row.append(button);
    }
    return row;
  }

  /** A value table's name: what its number is of, and the table around it, whose rows go to the source too. */
  function showValue(row: ValueRow, { doc, opener, documentPane, recordJump, jumpTo }: PopupRequest) {
    const inPane = pane.shows(doc);
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
    if (inPane) {
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
    count.style.minWidth = `${`Row ${table.rows.length}/${table.rows.length}`.length}ch`;
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
      buttons[active].scrollIntoView?.({ block: 'nearest' });
      if (pane.readsDocument()) pane.show(table.rows[active].position, doc, true);
    };
    const select = (index: number) => {
      recordJump();
      mark((index + table.rows.length) % table.rows.length);
      const node = nameNode(active);
      if (node) jumpTo(node);
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
    const rowsTitle = element('div');
    rowsTitle.append(...counted('Table', table.rows.length));
    rows.append(rowsTitle, list);
    panel.append(rows);
    mark(active);
    place(panel, closeButton, opener);
    buttons[active].scrollIntoView?.({ block: 'nearest' });
  }

  function show(request: PopupRequest) {
    const { token, doc, lines, opener, documentPane, recordJump, jumpTo } = request;
    if (token.valueRow) { showValue(token.valueRow, request); return; }
    const name = token.avp!;
    const { panel, closeButton } = open(`Uses of ${name}`, opener);
    const lineOf = (node: Element) => node.closest<HTMLElement>('.dad-line')!;
    const seen = new Set<Element>();
    const uses = [...documentPane.querySelectorAll<HTMLElement>('[data-avp]')].filter(node => {
      if (node.dataset.avp !== name || seen.has(lineOf(node))) return false;
      seen.add(lineOf(node));
      return true;
    });
    let active = Math.max(0, uses.findIndex(node => lineOf(node) === lineOf(opener)));
    panel.dataset.avp = name;
    const { definition, details } = namePlaces(token, lines, doc);
    const places = element('div', undefined, 'popup-places');
    const rows = [definition && placeRow('Definition', 'place-definition', definition, request), details && placeRow('Details', 'place-details', details, request)];
    places.append(...rows.filter(row => row !== undefined));
    if (places.childElementCount) panel.append(places);
    const actions = element('div', undefined, 'popup-actions');
    const count = element('span', `.dad ${active + 1}/${uses.length}`);
    count.style.minWidth = `${`.dad ${uses.length}/${uses.length}`.length}ch`;
    const previous = element('button', 'Previous', 'control');
    const next = element('button', 'Next', 'control');
    actions.append(count, previous, next);
    panel.append(actions);
    const list = element('div', undefined, 'usage-list');
    const buttons: HTMLButtonElement[] = [];
    const select = (index: number) => {
      if (!uses.length) return;
      recordJump();
      active = (index + uses.length) % uses.length;
      count.textContent = `.dad ${active + 1}/${uses.length}`;
      for (const node of uses) node.classList.remove('avp-current');
      for (const button of buttons) button.removeAttribute('aria-current');
      const node = uses[active];
      node.classList.add('avp-current');
      buttons[active].setAttribute('aria-current', 'location');
      buttons[active].scrollIntoView?.({ block: 'nearest' });
      jumpTo(node);
      const line = lineOf(node);
      const position = doc.sections.find(section => section.section === line.dataset.section);
      const row = lines[Number(line.dataset.line)].tokens.find(token => token.avp === name && token.source?.row)?.source;
      if (position && pane.readsDocument()) pane.show(row ?? { ...position, name, exact: true, occurrence: true }, doc, true);
    };
    previous.onclick = () => select(active - 1);
    next.onclick = () => select(active + 1);
    uses.forEach((node, index) => {
      const line = lineOf(node);
      // The spacing only aligns the line with its neighbours in the file.
      const text = lines[Number(line.dataset.line)].tokens.filter(token => !token.kind).map(token => token.text).join('').replace(/\s+/g, ' ').trim();
      const button = element('button', `${line.dataset.section ?? ''} · ${text}`, 'usage-link');
      button.title = button.textContent!;
      button.onclick = () => select(index);
      if (index === active) button.setAttribute('aria-current', 'location');
      buttons.push(button);
      list.append(button);
    });
    const usages = element('div', undefined, 'usage-details');
    const usagesTitle = element('div');
    usagesTitle.append(...counted('Uses', uses.length));
    usages.append(usagesTitle, list);
    panel.append(usages);
    place(panel, closeButton, opener);
    buttons[active]?.scrollIntoView?.({ block: 'nearest' });
  }

  return { show, close };
}
