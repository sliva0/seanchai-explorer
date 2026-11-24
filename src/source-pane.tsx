import type { ComponentChildren } from 'preact';
import { useLayoutEffect, useReducer, useRef, useState } from 'preact/hooks';
import type { Place } from './avp-places.ts';
import {
  docSubject,
  docTitle,
  docVersioned,
  dataURL,
  isPdfURL,
  paneFile,
  paneKind,
  paneURL,
  publisherURL,
} from './data.ts';
import type { Site } from './data.ts';
import type { PaneState, SourcePosition } from './navigation.ts';
import { attempt } from './notice.ts';
import { Popup } from './popup/root.tsx';
import type { PopupRequest } from './popup/root.tsx';
import { correctedRow, printedRow } from './printed-row.ts';
import { indexPage } from './text/site.ts';
import type { Document, DocumentSummary } from './types.ts';
import { strip } from './text/document.ts';
import { pane as paneText, publicBuildBrief, publicBuildNote } from './text/pane.ts';

const hostName = (url: URL) => url.hostname.replace(/^www\./, '');

function Icon({ class: className, path, label }: { class: string; path: string; label?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" class={className}>
      <path d={path} />
      {label && (
        <text x="8" y="11.5">
          {label}
        </text>
      )}
    </svg>
  );
}

/** A link to a copy of a document, opened in a new tab: its file icon, its host, and the mark of a new tab. */
function FileLink({ class: className, url, pdf }: { class: string; url: URL | null; pdf: boolean }) {
  if (!url) return <a class={`control ${className}`} target="_blank" rel="noopener" hidden />;
  const label = hostName(url);
  return (
    <a
      class={`control ${className}`}
      target="_blank"
      rel="noopener"
      href={url.href}
      title={url.href}
      aria-label={paneText.newTab(label)}
    >
      <Icon class="file-icon" path="M3 1.5h6l4 4v9H3z M9 1.5v4h4" label={pdf ? paneText.pdf : undefined} />
      <span>{label}</span>
      <Icon class="external-icon" path="M9 2h5v5 M14 2L7 9 M6 3H2v11h11v-4" />
    </a>
  );
}

/**
 * The bar over a pane: the document's name and links to its copies, the publisher's and the one this site holds.
 * The source's bar is the narrower one in a split, and the two share a row: a third line would move the text below,
 * so it says the short name, and the page where its pane has no page of its own to show. `publisher` leaves the
 * publisher's link out, where another part of the page says it.
 */
function PaneHeader({
  source,
  doc,
  position,
  site,
  publisher = true,
  children,
}: {
  source: boolean;
  doc: DocumentSummary;
  position: SourcePosition;
  site: Site;
  publisher?: boolean;
  children?: ComponentChildren;
}) {
  const kind = paneKind(doc, site.mode);
  // A PDF opens at the page, an RFC's HTML rendering at the section.
  const url = publisher ? publisherURL(doc, position) : null;
  let local: URL | null = null;
  if (kind === 'pdf') {
    local = dataURL(doc.source.local!);
    if (position.page) local.hash = `page=${position.page}`;
  } else if (doc.source.text) local = paneURL(doc, position, site.mode);
  const Title = source ? 'h2' : 'h1';
  return (
    <div class={`pane-header ${source ? 'source-header' : 'document-header'}`}>
      {children}
      <Title class={source ? 'source-document' : 'dad-document'} tabIndex={-1}>
        {source ? [docVersioned(doc), docSubject(doc)].filter(Boolean).join(' — ') : docTitle(doc)}
      </Title>
      {/* The PDF viewer shows its own page; the indicator is for panes without one. */}
      {source && <span class="source-page">{position.page && kind !== 'pdf' ? strip.page(position.page) : ''}</span>}
      <div class="pane-actions">
        <FileLink
          class="publisher-link"
          url={url}
          pdf={doc.source.kind === 'etsi-pdf' || Boolean(url && isPdfURL(url))}
        />
        <FileLink class="local-link" url={local} pdf={kind === 'pdf'} />
      </div>
    </div>
  );
}

/** What the pane says of a PDF this build does not hold, beside what it shows instead. */
function SelfHostNote({ doc, brief }: { doc: DocumentSummary; brief: boolean }) {
  // A build that names nothing of the project points at no other build of it either.
  // A condition the build knows, written as one expression for what it does not take to be left out.
  return SEANCHAI_UNLINKED ? (
    brief ? null : (
      <p class="inspector-note">{paneText.unlinkedNote(docVersioned(doc))}</p>
    )
  ) : brief ? (
    <p class="inspector-note">{publicBuildBrief(docVersioned(doc))}</p>
  ) : (
    <p class="inspector-note">{publicBuildNote(docVersioned(doc))}</p>
  );
}

