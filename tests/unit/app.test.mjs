import assert from 'node:assert/strict';
import test from 'node:test';
import { boot, click, readFixture, settle } from './helpers.mjs';

const nameLink = (document, href) => [...document.querySelectorAll('pre a[data-avp]')].find(a => a.getAttribute('href').startsWith(href));
const frameSrc = document => document.querySelector('iframe')?.getAttribute('src');

const placeholderLinks = document => [...document.querySelectorAll('#source-pane .source-placeholder a')].map(a => a.href);
const sectionPage = async (id, section) => (await readFixture(`documents/${id}.json`)).sections.find(entry => entry.section === section).page;

const rightClick = (page, node) => node.dispatchEvent(new page.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

test('public: a PDF gets the pane and its toggle, with a placeholder for the viewer', async () => {
  const page = await boot({ hash: '#29153-j00/5.1' });
  try {
    const { document } = page;
    const pageNumber = await sectionPage('29153-j00', '5.1');
    assert.equal(document.querySelector('iframe'), null);
    assert.equal(document.querySelector('.source-toggle input').checked, true);
    assert.ok(document.querySelector('#workspace').classList.contains('with-source'));
    assert.equal(document.querySelectorAll('#source-pane').length, 1);
    const placeholder = document.querySelector('.source-placeholder');
    assert.match(placeholder.textContent, /The PDF of TS 29\.153 V19\.0\.0 cannot be shown here for licensing reasons\./);
    const [publisher, selfHost] = placeholderLinks(document);
    assert.match(publisher, new RegExp(`^https://www\\.etsi\\.org/.*#page=${pageNumber}$`));
    assert.equal(selfHost, 'https://github.com/sliva0/seanchai-explorer#two-build-modes');
    assert.ok(document.querySelector('.source-document').textContent.startsWith('TS 29.153 V19.0.0 — '));
    assert.ok(document.querySelector('.document-header h1').textContent.startsWith('3GPP TS 29.153 V19.0.0 — '));
    assert.equal(document.querySelector('.source-header .source-page').textContent, `p. ${pageNumber}`);
    assert.equal(document.querySelector('.source-header .publisher-link').href, publisher);
    assert.equal(document.querySelector('.source-header .local-link').hidden, true);
    assert.equal(document.querySelector('.document-header .local-link').hidden, true);
  } finally { await page.close(); }
});

test('the page header says it all, the source pane\'s the short name, version and title', async () => {
  const page = await boot({ hash: '#29061-6f0' });
  try {
    const { document } = page;
    assert.equal(document.querySelector('.document-header h1').textContent, '3GPP TS 29.061 V6.15.0 · Gi, Gmb — PLMN interworking with packet data networks');
    assert.equal(document.querySelector('.source-document').textContent, 'TS 29.061 V6.15.0 — PLMN interworking with packet data networks');
  } finally { await page.close(); }
});

test('public: a name defined in an RFC goes to the pane and leaves the main view', async () => {
  const page = await boot({ hash: '#29153-j00' });
  try {
    const { document, window } = page;
    let opened = 0;
    window.open = () => { opened++; };
    const name = nameLink(document, '#rfc7944');
    assert.ok(name, 'a name defined in another document');
    click(page, name);
    await settle();
    assert.ok(document.querySelector('.document-header h1').textContent.startsWith('3GPP TS 29.153'));
    assert.ok(window.location.hash.startsWith('#29153-j00?'));
    assert.equal(new URLSearchParams(window.location.hash.split('?')[1]).get('source'), 'rfc7944');
    const source = new URL(frameSrc(document));
    assert.equal(source.pathname, '/rfc.html');
    assert.equal(new URLSearchParams(source.hash.slice(1)).get('query'), name.dataset.avp);
    assert.equal(document.querySelector('.source-placeholder'), null);
    assert.ok(document.querySelector('.source-document').textContent.startsWith('RFC 7944'));
    // Walking this document's own names has nothing to show, so the RFC stays.
    rightClick(page, name);
    document.querySelector('.avp-popup .usage-link').click();
    assert.equal(frameSrc(document), source.href);
    document.querySelector('.avp-popup .popup-title button').click();
    const base = [...document.querySelectorAll('pre a')].find(a => a.getAttribute('href') === '#rfc6733');
    click(page, base);
    await settle();
    assert.equal(window.location.hash, '#rfc6733', 'not in the fixture, so its page is tried');
    assert.equal(opened, 0);
  } finally { await page.close(); }
});

test('public: a name defined in a PDF shows that document\'s placeholder, which its route restores', async () => {
  const page = await boot({ hash: '#29153-j00' });
  let shared;
  let pageNumber;
  try {
    const { document, window } = page;
    const name = nameLink(document, '#29217-j00/');
    const section = decodeURIComponent(name.getAttribute('href').split('?')[0].split('/')[1]);
    pageNumber = await sectionPage('29217-j00', section);
    const check = () => {
      assert.match(document.querySelector('.source-placeholder').textContent, /The PDF of TS 29\.217 V19\.0\.0 cannot/);
      assert.match(placeholderLinks(document)[0], new RegExp(`/ts_129217v190000p\\.pdf#page=${pageNumber}$`));
      assert.equal(document.querySelector('.source-header .source-page').textContent, `p. ${pageNumber}`);
      assert.ok(document.querySelector('.document-header h1').textContent.startsWith('3GPP TS 29.153'));
    };
    click(page, name);
    await settle();
    check();
    shared = window.location.hash;
    const route = new URLSearchParams(shared.split('?')[1]);
    assert.ok(shared.startsWith('#29153-j00?'));
    assert.equal(route.get('source'), '29217-j00');
    assert.equal(route.get('sourceSection'), section);
    assert.equal(route.get('sourceName'), name.dataset.avp);
    // To an RFC and back: the reader comes and goes in the one pane.
    click(page, nameLink(document, '#rfc7944'));
    await settle();
    assert.equal(document.querySelector('.source-placeholder'), null);
    assert.equal(new URL(frameSrc(document)).pathname, '/rfc.html');
    click(page, name);
    await settle();
    assert.equal(document.querySelector('iframe'), null);
    check();
  } finally { await page.close(); }
  const opened = await boot({ hash: shared });
  try {
    const restored = opened.document;
    assert.ok(restored.querySelector('main h1').textContent.startsWith('3GPP TS 29.153'));
    assert.match(restored.querySelector('.source-placeholder').textContent, /TS 29\.217/);
    assert.match(placeholderLinks(restored)[0], new RegExp(`#page=${pageNumber}$`));
    assert.equal(opened.window.location.hash, shared);
  } finally { await opened.close(); }
});

test('public: with the pane switched off or too narrow to show, a name still goes to its page', async () => {
  const off = await boot({ hash: '#29153-j00?pane=0' });
  try {
    click(off, nameLink(off.document, '#rfc7944'));
    await settle();
    assert.ok(off.window.location.hash.startsWith('#rfc7944'));
    assert.match(off.window.location.hash, /pane=0/);
    assert.equal(off.document.querySelector('.source-toggle input').checked, false);
  } finally { await off.close(); }
  const narrow = await boot({ hash: '#29153-j00', width: 500 });
  try {
    assert.equal(narrow.document.querySelector('.source-toggle').hidden, true);
    assert.ok(!narrow.document.querySelector('#workspace').classList.contains('with-source'));
    click(narrow, nameLink(narrow.document, '#rfc7944'));
    await settle();
    assert.ok(narrow.window.location.hash.startsWith('#rfc7944'));
  } finally { await narrow.close(); }
});

test('public: ; Section: links open the publisher in a new tab', async () => {
  const page = await boot({ hash: '#29153-j00' });
  try {
    const section = page.document.querySelector('pre a[target="_blank"][data-token]');
    assert.ok(section.href.startsWith('https://www.etsi.org/'));
    assert.match(section.href, /#page=\d+$/);
    const event = new page.window.MouseEvent('click', { bubbles: true, cancelable: true });
    section.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false);
    const opened = [];
    page.window.open = (...args) => { opened.push(args); return null; };
    const alt = new page.window.MouseEvent('click', { bubbles: true, cancelable: true, altKey: true });
    section.dispatchEvent(alt);
    assert.equal(alt.defaultPrevented, true, 'a browser would download what alt-click leaves to it');
    assert.deepEqual(opened, [[section.href, '_blank', 'noopener']]);
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
    assert.equal(document.querySelector('.source-toggle').hidden, true);
    const local = [...document.querySelectorAll('pre a[data-avp]')].find(a => a.getAttribute('href').startsWith('#rfc7944/'));
    const href = local.getAttribute('href');
    click(page, local);
    await settle();
    assert.equal(window.location.hash, href);
    assert.equal(frameSrc(document), null);
    page.resize(1280);
    assert.ok(document.querySelector('#workspace').classList.contains('with-source'));
    assert.equal(document.querySelector('.source-toggle').hidden, false);
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
    const toggle = document.querySelector('.source-toggle input');
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
    assert.equal(document.querySelector('.source-toggle input').checked, false);
    const section = document.querySelector('pre a[target="_blank"][data-token]');
    click(page, section);
    assert.equal(document.querySelector('.source-toggle input').checked, true);
    assert.ok(document.querySelector('#workspace').classList.contains('with-source'));
  } finally { await page.close(); }
});

test('self-hosted: PDFs go to the viewer pane at the clause and table row', async () => {
  const page = await boot({ hash: '#29153-j00/5.1', mode: 'self-hosted' });
  try {
    const { document } = page;
    const source = new URL(frameSrc(document));
    assert.equal(source.pathname, '/viewer.html');
    assert.ok(source.searchParams.get('file').endsWith('/data/sources/29153-j00.pdf'));
    assert.equal(new URLSearchParams(source.hash.slice(1)).get('search'), '5.1');
    assert.ok(document.querySelector('.source-document').textContent.startsWith('TS 29.153'));
    assert.equal(document.querySelector('.source-header .publisher-link span').textContent, 'etsi.org');
    assert.equal(document.querySelector('.source-header .local-link span').textContent, 'localhost');
    const row = [...document.querySelectorAll('.table-row a[data-avp]')][0];
    click(page, row);
    const params = new URLSearchParams(new URL(frameSrc(document)).hash.slice(1));
    assert.equal(params.get('row'), '1');
    assert.equal(params.get('name'), row.dataset.avp);
  } finally { await page.close(); }
});

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

test('notes expand, comments are styled by kind and raw lines are marked', async () => {
  const page = await boot({ hash: '#29153-j00' });
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
    await page.go('#29153-j00?raw=1');
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
    await page.go('#29153-j00');
    assert.ok(!page.fetched.includes('data/search.json'));
    await page.go('#search?q=Sd');
    assert.ok(page.fetched.includes('data/search.json'));
  } finally { await page.close(); }
});

