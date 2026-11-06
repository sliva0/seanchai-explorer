import type { Place } from './avp-places.ts';
import { docSubject, docTitle, docVersioned, dataURL, isPdfURL, paneFile, paneKind, paneURL, publisherURL } from './data.ts';
import type { Site } from './data.ts';
import { element, externalLink } from './dom.ts';
import type { PaneState, SourcePosition } from './navigation.ts';
import { correctedRow, printedRow } from './printed-row.ts';
import type { Document, DocumentSummary } from './types.ts';

const svgNamespace = 'http://www.w3.org/2000/svg';
const selfHostingGuide = 'https://github.com/sliva0/seanchai-explorer#two-build-modes';
const hostName = (url: URL) => url.hostname.replace(/^www\./, '');

function icon(className: string, path: string, label?: string): SVGSVGElement {
  const svg = document.createElementNS(svgNamespace, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add(className);
  const shape = document.createElementNS(svgNamespace, 'path');
  shape.setAttribute('d', path);
  svg.append(shape);
  if (label) {
    const text = document.createElementNS(svgNamespace, 'text');
    text.setAttribute('x', '8');
    text.setAttribute('y', '11.5');
    text.textContent = label;
    svg.append(text);
  }
  return svg;
}

function decorateFileLink(anchor: HTMLAnchorElement, url: URL, label: string, pdf: boolean) {
  anchor.href = url.href;
  anchor.title = url.href;
  anchor.replaceChildren(
    icon('file-icon', 'M3 1.5h6l4 4v9H3z M9 1.5v4h4', pdf ? 'PDF' : undefined),
    element('span', label),
    icon('external-icon', 'M9 2h5v5 M14 2L7 9 M6 3H2v11h11v-4'),
  );
  anchor.setAttribute('aria-label', `${label}, new tab`);
}

/** The bar over a pane: the document's name and links to its copies. */
function createPaneHeader(source: boolean): HTMLElement {
  const header = element('div', undefined, `pane-header ${source ? 'source-header' : 'document-header'}`);
  const title = element(source ? 'h2' : 'h1', undefined, source ? 'source-document' : 'dad-document');
  title.tabIndex = -1;
  const actions = element('div', undefined, 'pane-actions');
  for (const className of ['publisher-link', 'local-link']) {
    const anchor = element('a', undefined, `control ${className}`);
    anchor.target = '_blank';
    anchor.rel = 'noopener';
    actions.append(anchor);
  }
  header.append(title);
  if (source) header.append(element('span', undefined, 'source-page'));
  header.append(actions);
  return header;
}

function updatePaneHeader(header: HTMLElement, doc: DocumentSummary, position: SourcePosition, site: Site) {
  // The source's bar is the narrower one in a split, and the two share a row: a third line would move the text below.
  header.querySelector('h1, h2')!.textContent = header.classList.contains('source-header') ? [docVersioned(doc), docSubject(doc)].filter(Boolean).join(' — ') : docTitle(doc);
  const kind = paneKind(doc, site.mode);
  // The PDF viewer shows its own page; the indicator is for panes without one.
  const page = header.querySelector('.source-page');
  if (page) page.textContent = position.page && kind !== 'pdf' ? `p. ${position.page}` : '';
  const publisher = header.querySelector<HTMLAnchorElement>('.publisher-link')!;
  // A PDF opens at the page, an RFC's HTML rendering at the section.
  const url = publisherURL(doc, position);
  publisher.hidden = !url;
  if (url) decorateFileLink(publisher, url, hostName(url), doc.source.kind === 'etsi-pdf' || isPdfURL(url));
  const local = header.querySelector<HTMLAnchorElement>('.local-link')!;
  local.hidden = !doc.source.text && kind !== 'pdf';
  if (kind === 'pdf') {
    const file = dataURL(doc.source.local!);
    if (position.page) file.hash = `page=${position.page}`;
    decorateFileLink(local, file, hostName(file), true);
  } else if (doc.source.text) {
    const text = paneURL(doc, position, site.mode)!;
    decorateFileLink(local, text, hostName(text), false);
  }
}

/** What the pane says of a PDF this build does not hold: why, and where to read it instead. */
function fillPlaceholder(panel: HTMLElement, doc: DocumentSummary, position: SourcePosition) {
  const reason = element('p', `The PDF of ${docVersioned(doc)} cannot be shown here for licensing reasons.`);
  const url = publisherURL(doc, position);
  const publisher = element('p');
  if (url) publisher.append(externalLink(`Open at ${hostName(url)}${position.page ? `, p. ${position.page}` : ''}`, url.href));
  const selfHost = element('p');
  selfHost.append(externalLink('Self-host Seanchaí Explorer to read PDFs beside the corpus', selfHostingGuide));
  panel.replaceChildren(reason, publisher, selfHost);
}

function createSplitter(workspace: HTMLElement): HTMLElement {
  const divider = element('div');
  divider.id = 'divider';
  let ratio = 50;
  const set = (value: number) => {
    ratio = Math.min(80, Math.max(20, value));
    workspace.style.setProperty('--source-left', `${ratio}fr`);
    workspace.style.setProperty('--source-right', `${100 - ratio}fr`);
    divider.setAttribute('aria-valuenow', String(Math.round(ratio)));
  };
  divider.tabIndex = 0;
  divider.setAttribute('role', 'separator');
  divider.setAttribute('aria-label', 'Source pane width');
  divider.setAttribute('aria-orientation', 'vertical');
  divider.setAttribute('aria-valuemin', '20');
  divider.setAttribute('aria-valuemax', '80');
  divider.setAttribute('aria-valuenow', '50');
  let grabbedAt = 0;
  let pointerX = 0;
  let frame = 0;
  divider.onpointerdown = event => {
    divider.setPointerCapture(event.pointerId);
    grabbedAt = event.clientX - divider.getBoundingClientRect().left;
    workspace.classList.add('resizing');
  };
  divider.onpointermove = event => {
    if (!divider.hasPointerCapture(event.pointerId)) return;
    pointerX = event.clientX;
    frame ||= requestAnimationFrame(() => {
      frame = 0;
      const rect = workspace.getBoundingClientRect();
      set((pointerX - grabbedAt - rect.left) * 100 / (rect.width - divider.offsetWidth));
    });
  };
  divider.onpointerup = event => divider.releasePointerCapture(event.pointerId);
  divider.onlostpointercapture = () => workspace.classList.remove('resizing');
  divider.onkeydown = event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      set(ratio + (event.key === 'ArrowLeft' ? -5 : 5));
    }
  };
  return divider;
}