/**
 * The pane where it cannot show the source: what the name last clicked is, as its popup says it, or until one is, what
 * a click does. The publisher's copy is the pane's header's to link to, at the place the name went to.
 */
function Inspector({
  site,
  pane,
  doc,
  inspected,
}: {
  site: Site;
  pane: SourcePane;
  doc: DocumentSummary;
  inspected: Inspected | undefined;
}) {
  const [keyOpen, setKeyOpen] = useState(false);
  return (
    <div class="inspector" aria-label={paneText.inspector} role="region">
      {inspected ? (
        <Popup
          key={inspected.count}
          inline
          site={site}
          pane={pane}
          request={inspected.request}
          keyOpen={keyOpen}
          toggleKey={() => setKeyOpen(open => !open)}
          close={() => {}}
        />
      ) : (
        <div class="inspector-empty">
          <p>{indexPage.clickHint}</p>
          <p>{paneText.inspectorEmpty}</p>
        </div>
      )}
      <SelfHostNote doc={doc} brief={Boolean(inspected)} />
    </div>
  );
}

/** The bar between the panes, dragged or moved with the arrow keys to share the width between them. */
function Divider({
  ratio,
  setRatio,
  setResizing,
  workspace,
}: {
  ratio: number;
  setRatio(ratio: number): void;
  setResizing(resizing: boolean): void;
  workspace: () => HTMLElement | null;
}) {
  const drag = useRef({ grabbedAt: 0, pointerX: 0, frame: 0 });
  return (
    <div
      id="divider"
      tabIndex={0}
      role="separator"
      aria-label={paneText.divider}
      aria-orientation="vertical"
      aria-valuemin={20}
      aria-valuemax={80}
      aria-valuenow={Math.round(ratio)}
      onPointerDown={event => {
        const divider = event.currentTarget;
        divider.setPointerCapture(event.pointerId);
        drag.current.grabbedAt = event.clientX - divider.getBoundingClientRect().left;
        setResizing(true);
      }}
      onPointerMove={event => {
        const divider = event.currentTarget;
        if (!divider.hasPointerCapture(event.pointerId)) return;
        const state = drag.current;
        state.pointerX = event.clientX;
        state.frame ||= requestAnimationFrame(() => {
          state.frame = 0;
          const rect = workspace()!.getBoundingClientRect();
          setRatio(((state.pointerX - state.grabbedAt - rect.left) * 100) / (rect.width - divider.offsetWidth));
        });
      }}
      onPointerUp={event => event.currentTarget.releasePointerCapture(event.pointerId)}
      onLostPointerCapture={() => setResizing(false)}
      onKeyDown={event => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          setRatio(ratio + (event.key === 'ArrowLeft' ? -5 : 5));
        }
      }}
    />
  );
}

export type SourcePane = ReturnType<typeof createSourcePane>;

/** The name the inspector shows, as a popup is asked for it, and the count of names shown, each drawn afresh. */
interface Inspected {
  request: PopupRequest;
  count: number;
}

/**
 * The source pane beside a document's text: what it shows and whether it is open, held here for the components drawing
 * it and the code moving it. `onChange` is told of a change the reader made, to keep in the route.
 */
