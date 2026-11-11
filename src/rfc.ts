import { locateRow, rfcPages } from './rfc-text.ts';
import { namePattern } from './table-row.ts';
import type { RfcLine } from './rfc-text.ts';
import { initTheme } from './theme.ts';

initTheme();

const container = document.querySelector<HTMLElement>('#rfc')!;
const sections = new Map<string, HTMLElement>();
const pages: HTMLElement[] = [];
const lines: RfcLine[] = [];
const spans: HTMLElement[] = [];
let marked: number[] = [];
const rawFile = new URLSearchParams(location.search).get('file');
// Opened in a tab of its own, as the pane's link to the text does, the page is named for its RFC.
const rfcNumber = rawFile?.match(/rfc(\d+)\.txt$/i)?.[1];
if (rfcNumber) document.title = `RFC ${rfcNumber} — Seanchaí`;
let lastPage = 0;
let pending = 0;
function reportPage() {
  pending = 0;
  if (!container.clientHeight) return;
  const top = container.getBoundingClientRect().top + 1;
  const first = pages.find(page => page.getBoundingClientRect().bottom > top);
  const number = Number(first?.dataset.page ?? 1);
  if (number !== lastPage) {
    lastPage = number;
    if (window.parent !== window)
      window.parent.postMessage({ type: 'seanchai-source-page', file: rawFile, page: number }, location.origin);
  }
}
container.addEventListener(
  'scroll',
  () => {
    if (!pending) pending = requestAnimationFrame(reportPage);
  },
  { passive: true },
);
function goTo(node: HTMLElement | undefined) {
  if (node) container.scrollTop += node.getBoundingClientRect().top - container.getBoundingClientRect().top - 12;
  requestAnimationFrame(reportPage);
}
function navigate() {
  const params = new URLSearchParams(location.hash.slice(1));
  const section = sections.get(params.get('section') ?? '');
  const page = pages.find(page => page.dataset.page === params.get('page'));
  const name = params.get('query')?.trim();
  const row =
    params.get('row') === '1' && name
      ? locateRow(
          lines,
          name,
          params.get('section') ?? '',
          Number(params.get('page')) || 1,
          params.get('printed') ?? undefined,
          params.get('titled') === '1',
        )?.lines
      : null;
  goTo(params.get('exact') === '1' ? page : ((row && spans[row[0]]) ?? section ?? page ?? pages[0]));
  // A name as a whole word: "Load" marks neither "Load-Type" nor "loaded".
  const query = name ? namePattern(name, 'giu', '\\p{L}\\p{N}_-') : null;
  for (const index of marked) {
    spans[index].textContent = lines[index].text;
    spans[index].classList.remove('rfc-match-line');
  }
  marked = [];
  if (query) for (const index of spans.keys()) markName(index, query);
  // The row prints the name wrapped or misspelt: show the line landed on instead.
  if (row && !marked.some(index => index >= row[0] && index <= row[1])) {
    spans[row[0]].classList.add('rfc-match-line');
    marked.push(row[0]);
  }
}
function markName(index: number, query: RegExp) {
  const text = lines[index].text;
  const parts: (string | HTMLElement)[] = [];
  let end = 0;
  for (const match of text.matchAll(query)) {
    if (!match[0]) continue;
    const mark = document.createElement('mark');
    mark.className = 'rfc-match';
    mark.textContent = match[0];
    parts.push(text.slice(end, match.index), mark);
    end = match.index + match[0].length;
  }
  if (!parts.length) return;
  spans[index].replaceChildren(...parts, text.slice(end));
  marked.push(index);
}
window.addEventListener('hashchange', navigate);

try {
  if (!rawFile) throw new Error('RFC not found');
  const url = new URL(rawFile, location.href);
  if (
    url.origin !== location.origin &&
    !(url.protocol === 'https:' && url.hostname === 'www.rfc-editor.org' && /^\/rfc\/rfc\d+\.txt$/.test(url.pathname))
  )
    throw new Error('Invalid RFC source');
  const response = await fetch(url);
  if (!response.ok) throw new Error(String(response.status));
  for (const page of rfcPages(await response.text())) {
    if (!page.text.trim()) continue;
    const block = document.createElement('section');
    block.dataset.page = String(page.page);
    const pre = document.createElement('pre');
    for (const line of page.lines) {
      const span = document.createElement('span');
      span.className = 'rfc-line';
      span.textContent = line.text;
      if (line.section && !sections.has(line.section)) {
        span.id = `section-${line.section}`;
        sections.set(line.section, span);
      }
      lines.push({ ...line, page: page.page });
      spans.push(span);
      pre.append(span);
    }
    block.append(pre);
    pages.push(block);
    container.append(block);
  }
  navigate();
} catch (error) {
  container.textContent = String(error);
}
