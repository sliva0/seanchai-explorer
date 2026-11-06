import { avpIdentities, avpTables } from './avp-facts.ts';
import type { AvpIdentity } from './avp-facts.ts';
import { namePlaces, placeRoute } from './avp-places.ts';
import { allCommands, blockPlace, commandOf, definitionsOf, partnerOf, registryRows, rowPlace, tablePlace, tablesOf } from './command-places.ts';
import type { Command } from './command-places.ts';
import { commandKey, isRequest } from './commands.ts';
import type { CommandRef } from './commands.ts';
import type { Place } from './avp-places.ts';
import { sourceHref } from './data.ts';
import type { Site } from './data.ts';
import { counted, element, externalLink, link } from './dom.ts';
import type { HighlightedLine, HighlightedToken } from './highlight.ts';
import type { SourcePane } from './source-pane.ts';
import type { Document, Line } from './types.ts';
import { valueRowLabel, valueTableTitle } from './values.ts';
import type { ValueRow } from './values.ts';

export interface PopupRequest {
  token: HighlightedToken;
  doc: Document;
  /** The view is of the raw text, whose lines `lines` are. */
  raw: boolean;
  lines: HighlightedLine[];
  /** The file's own lines, which `lines` decorate. */
  fileLines: Line[];
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
  function placeRow(label: string, className: string, place: Place, { doc, raw }: PopupRequest, said?: string) {
    const summary = site.summary(place.document);
    if (!summary) return undefined;
    const section = place.position?.section ?? place.target?.section ?? '';
    const where = said ?? (place.document === doc.id ? section : [site.label(summary), section].filter(Boolean).join(' · '));
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

  /** An identity in a line: "Code 1405 · Vendor-ID 10415 · Unsigned32". IETF's vendor 0 is no vendor to name. */
  const identityText = ({ code, vendor, type }: AvpIdentity) =>
    [code === undefined ? '' : `Code ${code}`, vendor ? `Vendor-ID ${vendor}` : '', type ?? ''].filter(Boolean).join(' · ');

  /**
   * What the files at hand say a name is, and the tables of its numbers: this one's, and the one its link names if
   * that has been loaded already. A table here is gone to in the pane at its first row, a result code's at its clause,
   * an `Enumerated AVP` block as Details are; one in another document at its clause there.
   */
  function facts(request: PopupRequest) {
    const { token, doc, fileLines } = request;
    const name = token.avp!;
    const away = token.target && token.target.document !== doc.id ? site.held(token.target.document) : undefined;
    const files = [...away ? [{ lines: away.lines, name: token.target!.name ?? name, document: away.id }] : [], { lines: fileLines, name, document: doc.id }];
    const identities = avpIdentities(files).map(identityText).filter(Boolean);
    const tables = [...files].reverse().flatMap(({ lines, name, document }) => avpTables(lines, name).map(table => {
      const { section, page, line } = table;
      const position = !('rows' in table) ? { section, page, name, row: true, titled: true } : table.kind === 'result-codes' ? { section, page } : table.rows[0].position;
      const place: Place = { document, ...document === doc.id ? { position } : {}, target: { document, section }, line };
      return placeRow('rows' in table ? valueTableTitle(table) : 'Enumerated', 'place-table', place, request);
    }));
    return { identities, tables: tables.filter(row => row !== undefined) };
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

  /** "Code 271 · Answer · PXY", then its application, and where the id comes from when the header prints none. */
  function commandIdentity(command: Pick<Command, 'code' | 'flags' | 'header' | 'application' | 'scope'>): string[] {
    const head = [`Code ${command.code}`, isRequest(command) ? 'Request' : 'Answer', command.flags.join(', ')].filter(Boolean).join(' · ');
    if (command.application === null) return [head, 'No Application-ID: the header prints none'];
    const from = command.header === null && command.scope ? `from ${command.scope.section}, not the header` : '';
    return [head, [`Application-ID ${command.application}`, command.scope?.name ?? '', from].filter(Boolean).join(' · ')];
  }

  /** What tells a definition from the one the popup is of: its name where that is another, its code and application where they are. */
  function difference(other: Command, command: Command | undefined): string {
    const application = other.application === null ? 'no Application-ID' : `Application-ID ${other.application}${other.scope?.name ? ` ${other.scope.name}` : ''}`;
    return [
      other.section,
      !command || other.name !== command.name ? other.name : '',
      command && other.code !== command.code ? `code ${other.code}` : '',
      command && other.application !== command.application ? application : '',
    ].filter(Boolean).join(' · ');
  }

  /** A run of rows in the targets' grid, under its title and count if `titled`, left out when it has none. */
  function group(title: string, className: string, rows: (HTMLElement | undefined)[], titled = true) {
    const kept = rows.filter(row => row !== undefined);
    if (!kept.length) return [];
    const node = element('div', undefined, `popup-group ${className}`);
    node.setAttribute('role', 'group');
    node.setAttribute('aria-label', title);
    if (titled) {
      const heading = element('div', undefined, 'popup-group-title');
      heading.append(...counted(title, kept.length));
      node.append(heading);
    }
    node.append(...kept);
    return [node];
  }

  /**
   * A command's popup: what its header says, its block, the other half, its tables and registry row, and every other
   * document printing it, then those printing its name for another command. The corpus's are the index's, which the
   * document's view has waited for; what is in this file is read from the lines the view shows.
   */
  function showCommand(ref: CommandRef, request: PopupRequest) {
    const { doc, fileLines, opener } = request;
    const index = site.commands();
    const command = commandOf(ref, doc, index);
    const name = command?.name ?? ref.name;
    const abbreviation = command ? command.abbreviation : ref.abbreviation;
    const heading = abbreviation ? `${name} (${abbreviation})` : name;
    const { panel, closeButton } = open(heading, opener);
    panel.dataset.command = commandKey(ref);
    opener.classList.add('avp-current');
    const identity = element('div', undefined, 'popup-identity');
    identity.append(...(command ? commandIdentity(command) : [`Code ${ref.code} · ${ref.request ? 'Request' : 'Answer'}`]).map(text => element('p', text)));
    panel.append(identity);
    const all = allCommands(fileLines, doc, index);
    const label = (place: Place) => site.summary(place.document) ? site.label(site.summary(place.document)!) : place.document;
    const rows: HTMLElement[] = [];
    const add = (...found: (HTMLElement | undefined)[]) => rows.push(...found.filter(row => row !== undefined));
    if (command) {
      add(placeRow('Definition', 'place-definition', blockPlace(command, doc), request));
      const partner = partnerOf(command, all);
      if (partner) {
        const place = blockPlace(partner, doc);
        const where = [partner.document === doc.id ? '' : label(place), partner.section, partner.abbreviation ?? partner.name].filter(Boolean).join(' · ');
        add(placeRow(isRequest(partner) ? 'Request' : 'Answer', 'place-partner', place, request, where));
      }
      add(...group('Tables', 'popup-tables', tablesOf(command, fileLines, doc).map(table =>
        placeRow('AVP table', 'place-table', tablePlace(table, doc), request, [table.section, table.table && `table ${table.table}`].filter(Boolean).join(' · '))), false));
    }
    add(...registryRows(ref, fileLines, doc, index).map(row => {
      const place = rowPlace(row, doc);
      return placeRow('Registry', 'place-registry', place, request, [row.document === doc.id ? '' : label(place), row.section, row.table && `table ${row.table}`].filter(Boolean).join(' · '));
    }));
    const otherRow = (other: Command, className: string, mark = '') => {
      const place = blockPlace(other, doc);
      return placeRow(`${mark}${label(place)}`, className, place, request, difference(other, command));
    };
    if (command) {
      const { same, differing } = definitionsOf(command, all);
      add(...group('Other definitions', 'popup-others', same.map(other => otherRow(other, 'place-other'))));
      add(...group('Same name, other command', 'popup-differing', differing.map(other => otherRow(other, 'place-other place-differs', '≠ '))));
    } else {
      const printed = all.filter(other => other.code === ref.code && isRequest(other) === ref.request);
      add(...group('Definitions', 'popup-others', printed.map(other => otherRow(other, 'place-other'))));
    }
    if (rows.length) {
      const places = element('div', undefined, 'popup-places command-places');
      places.append(...rows);
      panel.append(places);
    }
    place(panel, closeButton, opener);
  }

  function show(request: PopupRequest) {
    const { token, doc, lines, opener, documentPane, recordJump, jumpTo } = request;
    if (token.valueRow) { showValue(token.valueRow, request); return; }
    if (token.command) { showCommand(token.command, request); return; }
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
    const { identities, tables } = facts(request);
    if (identities.length) {
      const identity = element('div', undefined, 'popup-identity');
      identity.append(...identities.map(text => element('p', text)));
      panel.append(identity);
    }
    const { definition, details } = namePlaces(token, lines, doc);
    const places = element('div', undefined, 'popup-places');
    const rows = [definition && placeRow('Definition', 'place-definition', definition, request), details && placeRow('Details', 'place-details', details, request)];
    places.append(...rows.filter(row => row !== undefined));
    // In the targets' grid, for their columns to line up.
    if (tables.length) {
      const values = element('div', undefined, 'popup-tables');
      values.setAttribute('role', 'group');
      values.setAttribute('aria-label', 'Value tables');
      values.append(...tables);
      places.append(values);
    }
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
