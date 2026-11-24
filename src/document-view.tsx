import type { ComponentChildren } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { readClickTarget, writeClickTarget } from './click-target.ts';
import type { ClickTarget } from './click-target.ts';
import { clickAction, nameTitle } from './clicks.ts';
import type { ClickAction, ClickContext } from './clicks.ts';
import { commandKey } from './commands.ts';
import { sourceHref } from './data.ts';
import type { Site } from './data.ts';
import { lineAnnotations } from './annotations.ts';
import type { LineAnnotation } from './annotations.ts';
import { citationSpans, compactComment } from './comments.ts';
import { interpretedLines } from './constraints.ts';
import { elementsTitle } from './elements.ts';
import { element, externalLink, link, scrollTopFor } from './dom.ts';
import type { HighlightedLine, HighlightedToken } from './highlight.ts';
import { parseRoute, routeFor } from './navigation.ts';
import type { PopupRequest, Popups } from './popup/index.tsx';
import { fallbackPlace, markDetails, placeRoute, resolverOf, tokenPlace } from './avp-places.ts';
import type { NameSources } from './avp-places.ts';
import type { ScrollPosition } from './positions.ts';
import { createScroller } from './scroll.ts';
import { SourceToggle, Workspace } from './source-pane.tsx';
import { readStored, writeStored } from './storage.ts';
import type { SourcePane } from './source-pane.tsx';
import type { Document, Line, RawDocument } from './types.ts';
import { valueRowAt, valueTables, valueTableTitle } from './values.ts';
import type { ValueRow } from './values.ts';
import { strip } from './text/document.ts';

export interface ViewServices {
  site: Site;
  pane: SourcePane;
  popup: Popups;
  highlight(lines: Line[]): HighlightedLine[];
  navigate(hash: string): void;
  /** Keeps the place about to be left, for a jump this view makes itself. */
  recordJump(): void;
  /** The view has come to rest somewhere new. */
  scrolled(view: DocumentView): void;
}

// The text is tens of thousands of nodes, drawn once by hand below and never again: a component drawing it would be
// diffed whenever anything around it changed.

/**
 * A note's text from `from` to `to`, with the stretches the grammar scopes inside it, its kind and the declaration it
 * cites, in spans of their scope: no link, as a declaration is a file of the corpus's corrections or interpretations,
 * not a page.
 */
function noteText(token: HighlightedToken, from: number, to: number): (Node | string)[] {
  const nodes: (Node | string)[] = [];
  let at = from;
  for (const part of token.parts ?? []) {
    const start = Math.max(part.from, from);
    const end = Math.min(part.to, to);
    if (start >= end) continue;
    if (start > at) nodes.push(token.text.slice(at, start));
    nodes.push(element('span', token.text.slice(start, end), part.scope));
    at = end;
  }
  if (at < to) nodes.push(token.text.slice(at, to));
  return nodes;
}

/**
 * A `;;` note, as short open as shut, which opens the declaration's record under its line: what the note cites, on a
 * line of its own, then why. The record goes at the line's end, after its newline (see `renderLines`), which would
 * otherwise leave an empty line under it.
 */
function correctionNode(token: HighlightedToken, reason: string, id: string): HTMLElement {
  const comment = element('span', undefined, 'correction correction-note');
  const toggle = element('button', undefined, 'correction-toggle');
  const compact = compactComment(token.text);
  toggle.append(...(token.text.startsWith(compact) ? noteText(token, 0, compact.length) : [compact]));
  toggle.type = 'button';
  toggle.title = `${token.text}\n${reason}`;
  toggle.setAttribute('aria-expanded', 'false');
  const full = element('span', undefined, 'correction-detail');
  const citations = citationSpans(token.text);
  if (citations.length) {
    const line = element('span', undefined, 'correction-citation');
    for (const [index, citation] of citations.entries()) {
      if (index) line.append(' ');
      line.append(...noteText(token, citation.index, citation.index + citation.text.length));
    }
    full.append(line);
  }
  full.append(element('span', `— ${reason}`, 'correction-reason'));
  full.id = id;
  full.hidden = true;
  toggle.setAttribute('aria-controls', id);
  comment.append(toggle, full);
  return comment;
}

