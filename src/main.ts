import './layout.css';
import type { DocumentData, IndexData, Line, SourcePosition, Target, Token } from './types';
import { parseRoute, routeFor, searchGroups, searchSpecifications, sharedRoute, sharedState } from './navigation';
import { compactComment } from './comments';
import { createHighlighter } from './highlight';
import type { Grammar } from './highlight';
import './theme.css';

function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

const base = new URL(import.meta.env.BASE_URL, location.href);
async function load<T>(path: string): Promise<T> {
  const response = await fetch(new URL(`data/${path}`, base));
  if (!response.ok) throw new Error(`${response.status}: ${path}`);
  return response.json() as Promise<T>;
}

function link(text: string, target: Target): HTMLAnchorElement {
  const node = element('a', text);
  node.href = routeFor(target);
  return node;
}

const app = document.querySelector<HTMLDivElement>('#app')!;
const header = element('header');
const nav = element('nav');
const indexLink = element('a', 'Index');
indexLink.href = '#';
const searchLink = element('a', 'Search');
searchLink.href = '#search';
nav.append(indexLink, searchLink);
const themeButton = element('button');
themeButton.className = 'theme-toggle';
themeButton.type = 'button';
let theme: 'light' | 'dark' = 'light';
try { if (localStorage.getItem('seanchai-theme') === 'dark') theme = 'dark'; } catch {}
function applyTheme(next: 'light' | 'dark', persist = true) {
  theme = next;
  document.documentElement.dataset.theme = theme;
  themeButton.textContent = theme === 'light' ? 'Dark' : 'Light';
  themeButton.setAttribute('aria-label', `${themeButton.textContent} theme`);
  if (persist) { try { localStorage.setItem('seanchai-theme', theme); } catch {} }
  const frame = content.querySelector<HTMLIFrameElement>('iframe');
  if (frame && new URL(frame.src, location.href).origin === location.origin) frame.contentWindow?.postMessage({ type: 'seanchai-theme', theme }, location.origin);
}
themeButton.onclick = () => applyTheme(theme === 'light' ? 'dark' : 'light');
const headerActions = element('div');
headerActions.className = 'header-actions';
headerActions.append(themeButton);
const demo = element('span', 'Demo');
demo.className = 'demo-badge';
demo.title = 'Demo — work in progress';
demo.setAttribute('aria-label', demo.title);
header.append(nav, demo, headerActions);
const content = element('main');
content.id = 'content';
app.replaceChildren(header, content);
applyTheme(theme, false);
window.addEventListener('storage', event => {
  if (event.key === 'seanchai-theme' || event.key === null) applyTheme(event.newValue === 'dark' ? 'dark' : 'light', false);
});

let index: IndexData;
let current: DocumentData | undefined;
let currentKey = '';
let request = 0;
let sourceVisible = true;
let sourceRequest = 0;
let selectedSource: { doc: DocumentData; position: SourcePosition } | undefined;
let highlight: ReturnType<typeof createHighlighter>;
const highlighted = new WeakMap<Line[], Line[]>();
const cache = new Map<string, DocumentData>();
let popup: HTMLElement | undefined;

function closePopup() {
  popup?.remove();
  popup = undefined;
  for (const node of content.querySelectorAll('.avp-current')) node.classList.remove('avp-current');
}
document.addEventListener('keydown', event => { if (event.key === 'Escape') closePopup(); });
document.addEventListener('pointerdown', event => {
  if (popup && !popup.contains(event.target as Node)) closePopup();
});

