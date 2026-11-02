import * as pdfjs from 'pdfjs-dist';
import { EventBus, PDFFindController, PDFLinkService, PDFViewer } from 'pdfjs-dist/web/pdf_viewer.mjs';
import worker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { createSectionNavigator } from './pdf-navigation';
import type { Outline } from './pdf-navigation';
import 'pdfjs-dist/web/pdf_viewer.css';
import './theme.css';
import './viewer.css';

function applyTheme(theme: unknown) {
  document.documentElement.dataset.theme = theme === 'dark' ? 'dark' : 'light';
}
try { applyTheme(localStorage.getItem('seanchai-theme')); } catch { applyTheme('light'); }
window.addEventListener('message', event => {
  if (event.origin === location.origin && event.source === window.parent && event.data?.type === 'seanchai-theme') applyTheme(event.data.theme);
});
window.addEventListener('storage', event => {
  if (event.key === 'seanchai-theme' || event.key === null) applyTheme(event.newValue);
});

pdfjs.GlobalWorkerOptions.workerSrc = worker;
const container = document.querySelector<HTMLDivElement>('#viewerContainer')!;
const eventBus = new EventBus();
const linkService = new PDFLinkService({ eventBus });
let automaticFind = false;
class FindLinkService extends PDFLinkService {
  override get page() { return firstVisiblePage(); }
  override set page(value: number) { if (!automaticFind) super.page = value; }
}
const findLinkService = new FindLinkService({ eventBus });
class FindController extends PDFFindController {
  override scrollMatchIntoView(options: Parameters<PDFFindController['scrollMatchIntoView']>[0]) {
    if (!automaticFind) super.scrollMatchIntoView(options);
  }
}
const findController = new FindController({ eventBus, linkService: findLinkService });
const viewer = new PDFViewer({ container, eventBus, linkService, findController, removePageBorders: true });
linkService.setViewer(viewer);
findLinkService.setViewer(viewer);
const page = document.querySelector<HTMLInputElement>('#page')!;
const zoom = document.querySelector<HTMLSelectElement>('#zoom')!;
const find = document.querySelector<HTMLInputElement>('#find')!;
const matches = document.querySelector<HTMLOutputElement>('#matches')!;
const outlinePane = document.querySelector<HTMLElement>('#outline')!;
const chapters = document.querySelector<HTMLInputElement>('#chapters')!;
let showChapters = true;
try { showChapters = localStorage.getItem('seanchai-outline') !== 'hidden'; } catch {}
function setChapters(visible: boolean) {
  showChapters = visible;
  outlinePane.hidden = !visible;
  chapters.setAttribute('aria-expanded', String(visible));
  chapters.checked = visible;
  chapters.title = visible ? 'Hide chapters' : 'Show chapters';
}
chapters.onchange = () => {
  setChapters(chapters.checked);
  try { localStorage.setItem('seanchai-outline', showChapters ? 'visible' : 'hidden'); } catch {}
};
let navigator: ReturnType<typeof createSectionNavigator> | undefined;
let ready = false;
let navigation = 0;
let displayedPage = 1;
let counterFrame = 0;
function firstVisiblePage(): number {
  if (!ready || !container.clientHeight || !container.clientWidth) return displayedPage;
  const top = container.getBoundingClientRect().top + 1;
  let first = 0;
  let last = viewer.pagesCount - 1;
  while (first < last) {
    const middle = Math.floor((first + last) / 2);
    if (viewer.getPageView(middle).div.getBoundingClientRect().bottom <= top) first = middle + 1;
    else last = middle;
  }
  return first + 1;
}
function updatePageCounter() {
  counterFrame = 0;
  if (!ready || !container.clientHeight || !container.clientWidth) return;
  displayedPage = firstVisiblePage();
  page.value = String(displayedPage);
  report('seanchai-pdf-page', { page: displayedPage });
}
function scheduleCounter() {
  if (!counterFrame) counterFrame = requestAnimationFrame(updatePageCounter);
}
container.addEventListener('scroll', scheduleCounter, { passive: true });
let resizeFrame = 0;
new ResizeObserver(() => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => {
    if (!ready || !container.clientWidth || !container.clientHeight) return;
    if (zoom.value === 'page-width' || zoom.value === 'page-fit') viewer.currentScaleValue = zoom.value;
    viewer.update();
    scheduleCounter();
  });
}).observe(container);