function toggleCorrection(toggle: HTMLButtonElement) {
  const id = toggle.getAttribute('aria-controls');
  const full = [...toggle.closest('.dad-line')!.querySelectorAll<HTMLElement>('.correction-detail')].find(
    detail => detail.id === id,
  )!;
  full.hidden = !full.hidden;
  toggle.setAttribute('aria-expanded', String(!full.hidden));
}

/** Until a pointer or focus comes to a name and its title is worked out for the pane as it then is. */
const paneless: ClickContext = { paneShows: () => false, paneOn: false, uses: false };

function tokenNode(
  token: HighlightedToken,
  index: number,
  line: HighlightedLine,
  lines: HighlightedLine[],
  doc: Document,
  site: Site,
  prefer: ClickTarget,
  names: NameSources,
): Node {
  let node: HTMLElement | undefined;
  const source = token.source && !token.target ? sourceHref(doc, token.source, site.mode) : null;
  if (token.target) node = link(token.text, { ...token.target, name: token.target.name ?? token.avp });
  else if (source) node = externalLink(token.text, source.href);
  else if (token.scope.startsWith('markup.underline.link') && /^https?:\/\//.test(token.text))
    node = externalLink(token.text, token.text);
  else if (token.avp || token.command) node = element('button', token.text, 'avp-name');
  else if (!token.scope) return document.createTextNode(token.text);
  else if (token.parts) {
    node = element('span');
    node.append(...noteText(token, 0, token.text.length));
  } else node = element('span', token.text);
  if (token.scope) node.classList.add(token.scope);
  if (token.avp) node.dataset.avp = token.avp;
  if (token.command) node.dataset.command = commandKey(token.command);
  if (token.valueRow) node.classList.add('value-name');
  const commands = site.commands();
  if (token.avp || token.valueRow || token.command)
    node.title = nameTitle(
      token,
      tokenPlace(token, lines, doc, line.section ?? undefined, prefer, commands, names),
      paneless,
      fallbackPlace(token, lines, doc, prefer, commands, { ...names, section: line.section ?? undefined }),
    );
  if (token.avp || token.command || token.target || token.source) node.dataset.token = String(index);
  return node;
}

/** Puts a node at the end of a line's text, before its newline, where one laid over the text starts after its end. */
function beforeNewline(row: HTMLElement, node: Node) {
  let last: Node | null = row.lastChild;
  while (last && last.nodeType !== Node.TEXT_NODE) last = last.lastChild;
  const text = last as Text | null;
  if (!text?.data.endsWith('\n')) return void row.append(node);
  const newline = text.splitText(text.data.length - 1);
  newline.parentNode!.insertBefore(node, newline);
}

function renderLines(
  lines: HighlightedLine[],
  doc: Document,
  site: Site,
  prefer: ClickTarget,
  annotations: Map<number, LineAnnotation>,
  names: NameSources,
): HTMLPreElement {
  const pre = element('pre');
  let correction = 0;
  lines.forEach((line, lineIndex) => {
    const row = element('span', undefined, `dad-line ${line.decoration}`.trim());
    const annotation = annotations.get(lineIndex);
    if (annotation) row.classList.add(...annotation.classes);
    row.dataset.line = String(lineIndex);
    if (line.section) row.dataset.section = line.section;
    if (line.warning) {
      row.classList.add('raw-warning');
      row.title = strip.modified;
    }
    if (line.anchor) row.id = `section-${line.anchor}`;
    if (line.tokens.some(token => token.correction)) row.classList.add('corrected-line');
    line.tokens.forEach((token, index) => {
      const reason = token.correction && doc.corrections[token.correction]?.reason;
      if (reason) {
        const node = correctionNode(token, reason, `correction-${doc.id}-${correction++}`);
        node.dataset.token = String(index);
        row.append(node);
      } else row.append(tokenNode(token, index, line, lines, doc, site, prefer, names));
    });
    if (annotation?.after) beforeNewline(row, annotation.after);
    for (const record of row.querySelectorAll('.correction-detail')) row.append(record);
    pre.append(row);
  });
  return pre;
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
  /** The section at the top of the view, which a jump to it would leave there. */
  currentSection(): string | undefined;
  /** Leaves the Interpreted Constraints blocks out of the text, or puts them back, keeping the line at the top there. */
  hideInterpreted(hidden: boolean): void;
}

/** What the strip around the text sets for it, read at the moment of a click. */
interface Settings {
  prefer(): ClickTarget;
  uses(): boolean;
  /** The text has put the Interpreted Constraints blocks back, for a move to a line among them. */
  revealInterpreted(): void;
}

/**
 * Makes the text of `doc` in `documentPane`, its own pane, and everything the reader does in it: clicks, the popups,
 * the jumps and where it comes to rest. `onScroll` is told once a frame while it scrolls, for the strip's crumb.
 */
function createText(
  documentPane: HTMLElement,
  services: ViewServices,
  doc: Document,
  raw: RawDocument | undefined,
  settings: Settings,
  onScroll: () => void,
): DocumentView {
  const { site, pane, popup } = services;
  const file = raw ?? doc;
  markDetails(file, doc);
  const lines = services.highlight(file.lines);
  const scroller = createScroller(documentPane);
  // A name reused from another document goes to its definition there, through the documents the build holds.
  const names: NameSources = { resolve: resolverOf(site, doc), file };
  const pre = renderLines(lines, doc, site, settings.prefer(), lineAnnotations(file, doc.id, site), names);
  documentPane.replaceChildren(pre);
  const rows = [...pre.querySelectorAll<HTMLElement>('.dad-line')];
  // Hidden Interpreted Constraints blocks have no box, so a search down the page by its boxes passes over them.
  const interpreted = interpretedLines(file);
  const hiding = () => documentPane.classList.contains('interpreted-hidden');
  const hiddenRow = (row: HTMLElement) => hiding() && interpreted.has(Number(row.dataset.line));
  let shown: { hidden: boolean; rows: HTMLElement[]; sections: HTMLElement[] } | undefined;
  const shownRows = () => {
    const hidden = hiding();
    if (shown?.hidden !== hidden) {
      const visible = hidden ? rows.filter(row => !hiddenRow(row)) : rows;
      shown = { hidden, rows: visible, sections: visible.filter(row => row.dataset.section) };
    }
    return shown;
  };
  /** The section a jump to it leaves at the top of the view, where its line sits below the margin and the end of the last section still shows above. */
  const currentSection = () =>
    topRow(shownRows().sections, documentPane.getBoundingClientRect().top + JUMP_MARGIN + 4)?.dataset.section;
  /** A move to a line in a hidden block shows the blocks again first. */
  const reveal = (row: HTMLElement | undefined) => {
    if (!row || !hiddenRow(row)) return;
    documentPane.classList.remove('interpreted-hidden');
    settings.revealInterpreted();
  };

  const tokenOf = (node: HTMLElement) =>
    lines[Number(node.closest<HTMLElement>('.dad-line')!.dataset.line)].tokens[Number(node.dataset.token)];
  /** What a popup or the inspector is asked about a name: its token, and the text and its moves around it. */
  const requestFor = (node: HTMLElement): PopupRequest => ({
    token: tokenOf(node),
    doc,
    raw: Boolean(raw),
    lines,
    file,
    opener: node,
    documentPane,
    recordJump: services.recordJump,
    jumpTo: target => jumpTo(target, { smooth: true, flash: true, margin: 24 }),
    scrollGoal: () => scroller.goal,
  });
  const showUses = (node: HTMLElement) => popup.show(requestFor(node));
  const nameAt = (target: EventTarget | null) =>
    (target as Element).closest<HTMLElement>('[data-avp], [data-command], .value-name');
  const sectionAt = (node: HTMLElement) => node.closest<HTMLElement>('.dad-line')!.dataset.section;
  const clickContext = (): ClickContext => ({
    paneShows: document => pane.shows(site.summary(document)),
    paneOn: pane.switchedOn,
    uses: settings.uses(),
    inspects: document => pane.inspects(document),
  });
  const placeOf = (node: HTMLElement) =>
    tokenPlace(tokenOf(node), lines, doc, sectionAt(node), settings.prefer(), site.commands(), names);
  const fallbackOf = (node: HTMLElement) =>
    fallbackPlace(tokenOf(node), lines, doc, settings.prefer(), site.commands(), {
      ...names,
      section: sectionAt(node),
    });

  function perform(action: ClickAction, node: HTMLElement) {
    if (action.type === 'uses') {
      showUses(node);
      return;
    }
    popup.close();
    // Nothing moves in the view when the pane alone does, so the jump list has nothing to keep.
    if (action.type === 'inspect') pane.inspect(requestFor(node), action.place);
    else if (action.type === 'pane') pane.openPlace(action.place, doc);
    else if (action.type === 'both') services.navigate(placeRoute(action.place, doc, Boolean(raw), !pane.switchedOn));
    else if (action.type === 'new-tab') {
      const anchor = node.closest('a');
      if (anchor) window.open(anchor.href, anchor.target, anchor.rel);
    }
  }

  /**
   * A mark of interpreted constraints opens what a plain click on its name opens where that shows them, the inspector,
   * or else the name's popup, and brings their section into view with a flash.
   */
  function showConstraints(mark: HTMLElement) {
    const reads = (mark.dataset.reads ?? '').split(' ');
    const node = [...mark.closest('.dad-line')!.querySelectorAll<HTMLElement>('[data-avp]')].find(name =>
      reads.includes(name.dataset.avp!),
    );
    if (!node) return;
    const plain = { altKey: false, ctrlKey: false, metaKey: false, shiftKey: false };
    const action = clickAction(
      tokenOf(node),
      placeOf(node),
      plain,
      { ...clickContext(), uses: false },
      fallbackOf(node),
    );
    if (action.type === 'inspect') perform(action, node);
    else showUses(node);
    const section = [...mark.ownerDocument.querySelectorAll<HTMLElement>('.popup-constraints')].find(
      found => found.closest('.avp-popup') || found.closest('.inspector'),
    );
    if (!section) return;
    section.scrollIntoView?.({ block: 'nearest' });
    section.classList.remove('landing');
    void section.offsetWidth;
    section.classList.add('landing');
    section.addEventListener('animationend', () => section.classList.remove('landing'), { once: true });
  }

  pre.addEventListener('click', event => {
    const target = event.target as Element;
    const correction = target.closest<HTMLButtonElement>('.correction-toggle');
    if (correction) {
      toggleCorrection(correction);
      return;
    }
    const mark = target.closest<HTMLElement>('.line-mark.constraint-mark');
    if (mark) {
      showConstraints(mark);
      return;
    }
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
  // The keyboard's right-click: the Menu key, or Shift+F10, on a name with the focus.
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

  // Where the view came to rest goes to the URL and the session once, not at every step of the way there.
  let resting: ReturnType<typeof setTimeout> | undefined;
  const restLater = () => {
    clearTimeout(resting);
    resting = setTimeout(() => {
      if (!scroller.moving && documentPane.isConnected) services.scrolled(view);
    }, 150);
  };
  let frame = 0;
  documentPane.addEventListener(
    'scroll',
    () => {
      frame ||= requestAnimationFrame(() => {
        frame = 0;
        if (documentPane.isConnected) onScroll();
      });
      restLater();
    },
    { passive: true },
  );
  // A reader who has started scrolling should not be scrolled.
  for (const type of ['wheel', 'touchstart', 'pointerdown'])
    documentPane.addEventListener(type, () => scroller.stop(), { passive: true });
  // A walk's keys are no scrolling, and must read where the move was going, not where it had got to.
  documentPane.addEventListener(
    'keydown',
    event => {
      if (!event.ctrlKey && !event.altKey && !event.metaKey) scroller.stop();
    },
    { passive: true },
  );

  function jumpTo(
    target: HTMLElement,
    { smooth, flash: flashes, margin = JUMP_MARGIN }: { smooth: boolean; flash: boolean; margin?: number },
  ) {
    reveal(target.closest<HTMLElement>('.dad-line') ?? undefined);
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
      reveal(row);
      row?.classList.add('target-line');
      focusLater(row);
      return row;
    },
    sectionRow(section) {
      const row = document.getElementById(`section-${section}`) ?? undefined;
      reveal(row);
      if (row && !focusable) focusLater(row);
      return row;
    },
    jumpTo,
    restore(top, offset) {
      // A line hidden since is the first shown after it, flush with the edge.
      const hidden = rows[top] && hiddenRow(rows[top]);
      const row = hidden ? rows.slice(top).find(other => !hiddenRow(other)) : rows[top];
      if (!row) return;
      if (hidden) return void scroller.to(scrollTopFor(documentPane, row, 0), false);
      // A line with no saved offset is flush with the edge, except the first, above which the pane has only padding.
      scroller.to(top === 0 && offset === undefined ? 0 : scrollTopFor(documentPane, row, 0) + (offset ?? 0), false);
    },
    settle: () => scroller.finish(),
    focusPosition() {
      focusable?.focus({ preventScroll: true });
    },
    position() {
      const edge = documentPane.getBoundingClientRect().top;
      const row = topRow(shownRows().rows, edge);
      return row && { top: Number(row.dataset.line), offset: edge - row.getBoundingClientRect().top };
    },
    pointedLine() {
      const row = documentPane.querySelector<HTMLElement>('.target-line');
      return row ? Number(row.dataset.line) : undefined;
    },
    valueRow: (section, name) => valueRowAt(file, section, name),
    currentSection,
    hideInterpreted(hidden) {
      if (!interpreted.size || documentPane.classList.contains('interpreted-hidden') === hidden) return;
      const at = view.position();
      documentPane.classList.toggle('interpreted-hidden', hidden);
      if (at) view.restore(at.top, hidden && interpreted.has(at.top) ? undefined : at.offset);
    },
  };
  return view;
}

/**
 * The text's pane, drawn empty and filled by hand once: a draw of the strip or the pane beside it leaves the text's
 * nodes as they are, and a new document or the raw text is a new page. `onView` is given the view once the text is in
 * the page.
 */
function DocumentText({
  services,
  doc,
  raw,
  settings,
  onScroll,
  onView,
}: {
  services: ViewServices;
  doc: Document;
  raw: RawDocument | undefined;
  settings: Settings;
  onScroll(): void;
  onView(view: DocumentView): void;
}) {
  const pane = useRef<HTMLElement>(null);
  useLayoutEffect(() => onView(createText(pane.current!, services, doc, raw, settings, onScroll)), []);
  return <section id="document" ref={pane} tabIndex={0} aria-label={strip.documentText} />;
}

/** What a clause's value tables list: "Bits (12)", "Features list 1 (S6a/S6d) (29)". */
function tablesNote(doc: Document, section: string): string {
  return valueTables(doc)
    .filter(table => table.section === section)
    .map(table => `${valueTableTitle(table)} (${table.rows.length})`)
    .join(', ');
}

/**
 * A clause's title: the export's, but for a clause of Information Elements tables, which it titles by their type
 * alone, with the commands they describe, each by its abbreviation where the corpus prints one.
 */
function sectionTitle(site: Site, doc: Document, section: string, title: string): string {
  const short = (name: string) =>
    site.commands()?.commands.find(command => command.name.toLowerCase() === name.toLowerCase() && command.abbreviation)
      ?.abbreviation ?? name;
  return elementsTitle(doc, section, title, short);
}

function SectionList({
  site,
  doc,
  sectionLink,
  current,
  hidden,
}: {
  site: Site;
  doc: Document;
  sectionLink(section: string): ComponentChildren;
  current: string | undefined;
  hidden: Set<string>;
}) {
  return (
    <ul class="section-list">
      {doc.sections.flatMap(({ section, page, title: exported }) => {
        if (hidden.has(section)) return [];
        const title = sectionTitle(site, doc, section, exported);
        const tables = tablesNote(doc, section);
        return (
          <li key={section} data-section={section} aria-current={section === current ? 'location' : undefined}>
            {sectionLink(section)} <span>{tables ? `${title} · ${tables}` : title}</span>
            {page ? (
              <>
                {' '}
                <span class="section-page">{strip.page(page)}</span>
              </>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function FindingList({ doc, sectionLink }: { doc: Document; sectionLink(section: string): ComponentChildren }) {
  return (
    <ul>
      {doc.findings.map((finding, index) => (
        <li key={index}>
          {`${finding.severity} [${finding.rule}] ${finding.message}${finding.accepted_by ? ` (${finding.accepted_by})` : ''} `}
          {finding.section && sectionLink(finding.section)}
        </li>
      ))}
    </ul>
  );
}

function HoleList({ doc, sectionLink }: { doc: Document; sectionLink(section: string): ComponentChildren }) {
  return (
    <ul>
      {doc.holes.map((hole, index) => (
        <li key={index}>
          {`${hole.name}: ${hole.missing.join(', ')}${hole.recorded ? ` — ${hole.recorded}` : ''} `}
          {hole.section && sectionLink(hole.section)}
        </li>
      ))}
    </ul>
  );
}

type Panel = 'Findings' | 'Holes' | 'Sections';
const panelLabels: Record<Panel, string> = { Findings: strip.findings, Holes: strip.holes, Sections: strip.sections };

/** A toggle opening one of the panels under the strip; one with nothing to show stays off. */
function Disclosure({ title, count, open, toggle }: { title: Panel; count: number; open: boolean; toggle(): void }) {
  return (
    <button
      type="button"
      class="disclosure"
      disabled={!count}
      aria-expanded={open}
      aria-controls={`diagnostic-${title.toLowerCase()}`}
      onClick={toggle}
    >
      {`${panelLabels[title]} `}
      <span class="count">{String(count)}</span>
    </button>
  );
}

/** The choice of a name's place a click goes to first, kept for every document and tab. */
function ClickTargetChoice({ current, onChange }: { current: ClickTarget; onChange(target: ClickTarget): void }) {
  return (
    <div
      class="click-target click-option"
      role="radiogroup"
      aria-label={strip.clickGoesTo}
      title={strip.clickGoesToTitle}
    >
      {strip.clickGoesTo}
      {(
        [
          ['definition', strip.definition],
          ['details', strip.details],
        ] as const
      ).map(([target, label]) => (
        // A radio before its word, where a box follows a toggle's: each is told from the other.
        <label key={target} class="visibility-toggle">
          <input
            type="radio"
            name="click-target"
            value={target}
            // What the browser would restore on a reload is the stored choice's to say.
            autocomplete="off"
            checked={target === current}
            onChange={event => {
              if (event.currentTarget.checked) onChange(target);
            }}
          />
          {label}
        </label>
      ))}
    </div>
  );
}

/**
 * The link to the other text, corrected or raw, at the section in view: worked out as it is followed, from where the
 * text then is and the route as it then stands.
 */
function RawLink({ doc, raw, section }: { doc: Document; raw: boolean; section(): string | undefined }) {
  const hrefAt = (current: string | undefined) => {
    const route = parseRoute(location.hash);
    current ??= route.section;
    return routeFor(
      { document: doc.id, section: current || null, name: current === route.section ? route.name : undefined },
      { raw: !raw, source: route.source, paneHidden: route.paneHidden },
    );
  };
  const refresh = (event: Event) => {
    (event.currentTarget as HTMLAnchorElement).href = hrefAt(section());
  };
  // Drawn with the route's own section: the text is not yet where the route puts it.
  return (
    <a href={hrefAt(undefined)} onClick={refresh} onAuxClick={refresh} onContextMenu={refresh}>
      {raw ? strip.corrected : strip.raw}
    </a>
  );
}

/**
 * A document's page: its strip of diagnostics and controls over the workspace of its text and the source pane.
 * `header` goes first in the document's bar. The strip's own state, the panel open and the crumb, is drawn by it alone.
 */
export function DocumentPage({
  services,
  doc,
  raw,
  header,
  onView,
}: {
  services: ViewServices;
  doc: Document;
  raw: RawDocument | undefined;
  header?: ComponentChildren;
  onView(view: DocumentView): void;
}) {
  const { site, pane } = services;
  const [open, setOpen] = useState<Panel | undefined>(undefined);
  const [crumb, setCrumb] = useState<string | undefined>(undefined);
  const [prefer, setPrefer] = useState(readClickTarget);
  /** Where the window is narrow, the click's options are folded under a toggle of their own. */
  const [options, setOptions] = useState(false);
  // Read from the box at the moment of a click, as a browser restoring form state changes it with no event.
  const usesBox = useRef<HTMLInputElement>(null);
  /** The section the crumb opened the list at, scrolled to and focused there. */
  const [shown, setShown] = useState<{ section: string } | undefined>(undefined);
  const preferred = useRef(prefer);
  preferred.current = prefer;
  /** Whether the Interpreted Constraints blocks are left out of the text: kept for every document, shown by default. */
  const [interpretedHidden, setInterpretedHidden] = useState(() => readStored('interpreted') === 'hidden');
  const hiddenNow = useRef(interpretedHidden);
  hiddenNow.current = interpretedHidden;
  const [settings] = useState<Settings>(() => ({
    prefer: () => preferred.current,
    uses: () => Boolean(usesBox.current?.checked),
    // Shown again for a move to one, for this page alone: the stored choice stays.
    revealInterpreted: () => setInterpretedHidden(false),
  }));
  const view = useRef<DocumentView>(undefined);
  useLayoutEffect(() => view.current?.hideInterpreted(interpretedHidden), [interpretedHidden]);
  const file = raw ?? doc;
  const interpreted = interpretedLines(file);
  /** The clauses holding only Interpreted Constraints blocks, which the Sections list leaves out while they are hidden. */
  const interpretedSections = new Set(
    interpretedHidden
      ? file.lines.flatMap((line, index) => (line.anchor && interpreted.has(index) ? [line.anchor] : []))
      : [],
  );
  const sectionsPanel = useRef<HTMLDivElement>(null);

  const showCrumb = () => setCrumb(view.current?.currentSection());
  useLayoutEffect(() => {
    const panel = sectionsPanel.current;
    const item = shown && panel?.querySelector<HTMLElement>(`li[aria-current]`);
    if (!panel || !item) return;
    panel.scrollTop +=
      item.getBoundingClientRect().top -
      panel.getBoundingClientRect().top -
      (panel.clientHeight - item.offsetHeight) / 2;
    item.querySelector('a')?.focus({ preventScroll: true });
  }, [shown]);

  const sectionLink = (section: string) => (
    <a href={routeFor({ document: doc.id, section }, { raw: Boolean(raw) })}>{section}</a>
  );
  const toggle = (panel: Panel) => () => setOpen(current => (current === panel ? undefined : panel));
  const disclosure = (title: Panel, count: number) => (
    <Disclosure title={title} count={count} open={open === title} toggle={toggle(title)} />
  );
  const panels: [Panel, ComponentChildren][] = [
    ['Findings', <FindingList key="findings" doc={doc} sectionLink={sectionLink} />],
    ['Holes', <HoleList key="holes" doc={doc} sectionLink={sectionLink} />],
    [
      'Sections',
      <SectionList
        key="sections"
        site={site}
        doc={doc}
        sectionLink={sectionLink}
        current={shown?.section}
        hidden={interpretedSections}
      />,
    ],
  ];
  const crumbEntry = crumb ? doc.sections.find(section => section.section === crumb) : undefined;
  const crumbTitle =
    crumb && [crumb, crumbEntry && sectionTitle(site, doc, crumb, crumbEntry.title)].filter(Boolean).join(' · ');
  return (
    <>
      <div id="document-tools">
        <div id="diagnostics">
          {disclosure('Findings', doc.findings.length)}
          {disclosure('Holes', doc.holes.length)}
          {/* One control over one panel: its toggle opens and closes it, its crumb opens it at the current entry. */}
          <div class="section-control" role="group" aria-label={strip.sections}>
            {disclosure('Sections', doc.sections.length)}
            <div class="crumb-slot">
              <button
                type="button"
                class="section-crumb"
                disabled={!crumb}
                data-section={crumb ?? ''}
                title={crumb ? strip.showInSections(crumbTitle!) : ''}
                onClick={() => {
                  setOpen('Sections');
                  setShown(crumb ? { section: crumb } : undefined);
                }}
              >
                {crumbTitle || ''}
              </button>
            </div>
          </div>
        </div>
        <section id="controls" class={options ? 'options-open' : undefined}>
          {doc.raw && <RawLink doc={doc} raw={Boolean(raw)} section={() => view.current?.currentSection()} />}
          {interpreted.size > 0 && (
            <label class="visibility-toggle interpreted-toggle" title={strip.interpretedTitle}>
              {strip.interpreted}
              <input
                type="checkbox"
                // What the browser would restore on a reload is the stored choice's to say.
                autocomplete="off"
                checked={!interpretedHidden}
                onChange={event => {
                  const hidden = !event.currentTarget.checked;
                  writeStored('interpreted', hidden ? 'hidden' : 'shown');
                  setInterpretedHidden(hidden);
                }}
              />
            </label>
          )}
          <button
            type="button"
            class="disclosure options-toggle"
            aria-expanded={options}
            onClick={() => setOptions(open => !open)}
          >
            {strip.clickOptions}
          </button>
          <label class="visibility-toggle uses-toggle click-option" title={strip.clickShowsUsesTitle}>
            {strip.clickShowsUses}
            {/* Each document starts with it off, whatever the browser would restore on a reload. */}
            <input ref={usesBox} type="checkbox" autocomplete="off" />
          </label>
          <ClickTargetChoice
            current={prefer}
            onChange={target => {
              writeClickTarget(target);
              setPrefer(target);
            }}
          />
          <SourceToggle pane={pane} />
        </section>
        {panels.map(([title, list]) => (
          <div
            key={title}
            class="diagnostic-panel"
            id={`diagnostic-${title.toLowerCase()}`}
            hidden={open !== title}
            ref={title === 'Sections' ? sectionsPanel : undefined}
          >
            {list}
          </div>
        ))}
      </div>
      <Workspace
        pane={pane}
        site={site}
        header={header}
        text={
          <DocumentText
            services={services}
            doc={doc}
            raw={raw}
            settings={settings}
            onScroll={showCrumb}
            onView={created => {
              view.current = created;
              created.hideInterpreted(hiddenNow.current);
              showCrumb();
              onView(created);
            }}
          />
        }
      />
    </>
  );
}
