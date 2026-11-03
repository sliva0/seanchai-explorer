import assert from 'node:assert/strict';
import test from 'node:test';
import { boot, click, settle } from './helpers.mjs';

const nameLink = (document, href) => [...document.querySelectorAll('pre a[data-avp]')].find(a => a.getAttribute('href').startsWith(href));
const frameSrc = document => document.querySelector('iframe')?.getAttribute('src');

test('public: a name and ; Bases: go to the target page and nothing opens a window', async () => {
  const page = await boot({ hash: '#29153-i00' });
  try {
    const { document, window } = page;
    let opened = 0;
    window.open = () => { opened++; };
    assert.equal(document.querySelector('iframe'), null);
    assert.equal(document.querySelector('#controls input'), null);
    const name = nameLink(document, '#rfc7944');
    assert.ok(name, 'a name defined in another document');
    const href = name.getAttribute('href');
    click(page, name);
    await settle();
    assert.equal(window.location.hash, href);
    assert.ok(document.querySelector('.document-header h1').textContent.startsWith('RFC 7944'));
    await page.go('#29153-i00');
    const base = [...document.querySelectorAll('pre a')].find(a => a.getAttribute('href') === '#rfc6733');
    click(page, base);
    await settle();
    assert.equal(window.location.hash, '#rfc6733');
    assert.equal(opened, 0);
  } finally { await page.close(); }
});

test('public: ; Section: links open the publisher in a new tab', async () => {
  const page = await boot({ hash: '#29153-i00' });
  try {
    const section = page.document.querySelector('pre a[target="_blank"][data-token]');
    assert.ok(section.href.startsWith('https://www.etsi.org/'));
    assert.match(section.href, /#page=\d+$/);
    const event = new page.window.MouseEvent('click', { bubbles: true, cancelable: true });
    section.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false);
  } finally { await page.close(); }
});

test('public: an RFC page shows itself in the pane, and names go there when they can', async () => {
  const page = await boot({ hash: '#rfc7944' });
  try {
    const { document } = page;
    const source = new URL(frameSrc(document));
    assert.equal(source.pathname, '/rfc.html');
    assert.equal(source.searchParams.get('file'), 'http://localhost/data/sources/rfc7944.txt');
    assert.ok(document.querySelector('#workspace').classList.contains('with-source'));
    const local = [...document.querySelectorAll('pre a[data-avp]')].find(a => a.getAttribute('href').startsWith('#rfc7944/'));
    const before = page.window.location.hash;
    click(page, local);
    await settle();
    assert.equal(page.window.location.hash.split('?')[0], before, 'stays on the page');
    assert.equal(new URLSearchParams(new URL(frameSrc(document)).hash.slice(1)).get('query'), local.dataset.avp);
    const away = [...document.querySelectorAll('pre a')].find(a => a.getAttribute('href')?.startsWith('#rfc6733'));
    click(page, away);
    await settle();
    assert.equal(page.window.location.hash, away.getAttribute('href'), 'not in the fixture, so its page is tried');
    assert.equal(document.querySelector('main').textContent, 'Document not found');
  } finally { await page.close(); }
});

test('narrow: the pane is hidden, its source is not loaded, and names navigate', async () => {
  const page = await boot({ hash: '#rfc7944', width: 500 });
  try {
    const { document, window } = page;
    assert.equal(frameSrc(document), null);
    assert.ok(!document.querySelector('#workspace').classList.contains('with-source'));
    assert.equal(document.querySelector('#controls label').hidden, true);
    const local = [...document.querySelectorAll('pre a[data-avp]')].find(a => a.getAttribute('href').startsWith('#rfc7944/'));
    const href = local.getAttribute('href');
    click(page, local);
    await settle();
    assert.equal(window.location.hash, href);
    assert.equal(frameSrc(document), null);
    page.resize(1280);
    assert.ok(document.querySelector('#workspace').classList.contains('with-source'));
    assert.equal(document.querySelector('#controls label').hidden, false);
    assert.ok(frameSrc(document).includes('rfc.html'));
    page.resize(500);
    assert.ok(!document.querySelector('#workspace').classList.contains('with-source'));
  } finally { await page.close(); }
});