function showAVP(token: Token, doc: DocumentData, opener: HTMLElement) {
  closePopup();
  const name = token.avp!;
  const nodes = [...content.querySelectorAll<HTMLElement>('#document [data-avp]')].filter(node => node.dataset.avp === name);
  const occurrences = nodes.filter((node, i) => nodes.findIndex(other => other.closest('.dad-line') === node.closest('.dad-line')) === i);
  let active = Math.max(0, occurrences.findIndex(node => node === opener || node.closest('.dad-line') === opener.closest('.dad-line')));
  const panel = element('section');
  popup = panel;
  panel.className = 'avp-popup';
  panel.dataset.avp = name;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', name);
  const title = element('div');
  title.className = 'popup-title';
  title.append(element('strong', name));
  const close = element('button', '×');
  close.setAttribute('aria-label', 'Close');
  close.onclick = closePopup;
  title.append(close);
  panel.append(title);
  if (token.target) {
    const definition = index.documents.find(entry => entry.id === token.target!.document);
    if (definition) {
      const row = element('p', 'Definition: ');
      const anchor = link(`${definition.specification}${definition.version ? ` V${definition.version}` : ''}${token.target.section ? ` · ${token.target.section}` : ''}`, { ...token.target, name });
      anchor.className = 'definition-link';
      row.append(anchor);
      panel.append(row);
    }
  }
  const actions = element('div');
  actions.className = 'popup-actions';
  const count = element('span', `.dad ${active + 1}/${occurrences.length}`);
  actions.append(count);
  const previous = element('button', 'Previous');
  const next = element('button', 'Next');
  const list = element('div');
  list.className = 'usage-list';
  const buttons: HTMLButtonElement[] = [];
  const select = (index: number) => {
    if (!occurrences.length) return;
    active = (index + occurrences.length) % occurrences.length;
    count.textContent = `.dad ${active + 1}/${occurrences.length}`;
    for (const node of occurrences) node.classList.remove('avp-current');
    for (const button of buttons) button.removeAttribute('aria-current');
    const node = occurrences[active];
    node.classList.add('avp-current');
    buttons[active].setAttribute('aria-current', 'location');
    const pane = content.querySelector<HTMLElement>('#document')!;
    pane.scrollTop += node.getBoundingClientRect().top - pane.getBoundingClientRect().top - 24;
    const sourceLine = node.closest<HTMLElement>('.dad-line')!;
    const position = doc.sections.find(section => section.section === sourceLine.dataset.section);
    const row = lines[Number(sourceLine.dataset.line)].tokens.find(token => token.avp === name && token.source?.row)?.source;
    if (position && sourceVisible && window.matchMedia('(min-width: 761px)').matches) openSource(row ?? { ...position, name, exact: true, occurrence: true }, doc);
  };
  previous.onclick = () => select(active - 1);
  next.onclick = () => select(active + 1);
  actions.append(previous, next);
  panel.append(actions);
  const lines = parseRoute(location.hash).raw && doc.raw ? doc.raw : doc.lines;
  occurrences.forEach((node, index) => {
    const line = node.closest<HTMLElement>('.dad-line')!;
    const source = lines[Number(line.dataset.line)];
    const text = source.tokens.filter(token => !token.class.startsWith('comment.')).map(token => token.text).join('').trim();
    const button = element('button', `${line.dataset.section ?? ''} · ${text}`);
    button.className = 'usage-link';
    button.title = button.textContent!;
    button.onclick = () => select(index);
    if (index === active) button.setAttribute('aria-current', 'location');
    buttons.push(button);
    list.append(button);
  });
  const usages = element('div');
  usages.className = 'usage-details';
  usages.append(element('div', `Mentions (${occurrences.length})`), list);
  panel.append(usages);
  document.body.append(panel);
  const bounds = opener.getBoundingClientRect();
  const size = panel.getBoundingClientRect();
  panel.style.left = `${Math.max(12, Math.min(bounds.left, innerWidth - size.width - 12))}px`;
  panel.style.top = `${Math.max(12, Math.min(bounds.bottom + 8, innerHeight - size.height - 12))}px`;
  close.focus({ preventScroll: true });
}

