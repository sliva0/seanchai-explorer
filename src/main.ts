import { createAvpPopup } from './avp-popup.ts';
import { openSite, paneKind, siteURL } from './data.ts';
import { element } from './dom.ts';
import { renderDocument } from './document-view.ts';
import type { DocumentView } from './document-view.ts';
import { createHelp } from './help.ts';
import { createHighlighter } from './highlight.ts';
import type { Grammar, HighlightedLine } from './highlight.ts';
import { renderIndex } from './index-view.ts';
import { createJumpControls } from './jump-controls.ts';
import { createJumpList } from './jump-list.ts';
import type { JumpEntry, JumpWalk } from './jump-list.ts';
import { createChords, keyWalk, takesTyping } from './keys.ts';
import { pageOf, parseRoute, routeFor } from './navigation.ts';
import type { Route, RouteOptions } from './navigation.ts';
import { clearNotices, noticeRegion } from './notice.ts';
import { createPositionStore } from './positions.ts';
import { renderSearch } from './search-view.ts';
import { createSourcePane } from './source-pane.ts';
import type { SourcePane } from './source-pane.ts';
import { session } from './storage.ts';
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
const help = createHelp();
const headerActions = element('div', undefined, 'header-actions');
headerActions.append(help.button, themeButton);
header.append(nav, headerActions);
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
noticeRegion();

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

  const positions = createPositionStore(session);
  const jumps = createJumpList(session, document => !document || document === 'search' || Boolean(site.summary(document)));
  const jumpControls = createJumpControls(walk);

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

  // A place walked to in a document still loading, which a further walk must not take for the top of that document.
  let arriving: JumpEntry | undefined;

  /** The place being shown, under the route `hash` that shows it. */
  function here(hash = location.hash): JumpEntry {
    const parsed = parseRoute(hash);
    const position = view?.doc.id === parsed.document ? view.position() : undefined;
    if (!view && arriving?.document === parsed.document) return arriving;
    if (!view || !position) return { document: parsed.document, top: 0, offset: content.scrollTop, hash: hash || '#' };
    const line = view.pointedLine();
    return { document: parsed.document, ...position, ...(line === undefined ? {} : { line }), hash: routeFor(targetOf(parsed), { ...parsed, top: position.top }) };
  }

  /** Remembers a document's position, and returns the place being left for a walk or a jump to take from it. */
  function leave(hash?: string): JumpEntry {
    view?.settle();
    const left = here(hash);
    if (view?.doc.id === left.document) positions.set(pageOf({ document: left.document, raw: view.raw }), left);
    return left;
  }

  function jumpLabel({ document, line, top }: JumpEntry): string {
    if (!document) return 'Index';
    if (document === 'search') return 'Search';
    const summary = site.summary(document);
    return `${summary ? site.label(summary) : document} line ${(line ?? top) + 1}`;
  }

  function showJumps() {
    const current = here();
    jumpControls.update(walk => jumps.peek(walk, current), jumpLabel);
  }

  /** Puts the route in the browser's history: a new entry for a new page, so that Back steps between documents, the same one for a move within a page. */
  function setRoute(hash: string, state: unknown) {
    const samePage = pageOf(parseRoute(hash)) === pageOf(parseRoute(location.hash));
    if (samePage) { if ((hash === '#' ? '' : hash) !== location.hash || state) history.replaceState(state, '', hash); }
    else history.pushState(state, '', hash);
  }

  /** Walks the jump list. The pane stays as the reader has it, on or off, whatever it was at the place walked to. */
  function walk(walkTo: JumpWalk) {
    const left = leave();
    const entry = jumps.walk(walkTo, left);
    if (!entry) { showJumps(); return; }
    const refocus = jumpControls.node.contains(document.activeElement) ? document.activeElement as HTMLElement : undefined;
    const target = parseRoute(entry.hash);
    const inDocument = target.document && target.document !== 'search';
    const hash = inDocument ? routeFor(targetOf(target), { ...target, paneHidden: !sourcePane.switchedOn }) : entry.hash;
    if (pageOf(target) !== pageOf(parseRoute(location.hash))) updateRoute({ top: left.top }, left.offset);
    setRoute(hash, { offset: entry.offset });
    arrived = true;
    void route({ place: entry, refocus });
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
      jumps.push(left);
      if (pageOf(parseRoute(hash)) !== pageOf(parseRoute(location.hash))) updateRoute({ top: left.top }, left.offset);
      setRoute(hash, null);
      arrived = true;
      void route({ smooth: true });
    },
    recordJump() {
      jumps.push(leave());
      showJumps();
    },
    scrolled(moved: DocumentView) {
      if (moved !== view) return;
      const left = leave();
      updateRoute({ top: left.top }, left.offset);
      showJumps();
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
  const chords = createChords();
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || takesTyping(document.activeElement)) return;
    const walkTo = keyWalk(event, chords, performance.now());
    if (!walkTo) return;
    event.preventDefault();
    walk(walkTo);
  });
  // A reload soon after a scroll comes before the view has come to rest.
  window.addEventListener('pagehide', () => {
    if (!view) return;
    const left = leave();
    updateRoute({ top: left.top }, left.offset);
  });
  function leaveDocument(className: string) {
    view = undefined;
    sourcePane.unmount();
    content.className = className;
  }

  /** How a route is come to: `smooth` is a jump, which is eased if it stays in the document; `place` a walk back to where a page was left. */
  interface Arrival { smooth?: boolean; place?: JumpEntry; refocus?: HTMLElement }

  async function route(arrival: Arrival = {}) {
    await show(arrival);
    showJumps();
  }

  /** Gives a document's view its position: the place walked to, else what the route names, else where it was left. */
  function position(current: DocumentView, parsed: Route, fresh: boolean, value: ReturnType<DocumentView['valueRow']>, { smooth, place }: Arrival) {
    const pointed = current.pointAtLine(parsed.line ?? value?.line);
    const row = pointed ?? (parsed.section ? current.sectionRow(parsed.section) : undefined);
    const saved = positions.get(pageOf({ document: current.doc.id, raw: current.raw }));
    if (place) current.restore(place.top, place.offset);
    else if (parsed.top !== undefined) current.restore(parsed.top, history.state?.offset ?? (saved?.top === parsed.top ? saved.offset : undefined));
    else if (row) current.jumpTo(row, { smooth: Boolean(smooth) && !fresh, flash: arrived });
    else if (fresh && saved && !parsed.section) current.restore(saved.top, saved.offset);
  }

  let shownPage: string | undefined;

  async function show(arrival: Arrival) {
    const { place } = arrival;
    popup.close();
    const generation = ++request;
    const parsed = parseRoute(location.hash);
    // A failure on a page left behind is no longer the reader's, and its Retry would act on a page not shown.
    const page = pageOf(parsed);
    if (page !== shownPage) clearNotices();
    shownPage = page;
    if (!parsed.document) {
      leaveDocument('index-view');
      setTitle();
      renderIndex(content, site);
      if (arrived) focusHeading();
      if (place) content.scrollTop = place.offset;
      return;
    }
    if (parsed.document === 'search') {
      leaveDocument('');
      setTitle('Search');
      renderSearch(content, site, parsed.query, () => generation === request, { returning: Boolean(place), onReady: () => { if (place) content.scrollTop = place.offset; } });
      if (place) focusHeading();
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
        arriving = place;
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
        // The command index comes with the first document, for its commands' names to know where they go.
        const [doc, raw] = await Promise.all([site.loadDocument(meta.id), parsed.raw && meta.raw ? site.loadRaw(meta.id) : undefined, site.loadCommands()]).finally(() => clearTimeout(loading));
        if (generation !== request) return;
        content.className = 'document-view';
        view = renderDocument(content, services, doc, raw);
        content.querySelector('.document-header')!.prepend(jumpControls.node);
      }
      const current = view!;
      sourcePane.setVisible(!parsed.paneHidden);
      const value = parsed.name === undefined ? undefined : current.valueRow(parsed.section, parsed.name);
      // Before anything is waited for, so that a page is never painted at the wrong place first.
      position(current, parsed, fresh, value, arrival);
      arriving = undefined;
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
        if (arrival.refocus?.isConnected) arrival.refocus.focus({ preventScroll: true });
        else if (fresh) focusHeading();
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
  window.addEventListener('hashchange', event => {
    jumps.push(leave(new URL(event.oldURL).hash));
    arrived = true;
    void route({ smooth: true });
  });
  await route();
} catch (error) { showError(error); }
