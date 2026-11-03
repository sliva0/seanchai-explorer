import { createAvpPopup } from './avp-popup.ts';
import { openSite, siteURL } from './data.ts';
import { element } from './dom.ts';
import { renderDocument } from './document-view.ts';
import type { DocumentView } from './document-view.ts';
import { createHighlighter } from './highlight.ts';
import type { Grammar, HighlightedLine } from './highlight.ts';
import { renderIndex } from './index-view.ts';
import { parseRoute } from './navigation.ts';
import { renderSearch } from './search-view.ts';
import { createSourcePane } from './source-pane.ts';
import type { SourcePane } from './source-pane.ts';
import { initTheme } from './theme.ts';
import type { Line } from './types.ts';

const header = element('header');
const nav = element('nav');
const indexLink = element('a', 'Index');
indexLink.href = '#';
const searchLink = element('a', 'Search');
searchLink.href = '#search';
nav.append(indexLink, searchLink);
const themeButton = element('button', undefined, 'theme-toggle');
themeButton.type = 'button';
const headerActions = element('div', undefined, 'header-actions');
headerActions.append(themeButton);
header.append(nav, headerActions);
const content = element('main');
content.id = 'content';
document.querySelector('#app')!.replaceChildren(header, content);

let pane: SourcePane | undefined;
const theme = initTheme(value => {
  themeButton.textContent = value === 'light' ? 'Dark' : 'Light';
  themeButton.setAttribute('aria-label', `${themeButton.textContent} theme`);
  pane?.postTheme();
});
themeButton.onclick = () => theme.toggle();

function showError(error: unknown) {
  content.className = '';
  content.replaceChildren(element('p', String(error)));
}

try {
  const site = await openSite();
  const grammar = await fetch(siteURL('syntax/dad.tmLanguage.json'));
  if (!grammar.ok) throw new Error(`${grammar.status}: syntax/dad.tmLanguage.json`);
  const highlighter = createHighlighter(await grammar.json() as Grammar);
  const highlighted = new WeakMap<Line[], HighlightedLine[]>();
  const sourcePane = pane = createSourcePane(site, () => theme.current);
  const popup = createAvpPopup(site, sourcePane);
  const services = {
    site, pane: sourcePane, popup,
    highlight(lines: Line[]) {
      let decorated = highlighted.get(lines);
      if (!decorated) { decorated = highlighter(lines); highlighted.set(lines, decorated); }
      return decorated;
    },
    navigate(hash: string) {
      if (location.hash === hash) void route();
      else location.hash = hash;
    },
  };
  let view: DocumentView | undefined;
  let request = 0;

  function leaveDocument(className: string) {
    view = undefined;
    sourcePane.unmount();
    content.className = className;
  }

  async function route() {
    popup.close();
    const generation = ++request;
    const parsed = parseRoute(location.hash);
    if (!parsed.document) { leaveDocument('index-view'); renderIndex(content, site); return; }
    if (parsed.document === 'search') {
      leaveDocument('');
      renderSearch(content, site, parsed.query, () => generation === request);
      return;
    }
    const meta = site.summary(parsed.document);
    if (!meta) { leaveDocument(''); content.replaceChildren(element('p', 'Document not found')); return; }
    try {
      if (view?.doc.id !== meta.id || view.raw !== parsed.raw) {
        const [doc, raw] = await Promise.all([site.loadDocument(meta.id), parsed.raw && meta.raw ? site.loadRaw(meta.id) : undefined]);
        if (generation !== request) return;
        content.className = 'document-view';
        view = renderDocument(content, services, doc, raw);
      }
      const target = parsed.source && site.summary(parsed.source.document);
      if (parsed.source && target) {
        const doc = await site.loadDocument(target.id);
        if (generation !== request) return;
        const known = doc.sections.find(section => section.section === parsed.source!.position.section);
        sourcePane.show({ ...known, ...parsed.source.position, page: parsed.source.position.page ?? known?.page }, doc);
      } else {
        const position = view.doc.sections.find(section => section.section === parsed.section) ?? view.doc.sections[0];
        if (position) sourcePane.show({ ...position, name: parsed.name }, view.doc);
      }
      if (parsed.section) view.scrollToSection(parsed.section);
      if (parsed.line !== undefined) view.scrollToLine(parsed.line);
    } catch (error) {
      if (generation !== request) return;
      leaveDocument('');
      showError(error);
    }
  }

  window.addEventListener('hashchange', () => { void route(); });
  await route();
} catch (error) { showError(error); }