function search(query: string, again = false, previous = false) {
  eventBus.dispatch('find', {
    source: window, type: again ? 'again' : '', query,
    caseSensitive: false, entireWord: false, highlightAll: true,
    findPrevious: previous, matchDiacritics: false,
  });
}

function selectOutline(anchor: HTMLAnchorElement | undefined) {
  for (const active of outlinePane.querySelectorAll('[aria-current]')) active.removeAttribute('aria-current');
  if (!anchor) return;
  anchor.setAttribute('aria-current', 'location');
  for (let parent = anchor.parentElement; parent && parent !== outlinePane; parent = parent.parentElement) {
    if (parent instanceof HTMLDetailsElement) parent.open = true;
  }
  const bounds = anchor.getBoundingClientRect();
  const pane = outlinePane.getBoundingClientRect();
  if (bounds.top < pane.top) outlinePane.scrollTop += bounds.top - pane.top - 8;
  else if (bounds.bottom > pane.bottom) outlinePane.scrollTop += bounds.bottom - pane.bottom + 8;
}

function renderOutline(items: Outline): HTMLUListElement {
  const list = document.createElement('ul');
  for (const item of items) {
    const row = document.createElement('li');
    const title = document.createElement('a');
    title.textContent = item.title;
    if (item.dest) {
      const destination = item.dest;
      title.href = linkService.getDestinationHash(destination);
      title.onclick = event => {
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        navigation++;
        automaticFind = true;
        find.value = '';
        search('');
        selectOutline(title);
        void linkService.goToDestination(destination);
      };
    } else if (item.url && /^https?:\/\//.test(item.url)) {
      title.href = item.url;
      title.target = '_blank';
      title.rel = 'noopener';
    }
    if (item.items.length) {
      const branch = document.createElement('details');
      const summary = document.createElement('summary');
      summary.append(title);
      branch.append(summary, renderOutline(item.items));
      row.append(branch);
    } else row.append(title);
    list.append(row);
  }
  return list;
}

async function navigate() {
  const generation = ++navigation;
  if (!ready || !navigator) return;
  automaticFind = true;
  const params = new URLSearchParams(location.hash.slice(1));
  const requested = Number(params.get('page') ?? 1);
  const hint = Math.max(1, Math.min(viewer.pagesCount, Number.isFinite(requested) ? requested : 1));
  const section = params.get('search') ?? '';
  const name = params.get('name') ?? undefined;
  const row = params.get('row') === '1';
  find.value = name ?? section;
  const destination = section && params.get('exact') !== '1' ? await navigator.locate(section, hint, () => generation === navigation, name, row) : null;
  if (generation !== navigation) return;
  if (destination) viewer.scrollPageIntoView({ ...destination, ignoreDestinationZoom: true });
  else viewer.scrollPageIntoView({ pageNumber: hint });
  automaticFind = params.get('match') !== '1';
  search(name ?? section, params.get('match') === '1');
  selectOutline([...outlinePane.querySelectorAll('a')].find(anchor => {
    const title = anchor.textContent?.replace(/\s+/g, ' ').trim();
    return title === section || title?.startsWith(`${section} `);
  }));
}