test('the index lists releases newest first with pinned ones folded, and versions below', async () => {
  const documents = [
    ['a-18', '3GPP', 18, null], ['a-6', '3GPP', 6, 'Held for TS 29.210.'], ['a-11', '3GPP', 11, 'Held for TS 32.299.'], ['a-11b', '3GPP', 11, null], ['es1', 'ETSI', null, null], ['rfc1', 'IETF', null, null],
  ].map(([id, publisher, release, pinned]) => ({ id, publisher, release, pinned, path: `documents/${id}.json`, raw: null, reference: id, specification: id, title: `Title ${id}`, version: null, source: { kind: 'other', url: null, local: null, text: null } }));
  const page = await boot({ transform: (path, data) => path === 'data/index.json' ? { ...data, documents } : data });
  try {
    const { document } = page;
    assert.equal(document.querySelector('main h1'), null);
    assert.match(document.querySelector('main').lastElementChild.textContent, /^Corpus 2026\.\d+\.\d+ · seanchai \d+\.\d+\.\d+ · public build$/);
    assert.equal(document.querySelector('.demo-badge'), null);
    assert.deepEqual([...document.querySelectorAll('main section > h2, .pinned-release > summary')].map(node => node.textContent), [
      '3GPP · Release 18',
      '3GPP · Release 11',
      '3GPP · Release 11: 1 held for later citations',
      '3GPP · Release 6: 1 held for later citations',
      'IETF',
      'ETSI',
    ]);
    const folded = document.querySelectorAll('.pinned-release');
    assert.equal(folded[0].open, false);
    assert.equal(folded[1].querySelector('.doc-title p').textContent, 'Held for TS 29.210.');
    assert.equal(document.querySelectorAll('main tbody .doc-number a').length, documents.length);
  } finally { await page.close(); }
});

