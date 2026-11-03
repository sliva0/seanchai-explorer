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
    assert.ok(document.querySelector('.document-header h2').textContent.startsWith('RFC 7944'));
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
    assert.equal(page.window.location.hash, before);
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
    assert.equal(window.location.hash, href);
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
    assert.equal(page.document.querySelector('main').textContent, 'Document not found');
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
