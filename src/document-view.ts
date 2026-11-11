import { readClickTarget, writeClickTarget } from './click-target.ts';
import type { ClickTarget } from './click-target.ts';
import { clickAction, nameTitle } from './clicks.ts';
import type { ClickAction, ClickContext } from './clicks.ts';
import { commandKey } from './commands.ts';
import { sourceHref } from './data.ts';
import type { Site } from './data.ts';
import { compactComment } from './comments.ts';
import { counted, element, externalLink, link, scrollTopFor } from './dom.ts';
import type { HighlightedLine, HighlightedToken } from './highlight.ts';
import { parseRoute, routeFor } from './navigation.ts';
import { fallbackPlace, markDetails, placeRoute, tokenPlace } from './avp-places.ts';
import type { AvpPopup } from './avp-popup.ts';
import type { ScrollPosition } from './positions.ts';
import { createScroller } from './scroll.ts';
import type { SourcePane } from './source-pane.ts';
import type { Document, Line, RawDocument } from './types.ts';
import { valueRowAt, valueTables, valueTableTitle } from './values.ts';
import type { ValueRow } from './values.ts';

export interface ViewServices {
  site: Site;
  pane: SourcePane;
  popup: AvpPopup;
  highlight(lines: Line[]): HighlightedLine[];
  navigate(hash: string): void;
  /** Keeps the place about to be left, for a jump this view makes itself. */
  recordJump(): void;
  /** The view has come to rest somewhere new. */
  scrolled(view: DocumentView): void;
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

/** Until a pointer or focus comes to a name and its title is worked out for the pane as it then is. */
const paneless: ClickContext = { paneShows: () => false, paneOn: false, uses: false };

function tokenNode(token: HighlightedToken, index: number, line: HighlightedLine, lines: HighlightedLine[], doc: Document, site: Site, prefer: ClickTarget): Node {
  let node: HTMLElement | undefined;
  const source = token.source && !token.target ? sourceHref(doc, token.source, site.mode) : null;
  if (token.target) node = link(token.text, { ...token.target, name: token.target.name ?? token.avp });
  else if (source) node = externalLink(token.text, source.href);
  else if (token.scope.startsWith('markup.underline.link')) node = externalLink(token.text, token.text);
  else if (token.avp || token.command) node = element('button', token.text, 'avp-name');
  else if (!token.scope) return document.createTextNode(token.text);
  else node = element('span', token.text);
  if (token.scope) node.classList.add(token.scope);
  if (token.avp) node.dataset.avp = token.avp;
  if (token.command) node.dataset.command = commandKey(token.command);
  if (token.valueRow) node.classList.add('value-name');
  const commands = site.commands();
  if (token.avp || token.valueRow || token.command) node.title = nameTitle(token, tokenPlace(token, lines, doc, line.section ?? undefined, prefer, commands), paneless, fallbackPlace(token, lines, doc, prefer, commands));
  if (token.avp || token.command || token.target || token.source) node.dataset.token = String(index);
  return node;
}

function renderLines(lines: HighlightedLine[], doc: Document, site: Site, prefer: ClickTarget): HTMLPreElement {
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
      } else row.append(tokenNode(token, index, line, lines, doc, site, prefer));
    });
    pre.append(row);
  });
  return pre;
}

type SectionLink = (section: string) => HTMLAnchorElement;

/** What a clause's value tables list: "Bits (12)", "Features list 1 (S6a/S6d) (29)". */
function tablesNote(lines: Line[], section: string): string {
  return valueTables(lines).filter(table => table.section === section).map(table => `${valueTableTitle(table)} (${table.rows.length})`).join(', ');
}