export function createSourcePane(site: Site, currentTheme: () => string, onChange: () => void) {
  const wide = matchMedia('(min-width: 761px)');
  let switchedOn = true;
  let selected: { doc: Document; position: SourcePosition } | undefined;
  /**
   * The document whose text the pane is beside, where it was put last, whether it has a pane at all, and whether that
   * pane is the inspector of it, where it cannot show its source.
   */
  let mounted: { doc: Document; position: SourcePosition; reads: boolean; inspects: boolean } | undefined;
  let request = 0;
  /** What the pane shows while it is open, and keeps while it is hidden: a page loads only where it can be seen. */
  let shown: { url?: string; title?: string; placeholder?: { doc: Document; position: SourcePosition } } = {};
  /**
   * A position the reader in the frame reported itself at, as the reader scrolled it there: kept in the route and the
   * headers, never sent back to the frame. Sent back, it would move the reader again, to the top of the page it was
   * on, which reports the page above it, and so on to the first.
   */
  let reported: SourcePosition | undefined;
  let frame: HTMLIFrameElement | null = null;
  let inspected: Inspected | undefined;
  let inspections = 0;
  const listeners = new Set<() => void>();

  const isOpen = () => Boolean(wide.matches && switchedOn && mounted?.reads);
  /** A position in the mounted document has somewhere to go, which a placeholder is not. */
  const readsMounted = () => Boolean(mounted && paneKind(mounted.doc, site.mode) !== 'placeholder');

  /** Works out what an open pane shows, and draws the pane again. */
  function changed() {
    if (isOpen() && selected && selected.position !== reported) {
      const url = paneURL(selected.doc, selected.position, site.mode);
      shown = url
        ? { url: url.href, title: docVersioned(selected.doc) }
        : { ...shown, placeholder: { doc: selected.doc, position: selected.position }, url: undefined };
    }
    for (const listener of listeners) listener();
  }

  function postTheme() {
    if (frame?.src && new URL(frame.src, location.href).origin === location.origin)
      frame.contentWindow?.postMessage({ type: 'seanchai-theme', theme: currentTheme() }, location.origin);
  }

  wide.addEventListener('change', changed);

  window.addEventListener('message', event => {
    if (event.origin !== location.origin || !frame?.contentWindow || event.source !== frame.contentWindow || !selected)
      return;
    if (event.data?.file !== paneFile(selected.doc, site.mode)) return;
    if (
      (event.data.type === 'seanchai-pdf-page' || event.data.type === 'seanchai-source-page') &&
      Number.isInteger(event.data.page) &&
      event.data.page > 0 &&
      event.data.page !== selected.position.page
    ) {
      selected.position = reported = { ...selected.position, page: event.data.page, exact: true };
      changed();
      onChange();
    }
    // The viewer reports its own find for the position too, and every count of a search.
    if (
      event.data.type === 'seanchai-pdf-matches' &&
      typeof event.data.query === 'string' &&
      event.data.query !== (selected.position.name ?? selected.position.section)
    ) {
      selected.position = reported = { ...selected.position, name: event.data.query, exact: true };
      onChange();
    }
  });

  function setVisible(visible: boolean) {
    switchedOn = visible;
    changed();
  }

  const pane = {
    /** Puts the pane beside a document's text. A document with neither a reader nor a placeholder gets no pane. */
    mount(doc: Document) {
      mounted = {
        doc,
        position: doc.sections[0] ?? { section: '', page: null },
        reads: Boolean(paneKind(doc, site.mode)),
        inspects: paneKind(doc, site.mode) === 'placeholder',
      };
      selected = undefined;
      shown = {};
      inspected = undefined;
      changed();
    },
    /** The text is gone: a move still under way is dropped, and nothing is drawn again until the next mount. */
    unmount() {
      request++;
      mounted = undefined;
      selected = undefined;
      inspected = undefined;
    },
    get switchedOn() {
      return switchedOn;
    },
    /** The pane is showing, and a position in the mounted document can go to it. */
    readsDocument: () => isOpen() && readsMounted(),
    /** The pane can read this document here, switched on or not. A place in one it cannot is only the view's to go to. */
    shows(target: Pick<DocumentSummary, 'source'> | undefined): boolean {
      if (!wide.matches || !mounted?.reads || !target) return false;
      const kind = paneKind(target, site.mode);
      return Boolean(kind && kind !== 'placeholder');
    },
    /**
     * The pane would show what a name is for a place in `document`, or with none in the text's own: it is here, wide
     * enough, and has no reader for that document. It shows the place's source where it has one.
     */
    inspects(document: string | undefined): boolean {
      const target = document === undefined ? mounted?.doc : site.summary(document);
      return Boolean(wide.matches && mounted?.reads && target && paneKind(target, site.mode) === 'placeholder');
    },
    /**
     * Shows what the name `request` is about is, switching the pane on, and moves it to `place`, if there is one, for
     * its header to link to the publisher's copy there. The text stays where it is.
     */
    inspect(request: PopupRequest, place: Place | undefined) {
      inspected = { request, count: ++inspections };
      setVisible(true);
      if (place) pane.openPlace(place, request.doc);
      else onChange();
    },
    setVisible,
    /** The reader's switch of the pane, a change to keep in the route as a move by the code is not. */
    switchOn(visible: boolean) {
      setVisible(visible);
      onChange();
    },
    /** Moves the pane to a position, and remembers it for when the pane is next shown. `moved` is a move to keep in the URL. */
    show(position: SourcePosition, doc: Document, moved = false) {
      const generation = ++request;
      if (!mounted) return;
      const place = (position: SourcePosition) => {
        if (generation !== request || !mounted) return;
        if (doc.id === mounted.doc.id) mounted.position = position;
        if (mounted.reads && paneKind(doc, site.mode)) selected = { doc, position };
        changed();
        if (moved) onChange();
      };
      // The source prints a renamed row under its raw name.
      if (!position.row || !doc.raw || position.exact || !correctedRow(doc, position)) {
        place(position);
        return;
      }
      void site
        .loadRaw(doc.id)
        .then(
          raw => printedRow(doc, raw, position),
          () => null,
        )
        .then(printed => place(printed ? { ...position, printed } : position));
    },
    /** Moves the pane alone to a place, switching it on: to its position, or to a target's clause, in whichever document has it. */
    async showPlace(place: Place, doc: Document) {
      const generation = ++request;
      const held = place.document === doc.id ? doc : await site.loadDocument(place.document);
      if (generation !== request) return;
      const { position } = place;
      if (position) {
        const known = held.sections.find(section => section.section === position.section);
        setVisible(true);
        pane.show({ ...known, ...position, page: position.page ?? known?.page ?? null }, held, true);
        return;
      }
      const target = place.target!;
      const clause = held.sections.find(section => section.section === target.section) ?? held.sections[0];
      if (!clause) return;
      setVisible(true);
      pane.show({ ...clause, name: target.name }, held, true);
    },
    /** `showPlace` for the reader's click: a document that fails to load is said, with a Retry. */
    openPlace(place: Place, doc: Document) {
      const summary = site.summary(place.document);
      attempt(paneText.loadFailed(summary ? site.label(summary) : place.document), () => pane.showPlace(place, doc));
    },
    get state(): PaneState | undefined {
      return selected && { document: selected.doc.id, position: selected.position };
    },
    postTheme,
    /** Calls `listener` whenever the pane is to be drawn again, until the returned function is called. */
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** What the components draw: the pane as it stands. */
    get view() {
      return {
        wide: wide.matches,
        open: isOpen(),
        mounted,
        selected,
        shown,
        inspected,
        setFrame(node: HTMLIFrameElement | null) {
          frame = node;
        },
      };
    },
  };
  return pane;
}

