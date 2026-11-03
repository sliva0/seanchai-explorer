import { docLabel, docTitle, dataURL, paneFile, paneKind, paneURL, publisherURL } from './data.ts';
import type { Site } from './data.ts';
import { element } from './dom.ts';
import type { PaneState, SourcePosition } from './navigation.ts';
import type { Document, DocumentSummary, Target } from './types.ts';

const svgNamespace = 'http://www.w3.org/2000/svg';

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
  const title = element('h2', undefined, source ? 'source-document' : 'dad-document');
  const actions = element('div', undefined, 'pane-actions');
  for (const className of ['publisher-link', 'local-link']) {
    const anchor = element('a', undefined, className);
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
  header.querySelector('h2')!.textContent = docTitle(doc);
  const page = header.querySelector('.source-page');
  if (page) page.textContent = position.page ? `p. ${position.page}` : '';
  const publisher = header.querySelector<HTMLAnchorElement>('.publisher-link')!;
  const url = publisherURL(doc, position);
  publisher.hidden = !url;
  if (url) decorateFileLink(publisher, url, url.hostname.replace(/^www\./, ''), doc.source.kind === 'etsi-pdf' || url.pathname.toLowerCase().endsWith('.pdf'));
  const local = header.querySelector<HTMLAnchorElement>('.local-link')!;
  const kind = paneKind(doc, site.mode);
  local.hidden = !doc.source.text && kind !== 'pdf';
  if (kind === 'pdf') {
    const file = dataURL(doc.source.local!);
    if (position.page) file.hash = `page=${position.page}`;
    decorateFileLink(local, file, 'Local PDF', true);
  } else if (doc.source.text) decorateFileLink(local, paneURL(doc, position, site.mode)!, 'Local text', false);
}

function createSplitter(workspace: HTMLElement): HTMLElement {
  const divider = element('div');
  divider.id = 'divider';
  let ratio = 50;
  const set = (value: number) => {
    ratio = Math.min(80, Math.max(20, value));
    workspace.style.gridTemplateColumns = `minmax(0, ${ratio}fr) 8px minmax(0, ${100 - ratio}fr)`;
    divider.setAttribute('aria-valuenow', String(Math.round(ratio)));
  };
  divider.tabIndex = 0;
  divider.setAttribute('role', 'separator');
  divider.setAttribute('aria-label', 'Source pane width');
  divider.setAttribute('aria-orientation', 'vertical');
  divider.setAttribute('aria-valuemin', '20');
  divider.setAttribute('aria-valuemax', '80');
  divider.setAttribute('aria-valuenow', '50');
  divider.onpointerdown = event => divider.setPointerCapture(event.pointerId);
  divider.onpointermove = event => {
    if (!divider.hasPointerCapture(event.pointerId)) return;
    const rect = workspace.getBoundingClientRect();
    set((event.clientX - rect.left) * 100 / rect.width);
  };
  divider.onpointerup = event => divider.releasePointerCapture(event.pointerId);
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
  frame?: HTMLIFrameElement;
  toggle?: HTMLLabelElement;
}

export type SourcePane = ReturnType<typeof createSourcePane>;

export function createSourcePane(site: Site, currentTheme: () => string) {
  const wide = matchMedia('(min-width: 761px)');
  let switchedOn = true;
  let selected: { doc: Document; position: SourcePosition } | undefined;
  let mounted: Mounted | undefined;
  let request = 0;

  const isOpen = () => Boolean(wide.matches && switchedOn && mounted?.frame);

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
    const url = paneURL(selected.doc, selected.position, site.mode)!;
    mounted.frame.title = docLabel(selected.doc);
    if (mounted.frame.src !== url.href) mounted.frame.src = url.href;
  }

  wide.addEventListener('change', render);

  window.addEventListener('message', event => {
    const frame = mounted?.frame;
    if (event.origin !== location.origin || !frame?.contentWindow || event.source !== frame.contentWindow || !selected) return;
    if (event.data?.file !== paneFile(selected.doc, site.mode)) return;
    if ((event.data.type === 'seanchai-pdf-page' || event.data.type === 'seanchai-source-page') && Number.isInteger(event.data.page) && event.data.page > 0) {
      selected.position = { ...selected.position, page: event.data.page, exact: true };
      refreshHeaders();
    }
    if (event.data.type === 'seanchai-pdf-matches' && typeof event.data.query === 'string') {
      selected.position = { ...selected.position, name: event.data.query, exact: true };
    }
  });

  function setVisible(visible: boolean) {
    switchedOn = visible;
    const input = mounted?.toggle?.querySelector('input');
    if (input) input.checked = visible;
    render();
  }

  function createToggle(): HTMLLabelElement {
    const label = element('label', 'Source ', 'visibility-toggle');
    const input = element('input');
    input.type = 'checkbox';
    input.checked = switchedOn;
    input.setAttribute('aria-controls', 'source-pane');
    input.onchange = () => setVisible(input.checked);
    label.append(input);
    return label;
  }

  return {
    /** Fills a document's workspace. A document the pane cannot show gets no pane at all. */
    mount(workspace: HTMLElement, doc: Document) {
      const documentHeader = createPaneHeader(false);
      const position = doc.sections[0] ?? { section: '', page: null };
      mounted = { doc, position, workspace, documentHeader };
      selected = undefined;
      workspace.append(documentHeader);
      if (!paneKind(doc, site.mode)) return;
      const aside = element('aside');
      aside.id = 'source-pane';
      const frame = element('iframe');
      frame.title = docLabel(doc);
      frame.onload = () => postTheme(frame);
      aside.append(frame);
      mounted.sourceHeader = createPaneHeader(true);
      mounted.frame = frame;
      mounted.toggle = createToggle();
      workspace.append(createSplitter(workspace), mounted.sourceHeader, aside);
    },
    unmount() {
      request++;
      mounted = undefined;
      selected = undefined;
    },
    get toggle() { return mounted?.toggle; },
    isOpen,
    canShow: () => Boolean(wide.matches && mounted?.frame),
    /** A followed name goes to the pane only if this holds; otherwise to the target's page. */
    paneAvailable(target: DocumentSummary | undefined): boolean {
      return isOpen() && Boolean(target && paneKind(target, site.mode));
    },
    setVisible,
    /** Moves the pane to a position, and remembers it for when the pane is next shown. */
    show(position: SourcePosition, doc: Document) {
      request++;
      if (!mounted) return;
      if (doc.id === mounted.doc.id) mounted.position = position;
      if (mounted.frame && paneKind(doc, site.mode)) selected = { doc, position };
      refreshHeaders();
      render();
    },
    /** Shows a followed name's definition in the pane. */
    async showTarget(target: Target) {
      const generation = ++request;
      const doc = await site.loadDocument(target.document);
      if (generation !== request) return;
      const position = doc.sections.find(section => section.section === target.section) ?? doc.sections[0];
      if (position) this.show({ ...position, name: target.name }, doc);
    },
    get state(): PaneState | undefined {
      return selected && { document: selected.doc.id, position: selected.position };
    },
    postTheme() { if (mounted?.frame) postTheme(mounted.frame); },
  };
}
