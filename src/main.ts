import { createAvpPopup } from './avp-popup.ts';
import { openSite, paneKind, siteURL } from './data.ts';
import { element } from './dom.ts';
import { renderDocument } from './document-view.ts';
import type { DocumentView } from './document-view.ts';
import { createHighlighter } from './highlight.ts';
import type { Grammar, HighlightedLine } from './highlight.ts';
import { renderIndex } from './index-view.ts';
import { pageOf, parseRoute, routeFor } from './navigation.ts';
import type { Route, RouteOptions } from './navigation.ts';
import { createPositionStore } from './positions.ts';
import type { ScrollPosition } from './positions.ts';
import { renderSearch } from './search-view.ts';
import { createSourcePane } from './source-pane.ts';
import type { SourcePane } from './source-pane.ts';
import { initTheme } from './theme.ts';
import type { Line } from './types.ts';

const header = element('header');
const nav = element('nav');
const indexLink = element('a', 'Index', 'control');
indexLink.href = '#';
const searchLink = element('a', 'Search', 'control');
searchLink.href = '#search';
nav.append(indexLink, searchLink);
const themeButton = element('button', undefined, 'control theme-toggle');
themeButton.type = 'button';
header.append(nav, themeButton);
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

function setTitle(page?: string) {
  document.title = page ? `${page} — Seanchaí` : 'Seanchaí';
}

function focusHeading() {
  (content.querySelector('h1') ?? content).focus({ preventScroll: true });
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
  // The position is put back by the route, not by the browser after it.
  history.scrollRestoration = 'manual';

  const positions = createPositionStore(() => sessionStorage);

  const targetOf = (route: Route) => ({ document: route.document, section: route.section || null, name: route.name });

  /**
   * Keeps a view shareable: the pane's state goes into this history entry, so Back returns to it too.
   * `offset` is what `top` cannot say, the pixels of that line above the edge, and is kept beside it to return to exactly.
   */
  function updateRoute(options: RouteOptions, offset?: number) {
    const parsed = parseRoute(location.hash);
    if (parsed.document !== view?.doc.id) return;
    const next = routeFor(targetOf(parsed), { ...parsed, ...options });
    const stale = offset !== undefined && offset !== history.state?.offset;
    if (next !== location.hash || stale) history.replaceState(stale ? { ...history.state, offset } : history.state, '', next);
  }

  /** Remembers where the document being left is, and returns that for its history entry to keep. */
  function leave(): ScrollPosition | undefined {
    if (!view) return undefined;
    view.settle();
    const left = view.position();
    if (left) positions.set(pageOf({ document: view.doc.id, raw: view.raw }), left);
    return left;
  }

  /** Puts the route in the browser's history: a new entry for a new page, so that Back steps between documents, the same one for a move within a page. */
  function setRoute(hash: string, state: unknown) {
    const samePage = pageOf(parseRoute(hash)) === pageOf(parseRoute(location.hash));
    if (samePage) { if ((hash === '#' ? '' : hash) !== location.hash || state) history.replaceState(state, '', hash); }
    else history.pushState(state, '', hash);
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
      const left = leave();
      if (left && pageOf(parseRoute(hash)) !== pageOf(parseRoute(location.hash))) updateRoute({ top: left.top }, left.offset);
      setRoute(hash, null);
      arrived = true;
      void route({ smooth: true });
    },
    scrolled(moved: DocumentView) {
      if (moved !== view) return;
      const left = leave();
      if (left) updateRoute({ top: left.top }, left.offset);
    },
  };
  // Every route link goes through here, for the history to step by document. A link's route does not say the pane is off, and without that it would switch the pane on.
  document.addEventListener('click', event => {
    const anchor = (event.target as Element).closest?.<HTMLAnchorElement>('a[href^="#"]');
    if (!anchor || event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const href = anchor.getAttribute('href')!;
    const target = parseRoute(href);
    const keepsPaneOff = !sourcePane.switchedOn && target.document && target.document !== 'search' && !target.paneHidden;
    services.navigate(keepsPaneOff ? routeFor(targetOf(target), { ...target, paneHidden: true }) : href);
  });
  // A reload soon after a scroll comes before the view has come to rest.
  window.addEventListener('pagehide', () => {
    const left = leave();
    if (left) updateRoute({ top: left.top }, left.offset);
  });
  function leaveDocument(className: string) {
    view = undefined;
    sourcePane.unmount();
    content.className = className;
  }

  /** How a route is come to: `smooth` is a jump, which is eased if it stays in the document. */
  interface Arrival { smooth?: boolean }

  /** Gives a document's view its position: what the route names, else where it was left. */
  function position(current: DocumentView, parsed: Route, fresh: boolean, value: ReturnType<DocumentView['valueRow']>, { smooth }: Arrival) {
    const pointed = current.pointAtLine(parsed.line ?? value?.line);
    const row = pointed ?? (parsed.section ? current.sectionRow(parsed.section) : undefined);
    const saved = positions.get(pageOf({ document: current.doc.id, raw: current.raw }));
    if (parsed.top !== undefined) current.restore(parsed.top, history.state?.offset ?? (saved?.top === parsed.top ? saved.offset : undefined));
    else if (row) current.jumpTo(row, { smooth: Boolean(smooth) && !fresh, flash: arrived });
    else if (fresh && saved && !parsed.section) current.restore(saved.top, saved.offset);
  }

  async function route(arrival: Arrival = {}) {
    popup.close();
    const generation = ++request;
    const parsed = parseRoute(location.hash);
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
        view = undefined;
        sourcePane.unmount();
        setTitle(site.label(meta));
        // A quick load goes straight from the old page to the new; only a slow one says so.
        const loading = setTimeout(() => {
          if (generation !== request) return;
          content.className = '';
          const status = element('p', `Loading ${site.label(meta)}…`);
          status.setAttribute('role', 'status');
          content.replaceChildren(status);
        }, 150);
        const [doc, raw] = await Promise.all([site.loadDocument(meta.id), parsed.raw && meta.raw ? site.loadRaw(meta.id) : undefined]).finally(() => clearTimeout(loading));
        if (generation !== request) return;
        content.className = 'document-view';
        view = renderDocument(content, services, doc, raw);
      }
      const current = view!;
      sourcePane.setVisible(!parsed.paneHidden);
      const value = parsed.name === undefined ? undefined : current.valueRow(parsed.section, parsed.name);
      // Before anything is waited for, so that a page is never painted at the wrong place first.
      position(current, parsed, fresh, value, arrival);
      const target = parsed.source && site.summary(parsed.source.document);
      if (parsed.source && target && paneKind(target, site.mode)) {
        const doc = await site.loadDocument(target.id);
        if (generation !== request) return;
        const known = doc.sections.find(section => section.section === parsed.source!.position.section);
        sourcePane.show({ ...known, ...parsed.source.position, page: parsed.source.position.page ?? known?.page }, doc);
      } else if (value) sourcePane.show(value.position, current.doc);
      else {
        const position = current.doc.sections.find(section => section.section === parsed.section) ?? current.doc.sections[0];
        if (position) sourcePane.show({ ...position, name: parsed.name }, current.doc);
      }
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

  // A route the app did not set itself: the browser's Back and Forward, or an edited address.
  window.addEventListener('hashchange', () => {
    leave();
    arrived = true;
    void route({ smooth: true });
  });
  await route();
} catch (error) { showError(error); }