interface Mounted {
  doc: Document;
  position: SourcePosition;
  workspace: HTMLElement;
  documentHeader: HTMLElement;
  sourceHeader?: HTMLElement;
  aside?: HTMLElement;
  frame?: HTMLIFrameElement;
  placeholder?: HTMLElement;
  toggle?: HTMLLabelElement;
}

export type SourcePane = ReturnType<typeof createSourcePane>;

export function createSourcePane(site: Site, currentTheme: () => string, onChange: () => void) {
  const wide = matchMedia('(min-width: 761px)');
  let switchedOn = true;
  let selected: { doc: Document; position: SourcePosition } | undefined;
  let mounted: Mounted | undefined;
  let request = 0;

  const isOpen = () => Boolean(wide.matches && switchedOn && mounted?.frame);
  /** A position in the mounted document has somewhere to go, which a placeholder is not. */
  const readsMounted = () => Boolean(mounted && paneKind(mounted.doc, site.mode) !== 'placeholder');

  function refreshHeaders() {
    if (!mounted) return;
    updatePaneHeader(mounted.documentHeader, mounted.doc, selected?.doc.id === mounted.doc.id ? selected.position : mounted.position, site);
    if (mounted.sourceHeader && selected) updatePaneHeader(mounted.sourceHeader, selected.doc, selected.position, site);
  }

  function postTheme(frame: HTMLIFrameElement) {
    if (frame.src && new URL(frame.src, location.href).origin === location.origin) frame.contentWindow?.postMessage({ type: 'seanchai-theme', theme: currentTheme() }, location.origin);
  }

  /** The one place the pane is shown, hidden and given a source to load. */
  function render() {
    if (!mounted?.frame) return;
    mounted.workspace.classList.toggle('with-source', isOpen());
    mounted.toggle!.hidden = !wide.matches;
    if (!isOpen() || !selected) return;
    const url = paneURL(selected.doc, selected.position, site.mode);
    if (!url) {
      fillPlaceholder(mounted.placeholder!, selected.doc, selected.position);
      // Out of the page the reader unloads, and back in it loads and goes to its position afresh.
      mounted.aside!.replaceChildren(mounted.placeholder!);
      return;
    }
    mounted.frame.title = docVersioned(selected.doc);
    if (mounted.frame.src !== url.href) mounted.frame.src = url.href;
    if (!mounted.frame.isConnected) mounted.aside!.replaceChildren(mounted.frame);
  }

  wide.addEventListener('change', render);

  window.addEventListener('message', event => {
    const frame = mounted?.frame;
    if (event.origin !== location.origin || !frame?.contentWindow || event.source !== frame.contentWindow || !selected) return;
    if (event.data?.file !== paneFile(selected.doc, site.mode)) return;
    if ((event.data.type === 'seanchai-pdf-page' || event.data.type === 'seanchai-source-page') && Number.isInteger(event.data.page) && event.data.page > 0 && event.data.page !== selected.position.page) {
      selected.position = { ...selected.position, page: event.data.page, exact: true };
      refreshHeaders();
      onChange();
    }
    // The viewer reports its own find for the position too, and every count of a search.
    if (event.data.type === 'seanchai-pdf-matches' && typeof event.data.query === 'string' && event.data.query !== (selected.position.name ?? selected.position.section)) {
      selected.position = { ...selected.position, name: event.data.query, exact: true };
      onChange();
    }
  });

  function setVisible(visible: boolean) {
    switchedOn = visible;
    const input = mounted?.toggle?.querySelector('input');
    if (input) input.checked = visible;
    render();
  }

  function createToggle(): HTMLLabelElement {
    const label = element('label', 'Source ', 'visibility-toggle source-toggle');
    const input = element('input');
    input.type = 'checkbox';
    input.checked = switchedOn;
    input.setAttribute('aria-controls', 'source-pane');
    input.onchange = () => {
      setVisible(input.checked);
      onChange();
    };
    label.append(input);
    return label;
  }

  return {
    /** Fills a document's workspace. A document with neither a reader nor a placeholder gets no pane at all. */
    mount(workspace: HTMLElement, doc: Document) {
      const documentHeader = createPaneHeader(false);
      const position = doc.sections[0] ?? { section: '', page: null };
      mounted = { doc, position, workspace, documentHeader };
      selected = undefined;
      workspace.append(documentHeader);
      // A name arriving later would change the header's height under a restored position.
      refreshHeaders();
      if (!paneKind(doc, site.mode)) return;
      const aside = element('aside');
      aside.id = 'source-pane';
      const frame = element('iframe');
      frame.title = docVersioned(doc);
      frame.onload = () => postTheme(frame);
      aside.append(frame);
      mounted.sourceHeader = createPaneHeader(true);
      mounted.aside = aside;
      mounted.frame = frame;
      mounted.placeholder = element('div', undefined, 'source-placeholder');
      mounted.toggle = createToggle();
      workspace.append(createSplitter(workspace), mounted.sourceHeader, aside);
      render();
    },
    unmount() {
      request++;
      mounted = undefined;
      selected = undefined;
    },
    get toggle() { return mounted?.toggle; },
    get switchedOn() { return switchedOn; },
    /** The pane is showing, and a position in the mounted document can go to it. */
    readsDocument: () => isOpen() && readsMounted(),
    /** The pane can read this document here, switched on or not. A place in one it cannot is only the view's to go to. */
    shows(target: Pick<DocumentSummary, 'source'> | undefined): boolean {
      if (!wide.matches || !mounted?.frame || !target) return false;
      const kind = paneKind(target, site.mode);
      return Boolean(kind && kind !== 'placeholder');
    },
    setVisible,
    /** Moves the pane to a position, and remembers it for when the pane is next shown. `moved` is a move to keep in the URL. */
    show(position: SourcePosition, doc: Document, moved = false) {
      const generation = ++request;
      if (!mounted) return;
      const place = (position: SourcePosition) => {
        if (generation !== request || !mounted) return;
        if (doc.id === mounted.doc.id) mounted.position = position;
        if (mounted.frame && paneKind(doc, site.mode)) selected = { doc, position };
        refreshHeaders();
        render();
        if (moved) onChange();
      };
      // The source prints a renamed row under its raw name.
      if (!position.row || !doc.raw || position.exact || !correctedRow(doc, position)) { place(position); return; }
      void site.loadRaw(doc.id).then(raw => printedRow(doc, raw, position), () => null)
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
        this.show({ ...known, ...position, page: position.page ?? known?.page ?? null }, held, true);
        return;
      }
      const target = place.target!;
      const clause = held.sections.find(section => section.section === target.section) ?? held.sections[0];
      if (!clause) return;
      setVisible(true);
      this.show({ ...clause, name: target.name }, held, true);
    },
    get state(): PaneState | undefined {
      return selected && { document: selected.doc.id, position: selected.position };
    },
    postTheme() { if (mounted?.frame) postTheme(mounted.frame); },
  };
}