test('an index row is number, interfaces and title, with what its heading says left out', async () => {
  const doc = (id, publisher, specification, reference, release, version, title, pinned = null) => ({ id, publisher, specification, reference, release, version, title, pinned, path: `documents/${id}.json`, raw: null, source: { kind: 'other', url: null, local: null, text: null } });
  const documents = [
    doc('29229-j10', '3GPP', '3GPP TS 29.229', 'TS29.229', 19, '19.1.0', 'Cx and Dx interfaces based on Diameter'),
    doc('29212-j10', '3GPP', '3GPP TS 29.212', 'TS29.212', 19, '19.1.0', 'PCC'),
    doc('29212-bj0', '3GPP', '3GPP TS 29.212', 'TS29.212', 11, '11.19.0', 'PCC', 'Held for TS 32.299.'),
    doc('29230-j30', '3GPP', '3GPP TS 29.230', 'TS29.230', 19, '19.3.0', 'Codes'),
    doc('es283026-010600', 'ETSI', 'ETSI ES 283 026', 'ETSI-ES283.026', null, '1.6.0', 'TISPAN; Rq'),
    doc('es283026-010500', 'ETSI', 'ETSI ES 283 026', 'ETSI-ES283.026', null, '1.5.0', 'TISPAN; Rq'),
    doc('rfc6733', 'IETF', 'RFC 6733', 'RFC6733', null, null, 'RFC 6733'),
    doc('xs0013-006-b_v1.0', '3GPP2', '3GPP2 X.S0013-006', '3GPP2-X.S0013-006', null, '1.0', 'Cx'),
  ];
  const page = await boot({ transform: (path, data) => path === 'data/index.json' ? { ...data, documents } : data });
  try {
    const { document } = page;
    const rows = [...document.querySelectorAll('main tbody tr')].map(row => [...row.children].map(cell => cell.firstChild?.textContent ?? ''));
    assert.deepEqual(rows, [
      ['29.212', 'Gx, Gxx, Sd, St, S15', 'PCC'],
      ['29.229', 'Cx, Dx', 'Cx and Dx interfaces based on Diameter'],
      ['29.230', '', 'Codes'],
      ['29.212', 'Gx, Gxx, Sd, S15', 'PCC'],
      ['RFC 6733', 'Base', ''],
      ['ES 283 026 V1.5.0', 'Rq', 'TISPAN; Rq'],
      ['ES 283 026', 'Rq', 'TISPAN; Rq'],
      ['3GPP2 X.S0013-006', 'Cx', 'Cx'],
    ]);
    const row = document.querySelector('main tbody tr');
    assert.deepEqual([...row.querySelectorAll('a')].map(anchor => [anchor.getAttribute('href'), anchor.tabIndex]), [['#29212-j10', 0], ['#29212-j10', -1]]);
    const groups = [...document.querySelectorAll('.publisher-group')];
    assert.deepEqual(groups.map(group => [group.style.getPropertyValue('--number-width'), group.style.getPropertyValue('--interfaces-width')]), [['6ch', '20ch'], ['8ch', '4ch'], ['17ch', '2ch'], ['17ch', '2ch']]);
  } finally { await page.close(); }
});

