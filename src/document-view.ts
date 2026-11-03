import { clickAction } from './clicks.ts';
import type { ClickAction } from './clicks.ts';
import { sourceHref } from './data.ts';
import type { Site } from './data.ts';
import { compactComment } from './comments.ts';
import { counted, element, externalLink, link, scrollToNode } from './dom.ts';
import type { HighlightedLine, HighlightedToken } from './highlight.ts';
import { parseRoute, routeFor } from './navigation.ts';
import type { AvpPopup } from './avp-popup.ts';
import type { SourcePane } from './source-pane.ts';
import type { Document, Line, RawDocument } from './types.ts';
import { valueKindTitle, valueRowAt, valueTables } from './values.ts';
import type { ValueRow } from './values.ts';

export interface ViewServices {
  site: Site;
  pane: SourcePane;
  popup: AvpPopup;
  highlight(lines: Line[]): HighlightedLine[];
  navigate(hash: string): void;
}

function correctionNode(token: HighlightedToken, reason: string, id: string): HTMLElement {
  const comment = element('span', undefined, 'correction correction-note');
  const toggle = element('button', compactComment(token.text), 'correction-toggle');
  toggle.type = 'button';
  toggle.title = `${token.text}\n${reason}`;
  toggle.setAttribute('aria-expanded', 'false');
  const full = element('span', ` — ${reason}`, 'correction-detail');
  full.id = id;
  full.hidden = true;
  toggle.setAttribute('aria-controls', id);
  comment.append(toggle, full);
  return comment;
}

function toggleCorrection(toggle: HTMLButtonElement, token: HighlightedToken) {
  const full = toggle.nextElementSibling as HTMLElement;
  full.hidden = !full.hidden;
  toggle.textContent = full.hidden ? compactComment(token.text) : token.text.trimEnd();
  toggle.setAttribute('aria-expanded', String(!full.hidden));
}

function tokenNode(token: HighlightedToken, index: number, doc: Document, site: Site): Node {
  let node: HTMLElement | undefined;
  const source = token.source && !token.target ? sourceHref(doc, token.source, site.mode) : null;
  if (token.target) node = link(token.text, { ...token.target, name: token.target.name ?? token.avp });
  else if (source) node = externalLink(token.text, source.href);
  else if (token.scope.startsWith('markup.underline.link')) node = externalLink(token.text, token.text);
  else if (token.avp) node = element('button', token.text, 'avp-name');
  else if (!token.scope) return document.createTextNode(token.text);
  else node = element('span', token.text);
  if (token.scope) node.classList.add(token.scope);
  if (token.avp) {
    node.dataset.avp = token.avp;
    node.title = 'Alt-click for occurrences';
  }
  if (token.valueRow) {
    node.classList.add('value-name');
    node.title = 'Show its table';
  }
  if (token.avp || token.target || token.source) node.dataset.token = String(index);
  return node;
}

function renderLines(lines: HighlightedLine[], doc: Document, site: Site): HTMLPreElement {
  const pre = element('pre');
  let correction = 0;
  lines.forEach((line, lineIndex) => {
    const row = element('span', undefined, `dad-line ${line.decoration}`.trim());
    row.dataset.line = String(lineIndex);
    if (line.section) row.dataset.section = line.section;
    if (line.warning) { row.classList.add('raw-warning'); row.title = 'Modified in corrected view'; }
    if (line.anchor) row.id = `section-${line.anchor}`;
    if (line.tokens.some(token => token.correction)) row.classList.add('corrected-line');
    line.tokens.forEach((token, index) => {
      const reason = token.correction && doc.corrections[token.correction]?.reason;
      if (reason) {
        const node = correctionNode(token, reason, `correction-${doc.id}-${correction++}`);
        node.dataset.token = String(index);
        row.append(node);
      } else row.append(tokenNode(token, index, doc, site));
    });
    pre.append(row);
  });
  return pre;
}

type SectionLink = (section: string) => HTMLAnchorElement;

/** What a clause's value tables list: "Bits (12)", "Features list 1 (S6a/S6d) (29)". */
function tablesNote(lines: Line[], section: string): string {
  return valueTables(lines).filter(table => table.section === section).map(table => {
    const list = table.featureListId === null ? '' : ` list ${table.featureListId}`;
    return `${valueKindTitle(table.kind)}${list}${table.application ? ` (${table.application})` : ''} (${table.rows.length})`;
  }).join(', ');
}