function updatePaneHeader(header: HTMLElement, doc: DocumentData, position: SourcePosition) {
  const title = header.querySelector<HTMLElement>('h2')!;
  title.textContent = `${doc.specification}${doc.version ? ` V${doc.version}` : ''} — ${doc.title}`;
  const publisher = header.querySelector<HTMLAnchorElement>('.publisher-link')!;
  publisher.hidden = !doc.source.url;
  if (doc.source.url) {
    const url = doc.reference.startsWith('RFC') ? new URL(`https://www.rfc-editor.org/rfc/${doc.reference.toLowerCase()}.html#section-${position.section}`) : new URL(doc.source.url);
    if (position.page && !doc.reference.startsWith('RFC')) url.hash = `page=${position.page}`;
    publisher.href = url.href;
    decorateFileLink(publisher, url, Boolean(doc.source.local || url.pathname.toLowerCase().endsWith('.pdf')));
  }
  const local = header.querySelector<HTMLAnchorElement>('.local-pdf-link')!;
  local.hidden = !doc.source.local && !doc.source.text;
  if (doc.source.local || doc.source.text) {
    const url = doc.source.local ? new URL(`data/${doc.source.local}`, base) : sourceURL(doc, position)!;
    if (position.page && doc.source.local) url.hash = `page=${position.page}`;
    local.href = url.href;
    decorateFileLink(local, url, Boolean(doc.source.local));
  }
}

function decorateFileLink(anchor: HTMLAnchorElement, url: URL, pdf: boolean) {
  const file = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  file.setAttribute('viewBox', '0 0 16 16');
  file.setAttribute('aria-hidden', 'true');
  file.classList.add('file-icon');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M3 1.5h6l4 4v9H3z M9 1.5v4h4');
  file.append(path);
  if (pdf) {
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', '8'); text.setAttribute('y', '11.5');
    text.textContent = 'PDF';
    file.append(text);
  }
  const external = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  external.setAttribute('viewBox', '0 0 16 16');
  external.setAttribute('aria-hidden', 'true');
  external.classList.add('external-icon');
  const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  arrow.setAttribute('d', 'M9 2h5v5 M14 2L7 9 M6 3H2v11h11v-4');
  external.append(arrow);
  const domain = url.hostname.replace(/^www\./, '');
  anchor.replaceChildren(file, element('span', domain), external);
  anchor.title = url.href;
  anchor.setAttribute('aria-label', `${pdf ? 'PDF' : 'File'} · ${domain} · new tab`);
}

function paneHeader(doc: DocumentData, source: boolean): HTMLElement {
  const header = element('div');
  header.className = `pane-header ${source ? 'source-header' : 'document-header'}`;
  const title = element('h2');
  title.className = source ? 'source-document' : 'dad-document';
  const actions = element('div');
  actions.className = 'pane-actions';
  for (const [label, className] of [['Publisher', 'publisher-link'], ['Local PDF', 'local-pdf-link']]) {
    const anchor = element('a', label);
    anchor.className = className;
    anchor.target = '_blank';
    anchor.rel = 'noopener';
    actions.append(anchor);
  }
  header.append(title, actions);
  updatePaneHeader(header, doc, doc.sections[0] ?? { section: '', page: null });
  return header;
}

function refreshSourceHeaders() {
  if (!current) return;
  const left = content.querySelector<HTMLElement>('.document-header');
  const right = content.querySelector<HTMLElement>('.source-header');
  const position = selectedSource?.doc.id === current.id ? selectedSource.position
    : current.sections.find(section => section.section === parseRoute(location.hash).section) ?? current.sections[0];
  if (left && position) updatePaneHeader(left, current, position);
  if (right && selectedSource) updatePaneHeader(right, selectedSource.doc, selectedSource.position);
}

