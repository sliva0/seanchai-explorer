import type { ComponentChildren } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { readClickTarget, writeClickTarget } from './click-target.ts';
import type { ClickTarget } from './click-target.ts';
import { clickAction, nameTitle } from './clicks.ts';
import type { ClickAction, ClickContext } from './clicks.ts';
import { commandKey } from './commands.ts';
import { sourceHref } from './data.ts';
import type { Site } from './data.ts';
import { compactComment } from './comments.ts';
import { element, externalLink, link, scrollTopFor } from './dom.ts';
import type { HighlightedLine, HighlightedToken } from './highlight.ts';
import { parseRoute, routeFor } from './navigation.ts';
import type { PopupRequest, Popups } from './popup/index.tsx';
import { fallbackPlace, markDetails, placeRoute, tokenPlace } from './avp-places.ts';
import type { ScrollPosition } from './positions.ts';
import { createScroller } from './scroll.ts';
import { SourceToggle, Workspace } from './source-pane.tsx';
import type { SourcePane } from './source-pane.tsx';
import type { Document, Line, RawDocument } from './types.ts';
import { valueRowAt, valueTables, valueTableTitle } from './values.ts';
import type { ValueRow } from './values.ts';

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

function tokenNode(
  token: HighlightedToken,
  index: number,
  line: HighlightedLine,
  lines: HighlightedLine[],
  doc: Document,
  site: Site,
  prefer: ClickTarget,
): Node {
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
  if (token.avp || token.valueRow || token.command)
    node.title = nameTitle(
      token,
      tokenPlace(token, lines, doc, line.section ?? undefined, prefer, commands),
      paneless,
      fallbackPlace(token, lines, doc, prefer, commands),
    );
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
    if (line.warning) {
      row.classList.add('raw-warning');
      row.title = 'Modified in corrected view';
    }
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
}

/** What the strip around the text sets for it, read at the moment of a click. */
interface Settings {
  prefer(): ClickTarget;
  uses(): boolean;
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
  const pre = renderLines(lines, doc, site, settings.prefer());
  documentPane.replaceChildren(pre);
  const rows = [...pre.querySelectorAll<HTMLElement>('.dad-line')];
  const sectionRows = rows.filter(row => row.dataset.section);
  /** The section a jump to it leaves at the top of the view, where its line sits below the margin and the end of the last section still shows above. */
  const currentSection = () =>
    topRow(sectionRows, documentPane.getBoundingClientRect().top + JUMP_MARGIN + 4)?.dataset.section;

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
    tokenPlace(tokenOf(node), lines, doc, sectionAt(node), settings.prefer(), site.commands());
  const fallbackOf = (node: HTMLElement) =>
    fallbackPlace(tokenOf(node), lines, doc, settings.prefer(), site.commands());

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

  pre.addEventListener('click', event => {
    const target = event.target as Element;
    const correction = target.closest<HTMLButtonElement>('.correction-toggle');
    if (correction) {
      toggleCorrection(correction, tokenOf(correction.parentElement!));
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

  // The way to a right-click's popup for one who has not read the help: a ▾ over the end of the name under the pointer
  // or with the focus, laid over the text and not in it, so no column moves. Its glyph is drawn by the stylesheet, out
  // of a copy of the text. The keyboard has Menu and Shift+F10 for it.
  const menu = element('button', undefined, 'name-menu');
  menu.type = 'button';
  menu.tabIndex = -1;
  menu.hidden = true;
  menu.setAttribute('aria-hidden', 'true');
  let menuFor: HTMLElement | undefined;
  const placeMenu = (node: HTMLElement | null) => {
    menuFor = node ?? undefined;
    menu.hidden = !node;
    if (!node) return;
    const box = node.getBoundingClientRect();
    const origin = pre.getBoundingClientRect();
    menu.style.left = `${box.right - origin.left}px`;
    menu.style.top = `${box.top - origin.top}px`;
    menu.style.height = `${box.height}px`;
    menu.title = node.dataset.command
      ? 'Its definitions (right-click)'
      : node.classList.contains('value-name')
        ? 'Its table (right-click)'
        : 'Uses and places (right-click)';
  };
  pre.append(menu);
  pre.addEventListener('mouseover', event => {
    if (event.target !== menu) placeMenu(nameAt(event.target));
  });
  pre.addEventListener('mouseleave', () => placeMenu(null));
  pre.addEventListener('focusin', event => {
    if (event.target !== menu) placeMenu(nameAt(event.target));
  });
  menu.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    if (menuFor?.isConnected) showUses(menuFor);
  });

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
    valueRow: (section, name) => valueRowAt(file, section, name),
    currentSection,
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
  return <section id="document" ref={pane} tabIndex={0} aria-label="Document text" />;
}

/** What a clause's value tables list: "Bits (12)", "Features list 1 (S6a/S6d) (29)". */
function tablesNote(doc: Document, section: string): string {
  return valueTables(doc)
    .filter(table => table.section === section)
    .map(table => `${valueTableTitle(table)} (${table.rows.length})`)
    .join(', ');
}

function SectionList({
  doc,
  sectionLink,
  current,
}: {
  doc: Document;
  sectionLink(section: string): ComponentChildren;
  current: string | undefined;
}) {
  return (
    <ul class="section-list">
      {doc.sections.map(({ section, page, title }) => {
        const tables = tablesNote(doc, section);
        return (
          <li key={section} data-section={section} aria-current={section === current ? 'location' : undefined}>
            {sectionLink(section)} <span>{tables ? `${title} · ${tables}` : title}</span>
            {page ? (
              <>
                {' '}
                <span class="section-page">{`p. ${page}`}</span>
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
      {`${title} `}
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
      aria-label="Click goes to"
      title="What a click or alt-click on a name goes to where it has both; right-click offers both"
    >
      Click goes to
      {(
        [
          ['definition', 'Definition'],
          ['details', 'Details'],
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
      {raw ? 'Corrected' : 'Raw'}
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
  const [settings] = useState<Settings>(() => ({
    prefer: () => preferred.current,
    uses: () => Boolean(usesBox.current?.checked),
  }));
  const view = useRef<DocumentView>(undefined);
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
    ['Sections', <SectionList key="sections" doc={doc} sectionLink={sectionLink} current={shown?.section} />],
  ];
  const crumbTitle =
    crumb && [crumb, doc.sections.find(section => section.section === crumb)?.title].filter(Boolean).join(' · ');
  return (
    <>
      <div id="document-tools">
        <div id="diagnostics">
          {disclosure('Findings', doc.findings.length)}
          {disclosure('Holes', doc.holes.length)}
          {/* One control over one panel: its toggle opens and closes it, its crumb opens it at the current entry. */}
          <div class="section-control" role="group" aria-label="Sections">
            {disclosure('Sections', doc.sections.length)}
            <div class="crumb-slot">
              <button
                type="button"
                class="section-crumb"
                disabled={!crumb}
                data-section={crumb ?? ''}
                title={crumb ? `${crumbTitle}: show in Sections` : ''}
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
          <button
            type="button"
            class="disclosure options-toggle"
            aria-expanded={options}
            onClick={() => setOptions(open => !open)}
          >
            Click options
          </button>
          <label
            class="visibility-toggle uses-toggle click-option"
            title="Plain click lists where a name is used instead of going to it"
          >
            {'Click shows uses '}
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
              showCrumb();
              onView(created);
            }}
          />
        }
      />
    </>
  );
}