test('switched off: the source is not loaded, names navigate, and a section link switches it on', async () => {
  const page = await boot({ hash: '#rfc7944', width: 500 });
  try {
    const { document, window } = page;
    page.resize(1280);
    const toggle = document.querySelector('#controls input');
    assert.equal(toggle.hasAttribute('aria-expanded'), false);
    toggle.checked = false;
    toggle.dispatchEvent(new window.Event('change'));
    assert.ok(!document.querySelector('#workspace').classList.contains('with-source'));
    const local = [...document.querySelectorAll('pre a[data-avp]')].find(a => a.getAttribute('href').startsWith('#rfc7944/'));
    const href = local.getAttribute('href');
    click(page, local);
    await settle();
    assert.ok(window.location.hash.startsWith(href));
    assert.match(window.location.hash, /pane=0/);
    assert.equal(document.querySelector('#controls input').checked, false);
    const section = document.querySelector('pre a[target="_blank"][data-token]');
    click(page, section);
    assert.equal(document.querySelector('#controls input').checked, true);
    assert.ok(document.querySelector('#workspace').classList.contains('with-source'));
  } finally { await page.close(); }
});

test('self-hosted: PDFs go to the viewer pane at the clause and table row', async () => {
  const page = await boot({ hash: '#29153-i00/5.1', mode: 'self-hosted' });
  try {
    const { document } = page;
    const source = new URL(frameSrc(document));
    assert.equal(source.pathname, '/viewer.html');
    assert.ok(source.searchParams.get('file').endsWith('/data/sources/29153-i00.pdf'));
    assert.equal(new URLSearchParams(source.hash.slice(1)).get('search'), '5.1');
    assert.ok(document.querySelector('.source-document').textContent.startsWith('3GPP TS 29.153'));
    assert.equal(document.querySelector('.source-header .publisher-link span').textContent, 'etsi.org');
    assert.equal(document.querySelector('.source-header .local-link span').textContent, 'Local PDF');
    const row = [...document.querySelectorAll('.table-row a[data-avp]')][0];
    click(page, row);
    const params = new URLSearchParams(new URL(frameSrc(document)).hash.slice(1));
    assert.equal(params.get('row'), '1');
    assert.equal(params.get('name'), row.dataset.avp);
  } finally { await page.close(); }
});

test('the page indicator follows the reader, with shipped text and without', async () => {
  for (const shipped of [true, false]) {
    const page = await boot({
      hash: '#rfc7944',
      transform: (path, data) => shipped ? data : path.includes('rfc7944') ? { ...data, source: { ...data.source, text: null } } : path === 'data/index.json' ? { ...data, documents: data.documents.map(doc => ({ ...doc, source: { ...doc.source, text: null } })) } : data,
    });
    try {
      const { document, window } = page;
      const frame = document.querySelector('iframe');
      const file = new URL(frameSrc(document)).searchParams.get('file');
      assert.equal(file, shipped ? 'http://localhost/data/sources/rfc7944.txt' : 'https://www.rfc-editor.org/rfc/rfc7944.txt');
      Object.defineProperty(frame, 'contentWindow', { configurable: true, value: { postMessage() {} } });
      const send = data => window.dispatchEvent(new window.MessageEvent('message', { origin: window.location.origin, source: frame.contentWindow, data }));
      send({ type: 'seanchai-source-page', file, page: 7 });
      assert.equal(document.querySelector('.source-header .source-page').textContent, 'p. 7');
      assert.ok(document.querySelector('.source-header .publisher-link').href.endsWith('#page-7'));
      send({ type: 'seanchai-source-page', file: 'http://other/file.txt', page: 9 });
      assert.equal(document.querySelector('.source-header .source-page').textContent, 'p. 7');
      assert.equal(Boolean(document.querySelector('.source-header .local-link:not([hidden])')), shipped);
    } finally { await page.close(); }
  }
});

test('notes expand, comments are styled by kind and raw lines are marked', async () => {
  const page = await boot({ hash: '#29153-i00' });
  try {
    const { document } = page;
    const note = document.querySelector('pre .correction-toggle');
    assert.ok(note.parentElement.classList.contains('correction-note'));
    const detail = note.nextElementSibling;
    assert.equal(detail.hidden, true);
    assert.equal(note.getAttribute('aria-expanded'), 'false');
    click(page, note);
    assert.equal(detail.hidden, false);
    assert.equal(note.getAttribute('aria-expanded'), 'true');
    click(page, note);
    assert.equal(detail.hidden, true);
    await page.go('#29153-i00?raw=1');
    assert.ok([...document.querySelectorAll('#controls a')].some(a => a.textContent === 'Corrected'));
    assert.ok(document.querySelector('pre .raw-warning'));
    assert.equal(document.querySelector('pre .correction-toggle'), null);
    const url = [...document.querySelectorAll('pre a')].find(a => a.textContent.startsWith('https://'));
    assert.equal(url.target, '_blank');
  } finally { await page.close(); }
});

