import { rfcPages } from './rfc-text.ts';
import { initTheme } from './theme.ts';

initTheme();

const container = document.querySelector<HTMLElement>('#rfc')!;
const sections = new Map<string, HTMLElement>();
const pages: HTMLElement[] = [];
const rawFile = new URLSearchParams(location.search).get('file');
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
    if (window.parent !== window) window.parent.postMessage({ type: 'seanchai-source-page', file: rawFile, page: number }, location.origin);
  }
}
container.addEventListener('scroll', () => { if (!pending) pending = requestAnimationFrame(reportPage); }, { passive: true });
function goTo(node: HTMLElement | undefined) {
  if (node) container.scrollTop += node.getBoundingClientRect().top - container.getBoundingClientRect().top - 12;
  requestAnimationFrame(reportPage);
}
function navigate() {
  const params = new URLSearchParams(location.hash.slice(1));
  const section = sections.get(params.get('section') ?? '');
  const page = pages.find(page => page.dataset.page === params.get('page'));
  goTo(params.get('exact') === '1' ? page : section ?? page ?? pages[0]);
  const query = params.get('query')?.trim().toLowerCase();
  for (const node of container.querySelectorAll('.rfc-match')) node.classList.remove('rfc-match');
  if (query) for (const line of container.querySelectorAll('.rfc-line')) {
    if (line.textContent?.toLowerCase().includes(query)) line.classList.add('rfc-match');
  }
}
window.addEventListener('hashchange', navigate);

try {
  if (!rawFile) throw new Error('RFC not found');
  const url = new URL(rawFile, location.href);
  if (url.origin !== location.origin && !(url.protocol === 'https:' && url.hostname === 'www.rfc-editor.org' && /^\/rfc\/rfc\d+\.txt$/.test(url.pathname))) throw new Error('Invalid RFC source');
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
      pre.append(span);
    }
    block.append(pre);
    pages.push(block);
    container.append(block);
  }
  navigate();
} catch (error) { container.textContent = String(error); }