window.addEventListener('message', event => {
  const frame = content.querySelector<HTMLIFrameElement>('iframe');
  if (event.origin !== location.origin || !frame?.contentWindow || event.source !== frame.contentWindow || !selectedSource) return;
  const sourceFile = selectedSource.doc.source.local ?? selectedSource.doc.source.text;
  if (!sourceFile || event.data?.file !== new URL(`data/${sourceFile}`, base).href) return;
  if ((event.data.type === 'seanchai-pdf-page' || event.data.type === 'seanchai-source-page') && Number.isInteger(event.data.page) && event.data.page > 0) {
    selectedSource.position = { ...selectedSource.position, page: event.data.page, exact: true };
    refreshSourceHeaders();
  }
  if (event.data.type === 'seanchai-pdf-matches' && typeof event.data.query === 'string') {
    selectedSource.position = { ...selectedSource.position, name: event.data.query, exact: true };
  }
});

function renderIndex() {
  content.classList.remove('document-view');
  currentKey = '';
  content.replaceChildren();
  content.classList.add('index-view');
  const groups = new Map<string, typeof index.documents>();
  for (const doc of index.documents) {
    const key = `${doc.publisher}${doc.release ? ` · Release ${doc.release}` : ''}`;
    const group = groups.get(key) ?? [];
    group.push(doc);
    groups.set(key, group);
  }
  for (const [name, docs] of [...groups].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))) {
    const section = element('section');
    section.append(element('h2', name));
    const list = element('ul');
    for (const doc of docs) {
      const item = element('li');
      item.append(link(`${doc.specification}${doc.version ? ` V${doc.version}` : ''} — ${doc.title}`, { document: doc.id, section: null }));
      if (doc.pinned) item.append(element('p', doc.pinned));
      list.append(item);
    }
    section.append(list);
    content.append(section);
  }
}