/** Draws the calling component again whenever the pane changes, from the moment it is drawn. */
function usePane(pane: SourcePane) {
  const [, redraw] = useReducer((count: number) => count + 1, 0);
  useLayoutEffect(() => pane.subscribe(() => redraw(undefined)), [pane]);
  return pane.view;
}

/**
 * The control switching the pane on and off, for the document toolbar, named for what the pane shows: a source
 * document, or the inspector where it cannot show one, as it last showed or, before it has, as it would beside this
 * document. Hidden where the window is too narrow for it.
 */
export function SourceToggle({ pane }: { pane: SourcePane }) {
  const { wide, mounted, shown } = usePane(pane);
  if (!mounted?.reads) return null;
  const inspects = shown.url === undefined ? Boolean(shown.placeholder) || mounted.inspects : false;
  return (
    <label class="visibility-toggle source-toggle" hidden={!wide}>
      {inspects ? strip.inspector : strip.source}
      <input
        type="checkbox"
        checked={pane.switchedOn}
        aria-controls="source-pane"
        onChange={event => pane.switchOn(event.currentTarget.checked)}
      />
    </label>
  );
}

/**
 * A document's workspace: its header and text, and beside them the source pane, with the divider between them.
 * `header` goes first in the document's bar, as the jump controls do; `text` is the text's own pane.
 */
export function Workspace({
  pane,
  site,
  header,
  text,
}: {
  pane: SourcePane;
  site: Site;
  header?: ComponentChildren;
  text: ComponentChildren;
}) {
  const { open, mounted, selected, shown, inspected, setFrame } = usePane(pane);
  const [ratio, setRatio] = useState(50);
  const [resizing, setResizing] = useState(false);
  const workspace = useRef<HTMLDivElement>(null);
  if (!mounted) return null;
  const { doc } = mounted;
  const inspector = shown.url === undefined ? shown.placeholder : undefined;
  // The publisher's copy is linked once: by the inspector's header where it shows this document's place.
  const linked = !(open && inspector && selected?.doc.id === doc.id);
  const style = { '--source-left': `${ratio}fr`, '--source-right': `${100 - ratio}fr` };
  const classes = [open && 'with-source', resizing && 'resizing'].filter(Boolean).join(' ');
  return (
    <div id="workspace" ref={workspace} class={classes || undefined} style={style}>
      {/* A name arriving later would change the header's height under a restored position. */}
      <PaneHeader
        source={false}
        doc={doc}
        position={selected?.doc.id === doc.id ? selected.position : mounted.position}
        site={site}
        publisher={linked}
      >
        {header}
      </PaneHeader>
      {text}
      {mounted.reads && (
        <>
          <Divider
            ratio={ratio}
            setRatio={value => setRatio(Math.min(80, Math.max(20, value)))}
            setResizing={setResizing}
            workspace={() => workspace.current}
          />
          {selected ? (
            <PaneHeader source doc={selected.doc} position={selected.position} site={site} />
          ) : (
            <div class="pane-header source-header" />
          )}
          <aside id="source-pane">
            {inspector ? (
              <Inspector site={site} pane={pane} doc={inspector.doc} inspected={inspected} />
            ) : (
              <iframe
                ref={setFrame}
                // Out of the page the reader unloads, and back in it loads and goes to its position afresh.
                src={shown.url}
                title={shown.title ?? docVersioned(doc)}
                onLoad={() => pane.postTheme()}
              />
            )}
          </aside>
        </>
      )}
    </div>
  );
}