test('the index says once how to see where a name is used', async () => {
  const page = await boot();
  try {
    assert.equal([...page.document.querySelectorAll('main > .versions')].filter(node => node.textContent === 'Right-click any AVP name to see where it is used. Alt-click goes to its definition, click to its details.').length, 1);
  } finally { await page.close(); }
});

test('the versions an export leaves out are left out', async () => {
  const page = await boot({ transform: (path, data) => path === 'data/index.json' ? { ...data, corpus_version: null } : data });
  try {
    assert.ok(!page.document.querySelector('.versions').textContent.includes('Corpus'));
  } finally { await page.close(); }
});

test('the raw link is worked out when clicked, from the top visible section', async () => {
  const page = await boot({ hash: '#29153-j00/5.1?name=Ns' });
  try {
    const { document, window } = page;
    const toggle = [...document.querySelectorAll('#controls a')].find(a => a.textContent === 'Raw');
    assert.equal(toggle.getAttribute('href'), '#29153-j00/5.1?raw=1&name=Ns');
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
    assert.equal(toggle.getAttribute('href'), `#29153-j00/${rows[visible].dataset.section}?raw=1`);
    window.HTMLElement.prototype.getBoundingClientRect = rect;
  } finally { await page.close(); }
});

test('a uses popup names the definition\'s document without publisher or version', async () => {
  const page = await boot({ hash: '#29153-j00' });
  try {
    const { document } = page;
    document.querySelector('.uses-toggle input').click();
    for (const [href, label] of [['#29217-j00', /^TS 29\.217 · /], ['#rfc7944', /^RFC 7944 · /]]) {
      click(page, document.querySelector(`pre a[data-avp][href^="${href}"]`));
      await settle();
      assert.match(document.querySelector('.avp-popup .details-link').textContent, label);
    }
  } finally { await page.close(); }
});