function renderSearch(query: string) {
  content.classList.remove('index-view');
  content.classList.remove('document-view');
  currentKey = '';
  const form = element('form');
  form.className = 'search-form';
  const label = element('label', 'Search ');
  const input = element('input');
  input.type = 'search';
  input.value = query;
  input.placeholder = '29.214, Callee-Information, or 505';
  label.append(input);
  const submit = element('button', 'Search');
  form.append(label, submit);
  const results = element('section');
  results.id = 'search-results';
  results.setAttribute('aria-live', 'polite');
  content.replaceChildren(element('h2', 'Search'), element('p', 'Find specifications by title or number, AVPs by name or code, and mentions in document text.'), form, results);
  const limits = { specifications: 12, avps: 20, mentions: 20 };
  function update() {
    const groups = searchGroups(index.search, input.value);
    const specifications = searchSpecifications(index.documents, input.value);
    const words = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const names = new Set(groups.map(group => group[0].name));
    const mentions = (index.mentions ?? []).filter(mention => words.every(word => mention.text.toLowerCase().includes(word)) || mention.avps.some(name => names.has(name)));
    results.replaceChildren();
    if (!input.value.trim()) return;
    function section(title: string, count: number, key: keyof typeof limits) {
      const section = element('section');
      section.className = `search-section search-${key}`;
      section.append(element('h2', `${title} (${count})`));
      results.append(section);
      if (!count) section.append(element('p', `No matching ${title.toLowerCase()}.`));
      return section;
    }
    function more(section: HTMLElement, count: number, key: keyof typeof limits) {
      if (count <= limits[key]) return;
      const button = element('button', 'More');
      button.onclick = () => { limits[key] += 20; update(); };
      section.append(button);
    }
    const specs = section('Specifications', specifications.length, 'specifications');
    const specList = element('ul');
    for (const doc of specifications.slice(0, limits.specifications)) {
      const item = element('li');
      item.append(link(`${doc.specification}${doc.version ? ` V${doc.version}` : ''} — ${doc.title}`, { document: doc.id, section: null }));
      specList.append(item);
    }
    specs.append(specList);
    more(specs, specifications.length, 'specifications');
    const avps = section('AVPs', groups.length, 'avps');
    for (const group of groups.slice(0, limits.avps)) {
      const first = group[0];
      const panel = element('details');
      const summary = element('summary');
      summary.append(element('strong', first.name), element('span', `${first.identity ? first.identity.join(':') : ''}${first.data_type ? ` · ${first.data_type}` : ''}`));
      panel.append(summary);
      if (first.alias && first.alias !== first.name) panel.append(element('p', `Wireshark: ${first.alias}`));
      const list = element('ul');
      const seen = new Set<string>();
      for (const entry of group) {
        const doc = index.documents.find(doc => doc.id === entry.document)!;
        const key = JSON.stringify([entry.document, entry.target]);
        if (seen.has(key)) continue;
        seen.add(key);
        const item = element('li');
        item.append(link(`${doc.specification}${doc.version ? ` V${doc.version}` : ''}`, { document: entry.document, section: null }));
        if (entry.target) item.append(' → ', link(entry.defined_in ?? entry.name, entry.target));
        if (entry.across_releases) {
          const crossing = entry.across_releases;
          item.append(` · ${crossing.cited} V${crossing.version} · ${crossing.rule}`);
        }
        list.append(item);
      }
      panel.append(list);
      avps.append(panel);
    }
    more(avps, groups.length, 'avps');
    const found = section('Mentions', mentions.length, 'mentions');
    const mentionList = element('ul');
    for (const mention of mentions.slice(0, limits.mentions)) {
      const doc = index.documents.find(doc => doc.id === mention.document)!;
      const item = element('li');
      const anchor = element('a', `${doc.specification}${doc.version ? ` V${doc.version}` : ''}${mention.section ? ` · ${mention.section}` : ''}`);
      anchor.href = sharedRoute({ document: doc.id, section: mention.section }, false, undefined, mention.line);
      anchor.className = 'mention-link';
      const snippet = element('code');
      const needle = input.value.trim();
      const start = mention.text.toLowerCase().indexOf(needle.toLowerCase());
      if (start >= 0) snippet.append(mention.text.slice(0, start), element('mark', mention.text.slice(start, start + needle.length)), mention.text.slice(start + needle.length));
      else snippet.textContent = mention.text;
      item.append(anchor, snippet);
      mentionList.append(item);
    }
    found.append(mentionList);
    more(found, mentions.length, 'mentions');
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  input.oninput = () => {
    history.replaceState(null, '', `#search?q=${encodeURIComponent(input.value)}`);
    limits.specifications = 12; limits.avps = limits.mentions = 20;
    clearTimeout(timer);
    timer = setTimeout(update, 120);
  };
  form.onsubmit = event => { event.preventDefault(); clearTimeout(timer); update(); };
  update();
}

function sourceURL(doc: DocumentData, position: SourcePosition): URL | null {
  if (doc.source.local) {
    const viewer = new URL('viewer.html', base);
    viewer.searchParams.set('file', new URL(`data/${doc.source.local}`, base).href);
    viewer.hash = new URLSearchParams({ page: String(position.page ?? 1), search: position.section }).toString();
    if (position.name !== undefined) viewer.hash += `&name=${encodeURIComponent(position.name)}`;
    if (position.exact) viewer.hash += '&exact=1';
    if (position.occurrence) viewer.hash += '&match=1';
    if (position.row) viewer.hash += '&row=1';
    return viewer;
  }
  if (doc.reference.startsWith('RFC')) {
    const viewer = new URL('rfc.html', base);
    viewer.searchParams.set('file', doc.source.text ? new URL(`data/${doc.source.text}`, base).href : `https://www.rfc-editor.org/rfc/${doc.reference.toLowerCase()}.txt`);
    viewer.hash = new URLSearchParams({ section: position.section, page: String(position.page ?? 1), query: position.name ?? '' }).toString();
    if (position.exact) viewer.hash += '&exact=1';
    return viewer;
  }
  if (!doc.source.url) return null;
  const url = new URL(doc.source.url);
  if (position.page) url.hash = `page=${position.page}`;
  return url;
}

function openSource(position: SourcePosition, doc = current) {
  sourceRequest++;
  if (!doc) return;
  const url = sourceURL(doc, position);
  if (!url) return;
  const frame = content.querySelector<HTMLIFrameElement>('iframe');
  if (!frame || (!doc.source.local && !doc.reference.startsWith('RFC'))) return;
  selectedSource = { doc, position };
  refreshSourceHeaders();
  frame.title = doc.specification;
  if (sourceVisible && frame.src !== url.href) frame.src = url.href;
  content.querySelector('#workspace')?.classList.toggle('with-source', sourceVisible);
}

async function followDefinition(target: Target) {
  if (!sourceVisible) {
    const hash = routeFor(target);
    if (location.hash === hash) await route();
    else location.hash = hash;
    return;
  }
  const generation = ++sourceRequest;
  const doc = cache.get(target.document) ?? await load<DocumentData>(`documents/${encodeURIComponent(target.document)}.json`);
  cache.set(doc.id, doc);
  if (generation !== sourceRequest) return;
  const position = doc.sections.find(section => section.section === target.section) ?? doc.sections[0];
  if (!position) return;
  if (sourceVisible && window.matchMedia('(min-width: 761px)').matches && content.querySelector('iframe') && (doc.source.local || doc.reference.startsWith('RFC'))) {
    openSource({ ...position, name: target.name }, doc);
  } else {
    const url = sourceURL(doc, { ...position, name: target.name });
    if (url) window.open(url.href, '_blank', 'noopener');
  }
}

function tokenNode(token: Token, doc: DocumentData): HTMLElement {
  let node: HTMLElement;
  if (token.source) {
    const url = sourceURL(doc, token.source);
    if (url) {
      const anchor = element('a', token.text);
      anchor.href = url.href;
      anchor.target = '_blank';
      anchor.rel = 'noopener';
      anchor.onclick = event => {
        if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && window.matchMedia('(min-width: 761px)').matches && (doc.source.local || doc.reference.startsWith('RFC'))) {
          event.preventDefault();
          sourceVisible = true;
          const toggle = content.querySelector<HTMLInputElement>('#controls input');
          if (toggle) toggle.checked = true;
          toggle?.setAttribute('aria-expanded', 'true');
          openSource(token.source!, doc);
        }
      };
      node = anchor;
    } else node = element('span', token.text);
  } else if (token.target) {
    const anchor = link(token.text, token.target);
    if (!token.avp) anchor.onclick = event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      void followDefinition(token.target!).catch(console.error);
    };
    node = anchor;
  } else if (/^https?:\/\//.test(token.text)) {
    const anchor = element('a', token.text);
    anchor.href = token.text;
    anchor.target = '_blank';
    anchor.rel = 'noopener';
    node = anchor;
  }
  else node = element('span', token.text);
  node.className = token.class;
  if (token.avp) {
    if (!(node instanceof HTMLAnchorElement)) {
      node = element('button', token.text);
      node.className = `${token.class} avp-name`;
    }
    node.dataset.avp = token.avp;
    node.title = 'Alt-click for occurrences';
    node.onkeydown = event => {
      if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
        event.preventDefault();
        showAVP(token, doc, node);
      }
    };
    node.onclick = event => {
      if (event.altKey) { event.preventDefault(); showAVP(token, doc, node); return; }
      if (event.ctrlKey || event.metaKey || event.shiftKey) return;
      event.preventDefault();
      closePopup();
      if (token.source?.row && sourceVisible) openSource(token.source, doc);
      else if (token.target) void followDefinition({ ...token.target, name: token.target.name ?? token.avp }).catch(console.error);
      else {
        const position = doc.sections.find(section => section.section === node.closest<HTMLElement>('.dad-line')?.dataset.section);
        if (position && sourceVisible) openSource({ ...position, name: token.avp, exact: true, occurrence: true }, doc);
      }
    };
  }
  return node;
}