test('an unknown document and an unsupported export say so, the second before any other fetch', async () => {
  const page = await boot({ hash: '#does-not-exist' });
  try {
    assert.equal(page.document.querySelector('main h1').textContent, 'Document not found');
    assert.equal(page.document.title, 'Document not found — Seanchaí');
  } finally { await page.close(); }
  const old = await boot({ transform: (_path, data) => ({ ...data, schema_version: 1 }) });
  try {
    assert.match(old.document.querySelector('main').textContent, /Unsupported export schema 1/);
    assert.deepEqual(old.fetched, ['data/index.json']);
  } finally { await old.close(); }
});

test('search data is fetched on the search page only', async () => {
  const page = await boot();
  try {
    assert.ok(!page.fetched.includes('data/search.json'));
    await page.go('#29153-i00');
    assert.ok(!page.fetched.includes('data/search.json'));
    await page.go('#search?q=Sd');
    assert.ok(page.fetched.includes('data/search.json'));
  } finally { await page.close(); }
});

test('the index says what the site is and lists releases newest first with pinned ones folded', async () => {
  const documents = [
    ['a-18', '3GPP', 18, null], ['a-6', '3GPP', 6, 'Held for TS 29.210.'], ['a-11', '3GPP', 11, 'Held for TS 32.299.'], ['a-11b', '3GPP', 11, null], ['rfc1', 'IETF', null, null],
  ].map(([id, publisher, release, pinned]) => ({ id, publisher, release, pinned, path: `documents/${id}.json`, raw: null, reference: id, specification: id, title: `Title ${id}`, version: null, source: { kind: 'other', url: null, local: null, text: null } }));
  const page = await boot({ transform: (path, data) => path === 'data/index.json' ? { ...data, documents } : data });
  try {
    const { document } = page;
    assert.equal(document.querySelector('main h1').textContent, 'Seanchaí');
    const about = document.querySelector('.about').textContent;
    assert.match(about, /unofficial/);
    assert.match(about, /publishers' terms/);
    assert.match(about, /does not redistribute/);
    assert.match(about, /Corpus 2026\.\d+\.\d+ · seanchai \d+\.\d+\.\d+ · public build/);
    assert.equal(document.querySelector('.about a').href, 'https://github.com/sliva0/senchai');
    assert.equal(document.querySelector('.demo-badge'), null);
    assert.deepEqual([...document.querySelectorAll('main section > h2, .pinned-release > summary')].map(node => node.textContent), [
      '3GPP · Release 18',
      '3GPP · Release 11',
      '3GPP · Release 11: 1 held for later citations',
      '3GPP · Release 6: 1 held for later citations',
      'IETF',
    ]);
    const folded = document.querySelectorAll('.pinned-release');
    assert.equal(folded[0].open, false);
    assert.equal(folded[1].querySelector('li p').textContent, 'Held for TS 29.210.');
    assert.equal(document.querySelectorAll('main li > a').length, documents.length);
  } finally { await page.close(); }
});

test('the versions an export leaves out are left out', async () => {
  const page = await boot({ transform: (path, data) => path === 'data/index.json' ? { ...data, corpus_version: null } : data });
  try {
    assert.ok(!page.document.querySelector('.versions').textContent.includes('Corpus'));
  } finally { await page.close(); }
});

test('the raw link is worked out when clicked, from the top visible section', async () => {
  const page = await boot({ hash: '#29153-i00/5.1?name=Ns' });
  try {
    const { document, window } = page;
    const toggle = [...document.querySelectorAll('#controls a')].find(a => a.textContent === 'Raw');
    assert.equal(toggle.getAttribute('href'), '#29153-i00/5.1?raw=1&name=Ns');
    const pane = document.querySelector('#document');
    const rows = [...pane.querySelectorAll('.dad-line[data-section]')];
    const visible = rows.findIndex(row => row.dataset.section !== rows[0].dataset.section);
    assert.ok(visible > 0);
    const position = new Map(rows.map((row, index) => [row, (index - visible) * 18]));
    const rect = window.HTMLElement.prototype.getBoundingClientRect;
    window.HTMLElement.prototype.getBoundingClientRect = function () {
      if (position.has(this)) return { top: position.get(this) + 1, bottom: position.get(this) + 18 };
      return this === pane ? { top: 0, bottom: 500 } : rect.call(this);
    };
    toggle.addEventListener('click', event => event.preventDefault());
    click(page, toggle);
    assert.equal(toggle.getAttribute('href'), `#29153-i00/${rows[visible].dataset.section}?raw=1`);
    window.HTMLElement.prototype.getBoundingClientRect = rect;
  } finally { await page.close(); }
});

test('the occurrences control lists a name on a plain tap, and Esc returns focus to it', async () => {
  const page = await boot({ hash: '#29153-i00' });
  try {
    const { document, window } = page;
    const control = document.querySelector('.occurrences-toggle');
    assert.equal(control.getAttribute('aria-pressed'), 'false');
    const name = document.querySelector('pre a[data-avp]');
    const before = window.location.hash;
    control.click();
    assert.equal(control.getAttribute('aria-pressed'), 'true');
    name.focus();
    click(page, name);
    await settle();
    assert.equal(window.location.hash, before, 'not followed');
    const popup = document.querySelector('.avp-popup');
    assert.equal(popup.dataset.avp, name.dataset.avp);
    assert.ok(popup.querySelectorAll('.usage-link').length >= 1);
    assert.equal(document.activeElement, popup.querySelector('.popup-title button'));
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
    assert.equal(document.querySelector('.avp-popup'), null);
    assert.equal(document.activeElement, name);
    click(page, name);
    document.querySelector('.avp-popup .popup-title button').click();
    assert.equal(document.activeElement, name);
    click(page, name);
    document.querySelector('.avp-popup .usage-link').click();
    assert.equal(document.querySelectorAll('.avp-current').length, 1);
    document.body.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true }));
    assert.equal(document.querySelector('.avp-popup'), null);
    control.click();
    click(page, name);
    await settle();
    assert.notEqual(window.location.hash, before, 'followed again');
  } finally { await page.close(); }
});