test('self-hosted: a table row\'s name and Section cell go to its Details, and the popup offers both targets', async () => {
  const page = await boot({ hash: '#29061-6f0/17.7', mode: 'self-hosted' });
  try {
    const { document } = page;
    const paneAt = () => new URLSearchParams(new URL(frameSrc(document)).hash.slice(1));
    const name = [...document.querySelectorAll('.table-row a[data-avp]')].find(node => node.dataset.avp === 'TMGI');
    click(page, name);
    await settle();
    assert.equal(paneAt().get('search'), '17.7.2');
    assert.equal(paneAt().get('name'), 'TMGI');
    assert.equal(paneAt().get('row'), '1');
    assert.equal(paneAt().get('titled'), '1');
    name.dispatchEvent(new page.window.MouseEvent('mouseover', { bubbles: true }));
    assert.equal(name.title, 'Click: details · Alt-click: definition · Right-click: where it is used');
    click(page, name, { altKey: true });
    await settle();
    assert.equal(paneAt().get('search'), '17.7', 'alt is the row itself');
    assert.equal(paneAt().get('titled'), null);
    const cell = name.closest('.dad-line').querySelector('a[target="_blank"][data-token]');
    assert.equal(cell.textContent, '17.7.2');
    assert.equal(new URLSearchParams(new URL(cell.href).hash.slice(1)).get('name'), null, 'the browser\'s link is the bare clause');
    click(page, cell);
    await settle();
    assert.equal(paneAt().get('search'), '17.7.2');
    assert.equal(paneAt().get('name'), 'TMGI');
    rightClick(page, name);
    await settle();
    const popup = document.querySelector('.avp-popup');
    assert.match(popup.querySelector('.definition-link').parentElement.textContent, /^Definition: 17\.7$/);
    assert.match(popup.querySelector('.details-link').parentElement.textContent, /^Details: 17\.7\.2$/);
    popup.querySelector('.definition-link').click();
    await settle();
    assert.equal(paneAt().get('search'), '17.7');
    assert.equal(paneAt().get('titled'), null);
    popup.querySelector('.details-link').click();
    await settle();
    assert.equal(paneAt().get('search'), '17.7.2');
    assert.ok(page.window.location.hash.includes('titled=1'), 'kept in the route');
  } finally { await page.close(); }
});

test('the popup shows one target where a row\'s clause is its table\'s', async () => {
  const onlyRow = (path, data) => path !== 'data/documents/29061-6f0.json' ? data : { ...data, lines: data.lines.map(line => {
    const row = line.tokens.find(token => token.avp === 'TMGI' && token.source?.row);
    return row ? { ...line, tokens: line.tokens.map(token => token === row ? { ...token, target: { document: '29061-6f0', section: row.source.section } } : token.source ? { ...token, source: { ...token.source, section: row.source.section } } : token) } : line;
  }) };
  const page = await boot({ hash: '#29061-6f0/17.7', mode: 'self-hosted', transform: onlyRow });
  try {
    const { document } = page;
    const name = [...document.querySelectorAll('.table-row a[data-avp]')].find(node => node.dataset.avp === 'TMGI');
    rightClick(page, name);
    await settle();
    const popup = document.querySelector('.avp-popup');
    assert.match(popup.querySelector('.definition-link').parentElement.textContent, /^Definition: 17\.7$/);
    assert.equal(popup.querySelector('.details-link'), null);
  } finally { await page.close(); }
});