function renderLines(lines: Line[], doc: DocumentData): HTMLPreElement {
  const pre = element('pre');
  let commentIndex = 0;
  let decorated = highlighted.get(lines);
  if (!decorated) { decorated = highlight(lines); highlighted.set(lines, decorated); }
  let lineIndex = 0;
  for (const line of decorated) {
    const span = element('span');
    span.className = `dad-line ${line.class ?? ''}`;
    span.dataset.line = String(lineIndex++);
    span.dataset.section = line.section ?? '';
    if (line.warning) { span.classList.add('raw-warning'); span.title = 'Modified in corrected view'; }
    if (line.anchor) span.id = `section-${line.anchor}`;
    for (const token of line.tokens) {
      const node = tokenNode(token, doc);
      if (token.correction && doc.corrections[token.correction]) {
        const comment = element('span');
        comment.className = `correction ${token.class}`;
        const toggle = element('button', compactComment(token.text));
        toggle.className = 'correction-toggle';
        toggle.type = 'button';
        toggle.title = `${token.text}\n${doc.corrections[token.correction]}`;
        toggle.setAttribute('aria-expanded', 'false');
        const full = element('span', ` — ${doc.corrections[token.correction]}`);
        full.className = 'correction-detail';
        full.id = `correction-${doc.id}-${commentIndex++}`;
        full.hidden = true;
        toggle.setAttribute('aria-controls', full.id);
        toggle.onclick = () => {
          full.hidden = !full.hidden;
          toggle.textContent = full.hidden ? compactComment(token.text) : token.text.trimEnd();
          toggle.setAttribute('aria-expanded', String(!full.hidden));
        };
        comment.append(toggle, full);
        span.append(comment);
      } else span.append(node);
    }
    pre.append(span);
  }
  return pre;
}

