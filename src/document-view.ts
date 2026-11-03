import { clickAction } from './clicks.ts';
import type { ClickAction } from './clicks.ts';
import { compactComment } from './comments.ts';
import { sourceHref } from './data.ts';
import type { Site } from './data.ts';
import { element, externalLink, link, scrollToNode } from './dom.ts';
import type { HighlightedLine, HighlightedToken } from './highlight.ts';
import { parseRoute, routeFor } from './navigation.ts';
import type { AvpPopup } from './avp-popup.ts';
import type { SourcePane } from './source-pane.ts';
import type { Document, Line, RawDocument, Target } from './types.ts';

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

function renderFindings(doc: Document): HTMLElement {
  const findings = element('details');
  findings.append(element('summary', `Findings (${doc.findings.length})`));
  const list = element('ul');
  for (const finding of doc.findings) {
    const item = element('li', `${finding.severity} [${finding.rule}] ${finding.message}${finding.accepted_by ? ` (${finding.accepted_by})` : ''} `);
    if (finding.section) item.append(link(finding.section, { document: doc.id, section: finding.section }));
    list.append(item);
  }
  findings.append(list);
  return findings;
}

function renderHoles(doc: Document): HTMLElement {
  const holes = element('details');
  holes.append(element('summary', `Holes (${doc.holes.length})`));
  const list = element('ul');
  for (const hole of doc.holes) list.append(element('li', `${hole.name}: ${hole.missing.join(', ')}${hole.recorded ? ` — ${hole.recorded}` : ''}`));
  holes.append(list);
  return holes;
}

export interface DocumentView {
  doc: Document;
  raw: boolean;
  documentPane: HTMLElement;
  scrollToSection(section: string): void;
  scrollToLine(line: number): void;
}

export function renderDocument(container: HTMLElement, services: ViewServices, doc: Document, raw: RawDocument | undefined): DocumentView {
  const { site, pane, popup } = services;
  const lines = services.highlight(raw ? raw.lines : doc.lines);
  const controls = element('section');
  controls.id = 'controls';
  if (doc.raw) {
    const route = parseRoute(location.hash);
    const toggle = element('a', raw ? 'Corrected' : 'Raw');
    toggle.href = routeFor({ document: doc.id, section: route.section || null, name: route.name }, { raw: !raw });
    controls.append(toggle);
  }
  const workspace = element('div');
  workspace.id = 'workspace';
  pane.mount(workspace, doc);
  if (pane.toggle) controls.append(pane.toggle);
  const documentPane = element('section');
  documentPane.id = 'document';
  const pre = renderLines(lines, doc, site);
  documentPane.append(pre);
  workspace.insertBefore(documentPane, workspace.children[1] ?? null);
  const diagnostics = element('div');
  diagnostics.id = 'diagnostics';
  diagnostics.append(renderFindings(doc), renderHoles(doc));
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
      pane.show({ ...doc.sections.find(section => section.section === action.position.section), ...action.position }, doc);
    } else if (action.type === 'pane-target') void pane.showTarget(action.target).catch(console.error);
    else if (action.type === 'navigate') services.navigate(routeFor(action.target as Target));
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
      occurrences: false,
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

  return {
    doc,
    raw: Boolean(raw),
    documentPane,
    scrollToSection(section) {
      const anchor = document.getElementById(`section-${section}`);
      if (anchor) scrollToNode(documentPane, anchor);
    },
    scrollToLine(line) {
      const row = documentPane.querySelector(`[data-line="${line}"]`);
      if (row) scrollToNode(documentPane, row);
    },
  };
}