eventBus.on('pagesinit', () => {
  ready = true;
  viewer.currentScaleValue = 'page-width';
  void navigate().then(() => {
    if (pendingFind) { const query = pendingFind; pendingFind = undefined; runFind(query); }
  }).catch(error => { container.textContent = String(error); });
});
const documentFile = new URLSearchParams(location.search).get('file');
function report(type: string, data: object) {
  if (window.parent !== window) window.parent.postMessage({ type, file: documentFile, ...data }, location.origin);
}
eventBus.on('pagechanging', ({ pageNumber }: { pageNumber: number }) => {
  void pageNumber;
  scheduleCounter();
});
eventBus.on('pagesloaded', scheduleCounter);
eventBus.on('pagerendered', scheduleCounter);
eventBus.on('scalechanging', () => {
  const scale = viewer.currentScaleValue;
  if ([...zoom.options].some(option => option.value === scale)) zoom.value = scale;
  scheduleCounter();
});
function updateMatches({ matchesCount }: { matchesCount?: { current: number; total: number } }) {
  if (!matchesCount) return;
  matches.textContent = `${matchesCount.current} / ${matchesCount.total}`;
  report('seanchai-pdf-matches', { query: find.value, ...matchesCount });
}
eventBus.on('updatefindmatchescount', updateMatches);
eventBus.on('updatefindcontrolstate', updateMatches);
function manual() { navigation++; }
let pendingFind: { query: string; previous: boolean } | undefined;
function runFind(data: { query: string; previous: boolean }) {
  if (!ready) { pendingFind = data; return; }
  manual();
  automaticFind = false;
  find.value = data.query;
  search(data.query, true, data.previous);
}
document.querySelector<HTMLButtonElement>('#find-previous')!.onclick = () => runFind({ query: find.value, previous: true });
document.querySelector<HTMLButtonElement>('#find-next')!.onclick = () => runFind({ query: find.value, previous: false });
function goToPageInput() { manual(); if (ready) viewer.scrollPageIntoView({ pageNumber: Math.max(1, Math.min(viewer.pagesCount, Number(page.value) || 1)) }); }
page.onchange = goToPageInput;
zoom.onchange = () => { viewer.currentScaleValue = zoom.value; };
document.querySelector<HTMLFormElement>('#toolbar')!.onsubmit = event => {
  event.preventDefault();
  if (document.activeElement === page) { goToPageInput(); return; }
  runFind({ query: find.value, previous: false });
};
find.oninput = () => { manual(); automaticFind = false; search(find.value); };
window.addEventListener('hashchange', () => { void navigate().catch(console.error); });
const toolbar = document.querySelector<HTMLFormElement>('#toolbar')!;
new ResizeObserver(() => { document.documentElement.style.setProperty('--toolbar-height', `${toolbar.getBoundingClientRect().height}px`); }).observe(toolbar);

Object.assign(window, {
  PDFViewerApplication: {
    get page() { return displayedPage; },
    set page(value: number) { manual(); viewer.scrollPageIntoView({ pageNumber: value }); },
    findController, eventBus, pdfViewer: viewer,
  },
});

try {
  const file = new URLSearchParams(location.search).get('file');
  if (!file) throw new Error('PDF not found');
  const url = new URL(file, location.href);
  if (url.origin !== location.origin) throw new Error('PDF must be local');
  const base = new URL(import.meta.env.BASE_URL, location.href);
  const asset = (directory: string) => new URL(`pdfjs/${directory}/`, base).href;
  const pdf = await pdfjs.getDocument({
    url: url.href, cMapUrl: asset('cmaps'), cMapPacked: true,
    standardFontDataUrl: asset('standard_fonts'), wasmUrl: asset('wasm'), iccUrl: asset('iccs'),
  }).promise;
  page.max = String(pdf.numPages);
  document.querySelector('#pages')!.textContent = `/ ${pdf.numPages}`;
  navigator = createSectionNavigator(pdf);
  const outline = await navigator.outline;
  outlinePane.replaceChildren(renderOutline(outline));
  document.querySelector<HTMLElement>('#chapters-toggle')!.hidden = outline.length === 0;
  setChapters(outline.length > 0 && showChapters);
  viewer.setDocument(pdf);
  linkService.setDocument(pdf);
  findLinkService.setDocument(pdf);
} catch (error) { container.textContent = String(error); }