function renderSections(doc: Document, sectionLink: SectionLink): HTMLElement {
  const list = element('ul', undefined, 'section-list');
  for (const { section, page, title } of doc.sections) {
    const item = element('li');
    const tables = tablesNote(doc.lines, section);
    item.dataset.section = section;
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
  const setOpen = (entry: typeof entries[number], opening: boolean) => {
    for (const other of entries) {
      other.panel.hidden = true;
      other.toggle.setAttribute('aria-expanded', 'false');
    }
    entry.panel.hidden = !opening;
    entry.toggle.setAttribute('aria-expanded', String(opening));
  };
  for (const entry of entries) entry.toggle.onclick = () => setOpen(entry, entry.panel.hidden === true);
  return { toggles, bodies: entries.map(entry => entry.panel), open: (index: number) => setOpen(entries[index], true) };
}

/** The choice of a name's place a click goes to first, kept for every document and tab. */
function renderClickTarget(current: ClickTarget, onChange: (target: ClickTarget) => void): HTMLElement {
  const group = element('div', 'Click goes to', 'click-target');
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', 'Click goes to');
  group.title = 'What a click or alt-click on a name goes to where it has both; right-click offers both';
  for (const [target, label] of [['definition', 'Definition'], ['details', 'Details']] as const) {
    // A radio before its word, where a box follows a toggle's: each is told from the other.
    const option = element('label', label, 'visibility-toggle');
    const input = element('input');
    input.type = 'radio';
    input.name = 'click-target';
    input.value = target;
    // What the browser would restore on a reload is the stored choice's to say.
    input.autocomplete = 'off';
    input.checked = target === current;
    input.onchange = () => { if (input.checked) onChange(target); };
    option.prepend(input);
    group.append(option);
  }
  return group;
}

/** How far below the top edge a jump leaves a line. */
const JUMP_MARGIN = 12;

/** The first of `rows`, which run down the page, that reaches below `edge`. */
function topRow(rows: HTMLElement[], edge: number): HTMLElement | undefined {
  let first = 0;
  let last = rows.length;
  while (first < last) {
    const middle = Math.floor((first + last) / 2);
    if (rows[middle].getBoundingClientRect().bottom <= edge) first = middle + 1;
    else last = middle;
  }
  return rows[first] ?? rows[rows.length - 1];
}

export interface DocumentView {
  doc: Document;
  raw: boolean;
  documentPane: HTMLElement;
  /** Marks the line a link points at and returns it; no line clears the mark. */
  pointAtLine(line: number | undefined): HTMLElement | undefined;
  /** A section's line, to jump to. */
  sectionRow(section: string): HTMLElement | undefined;
  /** Goes to a line a link points at, leaving it just below the top edge. */
  jumpTo(row: HTMLElement, options: { smooth: boolean; flash: boolean; margin?: number }): void;
  /** Puts a line at the top edge, with `offset` pixels of it above the edge if given. */
  restore(top: number, offset?: number): void;
  /** Ends a smooth scroll at its goal, so that what is read next is where the view is going. */
  settle(): void;
  focusPosition(): void;
  position(): ScrollPosition | undefined;
  pointedLine(): number | undefined;
  /** The value table's row a link to `section` under `name` means, if it means one. */
  valueRow(section: string, name: string): ValueRow | undefined;
}

export function renderDocument(container: HTMLElement, services: ViewServices, doc: Document, raw: RawDocument | undefined): DocumentView {
  const { site, pane, popup } = services;
  const fileLines = raw ? raw.lines : doc.lines;
  markDetails(fileLines, doc);
  const lines = services.highlight(fileLines);
  const controls = element('section');
  controls.id = 'controls';
  const documentPane = element('section');
  documentPane.id = 'document';
  documentPane.tabIndex = 0;
  documentPane.setAttribute('aria-label', 'Document text');
  const scroller = createScroller(documentPane);
  let rows: HTMLElement[] = [];
  let sectionRows: HTMLElement[] = [];
  /** The section a jump to it leaves at the top of the view, where its line sits below the margin and the end of the last section still shows above. */
  const currentSection = () => topRow(sectionRows, documentPane.getBoundingClientRect().top + JUMP_MARGIN + 4)?.dataset.section;
  if (doc.raw) {
    const toggle = element('a', raw ? 'Corrected' : 'Raw');
    const refresh = () => {
      const route = parseRoute(location.hash);
      const section = currentSection() ?? route.section;
      toggle.href = routeFor({ document: doc.id, section: section || null, name: section === route.section ? route.name : undefined }, { raw: !raw, source: route.source, paneHidden: route.paneHidden });
    };
    refresh();
    for (const type of ['click', 'auxclick', 'contextmenu']) toggle.addEventListener(type, refresh);
    controls.append(toggle);
  }
  const usesToggle = element('label', 'Click shows uses ', 'visibility-toggle uses-toggle');
  usesToggle.title = 'Plain click lists where a name is used instead of going to it';
  const usesInput = element('input');
  usesInput.type = 'checkbox';
  // Each document starts with it off, whatever the browser would restore on a reload.
  usesInput.autocomplete = 'off';
  usesInput.checked = false;
  usesToggle.append(usesInput);
  let prefer = readClickTarget();
  controls.append(usesToggle, renderClickTarget(prefer, target => { prefer = target; writeClickTarget(target); }));
  const workspace = element('div');
  workspace.id = 'workspace';
  pane.mount(workspace, doc);
  if (pane.toggle) controls.append(pane.toggle);
  const pre = renderLines(lines, doc, site, prefer);
  documentPane.append(pre);
  rows = [...pre.querySelectorAll<HTMLElement>('.dad-line')];
  sectionRows = rows.filter(row => row.dataset.section);
  workspace.insertBefore(documentPane, workspace.children[1] ?? null);
  const sectionLink: SectionLink = section => {
    const anchor = element('a', section);
    anchor.href = routeFor({ document: doc.id, section }, { raw: Boolean(raw) });
    return anchor;
  };
  const { toggles, bodies, open } = renderDiagnostics([
    { title: 'Findings', count: doc.findings.length, list: renderFindings(doc, sectionLink) },
    { title: 'Holes', count: doc.holes.length, list: renderHoles(doc, sectionLink) },
    { title: 'Sections', count: doc.sections.length, list: renderSections(doc, sectionLink) },
  ]);
  const sectionsPanel = bodies.length - 1;
  const tools = element('div');
  tools.id = 'document-tools';
  const crumb = element('button', undefined, 'section-crumb');
  crumb.type = 'button';
  const crumbSlot = element('div', undefined, 'crumb-slot');
  crumbSlot.append(crumb);
  // One control over one panel: its toggle opens and closes it, its crumb opens it at the current entry.
  const sectionControl = element('div', undefined, 'section-control');
  sectionControl.setAttribute('role', 'group');
  sectionControl.setAttribute('aria-label', 'Sections');
  sectionControl.append(toggles.lastElementChild!, crumbSlot);
  toggles.append(sectionControl);
  tools.append(toggles, controls, ...bodies);
  container.replaceChildren(tools, workspace);

  const tokenOf = (node: HTMLElement) => lines[Number(node.closest<HTMLElement>('.dad-line')!.dataset.line)].tokens[Number(node.dataset.token)];
  const showUses = (node: HTMLElement) => popup.show({
    token: tokenOf(node), doc, raw: Boolean(raw), lines, fileLines, opener: node, documentPane,
    recordJump: services.recordJump,
    jumpTo: target => jumpTo(target, { smooth: true, flash: true, margin: 24 }),
  });
  const nameAt = (target: EventTarget | null) => (target as Element).closest<HTMLElement>('[data-avp], [data-command], .value-name');
  const sectionAt = (node: HTMLElement) => node.closest<HTMLElement>('.dad-line')!.dataset.section;
  const clickContext = (): ClickContext => ({
    paneShows: document => pane.shows(site.summary(document)),
    paneOn: pane.switchedOn,
    uses: usesInput.checked,
  });
  const placeOf = (node: HTMLElement) => tokenPlace(tokenOf(node), lines, doc, sectionAt(node), prefer, site.commands());
  const fallbackOf = (node: HTMLElement) => fallbackPlace(tokenOf(node), lines, doc, prefer, site.commands());

  function perform(action: ClickAction, node: HTMLElement) {
    if (action.type === 'uses') { showUses(node); return; }
    popup.close();
    // Nothing moves in the view when the pane alone does, so the jump list has nothing to keep.
    if (action.type === 'pane') pane.openPlace(action.place, doc);
    else if (action.type === 'both') services.navigate(placeRoute(action.place, doc, Boolean(raw), !pane.switchedOn));
    else if (action.type === 'new-tab') {
      const anchor = node.closest('a');
      if (anchor) window.open(anchor.href, anchor.target, anchor.rel);
    }
  }

  pre.addEventListener('click', event => {
    const target = event.target as Element;
    const correction = target.closest<HTMLButtonElement>('.correction-toggle');
    if (correction) { toggleCorrection(correction, tokenOf(correction.parentElement!)); return; }
    const node = target.closest<HTMLElement>('[data-token]');
    if (!node) return;
    const action = clickAction(tokenOf(node), placeOf(node), event, clickContext(), fallbackOf(node));
    if (action.type === 'browser') return;
    event.preventDefault();
    perform(action, node);
  });
  pre.addEventListener('contextmenu', event => {
    const node = nameAt(event.target);
    if (!node) return;
    event.preventDefault();
    showUses(node);
  });
  pre.addEventListener('keydown', event => {
    const node = nameAt(event.target);
    if (node && (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))) {
      event.preventDefault();
      showUses(node);
    }
  });
  // What a click does depends on the pane and the control, so a title says it as they are when it shows.
  for (const type of ['mouseover', 'focusin']) {
    pre.addEventListener(type, event => {
      const node = nameAt(event.target);
      if (node) node.title = nameTitle(tokenOf(node), placeOf(node), clickContext(), fallbackOf(node));
    });
  }

  let focusable: HTMLElement | undefined;
  const focusLater = (node: HTMLElement | undefined) => {
    if (node) node.tabIndex = -1;
    focusable = node;
  };

  /** A stronger tint fading to the line's own, once it has come to rest, to show where the motion ended. */
  function flash(row: HTMLElement) {
    row.classList.remove('landing');
    void row.offsetWidth;
    row.classList.add('landing');
    row.addEventListener('animationend', () => row.classList.remove('landing'), { once: true });
  }

  const sectionTitles = new Map(doc.sections.map(({ section, title }) => [section, title]));
  const showCrumb = () => {
    const section = currentSection();
    const title = sectionTitles.get(section ?? '');
    crumb.textContent = section ? [section, title].filter(Boolean).join(' · ') : '';
    crumb.disabled = !section;
    crumb.dataset.section = section ?? '';
    crumb.title = section ? `${crumb.textContent}: show in Sections` : '';
  };
  crumb.onclick = () => {
    const panel = bodies[sectionsPanel];
    open(sectionsPanel);
    for (const node of panel.querySelectorAll('[aria-current]')) node.removeAttribute('aria-current');
    const item = [...panel.querySelectorAll<HTMLElement>('li')].find(node => node.dataset.section === crumb.dataset.section);
    if (!item) return;
    item.setAttribute('aria-current', 'location');
    panel.scrollTop += item.getBoundingClientRect().top - panel.getBoundingClientRect().top - (panel.clientHeight - item.offsetHeight) / 2;
    item.querySelector('a')?.focus({ preventScroll: true });
  };

  // Where the view came to rest goes to the URL and the session once, not at every step of the way there.
  let resting: ReturnType<typeof setTimeout> | undefined;
  const restLater = () => {
    clearTimeout(resting);
    resting = setTimeout(() => {
      if (!scroller.moving && documentPane.isConnected) services.scrolled(view);
    }, 150);
  };
  let frame = 0;
  documentPane.addEventListener('scroll', () => {
    frame ||= requestAnimationFrame(() => {
      frame = 0;
      if (documentPane.isConnected) showCrumb();
    });
    restLater();
  }, { passive: true });
  // A reader who has started scrolling should not be scrolled.
  for (const type of ['wheel', 'touchstart', 'pointerdown']) documentPane.addEventListener(type, () => scroller.stop(), { passive: true });
  // A walk's keys are no scrolling, and must read where the move was going, not where it had got to.
  documentPane.addEventListener('keydown', event => { if (!event.ctrlKey && !event.altKey && !event.metaKey) scroller.stop(); }, { passive: true });

  function jumpTo(target: HTMLElement, { smooth, flash: flashes, margin = JUMP_MARGIN }: { smooth: boolean; flash: boolean; margin?: number }) {
    scroller.to(scrollTopFor(documentPane, target, margin), smooth, () => {
      const row = target.closest<HTMLElement>('.dad-line');
      if (flashes && row) flash(row);
    });
  }

  const view: DocumentView = {
    doc,
    raw: Boolean(raw),
    documentPane,
    pointAtLine(line) {
      for (const node of documentPane.querySelectorAll('.target-line')) node.classList.remove('target-line');
      const row = line === undefined ? undefined : rows[line];
      row?.classList.add('target-line');
      focusLater(row);
      return row;
    },
    sectionRow(section) {
      const row = document.getElementById(`section-${section}`) ?? undefined;
      if (row && !focusable) focusLater(row);
      return row;
    },
    jumpTo,
    restore(top, offset) {
      const row = rows[top];
      if (!row) return;
      // A line with no saved offset is flush with the edge, except the first, above which the pane has only padding.
      scroller.to(top === 0 && offset === undefined ? 0 : scrollTopFor(documentPane, row, 0) + (offset ?? 0), false);
    },
    settle: () => scroller.finish(),
    focusPosition() {
      focusable?.focus({ preventScroll: true });
    },
    position() {
      const edge = documentPane.getBoundingClientRect().top;
      const row = topRow(rows, edge);
      return row && { top: Number(row.dataset.line), offset: edge - row.getBoundingClientRect().top };
    },
    pointedLine() {
      const row = documentPane.querySelector<HTMLElement>('.target-line');
      return row ? Number(row.dataset.line) : undefined;
    },
    valueRow: (section, name) => valueRowAt(raw ? raw.lines : doc.lines, section, name),
  };
  showCrumb();
  return view;
}
