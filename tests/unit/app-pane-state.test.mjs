// What the source pane is given beyond its place, and how its state is kept in the URL.
import assert from 'node:assert/strict';
import test from 'node:test';
import { boot, click, frameSrc, readFixture, settle } from './helpers.mjs';

// TS 29.153's first table row, as the export would give it if the corpus had renamed or inserted it.
const withRow = (path, data, kind) => {
  if (path !== 'data/documents/29153-j00.json') return data;
  const corrections = { ...data.corrections, 'TS29.153.py#row': { kind, reason: 'the table misprints it' } };
  let done = false;
  const lines = data.lines.map(line => {
    const token = !done && line.tokens.find(token => token.source?.row);
    if (!token) return line;
    done = true;
    const renamed = { ...token, avp: 'Corrected-Name', text: 'Corrected-Name', source: { ...token.source, name: 'Corrected-Name' } };
    return { ...line, tokens: [...line.tokens.map(other => other === token ? renamed : other), { correction: 'TS29.153.py#row', kind: 'correction-note', text: ';; corrected: (TS29.153.py#row)' }] };
  });
  return { ...data, corrections, lines };
};
const rowLink = document => [...document.querySelectorAll('.table-row a[data-avp]')].find(node => node.dataset.avp === 'Corrected-Name');

test('a renamed row goes to the pane with the spelling the raw mirror holds, which the route leaves out', async () => {
  const printed = (await readFixture('documents/29153-j00.raw.json')).lines.flatMap(line => line.tokens).find(token => token.source?.row).source.name;
  const page = await boot({ hash: '#29153-j00/5.1', mode: 'self-hosted', transform: (path, data) => withRow(path, data, 'correction') });
  try {
    const { document } = page;
    click(page, rowLink(document));
    await settle();
    const params = new URLSearchParams(new URL(frameSrc(document)).hash.slice(1));
    assert.equal(params.get('name'), 'Corrected-Name');
    assert.equal(params.get('printed'), printed);
    assert.ok(page.fetched.includes('data/documents/29153-j00.raw.json'));
    assert.ok(!page.window.location.hash.includes('printed'), page.window.location.hash);
  } finally { await page.close(); }
});

test('an inserted row has no raw spelling, and a plain row does not load the raw mirror', async () => {
  const inserted = await boot({ hash: '#29153-j00/5.1', mode: 'self-hosted', transform: (path, data) => withRow(path, data, 'insert') });
  try {
    click(inserted, rowLink(inserted.document));
    await settle();
    const params = new URLSearchParams(new URL(frameSrc(inserted.document)).hash.slice(1));
    assert.equal(params.get('name'), 'Corrected-Name');
    assert.equal(params.get('printed'), null);
    assert.ok(!inserted.fetched.includes('data/documents/29153-j00.raw.json'));
  } finally { await inserted.close(); }
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

test('a restored PDF view goes on to the same occurrence', async () => {
  const page = await boot({ hash: '#29153-j00/5.1?source=29153-j00&sourceSection=5.1&sourceName=Ns&exact=1&occurrence=1', mode: 'self-hosted' });
  try {
    assert.equal(new URLSearchParams(new URL(frameSrc(page.document)).hash.slice(1)).get('match'), '1');
  } finally { await page.close(); }
});

test('a search typed in the PDF viewer reaches the URL once, and its own find does not', async () => {
  const page = await boot({ hash: '#29153-j00/5.1', mode: 'self-hosted' });
  try {
    const { document, window } = page;
    const frame = document.querySelector('iframe');
    Object.defineProperty(frame, 'contentWindow', { configurable: true, value: { postMessage() {} } });
    const file = new URL(frameSrc(document)).searchParams.get('file');
    let replaced = 0;
    const replaceState = window.history.replaceState.bind(window.history);
    window.history.replaceState = (...args) => { replaced++; replaceState(...args); };
    const send = query => window.dispatchEvent(new window.MessageEvent('message', { origin: window.location.origin, source: frame.contentWindow, data: { type: 'seanchai-pdf-matches', file, query, current: 1, total: 2 } }));
    send('5.1');
    assert.equal(window.location.hash, '#29153-j00/5.1');
    assert.equal(replaced, 0);
    send('Rx-Request-Type');
    send('Rx-Request-Type');
    assert.equal(replaced, 1);
    const route = new URLSearchParams(window.location.hash.split('?')[1]);
    assert.equal(route.get('sourceName'), 'Rx-Request-Type');
    assert.equal(route.get('exact'), '1');
  } finally { await page.close(); }
});

test('a switched-off pane is kept in the URL, and following a name leaves its position to go back to', async () => {
  const page = await boot({ hash: '#rfc7944?pane=0' });
  try {
    const { document, window } = page;
    assert.equal(document.querySelector('.source-toggle input').checked, false);
    assert.equal(document.querySelector('iframe').getAttribute('src'), null);
    const toggle = document.querySelector('.source-toggle input');
    toggle.checked = true;
    toggle.dispatchEvent(new window.Event('change'));
    assert.ok(!window.location.hash.includes('pane=0'));
    toggle.checked = false;
    toggle.dispatchEvent(new window.Event('change'));
    assert.match(window.location.hash, /pane=0/);
  } finally { await page.close(); }
  const left = await boot({ hash: '#29153-j00' });
  try {
    const { window, document } = left;
    let replaced;
    const replaceState = window.history.replaceState.bind(window.history);
    window.history.replaceState = (state, title, url) => { replaced = url; replaceState(state, title, url); };
    click(left, document.querySelector('pre a[data-avp]'));
    assert.match(replaced, /^#29153-j00\?top=\d+$/);
    await settle();
    assert.ok(!window.location.hash.startsWith('#29153-j00'));
  } finally { await left.close(); }
});

test('the route sets the pane\'s visibility both ways, and a link keeps it switched off', async () => {
  const page = await boot({ hash: '#rfc7944?pane=0' });
  try {
    const { document, window } = page;
    const toggle = () => document.querySelector('.source-toggle input');
    const shown = () => document.querySelector('#workspace').classList.contains('with-source');
    assert.equal(frameSrc(document), null);
    const link = document.querySelector('.section-list a');
    click(page, link);
    await settle();
    assert.equal(window.location.hash, `${link.getAttribute('href')}?pane=0`);
    assert.equal(toggle().checked, false);
    assert.equal(frameSrc(document), null);
    await page.go('#rfc7944/9.1');
    assert.equal(toggle().checked, true);
    assert.ok(shown());
    assert.equal(new URLSearchParams(new URL(frameSrc(document)).hash.slice(1)).get('section'), '9.1');
    await page.go('#rfc7944?pane=0');
    assert.equal(toggle().checked, false);
    assert.ok(!shown());
    await page.go('#rfc7944/9.1');
    assert.equal(toggle().checked, true);
    assert.ok(shown());
  } finally { await page.close(); }
});