test('alt-click and the context-menu key still list occurrences', async () => {
  const page = await boot({ hash: '#29153-i00' });
  try {
    const { document, window } = page;
    const name = document.querySelector('pre a[data-avp]');
    click(page, name, { altKey: true });
    assert.equal(document.querySelector('.avp-popup').dataset.avp, name.dataset.avp);
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
    name.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ContextMenu', bubbles: true, cancelable: true }));
    assert.equal(document.querySelector('.avp-popup').dataset.avp, name.dataset.avp);
  } finally { await page.close(); }
});

test('the pane is kept in the URL without new history entries, and restored from it', async () => {
  const page = await boot({ hash: '#rfc7944' });
  let shared;
  try {
    const { document, window } = page;
    assert.equal(window.location.hash, '#rfc7944', 'nothing added until the pane moves');
    const length = window.history.length;
    const name = [...document.querySelectorAll('pre a[data-avp]')].find(a => a.getAttribute('href').startsWith('#rfc7944/'));
    click(page, name);
    await settle();
    const route = new URLSearchParams(window.location.hash.split('?')[1]);
    assert.equal(route.get('source'), 'rfc7944');
    assert.equal(route.get('sourceName'), name.dataset.avp);
    assert.equal(window.history.length, length);
    const frame = document.querySelector('iframe');
    Object.defineProperty(frame, 'contentWindow', { configurable: true, value: { postMessage() {} } });
    const file = new URL(frame.getAttribute('src')).searchParams.get('file');
    window.dispatchEvent(new window.MessageEvent('message', { origin: window.location.origin, source: frame.contentWindow, data: { type: 'seanchai-source-page', file, page: 5 } }));
    assert.match(window.location.hash, /page=5/);
    assert.match(window.location.hash, /exact=1/);
    shared = window.location.hash;
  } finally { await page.close(); }
  const opened = await boot({ hash: shared });
  try {
    const params = new URLSearchParams(new URL(opened.document.querySelector('iframe').getAttribute('src')).hash.slice(1));
    assert.equal(params.get('page'), '5');
    assert.equal(params.get('exact'), '1');
    assert.equal(opened.document.querySelector('.source-header .source-page').textContent, 'p. 5');
  } finally { await opened.close(); }
});

