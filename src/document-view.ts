import { clickAction } from './clicks.ts';
import type { ClickAction } from './clicks.ts';
import { sourceHref } from './data.ts';
import type { Site } from './data.ts';
import { element, externalLink, link, scrollToNode } from './dom.ts';
import type { HighlightedLine, HighlightedToken } from './highlight.ts';
import { parseRoute, routeFor } from './navigation.ts';
import type { AvpPopup } from './avp-popup.ts';
import type { SourcePane } from './source-pane.ts';
import type { Document, Line, RawDocument } from './types.ts';

export interface ViewServices {
  site: Site;
  pane: SourcePane;
  popup: AvpPopup;
  highlight(lines: Line[]): HighlightedLine[];
  navigate(hash: string): void;
}

function correctionNode(token: HighlightedToken, reason: string, id: string): HTMLElement {
  const comment = element('span', undefined, 'correction correction-note');
  const toggle = element('button', token.text.trimEnd(), 'correction-toggle');
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

function toggleCorrection(toggle: HTMLButtonElement) {
  const full = toggle.nextElementSibling as HTMLElement;
  full.hidden = !full.hidden;
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

function renderSections(doc: Document, sectionLink: SectionLink): HTMLElement {
  const sections = element('details');
  sections.append(element('summary', `Sections (${doc.sections.length})`));
  const list = element('ul', undefined, 'section-list');
  for (const { section, page, title } of doc.sections) {
    const item = element('li');
    item.append(sectionLink(section), ` ${title}`);
    if (page) item.append(` · p. ${page}`);
    list.append(item);
  }
  sections.append(list);
  return sections;
}

function renderFindings(doc: Document, sectionLink: SectionLink): HTMLElement {
  const findings = element('details');
  findings.append(element('summary', `Findings (${doc.findings.length})`));
  const list = element('ul');
  for (const finding of doc.findings) {
    const item = element('li', `${finding.severity} [${finding.rule}] ${finding.message}${finding.accepted_by ? ` (${finding.accepted_by})` : ''} `);
    if (finding.section) item.append(sectionLink(finding.section));
    list.append(item);
  }
  findings.append(list);
  return findings;
}

function renderHoles(doc: Document, sectionLink: SectionLink): HTMLElement {
  const holes = element('details');
  holes.append(element('summary', `Holes (${doc.holes.length})`));
  const list = element('ul');
  for (const hole of doc.holes) {
    const item = element('li', `${hole.name}: ${hole.missing.join(', ')}${hole.recorded ? ` — ${hole.recorded}` : ''} `);
    if (hole.section) item.append(sectionLink(hole.section));
    list.append(item);
  }
  holes.append(list);
  return holes;
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
  const occurrencesToggle = element('button', 'Occurrences', 'occurrences-toggle');
  occurrencesToggle.type = 'button';
  occurrencesToggle.title = 'Tap a name to list where this document uses it';
  occurrencesToggle.setAttribute('aria-pressed', 'false');
  occurrencesToggle.onclick = () => {
    occurrences = !occurrences;
    occurrencesToggle.setAttribute('aria-pressed', String(occurrences));
  };
  controls.append(occurrencesToggle);
  const workspace = element('div');
  workspace.id = 'workspace';
  pane.mount(workspace, doc);
  if (pane.toggle) controls.append(pane.toggle);
  const pre = renderLines(lines, doc, site);
  documentPane.append(pre);
  workspace.insertBefore(documentPane, workspace.children[1] ?? null);
  const diagnostics = element('div');
  diagnostics.id = 'diagnostics';
  const sectionLink: SectionLink = section => {
    const anchor = element('a', section);
    anchor.href = routeFor({ document: doc.id, section }, { raw: Boolean(raw) });
    return anchor;
  };
  diagnostics.append(renderSections(doc, sectionLink), renderFindings(doc, sectionLink), renderHoles(doc, sectionLink));
  const tools = element('div');
  tools.id = 'document-tools';
  tools.append(diagnostics, controls);
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
    if (correction) { toggleCorrection(correction); return; }
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
    const node = (event.target as Element).closest<HTMLElement>('[data-avp]');
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
  };
}
