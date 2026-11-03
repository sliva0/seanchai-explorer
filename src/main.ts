import { createAvpPopup } from './avp-popup.ts';
import { docLabel, openSite, paneKind, siteURL } from './data.ts';
import { element } from './dom.ts';
import { renderDocument } from './document-view.ts';
import type { DocumentView } from './document-view.ts';
import { createHighlighter } from './highlight.ts';
import type { Grammar, HighlightedLine } from './highlight.ts';
import { renderIndex } from './index-view.ts';
import { parseRoute, routeFor } from './navigation.ts';
import type { RouteOptions } from './navigation.ts';
import { renderSearch } from './search-view.ts';
import { createSourcePane } from './source-pane.ts';
import type { SourcePane } from './source-pane.ts';
import { initTheme } from './theme.ts';
import type { Line } from './types.ts';

const header = element('header');
const nav = element('nav');
const siteName = element('a', 'Seanchaí', 'site-name');
siteName.href = '#';
siteName.setAttribute('aria-label', 'Seanchaí, index');
const searchLink = element('a', 'Search');
searchLink.href = '#search';
nav.append(siteName, searchLink);
const searchForm = element('form', undefined, 'header-search');
searchForm.setAttribute('role', 'search');
const searchInput = element('input');
searchInput.type = 'search';
searchInput.placeholder = 'Search ( / )';
searchInput.setAttribute('aria-label', 'Search');
searchForm.append(searchInput);
searchForm.onsubmit = event => {
  event.preventDefault();
  location.hash = `#search?q=${encodeURIComponent(searchInput.value.trim())}`;
  searchInput.value = '';
};
const themeButton = element('button', undefined, 'theme-toggle');
themeButton.type = 'button';
const headerActions = element('div', undefined, 'header-actions');
headerActions.append(themeButton);
header.append(nav, searchForm, headerActions);
const content = element('main');
content.id = 'content';
content.tabIndex = -1;
// A link's own fragment would be taken for a route.
const skipLink = element('a', 'Skip to content', 'skip-link');
skipLink.href = '#';
skipLink.onclick = event => {
  event.preventDefault();
  (content.querySelector<HTMLElement>('#document') ?? content).focus();
};
document.querySelector('#app')!.replaceChildren(skipLink, header, content);

let pane: SourcePane | undefined;
const theme = initTheme(value => {
  themeButton.textContent = value === 'light' ? 'Dark' : 'Light';
  themeButton.setAttribute('aria-label', `${themeButton.textContent} theme`);
  pane?.postTheme();
});
themeButton.onclick = () => theme.toggle();
document.addEventListener('keydown', event => {
  const typing = (event.target as Element).closest?.('input, textarea, select, [contenteditable]');
  if (event.key !== '/' || typing || event.ctrlKey || event.metaKey || event.altKey) return;
  event.preventDefault();
  (content.querySelector<HTMLInputElement>('.search-form input') ?? searchInput).focus();
});

function setTitle(page?: string) {
  document.title = page ? `${page} — Seanchaí` : 'Seanchaí';
}

function focusHeading() {
  content.querySelector('h1')?.focus({ preventScroll: true });
}

function showMessage(heading: string, detail?: string) {
  content.className = '';
  setTitle(heading);
  const title = element('h1', heading);
  title.tabIndex = -1;
  content.replaceChildren(title);
  if (detail) content.append(element('p', detail));
}

function showError(error: unknown) {
  showMessage('Something went wrong', String(error));
}

try {
  const site = await openSite();
  const grammar = await fetch(siteURL('syntax/dad.tmLanguage.json'));
  if (!grammar.ok) throw new Error(`${grammar.status}: syntax/dad.tmLanguage.json`);
  const highlighter = createHighlighter(await grammar.json() as Grammar);
  const highlighted = new WeakMap<Line[], HighlightedLine[]>();
  let view: DocumentView | undefined;
  let request = 0;
  // Focus moves on navigation, not when the site is first opened.
  let arrived = false;

  /** Keeps a view shareable: the pane's state goes into this history entry, so Back returns to it too. */
  function updateRoute(options: RouteOptions) {
    const parsed = parseRoute(location.hash);
    if (parsed.document !== view?.doc.id) return;
    const next = routeFor({ document: parsed.document, section: parsed.section || null, name: parsed.name }, { ...parsed, ...options });
    if (next !== location.hash) history.replaceState(history.state, '', next);
  }

  const sourcePane = pane = createSourcePane(site, () => theme.current, () => {
    updateRoute({ source: sourcePane.state, paneHidden: !sourcePane.switchedOn });
  });
  const popup = createAvpPopup(site, sourcePane);
  const services = {
    site, pane: sourcePane, popup,
    highlight(lines: Line[]) {
      let decorated = highlighted.get(lines);
      if (!decorated) { decorated = highlighter(lines); highlighted.set(lines, decorated); }
      return decorated;
    },
    navigate(hash: string) {
      if (location.hash === hash) { void route(); return; }
      updateRoute({ top: view?.topLine() });
      location.hash = hash;
    },
  };
  function leaveDocument(className: string) {
    view = undefined;
    sourcePane.unmount();
    content.className = className;
  }

  async function route() {
    popup.close();
    const generation = ++request;
    const parsed = parseRoute(location.hash);
    searchForm.hidden = parsed.document === 'search';
    if (!parsed.document) {
      leaveDocument('index-view');
      setTitle();
      renderIndex(content, site);
      if (arrived) focusHeading();
      return;
    }
    if (parsed.document === 'search') {
      leaveDocument('');
      setTitle('Search');
      renderSearch(content, site, parsed.query, () => generation === request);
      return;
    }
    if (parsed.paneHidden) sourcePane.setVisible(false);
    const meta = site.summary(parsed.document);
    if (!meta) {
      leaveDocument('');
      showMessage('Document not found');
      if (arrived) focusHeading();
      return;
    }
    try {
      const fresh = view?.doc.id !== meta.id || view.raw !== parsed.raw;
      if (fresh) {
        leaveDocument('');
        setTitle(docLabel(meta));
        const loading = element('p', `Loading ${docLabel(meta)}…`);
        loading.setAttribute('role', 'status');
        content.replaceChildren(loading);
        const [doc, raw] = await Promise.all([site.loadDocument(meta.id), parsed.raw && meta.raw ? site.loadRaw(meta.id) : undefined]);
        if (generation !== request) return;
        content.className = 'document-view';
        view = renderDocument(content, services, doc, raw);
      }
      const current = view!;
      const target = parsed.source && site.summary(parsed.source.document);
      if (parsed.source && target && paneKind(target, site.mode)) {
        const doc = await site.loadDocument(target.id);
        if (generation !== request) return;
        const known = doc.sections.find(section => section.section === parsed.source!.position.section);
        sourcePane.show({ ...known, ...parsed.source.position, page: parsed.source.position.page ?? known?.page }, doc);
      } else {
        const position = current.doc.sections.find(section => section.section === parsed.section) ?? current.doc.sections[0];
        if (position) sourcePane.show({ ...position, name: parsed.name }, current.doc);
      }
      if (parsed.section) current.scrollToSection(parsed.section);
      current.pointAtLine(parsed.line);
      if (parsed.top !== undefined) current.scrollToLine(parsed.top);
      if (arrived) {
        if (fresh) focusHeading();
        else current.focusPosition();
      }
    } catch (error) {
      if (generation !== request) return;
      leaveDocument('');
      showError(error);
      if (arrived) focusHeading();
    }
  }

  window.addEventListener('hashchange', () => {
    arrived = true;
    void route();
  });
  await route();
} catch (error) { showError(error); }