function splitter(divider: HTMLElement, workspace: HTMLElement) {
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
}

function renderDocument(doc: DocumentData, raw: boolean) {
  content.classList.remove('index-view');
  content.classList.add('document-view');
  content.replaceChildren();
  const controls = element('section');
  controls.id = 'controls';
  if (doc.raw) {
    const toggle = element('a', raw ? 'Corrected' : 'Raw');
    const parsed = parseRoute(location.hash);
    toggle.href = routeFor({ document: doc.id, section: parsed.section || null, name: parsed.name }, !raw);
    controls.append(toggle);
  }
  const availableSource = Boolean(doc.source.local || doc.reference.startsWith('RFC'));
  if (availableSource) {
    const label = element('label', 'Source ');
    label.className = 'visibility-toggle';
    const toggle = element('input');
    toggle.type = 'checkbox';
    toggle.checked = sourceVisible;
    toggle.setAttribute('aria-controls', 'source-pane');
    toggle.setAttribute('aria-expanded', String(sourceVisible));
    toggle.onchange = () => {
      sourceVisible = toggle.checked;
      toggle.setAttribute('aria-expanded', String(sourceVisible));
      content.querySelector('#workspace')?.classList.toggle('with-source', sourceVisible);
      if (sourceVisible) {
        const source = selectedSource ?? { doc, position: doc.sections.find(section => section.section === parseRoute(location.hash).section) ?? doc.sections[0] };
        if (source.position) openSource(source.position, source.doc);
      }
    };
    label.append(toggle);
    controls.append(label);
  }
  const findings = element('details');
  findings.append(element('summary', `Findings (${doc.findings.length})`));
  const list = element('ul');
  for (const finding of doc.findings) {
    const item = element('li', `${finding.severity} [${finding.rule}] ${finding.message}${finding.accepted_by ? ` (${finding.accepted_by})` : ''} `);
    if (finding.section) item.append(link(finding.section, { document: doc.id, section: finding.section }));
    list.append(item);
  }
  findings.append(list);
  const holes = element('details');
  holes.append(element('summary', `Holes (${doc.holes.length})`));
  const holeList = element('ul');
  for (const hole of doc.holes) holeList.append(element('li', `${hole.name}: ${hole.missing.join(', ')}${hole.recorded ? ` — ${hole.recorded}` : ''}`));
  holes.append(holeList);
  const workspace = element('div');
  workspace.id = 'workspace';
  const documentHeader = paneHeader(doc, false);
  const documentPane = element('section');
  documentPane.id = 'document';
  documentPane.append(renderLines(raw && doc.raw ? doc.raw : doc.lines, doc));
  workspace.append(documentHeader, documentPane);
  if (availableSource) {
    const divider = element('div');
    divider.id = 'divider';
    splitter(divider, workspace);
    const pane = element('aside');
    pane.id = 'source-pane';
    const sourceHeader = paneHeader(doc, true);
    const frame = element('iframe');
    frame.title = doc.specification;
    frame.onload = () => {
      if (new URL(frame.src, location.href).origin === location.origin) frame.contentWindow?.postMessage({ type: 'seanchai-theme', theme }, location.origin);
    };
    pane.append(frame);
    workspace.append(divider, sourceHeader, pane);
  }
  const diagnostics = element('div');
  diagnostics.id = 'diagnostics';
  diagnostics.append(findings, holes);
  const tools = element('div');
  tools.id = 'document-tools';
  tools.append(diagnostics, controls);
  content.append(tools, workspace);
}