test('the uses control lists a name on a plain tap, and Esc returns focus to it', async () => {
  const page = await boot({ hash: '#29153-j00' });
  try {
    const { document, window } = page;
    const control = document.querySelector('.uses-toggle input');
    assert.equal(control.checked, false);
    const name = document.querySelector('pre a[data-avp]');
    const before = window.location.hash;
    control.click();
    assert.equal(control.checked, true);
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

test('the uses control is read at click time and starts off on each document', async () => {
  const page = await boot({ hash: '#29153-j00' });
  try {
    const { document } = page;
    const control = document.querySelector('.uses-toggle input');
    assert.equal(control.checked, false);
    // As a browser restoring form state does: the box changes with no change event.
    control.checked = true;
    click(page, document.querySelector('pre a[data-avp]'));
    assert.ok(document.querySelector('.avp-popup'));
    document.querySelector('.avp-popup .popup-title button').click();
    await page.go('#rfc7944');
    assert.equal(document.querySelector('.uses-toggle input').checked, false);
    click(page, document.querySelector('pre a[data-avp]'));
    await settle();
    assert.equal(document.querySelector('.avp-popup'), null);
  } finally { await page.close(); }
});

test('right-click and the context-menu key list a name\'s uses, alt-click goes to its definition', async () => {
  const page = await boot({ hash: '#29153-j00' });
  try {
    const { document, window } = page;
    const name = document.querySelector('pre a[data-avp]');
    const escape = () => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
    assert.equal(rightClick(page, name), false, 'the browser\'s menu is replaced');
    const popup = document.querySelector('.avp-popup');
    assert.equal(popup.dataset.avp, name.dataset.avp);
    assert.equal(popup.querySelector('.popup-title strong').textContent, `Uses of ${name.dataset.avp}`);
    assert.equal(popup.getAttribute('aria-label'), `Uses of ${name.dataset.avp}`);
    assert.match(popup.querySelector('.usage-details').textContent, /^Uses \d+/);
    escape();
    name.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ContextMenu', bubbles: true, cancelable: true }));
    assert.equal(document.querySelector('.avp-popup').dataset.avp, name.dataset.avp);
    escape();
    const line = [...document.querySelectorAll('pre .dad-line')].find(node => !node.querySelector('[data-avp], .value-name'));
    assert.equal(rightClick(page, line), true, 'anywhere else the menu is the browser\'s');
    assert.equal(rightClick(page, document.querySelector('.document-header')), true);
    assert.equal(document.querySelector('.avp-popup'), null);
    click(page, document.querySelector('pre a[data-avp][href^="#rfc7944"]'), { altKey: true });
    await settle();
    assert.equal(document.querySelector('.avp-popup'), null, 'alt lists nothing');
    assert.equal(new URLSearchParams(window.location.hash.split('?')[1]).get('source'), 'rfc7944', 'a name with no row is followed to its definition');
  } finally { await page.close(); }
});

test('a name\'s title follows the control, and the control says what it does', async () => {
  const page = await boot({ hash: '#29153-j00' });
  try {
    const { document, window } = page;
    const name = document.querySelector('pre a[data-avp]');
    assert.equal(name.title, 'Click: definition · Right-click: where it is used');
    const control = document.querySelector('.uses-toggle');
    assert.equal(control.textContent.trim(), 'Click shows uses');
    assert.equal(control.title, 'Plain click lists where a name is used instead of following it');
    control.querySelector('input').click();
    name.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }));
    assert.equal(name.title, 'Click or right-click: where it is used · Alt-click: definition');
    control.querySelector('input').click();
    name.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }));
    assert.equal(name.title, 'Click: definition · Right-click: where it is used');
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