function renderSections(doc: Document, sectionLink: SectionLink): HTMLElement {
  const list = element('ul', undefined, 'section-list');
  for (const { section, page, title } of doc.sections) {
    const item = element('li');
    const tables = tablesNote(doc.lines, section);
    item.append(sectionLink(section), ' ', element('span', tables ? `${title} · ${tables}` : title));
    if (page) item.append(' ', element('span', `p. ${page}`, 'section-page'));
    list.append(item);
  }
  return list;
}

function renderFindings(doc: Document, sectionLink: SectionLink): HTMLElement {
  const list = element('ul');
  for (const finding of doc.findings) {
    const item = element('li', `${finding.severity} [${finding.rule}] ${finding.message}${finding.accepted_by ? ` (${finding.accepted_by})` : ''} `);
    if (finding.section) item.append(sectionLink(finding.section));
    list.append(item);
  }
  return list;
}

function renderHoles(doc: Document, sectionLink: SectionLink): HTMLElement {
  const list = element('ul');
  for (const hole of doc.holes) {
    const item = element('li', `${hole.name}: ${hole.missing.join(', ')}${hole.recorded ? ` — ${hole.recorded}` : ''} `);
    if (hole.section) item.append(sectionLink(hole.section));
    list.append(item);
  }
  return list;
}

/** A row of toggles and the panels they open under the strip, one at a time. A toggle with nothing to show stays off. */
function renderDiagnostics(panels: { title: string; count: number; list: HTMLElement }[]) {
  const toggles = element('div');
  toggles.id = 'diagnostics';
  const entries = panels.map(({ title, count, list }) => {
    const panel = element('div', undefined, 'diagnostic-panel');
    panel.id = `diagnostic-${title.toLowerCase()}`;
    panel.hidden = true;
    panel.append(list);
    const toggle = element('button', undefined, 'disclosure');
    toggle.type = 'button';
    toggle.append(...counted(title, count));
    toggle.disabled = !count;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', panel.id);
    toggles.append(toggle);
    return { toggle, panel };
  });
  for (const { toggle, panel } of entries) {
    toggle.onclick = () => {
      const opening = panel.hidden;
      for (const other of entries) {
        other.panel.hidden = true;
        other.toggle.setAttribute('aria-expanded', 'false');
      }
      panel.hidden = !opening;
      toggle.setAttribute('aria-expanded', String(opening));
    };
  }
  return { toggles, bodies: entries.map(entry => entry.panel) };
}

/** The first line at or below the pane's top edge that `filter` selects. */
function topRow(documentPane: HTMLElement, filter: string): HTMLElement | undefined {
  const rows = documentPane.querySelectorAll<HTMLElement>(`.dad-line${filter}`);
  const top = documentPane.getBoundingClientRect().top;
  let first = 0;
  let last = rows.length;
  while (first < last) {
    const middle = Math.floor((first + last) / 2);
    if (rows[middle].getBoundingClientRect().bottom <= top) first = middle + 1;
    else last = middle;
  }
  return rows[first] ?? rows[rows.length - 1];
}

export interface DocumentView {
  doc: Document;
  raw: boolean;
  documentPane: HTMLElement;
  scrollToSection(section: string): void;
  scrollToLine(line: number): void;
  /** Marks and scrolls to the line a link points at; no line clears the mark. */
  pointAtLine(line: number | undefined): void;
  focusPosition(): void;
  topLine(): number | undefined;
  /** The value table's row a link to `section` under `name` means, if it means one. */
  valueRow(section: string, name: string): ValueRow | undefined;
}

