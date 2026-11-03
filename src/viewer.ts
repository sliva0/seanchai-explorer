import * as pdfjs from 'pdfjs-dist';
import { EventBus, FindState, PDFFindController, PDFLinkService, PDFViewer } from 'pdfjs-dist/web/pdf_viewer.mjs';
import worker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { createSectionNavigator, matchOnRow } from './pdf-navigation.ts';
import { initTheme } from './theme.ts';
import { zoomStep } from './zoom.ts';
import type { Outline } from './pdf-navigation.ts';
import 'pdfjs-dist/web/pdf_viewer.css';
import './theme.css';
import './viewer.css';

initTheme();

pdfjs.GlobalWorkerOptions.workerSrc = worker;
const container = document.querySelector<HTMLDivElement>('#viewerContainer')!;
const eventBus = new EventBus();
// A destination's own zoom would undo the chosen one.
const linkService = new PDFLinkService({ eventBus, ignoreDestinationZoom: true });
let automaticFind = false;
// A row's name, found as a whole word.
let wholeWord = false;
// Where a navigation's find starts, whatever the pane has scrolled to by the time it runs.
let findStart: number | undefined;
class FindLinkService extends PDFLinkService {
  override get page() { return findStart ?? firstVisiblePage(); }
  override set page(value: number) { if (!automaticFind) super.page = value; }
}
const findLinkService = new FindLinkService({ eventBus });
class FindController extends PDFFindController {
  override scrollMatchIntoView(options: Parameters<PDFFindController['scrollMatchIntoView']>[0]) {
    if (!automaticFind) super.scrollMatchIntoView(options);
  }
  // pdf.js joins a name a table wraps as "3GPP-SGSN-" over "Address" into 3GPP-SGSNAddress, which its own match misses.
  override match(query: string | string[], pageContent: string, pageIndex: number) {
    if (typeof query !== 'string' || !/[_-]/.test(query)) return super.match(query, pageContent, pageIndex);
    const parts = query.split(/[\s_-]+/).map(part => part.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&'));
    const body = parts.join('[\\s_-]*');
    const pattern = new RegExp(wholeWord ? `(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])` : body, 'giu');
    return [...pageContent.matchAll(pattern)].filter(found => found[0]).map(found => ({ index: found.index, length: found[0].length }));
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
let pdfDocument: pdfjs.PDFDocumentProxy | undefined;
// The row a navigation's find is still to settle on.
let rowTarget: { page: number; top: number } | undefined;
// A link's name, and what the source prints in its place: the pane knows the link by its name.
let printedAs: { name: string; query: string } | undefined;
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
let rescale: ReturnType<typeof setTimeout> | undefined;
let paneWidth = 0;
let paneHeight = 0;
new ResizeObserver(() => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => {
    const { clientWidth: width, clientHeight: height } = container;
    if (!ready || !width || !height) return;
    viewer.update();
    scheduleCounter();
    const fits = zoom.value === 'page-width' ? width !== paneWidth : zoom.value === 'page-fit' && (width !== paneWidth || height !== paneHeight);
    paneWidth = width;
    paneHeight = height;
    if (!fits) return;
    // Rescaling redraws the pages: once a dragged splitter stops, and not for a height a fit to width ignores.
    clearTimeout(rescale);
    rescale = setTimeout(() => { if (zoom.value === 'page-width' || zoom.value === 'page-fit') viewer.currentScaleValue = zoom.value; }, 150);
  });
}).observe(container);

function search(query: string, again = false, previous = false) {
  eventBus.dispatch('find', {
    source: window, type: again ? 'again' : '', query,
    caseSensitive: false, entireWord: wholeWord, highlightAll: true,
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
        findStart = undefined;
        wholeWord = false;
        rowTarget = undefined;
        printedAs = undefined;
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
  rowTarget = undefined;
  printedAs = undefined;
  wholeWord = row;
  const destination = section && params.get('exact') !== '1' ? await navigator.locate(section, hint, () => generation === navigation, name, row, params.get('printed') ?? undefined, {
    ...(params.get('titled') === '1' ? { titled: true } : {}),
    ...(params.has('value') ? { value: Number(params.get('value')) } : {}),
  }) : null;
  if (generation !== navigation) return;
  if (destination?.query && destination.query !== name) {
    printedAs = { name: name!, query: destination.query };
    find.value = destination.query;
  }
  if (destination) viewer.scrollPageIntoView({ ...destination, ignoreDestinationZoom: true });
  else viewer.scrollPageIntoView({ pageNumber: hint });
  automaticFind = params.get('match') !== '1';
  findStart = destination?.pageNumber ?? hint;
  if (row && destination?.destArray[0] === null) rowTarget = { page: destination.pageNumber, top: destination.destArray[3] as number };
  search(find.value, params.get('match') === '1');
  selectOutline([...outlinePane.querySelectorAll('a')].find(anchor => {
    const title = anchor.textContent?.replace(/\s+/g, ' ').trim();
    return title === section || title?.startsWith(`${section} `);
  }));
}

eventBus.on('pagesinit', () => {
  ready = true;
  viewer.currentScaleValue = zoom.value;
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
  report('seanchai-pdf-matches', { query: find.value === printedAs?.query ? printedAs.name : find.value, ...matchesCount });
}
/** The find selects a page's first match, which may be a mention above the row: moves on to the row's own. */
async function settleOnRow(generation: number) {
  const target = rowTarget;
  const selected = findController.selected;
  if (!target || !pdfDocument || !selected || selected.pageIdx === -1) return;
  rowTarget = undefined;
  const { pageIdx, matchIdx } = selected;
  if (pageIdx !== target.page - 1) return;
  const offsets = findController.pageMatches?.[pageIdx];
  if (!offsets || offsets.length < 2) return;
  const page = await pdfDocument.getPage(target.page);
  const { items } = await page.getTextContent({ disableNormalization: true });
  if (generation !== navigation) return;
  const steps = matchOnRow(items, offsets, target.top) - matchIdx;
  for (let step = 0; step < steps; step++) search(find.value, true);
}
eventBus.on('updatefindmatchescount', updateMatches);
eventBus.on('updatefindcontrolstate', (event: Parameters<typeof updateMatches>[0] & { state: number }) => {
  updateMatches(event);
  if (event.state !== FindState.PENDING) void settleOnRow(navigation).catch(console.error);
});
function manual() { navigation++; findStart = undefined; rowTarget = undefined; }
let pendingFind: { query: string; previous: boolean } | undefined;
function runFind(data: { query: string; previous: boolean }) {
  if (!ready) { pendingFind = data; return; }
  manual();
  automaticFind = false;
  if (data.query !== find.value) wholeWord = false;
  find.value = data.query;
  search(data.query, true, data.previous);
}
document.querySelector<HTMLButtonElement>('#find-previous')!.onclick = () => runFind({ query: find.value, previous: true });
document.querySelector<HTMLButtonElement>('#find-next')!.onclick = () => runFind({ query: find.value, previous: false });
function goToPageInput() { manual(); if (ready) viewer.scrollPageIntoView({ pageNumber: Math.max(1, Math.min(viewer.pagesCount, Number(page.value) || 1)) }); }
page.onchange = goToPageInput;
function rememberZoom() {
  try { localStorage.setItem('seanchai-zoom', zoom.value); } catch {}
}
try {
  const stored = localStorage.getItem('seanchai-zoom');
  if ([...zoom.options].some(option => option.value === stored)) zoom.value = stored!;
} catch {}
zoom.onchange = () => { viewer.currentScaleValue = zoom.value; rememberZoom(); };
const zoomSteps = [...zoom.options].map(option => Number(option.value)).filter(Boolean);
function stepZoom(direction: 1 | -1, origin?: [number, number]) {
  if (!ready) return;
  const next = zoomStep(zoomSteps, viewer.currentScale, direction);
  if (next === undefined) return;
  viewer.updateScale({ scaleFactor: next / viewer.currentScale, drawingDelay: 150, ...(origin ? { origin } : {}) });
  rememberZoom();
}
// A wheel's notch is one step; a touchpad's pinch, many small deltas, has to add up to one.
let wheelDelta = 0;
window.addEventListener('wheel', event => {
  if (!event.ctrlKey) return;
  event.preventDefault();
  const delta = event.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? event.deltaY : event.deltaY * 40;
  wheelDelta = wheelDelta * delta < 0 ? delta : wheelDelta + delta;
  if (Math.abs(wheelDelta) < 40) return;
  stepZoom(wheelDelta < 0 ? 1 : -1, container.contains(event.target as Node) ? [event.clientX, event.clientY] : undefined);
  wheelDelta = 0;
}, { passive: false });
window.addEventListener('keydown', event => {
  if (!event.ctrlKey && !event.metaKey) return;
  const direction = event.key === '+' || event.key === '=' ? 1 : event.key === '-' || event.key === '_' ? -1 : 0;
  if (!direction) return;
  event.preventDefault();
  stepZoom(direction);
});
document.querySelector<HTMLFormElement>('#toolbar')!.onsubmit = event => {
  event.preventDefault();
  if (document.activeElement === page) { goToPageInput(); return; }
  runFind({ query: find.value, previous: false });
};
find.oninput = () => { manual(); automaticFind = false; wholeWord = false; search(find.value); };
window.addEventListener('hashchange', () => { void navigate().catch(console.error); });

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
  pdfDocument = pdf;
  navigator = createSectionNavigator(pdf);
  const outline = await navigator.outline;
  outlinePane.replaceChildren(renderOutline(outline));
  const chaptersToggle = document.querySelector<HTMLElement>('#chapters-toggle')!;
  chaptersToggle.classList.remove('pending');
  chaptersToggle.hidden = outline.length === 0;
  setChapters(outline.length > 0 && showChapters);
  viewer.setDocument(pdf);
  linkService.setDocument(pdf);
  findLinkService.setDocument(pdf);
} catch (error) { container.textContent = String(error); }