test('each route sets its title and heading, and navigation moves focus', async () => {
  const page = await boot();
  try {
    const { document, window } = page;
    assert.equal(document.title, 'Seanchaí');
    assert.notEqual(document.activeElement, document.querySelector('main'), 'not on first load');
    await page.go('#29153-j00');
    assert.equal(document.title, 'TS 29.153 — Seanchaí');
    const heading = document.querySelector('main h1');
    assert.match(heading.textContent, /^3GPP TS 29\.153 V19\.0\.0 — /);
    assert.equal(document.activeElement, heading);
    await page.go('#29153-j00/5.1');
    assert.equal(document.activeElement, document.getElementById('section-5.1'));
    await page.go('#search');
    assert.equal(document.title, 'Search — Seanchaí');
    assert.equal(document.querySelector('main h1').textContent, 'Search');
    assert.equal(document.activeElement, document.querySelector('.search-form input'));
    await page.go('');
    assert.equal(document.activeElement, document.querySelector('main'));
    const skip = document.querySelector('.skip-link');
    assert.equal(document.querySelector('#app').firstElementChild, skip);
    await page.go('#29153-j00');
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
    const [sections, findings, holes] = document.querySelectorAll('.diagnostic-panel');
    assert.match(document.querySelector('#diagnostics button').textContent, /^Sections \d+$/);
    const first = sections.querySelector('li');
    const { sections: listed } = await readFixture('documents/29061-6f0.json');
    assert.equal(first.textContent, `${listed[0].section} ${listed[0].title} p. ${listed[0].page}`);
    assert.match(first.querySelector('a').getAttribute('href'), /^#29061-6f0\/[\d.]+$/);
    assert.equal(findings.querySelector('li a').getAttribute('href'), '#29061-6f0/5.1');
    assert.ok(holes.querySelector('li a'), 'a hole links to its clause');
    assert.match(holes.querySelector('li a').getAttribute('href'), /^#29061-6f0\/[\d.]+$/);
    await page.go('#29061-6f0?raw=1');
    assert.match(document.querySelector('.diagnostic-panel li a').getAttribute('href'), /\?raw=1$/);
  } finally { await page.close(); }
});

test('the strip\'s toggles open one panel at a time, and one with nothing to show stays off', async () => {
  const page = await boot({
    hash: '#29061-6f0',
    transform: (path, data) => path === 'data/documents/29061-6f0.json' ? { ...data, findings: [{ severity: 'warning', rule: 'r', message: 'm', section: '5.1', accepted_by: null }], holes: [] } : data,
  });
  try {
    const { document } = page;
    const [sections, findings, holes] = document.querySelectorAll('#diagnostics button');
    const panel = toggle => document.getElementById(toggle.getAttribute('aria-controls'));
    assert.equal(holes.disabled, true);
    assert.equal(holes.textContent, 'Holes 0');
    assert.equal(sections.disabled, false);
    assert.equal(panel(sections).hidden, true);
    sections.click();
    assert.equal(sections.getAttribute('aria-expanded'), 'true');
    assert.equal(panel(sections).hidden, false);
    findings.click();
    assert.equal(sections.getAttribute('aria-expanded'), 'false');
    assert.equal(panel(sections).hidden, true);
    assert.equal(panel(findings).hidden, false);
    findings.click();
    assert.equal(panel(findings).hidden, true);
    assert.equal(findings.getAttribute('aria-expanded'), 'false');
  } finally { await page.close(); }
});

test('a mention link marks its line, a later route clears it, and loading says so', async () => {
  const page = await boot({ hash: '#29153-j00/5.1?line=12' });
  try {
    const { document } = page;
    const line = document.querySelector('.target-line');
    assert.equal(line.dataset.line, '12');
    await page.go('#29153-j00/5.1');
    assert.equal(document.querySelector('.target-line'), null);
    page.window.location.hash = '#29061-6f0';
    await new Promise(resolve => setTimeout(resolve, 0));
    const status = document.querySelector('main [role="status"]');
    if (status) assert.match(status.textContent, /^Loading TS 29\.061/);
    await settle();
    assert.equal(document.querySelector('main [role="status"]'), null);
  } finally { await page.close(); }
});

test('a shared pane state the build cannot show falls back to the document itself', async () => {
  const unlinked = (path, data) => path === 'data/index.json' ? { ...data, documents: data.documents.map(doc => doc.id === '29153-j00' ? { ...doc, source: { ...doc.source, url: null } } : doc) } : data;
  const page = await boot({ hash: '#rfc7944?source=29153-j00&sourceSection=5.1', transform: unlinked });
  try {
    const source = new URL(page.document.querySelector('iframe').getAttribute('src'));
    assert.equal(source.pathname, '/rfc.html');
    assert.ok(source.searchParams.get('file').endsWith('rfc7944.txt'));
  } finally { await page.close(); }
});

test('public: an RFC page restores a PDF\'s placeholder beside it from a shared pane state', async () => {
  const page = await boot({ hash: '#rfc7944?source=29153-j00&sourceSection=5.1' });
  try {
    const { document } = page;
    assert.equal(document.querySelector('iframe'), null);
    assert.ok(document.querySelector('.document-header h1').textContent.startsWith('RFC 7944'));
    assert.match(document.querySelector('.source-placeholder').textContent, /TS 29\.153/);
  } finally { await page.close(); }
});

const rowOf = (document, name) => [...document.querySelectorAll('pre a.value-name')].find(node => node.textContent.replace(/^"|"$/g, '') === name);

test('public: right-click on a value name shows its table, with its AVP and source, and walks the rows', async () => {
  const page = await boot({ hash: '#29061-6f0' });
  try {
    const { document, window } = page;
    const before = window.location.hash;
    const name = rowOf(document, 'DIAMETER_ERROR_SERVICE_AREA');
    assert.equal(name.getAttribute('href'), '#29061-6f0/17.8.2');
    rightClick(page, name);
    await settle();
    assert.equal(window.location.hash, before, 'stays where it is');
    const popup = document.querySelector('.avp-popup');
    assert.equal(popup.dataset.value, 'DIAMETER_ERROR_SERVICE_AREA');
    assert.match(popup.textContent, /Result code 5123 of Experimental-Result-Code/);
    assert.equal(popup.querySelector('p a').getAttribute('href').split('?')[0], '#rfc6733/7.7');
    assert.match(popup.querySelector('a[target="_blank"]').href, /etsi\.org.*#page=92$/);
    assert.equal(popup.querySelector('.usage-link[aria-current]').textContent, '5123 · DIAMETER_ERROR_SERVICE_AREA');
    assert.ok(name.classList.contains('avp-current'));
    assert.match(popup.querySelector('.popup-actions span').textContent, /^Row 4\/\d+$/);
    [...popup.querySelectorAll('.popup-actions button')].at(-1).click();
    assert.equal(popup.querySelector('.usage-link[aria-current]').textContent, '4121 · DIAMETER_ERROR_OUT_OF_RESOURCES');
    assert.ok(rowOf(document, 'DIAMETER_ERROR_OUT_OF_RESOURCES').classList.contains('avp-current'));
    assert.ok(!name.classList.contains('avp-current'));
    popup.querySelector('.popup-title button').click();
    assert.equal(document.querySelector('.avp-popup'), null);
    const ctrl = new window.MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true });
    name.dispatchEvent(ctrl);
    assert.equal(ctrl.defaultPrevented, false, 'a new tab is the browser\'s');
    assert.equal(document.querySelector('.avp-popup'), null);
    const plain = new window.MouseEvent('click', { bubbles: true, cancelable: true });
    name.dispatchEvent(plain);
    assert.equal(plain.defaultPrevented, false, 'with only a placeholder, its link is the browser\'s');
    await settle();
    assert.equal(document.querySelector('.avp-popup'), null);
  } finally { await page.close(); }
});

test('self-hosted: a value name and its clause drive the pane to the row, and the table to its number', async () => {
  const page = await boot({ hash: '#29217-j00', mode: 'self-hosted' });
  try {
    const { document } = page;
    const pane = () => new URLSearchParams(new URL(frameSrc(document)).hash.slice(1));
    const doc = await readFixture('documents/29217-j00.json');
    const { valueTables } = await import('../../src/values.ts');
    const bits = valueTables(doc.lines).find(table => table.kind === 'bits');
    const row = bits.rows[0];
    click(page, rowOf(document, row.name));
    await settle();
    assert.deepEqual(Object.fromEntries(['search', 'name', 'row', 'value'].map(key => [key, pane().get(key)])), { search: row.position.section, name: row.name, row: '1', value: String(row.value) });
    assert.match(page.window.location.hash, /sourceName=/);
    assert.equal(document.querySelector('.avp-popup'), null);
    const codes = valueTables(doc.lines).find(table => table.kind === 'result-codes');
    const code = codes.rows[0];
    const clause = [...document.querySelectorAll(`[data-line="${code.line}"] [data-token]`)].find(node => node.textContent === code.position.section);
    click(page, clause);
    await settle();
    assert.deepEqual(Object.fromEntries(['search', 'name', 'row', 'titled'].map(key => [key, pane().get(key)])), { search: code.position.section, name: code.name, row: '1', titled: '1' });
    assert.equal(document.querySelector('.avp-popup'), null);
  } finally { await page.close(); }
});

test('self-hosted: a link to a row opens the pane there and survives a reload of its route', async () => {
  const page = await boot({ hash: '#29061-6f0/17.8.2?name=DIAMETER_ERROR_SERVICE_AREA', mode: 'self-hosted' });
  try {
    const { document } = page;
    assert.ok(document.querySelector('.target-line').textContent.startsWith('DIAMETER_ERROR_SERVICE_AREA'));
    const pane = new URLSearchParams(new URL(frameSrc(document)).hash.slice(1));
    assert.deepEqual(Object.fromEntries(['search', 'name', 'row', 'titled', 'page'].map(key => [key, pane.get(key)])), { search: '17.8.2', name: 'DIAMETER_ERROR_SERVICE_AREA', row: '1', titled: '1', page: '92' });
    await page.go('#29061-6f0/17.8.2');
    assert.equal(document.querySelector('.target-line'), null, 'a link to the clause marks no row');
  } finally { await page.close(); }
});

test('; From: links to the document a reprint comes from, and the block\'s names to theirs', async () => {
  const page = await boot({ hash: '#29109-j00' });
  try {
    const { document, window } = page;
    const lines = [...document.querySelectorAll('.dad-line')];
    const type = lines.findIndex(line => line.textContent === '; Type: Reprinted AVP\n');
    const from = lines.slice(type).find(line => line.textContent.startsWith('; From:'));
    const anchor = from.querySelector('a');
    assert.equal(anchor.textContent, 'RFC6733');
    assert.equal(anchor.getAttribute('href'), '#rfc6733');
    assert.equal(anchor.dataset.token !== undefined, true);
    click(page, anchor);
    await settle();
    assert.equal(window.location.hash, '#rfc6733');
  } finally { await page.close(); }
});

test('the section list says what a clause\'s value tables hold', async () => {
  const page = await boot({ hash: '#29217-j00' });
  try {
    const items = [...page.document.querySelectorAll('.section-list li')].map(item => item.textContent);
    assert.ok(items.some(item => /Value Table \S+ · Bits \(\d+\)/.test(item)), items.join('\n'));
    assert.ok(items.some(item => /Value Table Feature-List · Features list \d+ \([^)]+\) \(\d+\)/.test(item)), items.join('\n'));
    assert.ok(items.some(item => /Value Table \S+ · Result codes \(\d+\)/.test(item)), items.join('\n'));
  } finally { await page.close(); }
});