async function route() {
  closePopup();
  const generation = ++request;
  sourceRequest++;
  const parsed = parseRoute(location.hash);
  if (!parsed.document) { renderIndex(); return; }
  if (parsed.document === 'search') { renderSearch(parsed.query); return; }
  const meta = index.documents.find(doc => doc.id === parsed.document);
  if (!meta) { currentKey = ''; content.classList.remove('document-view'); content.replaceChildren(element('p', 'Document not found')); return; }
  const key = `${meta.id}:${parsed.raw}`;
  try {
    if (currentKey !== key) {
      const doc = cache.get(meta.id) ?? await load<DocumentData>(`documents/${encodeURIComponent(meta.id)}.json`);
      if (generation !== request) return;
      cache.set(meta.id, doc);
      current = doc;
      currentKey = key;
      renderDocument(doc, parsed.raw);
    }
    const state = sharedState(location.hash);
    if (state.source && index.documents.some(doc => doc.id === state.source!.document)) {
      const source = cache.get(state.source.document) ?? await load<DocumentData>(`documents/${encodeURIComponent(state.source.document)}.json`);
      if (generation !== request) return;
      cache.set(source.id, source);
      openSource(state.source.position, source);
    } else {
      const position = current!.sections.find(section => section.section === parsed.section) ?? current!.sections[0];
      if (position) openSource({ ...position, name: parsed.name });
    }
    if (parsed.section) {
      const anchor = document.getElementById(`section-${parsed.section}`);
      const pane = document.querySelector<HTMLElement>('#document');
      if (anchor && pane) pane.scrollTop += anchor.getBoundingClientRect().top - pane.getBoundingClientRect().top - 12;
    }
    if (state.line !== undefined) {
      const pane = content.querySelector<HTMLElement>('#document');
      const line = pane?.querySelector<HTMLElement>(`[data-line="${state.line}"]`);
      if (pane && line) pane.scrollTop += line.getBoundingClientRect().top - pane.getBoundingClientRect().top - 12;
    }
  } catch (error) {
    if (generation !== request) return;
    currentKey = '';
    content.replaceChildren(element('p', String(error)));
  }
}

try {
  index = await load<IndexData>('index.json');
  const grammar = await fetch(new URL('syntax/dad.tmLanguage.json', base));
  if (!grammar.ok) throw new Error(String(grammar.status));
  highlight = createHighlighter(await grammar.json() as Grammar);
  if (index.schema_version !== 1) throw new Error('Unsupported export schema');
  window.addEventListener('hashchange', () => { void route(); });
  await route();
} catch (error) { content.replaceChildren(element('p', String(error))); }