test('a switched-off pane is kept in the URL, and following a name leaves its position to go back to', async () => {
  const page = await boot({ hash: '#rfc7944?pane=0' });
  try {
    const { document, window } = page;
    assert.equal(document.querySelector('#controls input').checked, false);
    assert.equal(document.querySelector('iframe').getAttribute('src'), null);
    const toggle = document.querySelector('#controls input');
    toggle.checked = true;
    toggle.dispatchEvent(new window.Event('change'));
    assert.ok(!window.location.hash.includes('pane=0'));
    toggle.checked = false;
    toggle.dispatchEvent(new window.Event('change'));
    assert.match(window.location.hash, /pane=0/);
  } finally { await page.close(); }
  const left = await boot({ hash: '#29153-i00' });
  try {
    const { window, document } = left;
    let replaced;
    const replaceState = window.history.replaceState.bind(window.history);
    window.history.replaceState = (state, title, url) => { replaced = url; replaceState(state, title, url); };
    click(left, document.querySelector('pre a[data-avp]'));
    assert.match(replaced, /^#29153-i00\?top=\d+$/);
    await settle();
    assert.ok(!window.location.hash.startsWith('#29153-i00'));
  } finally { await left.close(); }
});

test('each route sets its title and heading, and navigation moves focus', async () => {
  const page = await boot();
  try {
    const { document, window } = page;
    assert.equal(document.title, 'Seanchaí');
    assert.equal(document.querySelector('main h1').textContent, 'Seanchaí');
    assert.notEqual(document.activeElement, document.querySelector('main h1'), 'not on first load');
    await page.go('#29153-i00');
    assert.equal(document.title, '3GPP TS 29.153 V18.0.0 — Seanchaí');
    const heading = document.querySelector('main h1');
    assert.match(heading.textContent, /^3GPP TS 29\.153 V18\.0\.0 — /);
    assert.equal(document.activeElement, heading);
    await page.go('#29153-i00/5.1');
    assert.equal(document.activeElement, document.getElementById('section-5.1'));
    await page.go('#search');
    assert.equal(document.title, 'Search — Seanchaí');
    assert.equal(document.querySelector('main h1').textContent, 'Search');
    assert.equal(document.activeElement, document.querySelector('.search-form input'));
    await page.go('');
    assert.equal(document.activeElement, document.querySelector('main h1'));
    const skip = document.querySelector('.skip-link');
    assert.equal(document.querySelector('#app').firstElementChild, skip);
    await page.go('#29153-i00');
    const before = window.location.hash;
    click(page, skip);
    assert.equal(document.activeElement, document.querySelector('#document'));
    assert.equal(window.location.hash, before);
  } finally { await page.close(); }
});

test('sections, findings and holes link to their clause in the current view', async () => {
  const finding = { severity: 'note', rule: 'a-rule', message: 'Said.', section: '5.1', origin: null, accepted_by: null };
  const page = await boot({
    hash: '#29061-6f0',
    transform: (path, data) => path === 'data/documents/29061-6f0.json' ? { ...data, findings: [finding] } : data,
  });
  try {
    const { document } = page;
    const [sections, findings, holes] = document.querySelectorAll('#diagnostics > details');
    assert.match(sections.querySelector('summary').textContent, /^Sections \(\d+\)$/);
    const first = sections.querySelector('li');
    assert.match(first.textContent, /^[\d.]+ · p\. \d+$/);
    assert.match(first.querySelector('a').getAttribute('href'), /^#29061-6f0\/[\d.]+$/);
    assert.equal(findings.querySelector('li a').getAttribute('href'), '#29061-6f0/5.1');
    assert.ok(holes.querySelector('li a'), 'a hole links to its clause');
    assert.match(holes.querySelector('li a').getAttribute('href'), /^#29061-6f0\/[\d.]+$/);
    await page.go('#29061-6f0?raw=1');
    assert.match(document.querySelector('#diagnostics li a').getAttribute('href'), /\?raw=1$/);
  } finally { await page.close(); }
});

test('a mention link marks its line, a later route clears it, and loading says so', async () => {
  const page = await boot({ hash: '#29153-i00/5.1?line=12' });
  try {
    const { document } = page;
    const line = document.querySelector('.target-line');
    assert.equal(line.dataset.line, '12');
    await page.go('#29153-i00/5.1');
    assert.equal(document.querySelector('.target-line'), null);
    page.window.location.hash = '#29061-6f0';
    await new Promise(resolve => setTimeout(resolve, 0));
    const status = document.querySelector('main [role="status"]');
    if (status) assert.match(status.textContent, /^Loading 3GPP TS 29\.061/);
    await settle();
    assert.equal(document.querySelector('main [role="status"]'), null);
  } finally { await page.close(); }
});