export function renderDocument(container: HTMLElement, services: ViewServices, doc: Document, raw: RawDocument | undefined): DocumentView {
  const { site, pane, popup } = services;
  const lines = services.highlight(raw ? raw.lines : doc.lines);
  const controls = element('section');
  controls.id = 'controls';
  const documentPane = element('section');
  documentPane.id = 'document';
  documentPane.tabIndex = 0;
  documentPane.setAttribute('aria-label', 'Document text');
  if (doc.raw) {
    const toggle = element('a', raw ? 'Corrected' : 'Raw');
    const refresh = () => {
      const route = parseRoute(location.hash);
      const section = topRow(documentPane, '[data-section]')?.dataset.section ?? route.section;
      toggle.href = routeFor({ document: doc.id, section: section || null, name: section === route.section ? route.name : undefined }, { raw: !raw, source: route.source, paneHidden: route.paneHidden });
    };
    refresh();
    for (const type of ['click', 'auxclick', 'contextmenu']) toggle.addEventListener(type, refresh);
    controls.append(toggle);
  }
  let occurrences = false;
  const occurrencesToggle = element('label', 'Occurrences ', 'visibility-toggle occurrences-toggle');
  occurrencesToggle.title = 'Tap a name to list where this document uses it';
  const occurrencesInput = element('input');
  occurrencesInput.type = 'checkbox';
  occurrencesInput.onchange = () => { occurrences = occurrencesInput.checked; };
  occurrencesToggle.append(occurrencesInput);
  controls.append(occurrencesToggle);
  const workspace = element('div');
  workspace.id = 'workspace';
  pane.mount(workspace, doc);
  if (pane.toggle) controls.append(pane.toggle);
  const pre = renderLines(lines, doc, site);
  documentPane.append(pre);
  workspace.insertBefore(documentPane, workspace.children[1] ?? null);
  const sectionLink: SectionLink = section => {
    const anchor = element('a', section);
    anchor.href = routeFor({ document: doc.id, section }, { raw: Boolean(raw) });
    return anchor;
  };
  const { toggles, bodies } = renderDiagnostics([
    { title: 'Sections', count: doc.sections.length, list: renderSections(doc, sectionLink) },
    { title: 'Findings', count: doc.findings.length, list: renderFindings(doc, sectionLink) },
    { title: 'Holes', count: doc.holes.length, list: renderHoles(doc, sectionLink) },
  ]);
  const tools = element('div');
  tools.id = 'document-tools';
  tools.append(toggles, controls, ...bodies);
  container.replaceChildren(tools, workspace);

  const tokenOf = (node: HTMLElement) => lines[Number(node.closest<HTMLElement>('.dad-line')!.dataset.line)].tokens[Number(node.dataset.token)];
  const showOccurrences = (node: HTMLElement) => popup.show({ token: tokenOf(node), doc, lines, opener: node, documentPane });

  function perform(action: ClickAction, node: HTMLElement) {
    if (action.type === 'occurrences') { showOccurrences(node); return; }
    popup.close();
    if (action.type === 'source') {
      pane.setVisible(true);
      pane.show({ ...doc.sections.find(section => section.section === action.position.section), ...action.position }, doc, true);
    } else if (action.type === 'pane-target') void pane.showTarget(action.target).catch(console.error);
    else if (action.type === 'navigate') services.navigate(routeFor(action.target, pane.switchedOn ? {} : { paneHidden: true }));
  }

  pre.addEventListener('click', event => {
    const target = event.target as Element;
    const correction = target.closest<HTMLButtonElement>('.correction-toggle');
    if (correction) { toggleCorrection(correction, tokenOf(correction.parentElement!)); return; }
    const node = target.closest<HTMLElement>('[data-token]');
    if (!node) return;
    const action = clickAction(tokenOf(node), event, node.closest<HTMLElement>('.dad-line')!.dataset.section, {
      paneOpen: pane.isOpen(),
      sourceInPane: pane.canShow(),
      paneAvailable: document => pane.paneAvailable(site.summary(document)),
      occurrences,
    });
    if (action.type === 'browser') return;
    event.preventDefault();
    perform(action, node);
  });
  pre.addEventListener('keydown', event => {
    const node = (event.target as Element).closest<HTMLElement>('[data-avp], .value-name');
    if (node && (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))) {
      event.preventDefault();
      showOccurrences(node);
    }
  });

  let focusable: HTMLElement | undefined;
  const focusLater = (node: HTMLElement) => {
    node.tabIndex = -1;
    focusable = node;
  };

  return {
    doc,
    raw: Boolean(raw),
    documentPane,
    scrollToSection(section) {
      const anchor = document.getElementById(`section-${section}`);
      if (anchor) {
        scrollToNode(documentPane, anchor);
        focusLater(anchor);
      }
    },
    scrollToLine(line) {
      const row = documentPane.querySelector(`[data-line="${line}"]`);
      if (row) scrollToNode(documentPane, row);
    },
    pointAtLine(line) {
      for (const node of documentPane.querySelectorAll('.target-line')) node.classList.remove('target-line');
      const row = line === undefined ? null : documentPane.querySelector<HTMLElement>(`[data-line="${line}"]`);
      if (!row) return;
      row.classList.add('target-line');
      scrollToNode(documentPane, row);
      focusLater(row);
    },
    focusPosition() {
      focusable?.focus({ preventScroll: true });
    },
    topLine() {
      const row = topRow(documentPane, '');
      return row && Number(row.dataset.line);
    },
    valueRow: (section, name) => valueRowAt(raw ? raw.lines : doc.lines, section, name),
  };
}
