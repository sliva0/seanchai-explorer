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

test('public: a name defined in a PDF goes to its page, whose placeholder says where to read it', async () => {
  const page = await boot({ hash: '#29153-j00' });
  try {
    const { document, window } = page;
    const name = nameLink(document, '#29217-j00/');
    const section = decodeURIComponent(name.getAttribute('href').split('?')[0].split('/')[1]);
    const pageNumber = await sectionPage('29217-j00', section);
    const title = () => { name.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true })); return name.title; };
    assert.equal(title(), 'Click: go to definition · Right-click: uses');
    click(page, name);
    await settle();
    assert.ok(window.location.hash.startsWith(`#29217-j00/${section}`));
    assert.ok(document.querySelector('.document-header h1').textContent.startsWith('3GPP TS 29.217'));
    assert.match(document.querySelector('.source-placeholder').textContent, /The PDF of TS 29\.217 V19\.0\.0 cannot/);
    assert.match(placeholderLinks(document)[0], new RegExp(`/ts_129217v190000p\\.pdf#page=${pageNumber}$`));
  } finally { await page.close(); }
});

test('public: a pane restored to a placeholder gives way to an RFC and comes back, in the one pane', async () => {
  const shared = '#29153-j00?source=29217-j00&sourceSection=5.1';
  const page = await boot({ hash: shared });
  try {
    const { document } = page;
    assert.match(document.querySelector('.source-placeholder').textContent, /TS 29\.217/);
    assert.ok(document.querySelector('main h1').textContent.startsWith('3GPP TS 29.153'));
    click(page, nameLink(document, '#rfc7944'));
    await settle();
    assert.equal(document.querySelector('.source-placeholder'), null);
    assert.equal(new URL(frameSrc(document)).pathname, '/rfc.html');
    await page.go(shared);
    assert.equal(document.querySelector('iframe'), null);
    assert.match(document.querySelector('.source-placeholder').textContent, /TS 29\.217/);
  } finally { await page.close(); }
});

test('public: a switched-off pane is switched on for a place it can read, and left off for one it cannot; too narrow, a name goes to its page', async () => {
  const off = await boot({ hash: '#29153-j00?pane=0' });
  try {
    const { document, window } = off;
    click(off, nameLink(document, '#rfc7944'));
    await settle();
    assert.ok(window.location.hash.startsWith('#29153-j00?'), 'the view stays');
    assert.doesNotMatch(window.location.hash, /pane=0/);
    assert.equal(document.querySelector('.source-toggle input').checked, true);
    assert.match(document.querySelector('.source-document').textContent, /^RFC 7944/);
  } finally { await off.close(); }
  const placeholder = await boot({ hash: '#29153-j00?pane=0' });
  try {
    click(placeholder, nameLink(placeholder.document, '#29217-j00/'));
    await settle();
    assert.ok(placeholder.window.location.hash.startsWith('#29217-j00/'));
    assert.match(placeholder.window.location.hash, /pane=0/);
    assert.equal(placeholder.document.querySelector('.source-toggle input').checked, false);
  } finally { await placeholder.close(); }
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
    click(page, local);
    await settle();
    assert.equal(window.location.hash.split('?')[0], local.getAttribute('href').split('?')[0], 'to the clause describing it');
    document.querySelector('.click-target input[value="definition"]').click();
    click(page, local);
    await settle();
    assert.equal(document.querySelector('.target-line [data-avp]').dataset.avp, local.dataset.avp, 'or to the row listing it');
    assert.equal(frameSrc(document), null);
    page.resize(1280);
    assert.ok(document.querySelector('#workspace').classList.contains('with-source'));
    assert.equal(document.querySelector('.source-toggle').hidden, false);
    assert.ok(frameSrc(document).includes('rfc.html'));
    page.resize(500);
    assert.ok(!document.querySelector('#workspace').classList.contains('with-source'));
  } finally { await page.close(); }
});

test('switched off: the source is not loaded, a click on a name or section link switches it on, and alt leaves it off', async () => {
  const page = await boot({ hash: '#rfc7944', width: 500 });
  try {
    const { document, window } = page;
    page.resize(1280);
    const toggle = document.querySelector('.source-toggle input');
    const switchOff = () => {
      toggle.checked = false;
      toggle.dispatchEvent(new window.Event('change'));
    };
    assert.equal(toggle.hasAttribute('aria-expanded'), false);
    switchOff();
    assert.ok(!document.querySelector('#workspace').classList.contains('with-source'));
    const local = [...document.querySelectorAll('pre a[data-avp]')].find(a => a.getAttribute('href').startsWith('#rfc7944/'));
    const before = window.location.hash;
    click(page, local, { altKey: true });
    await settle();
    assert.notEqual(window.location.hash, before, 'alt moves the view');
    assert.match(window.location.hash, /pane=0/);
    assert.equal(toggle.checked, false);
    click(page, local);
    await settle();
    assert.equal(document.querySelector('.source-toggle input').checked, true);
    assert.ok(document.querySelector('#workspace').classList.contains('with-source'));
    assert.doesNotMatch(window.location.hash, /pane=0/);
    assert.equal(new URLSearchParams(new URL(frameSrc(document)).hash.slice(1)).get('query'), local.dataset.avp);
    switchOff();
    click(page, document.querySelector('pre a[target="_blank"][data-token]'));
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

test('the index says once what clicks on a name do', async () => {
  const page = await boot();
  try {
    assert.equal([...page.document.querySelectorAll('main > .versions')].filter(node => node.textContent === 'Click an AVP or command name to see its details or its definition in the source pane, alt-click to move the text there too, right-click to see where an AVP is used or where else a command is printed.').length, 1);
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

test('a uses popup names a Definition\'s document without publisher or version', async () => {
  const page = await boot({ hash: '#29153-j00' });
  try {
    const { document } = page;
    document.querySelector('.uses-toggle input').click();
    for (const [href, label] of [['#29217-j00', /^TS 29\.217 · /], ['#rfc7944', /^RFC 7944 · /]]) {
      click(page, document.querySelector(`pre a[data-avp][href^="${href}"]`));
      await settle();
      const row = document.querySelector('.avp-popup .place-definition');
      assert.match(row.querySelector('.place-where').textContent, label);
      assert.ok(row.querySelector('.view-action').getAttribute('href').startsWith(href), 'and goes there');
      assert.equal(document.querySelector('.avp-popup .place-details'), null, 'no Details are made from its link');
    }
  } finally { await page.close(); }
});

const paneAt = document => new URLSearchParams(new URL(frameSrc(document)).hash.slice(1));
const tmgi = document => [...document.querySelectorAll('.table-row a[data-avp]')].find(node => node.dataset.avp === 'TMGI');

test('self-hosted: a table row\'s name goes to its Definition in the pane where chosen, and its Section cell to its Details', async () => {
  const page = await boot({ hash: '#29061-6f0/17.7', mode: 'self-hosted', clickTarget: 'definition' });
  try {
    const { document, window } = page;
    const name = tmgi(document);
    const route = window.location.hash;
    click(page, name);
    await settle();
    assert.equal(paneAt(document).get('search'), '17.7');
    assert.equal(paneAt(document).get('name'), 'TMGI');
    assert.equal(paneAt(document).get('row'), '1');
    assert.equal(paneAt(document).get('titled'), null);
    assert.ok(window.location.hash.startsWith(route), 'the view\'s own place is the route\'s');
    name.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }));
    assert.equal(name.title, 'Click: definition in pane · Alt-click: definition in both · Right-click: uses');
    const cell = name.closest('.dad-line').querySelector('a[target="_blank"][data-token]');
    assert.equal(cell.textContent, '17.7.2');
    assert.equal(new URLSearchParams(new URL(cell.href).hash.slice(1)).get('name'), null, 'the browser\'s link is the bare clause');
    click(page, cell);
    await settle();
    assert.equal(paneAt(document).get('search'), '17.7.2');
    assert.equal(paneAt(document).get('name'), 'TMGI');
    assert.equal(paneAt(document).get('titled'), '1');
    assert.ok(window.location.hash.includes('titled=1'), 'kept in the route');
  } finally { await page.close(); }
});

test('self-hosted: an alt-click takes the view to the row and the pane with it, and the list keeps where it left', async () => {
  const page = await boot({ hash: '#29061-6f0', mode: 'self-hosted', clickTarget: 'definition' });
  try {
    const { document, window } = page;
    layOut(page);
    const name = [...document.querySelectorAll('pre a[data-avp]')].find(node => node.dataset.avp === 'TMGI' && !node.closest('.table-row'));
    pane(document).scrollTop = 407;
    const jumps = () => JSON.parse(window.sessionStorage.getItem('seanchai-jumps') ?? '{"entries":[]}').entries.length;
    click(page, name);
    await settle();
    assert.equal(paneAt(document).get('search'), '17.7', 'a plain click, from a mention, shows the row');
    assert.equal(paneAt(document).get('row'), '1');
    assert.equal(pane(document).scrollTop, 407, 'and leaves the view');
    assert.equal(jumps(), 0, 'with nothing to go back to');
    click(page, name, { altKey: true });
    await easing();
    const line = tmgi(document).closest('.dad-line');
    assert.equal(line.dataset.line, document.querySelector('.target-line').dataset.line);
    assert.equal(pane(document).scrollTop, Number(line.dataset.line) * 20 - 12);
    assert.equal(paneAt(document).get('search'), '17.7');
    assert.equal(paneAt(document).get('name'), 'TMGI');
    assert.equal(jumps(), 1);
    press(page, { key: 'o', ctrlKey: true });
    await settle();
    assert.equal(pane(document).scrollTop, 407);
  } finally { await page.close(); }
});

test('self-hosted: a cell in the raw text keeps to the raw text', async () => {
  const page = await boot({ hash: '#29061-6f0?raw=1', mode: 'self-hosted', clickTarget: 'definition' });
  try {
    const { document, window } = page;
    click(page, tmgi(document), { altKey: true });
    await settle();
    assert.match(window.location.hash, /[?&]raw=1/);
    assert.ok(document.querySelector('.target-line').querySelector('a[data-avp="TMGI"]'));
  } finally { await page.close(); }
});

test('self-hosted: the popup gives each target both panels first and the pane alone second, and neither is a jump until the view moves', async () => {
  const page = await boot({ hash: '#29061-6f0/17.7', mode: 'self-hosted' });
  try {
    const { document, window } = page;
    layOut(page);
    pane(document).scrollTop = 407;
    const jumps = () => JSON.parse(window.sessionStorage.getItem('seanchai-jumps') ?? '{"entries":[]}').entries.length;
    rightClick(page, tmgi(document));
    await settle();
    const popup = document.querySelector('.avp-popup');
    const definition = popup.querySelector('.place-definition');
    const details = popup.querySelector('.place-details');
    const words = row => [...row.children].map(node => node.textContent);
    assert.deepEqual(words(definition), ['Definition:', '17.7', 'Jump to', 'Show on the right']);
    assert.deepEqual(words(details), ['Details:', '17.7.2', 'Jump to', 'Show on the right']);
    assert.equal(definition.querySelector('button').className, 'control pane-action');
    assert.equal(definition.querySelector('a').className, 'control view-action');
    assert.match(definition.querySelector('a').title, /text on the left and the source pane on the right/);
    assert.match(definition.querySelector('button').title, /only the source pane on the right, and opens it if it is hidden/);
    definition.querySelector('button').click();
    await settle();
    assert.equal(paneAt(document).get('search'), '17.7');
    assert.equal(paneAt(document).get('titled'), null);
    details.querySelector('button').click();
    await settle();
    assert.equal(paneAt(document).get('search'), '17.7.2');
    assert.ok(window.location.hash.includes('titled=1'), 'kept in the route');
    assert.ok(document.querySelector('.avp-popup'), 'the pane moves with the popup open');
    assert.equal(pane(document).scrollTop, 407);
    assert.equal(jumps(), 0);
    assert.match(definition.querySelector('a').getAttribute('href'), /^#29061-6f0\/17\.7\?name=TMGI&source=29061-6f0&sourceSection=17\.7&.*&line=\d+$/);
    click(page, details.querySelector('a'));
    await settle();
    assert.equal(document.querySelector('.avp-popup'), null, 'moving the view closes it');
    assert.equal(paneAt(document).get('search'), '17.7.2');
    assert.ok(window.location.hash.startsWith('#29061-6f0/17.7.2?'));
    assert.equal(jumps(), 1);
  } finally { await page.close(); }
});

test('self-hosted: Show on the right opens a pane that is switched off, and leaves the text where it is', async () => {
  const page = await boot({ hash: '#29061-6f0/17.7?pane=0', mode: 'self-hosted' });
  try {
    const { document, window } = page;
    const control = document.querySelector('.source-toggle input');
    assert.equal(control.checked, false);
    const before = window.location.hash.split('?')[0];
    rightClick(page, tmgi(document));
    await settle();
    document.querySelector('.avp-popup .place-details .pane-action').click();
    await settle();
    assert.equal(control.checked, true);
    assert.doesNotMatch(window.location.hash, /pane=0/);
    assert.equal(paneAt(document).get('search'), '17.7.2');
    assert.equal(window.location.hash.split('?')[0], before);
    assert.ok(document.querySelector('.avp-popup'), 'still open');
  } finally { await page.close(); }
});

test('a use in the popup is the line with its alignment padding collapsed, in its text and its title', async () => {
  const page = await boot({ hash: '#29061-6f0/17.7' });
  try {
    const { document } = page;
    rightClick(page, tmgi(document));
    await settle();
    const uses = [...document.querySelectorAll('.avp-popup .usage-link')];
    assert.deepEqual(uses.map(use => use.textContent), [
      '17.6.2 · [ TMGI ] ; bold',
      '17.6.5 · [ TMGI ] ; bold',
      '17.7 · TMGI 900 17.7.2 OctetString M,V P - - Yes',
    ]);
    assert.deepEqual(uses.map(use => use.title), uses.map(use => use.textContent));
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
    rightClick(page, tmgi(document));
    await settle();
    const popup = document.querySelector('.avp-popup');
    assert.equal(popup.querySelector('.place-definition .place-where').textContent, '17.7');
    assert.equal(popup.querySelector('.place-details'), null);
  } finally { await page.close(); }
});

test('public: the popup has only the view\'s way to a target, under the publisher\'s copy, and a name\'s click goes there', async () => {
  const page = await boot({ hash: '#29061-6f0/17.7', clickTarget: 'definition' });
  try {
    const { document, window } = page;
    const name = tmgi(document);
    rightClick(page, name);
    await settle();
    const definition = document.querySelector('.avp-popup .place-definition');
    assert.equal(definition.querySelector('button'), null);
    assert.equal(definition.querySelector('.view-action').textContent, 'Jump to');
    assert.match(definition.querySelector('.place-where').href, /etsi\.org.*#page=\d+$/);
    document.querySelector('.avp-popup .popup-title button').click();
    click(page, name);
    await settle();
    assert.equal(window.location.hash.split('?')[0], '#29061-6f0/17.7');
    assert.equal(document.querySelector('.target-line a[data-avp]').dataset.avp, 'TMGI');
    assert.match(document.querySelector('.source-placeholder').textContent, /cannot be shown here/);
  } finally { await page.close(); }
});

test('a Details clause the view has no line for has only its way to the pane', async () => {
  const unanchored = (path, data) => path !== 'data/documents/29061-6f0.json' ? data : { ...data, lines: data.lines.map(line => line.anchor === '17.7.2' ? { ...line, anchor: null } : line) };
  const page = await boot({ hash: '#29061-6f0/17.7', mode: 'self-hosted', transform: unanchored });
  try {
    const { document } = page;
    rightClick(page, tmgi(document));
    await settle();
    const details = document.querySelector('.avp-popup .place-details');
    assert.ok(details.querySelector('.pane-action'));
    assert.equal(details.querySelector('.view-action'), null);
  } finally { await page.close(); }
});

test('a Definition in a document the pane has no reader for is only the view\'s, as a click on it is', async () => {
  const unread = (path, data) => {
    const plain = doc => doc.id === 'rfc7944' ? { ...doc, source: { kind: 'other', url: 'https://example.org/default.aspx?docID=1', local: null, text: null } } : doc;
    return path === 'data/index.json' ? { ...data, documents: data.documents.map(plain) } : path === 'data/documents/rfc7944.json' ? plain(data) : data;
  };
  const page = await boot({ hash: '#29153-j00/5.1', mode: 'self-hosted', transform: unread });
  try {
    const { document, window } = page;
    const name = nameLink(document, '#rfc7944');
    rightClick(page, name);
    await settle();
    const definition = document.querySelector('.avp-popup .place-definition');
    assert.equal(definition.querySelector('button'), null);
    assert.ok(definition.querySelector('.view-action'));
    document.querySelector('.avp-popup .popup-title button').click();
    click(page, name);
    await settle();
    assert.ok(window.location.hash.startsWith('#rfc7944/'));
    assert.equal(document.querySelector('#source-pane'), null, 'and its own page has no pane');
  } finally { await page.close(); }
});

test('self-hosted: a click goes to a name\'s Details by default, and the strip\'s choice of Definition is kept for every document', async () => {
  const page = await boot({ hash: '#29061-6f0/17.7', mode: 'self-hosted' });
  try {
    const { document, window } = page;
    const control = document.querySelector('.click-target');
    assert.equal(control.previousElementSibling, document.querySelector('.uses-toggle'));
    assert.equal(control.nextElementSibling, document.querySelector('.source-toggle'), 'beside the pane\'s toggle');
    assert.equal(control.getAttribute('role'), 'radiogroup');
    assert.deepEqual([...control.querySelectorAll('label')].map(label => label.textContent.trim()), ['Definition', 'Details']);
    const chosen = () => control.querySelector('input:checked').value;
    assert.equal(chosen(), 'details');
    const name = tmgi(document);
    const hover = () => { name.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true })); return name.title; };
    assert.equal(hover(), 'Click: details in pane · Alt-click: details in both · Right-click: uses');
    click(page, name);
    await settle();
    assert.equal(paneAt(document).get('search'), '17.7.2');
    assert.equal(paneAt(document).get('titled'), '1');
    control.querySelector('input[value="definition"]').click();
    assert.equal(window.localStorage.getItem('seanchai-click-target'), 'definition');
    assert.equal(hover(), 'Click: definition in pane · Alt-click: definition in both · Right-click: uses');
    click(page, name);
    await settle();
    assert.equal(paneAt(document).get('search'), '17.7');
    assert.equal(paneAt(document).get('titled'), null);
    await page.go('#rfc7944');
    assert.equal(document.querySelector('.click-target input:checked').value, 'definition');
    const drmp = document.querySelector('pre a[data-avp="DRMP"]');
    drmp.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }));
    assert.equal(drmp.title, 'Click: definition in pane · Alt-click: definition in both · Right-click: uses');
    document.querySelector('.click-target input[value="details"]').click();
    assert.equal(window.localStorage.getItem('seanchai-click-target'), 'details');
  } finally { await page.close(); }
});

test('self-hosted: where the view has no line for the Details, an alt-click takes both to the Definition, and the title says so', async () => {
  const unanchored = (path, data) => path !== 'data/documents/29061-6f0.json' ? data : { ...data, lines: data.lines.map(line => line.anchor === '17.7.2' ? { ...line, anchor: null } : line) };
  const page = await boot({ hash: '#29061-6f0/17.7', mode: 'self-hosted', transform: unanchored });
  try {
    const { document, window } = page;
    const name = tmgi(document);
    name.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }));
    assert.equal(name.title, 'Click: details in pane · Alt-click: definition in both · Right-click: uses');
    click(page, name, { altKey: true });
    await settle();
    assert.ok(document.querySelector('.target-line').querySelector('a[data-avp="TMGI"]'), 'the row listing it');
    assert.equal(paneAt(document).get('search'), '17.7');
  } finally { await page.close(); }
});

test('public: where neither panel can show the Details, a click goes to the Definition', async () => {
  const unanchored = (path, data) => path !== 'data/documents/29061-6f0.json' ? data : { ...data, lines: data.lines.map(line => line.anchor === '17.7.2' ? { ...line, anchor: null } : line) };
  const page = await boot({ hash: '#29061-6f0/17.7', transform: unanchored });
  try {
    const { document, window } = page;
    const name = tmgi(document);
    name.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }));
    assert.equal(name.title, 'Click: go to definition · Right-click: uses');
    click(page, name);
    await settle();
    assert.ok(document.querySelector('.target-line').querySelector('a[data-avp="TMGI"]'));
  } finally { await page.close(); }
});

const popupOf = async (page, node) => {
  rightClick(page, node);
  await settle();
  return page.document.querySelector('.avp-popup');
};
const identities = popup => [...popup.querySelectorAll('.popup-identity p')].map(line => line.textContent);
const tableRows = popup => [...popup.querySelectorAll('.popup-tables .place-table')].map(row => [...row.children].map(node => node.textContent));

test('self-hosted: a name\'s popup says its code, vendor and type, and gives its value tables both ways to them', async () => {
  const page = await boot({ hash: '#29217-j00', mode: 'self-hosted' });
  try {
    const { document } = page;
    const row = [...document.querySelectorAll('.table-row a[data-avp]')].find(node => node.dataset.avp === 'Congestion-Level-Range');
    let popup = await popupOf(page, row);
    assert.deepEqual(identities(popup), ['Code 4003 · Vendor-ID 10415 · Unsigned32']);
    assert.equal(popup.firstElementChild.nextElementSibling.className, 'popup-identity', 'under the title');
    assert.deepEqual(tableRows(popup), [['Bits:', '5.3.5', 'Jump to', 'Show on the right']]);
    assert.equal(popup.querySelector('.popup-tables').closest('.popup-places').querySelector('.place-definition') !== null, true, 'in the targets\' grid, after them');
    const before = pane(document).scrollTop;
    popup.querySelector('.place-table .pane-action').click();
    await settle();
    assert.deepEqual([paneAt(document).get('search'), paneAt(document).get('name'), paneAt(document).get('value')], ['5.3.5', 'No congestion', '0'], 'the pane at its first row');
    assert.equal(pane(document).scrollTop, before);
    assert.ok(document.querySelector('.avp-popup'), 'still open');
    const jump = popup.querySelector('.place-table .view-action');
    assert.match(jump.getAttribute('href'), /^#29217-j00\/5\.3\.5\?source=29217-j00&sourceSection=5\.3\.5&.*&line=244$/);
    click(page, jump);
    await settle();
    assert.equal(document.querySelector('.avp-popup'), null);
    assert.equal(document.querySelector('.target-line').dataset.line, '244');
    popup = await popupOf(page, [...document.querySelectorAll('pre a[data-avp]')].find(node => node.dataset.avp === 'Experimental-Result-Code'));
    assert.deepEqual(tableRows(popup).map(cells => cells.slice(0, 2)), [['Result codes:', '5.5']]);
    popup.querySelector('.place-table .pane-action').click();
    await settle();
    assert.deepEqual([paneAt(document).get('search'), paneAt(document).get('name')], ['5.5', null], 'a result code\'s table at its clause');
    popup = await popupOf(page, [...document.querySelectorAll('pre [data-avp]')].find(node => node.dataset.avp === 'Feature-List'));
    assert.deepEqual(tableRows(popup).map(cells => cells[0]), ['Features list 1 (Np):']);
    assert.deepEqual(identities(popup), [], 'nothing said of it here');
    assert.equal(popup.querySelector('.popup-identity'), null);
  } finally { await page.close(); }
});

test('a name\'s popup leaves out what it has nothing for, shows an Enumerated AVP block as a table, and every identity that disagrees', async () => {
  const page = await boot({ hash: '#29061-6f0/17.7' });
  try {
    const popup = await popupOf(page, tmgi(page.document));
    assert.deepEqual(identities(popup), ['Code 900 · Vendor-ID 10415 · OctetString']);
    assert.equal(popup.querySelector('.popup-tables'), null);
  } finally { await page.close(); }
  const recoded = (path, data) => path !== 'data/documents/rfc7944.json' ? data : { ...data, lines: data.lines.map(line => ({ ...line, tokens: line.tokens.map(token => ({ ...token, text: token.text.replace('header: 301', 'header: 302') })) })) };
  for (const [transform, expected] of [[undefined, ['Code 301 · Enumerated']], [recoded, ['Code 301 · Enumerated', 'Code 302 · Enumerated']]]) {
    const drmp = await boot({ hash: '#rfc7944', transform });
    try {
      const popup = await popupOf(drmp, drmp.document.querySelector('pre a[data-avp="DRMP"]'));
      assert.deepEqual(identities(popup), expected, 'IETF\'s vendor 0 is none to name');
      assert.deepEqual(tableRows(popup), [['Enumerated:', '9.1', 'Jump to', 'Show on the right']], 'the RFC reader reads it');
      assert.match(popup.querySelector('.place-table .view-action').getAttribute('href'), /^#rfc7944\/9\.1\?.*&line=13$/);
      popup.querySelector('.place-table .pane-action').click();
      await settle();
      assert.deepEqual([paneAt(drmp.document).get('section'), paneAt(drmp.document).get('query')], ['9.1', 'DRMP'], 'the pane as at its Details');
    } finally { await drmp.close(); }
  }
});

test('a name defined in another document has its identity and tables from there once that is loaded, and nothing is loaded for them', async () => {
  const page = await boot({ hash: '#29153-j00' });
  try {
    const { document } = page;
    const drmp = () => [...document.querySelectorAll('pre a[data-avp]')].find(node => node.dataset.avp === 'DRMP');
    let popup = await popupOf(page, drmp());
    assert.equal(popup.querySelector('.popup-identity'), null);
    assert.equal(popup.querySelector('.popup-tables'), null);
    assert.ok(!page.fetched.includes('data/documents/rfc7944.json'));
    popup.querySelector('.popup-title button').click();
    await page.go('#rfc7944');
    await page.go('#29153-j00');
    popup = await popupOf(page, drmp());
    assert.deepEqual(identities(popup), ['Code 301 · Enumerated']);
    assert.deepEqual(tableRows(popup).map(cells => cells.slice(0, 3)), [['Enumerated:', 'RFC 7944 · 9.1', 'Jump to']]);
    assert.match(popup.querySelector('.place-table .view-action').getAttribute('href'), /^#rfc7944\/9\.1\?line=13$/);
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
    assert.ok(window.location.hash.startsWith('#rfc7944/'), 'the view goes to its definition');
    assert.match(document.querySelector('.source-document').textContent, /^RFC 7944/, 'and the pane');
  } finally { await page.close(); }
});

test('a name\'s title follows the pane and the control, and the control says what it does', async () => {
  const page = await boot({ hash: '#29153-j00' });
  try {
    const { document, window } = page;
    const name = document.querySelector('pre a[data-avp][href^="#rfc7944"]');
    assert.equal(name.title, 'Click: go to definition · Right-click: uses', 'until the pane is known');
    const hover = () => name.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }));
    hover();
    assert.equal(name.title, 'Click: definition in pane · Alt-click: definition in both · Right-click: uses');
    const control = document.querySelector('.uses-toggle');
    assert.equal(control.textContent.trim(), 'Click shows uses');
    assert.equal(control.title, 'Plain click lists where a name is used instead of going to it');
    control.querySelector('input').click();
    hover();
    assert.equal(name.title, 'Click or right-click: uses · Alt-click: definition in both');
    control.querySelector('input').click();
    hover();
    assert.equal(name.title, 'Click: definition in pane · Alt-click: definition in both · Right-click: uses');
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
    const [findings, holes, sections] = document.querySelectorAll('.diagnostic-panel');
    assert.match(document.querySelector('.section-control .disclosure').textContent, /^Sections \d+$/);
    const first = sections.querySelector('li');
    const { sections: listed } = await readFixture('documents/29061-6f0.json');
    assert.equal(first.textContent, `${listed[0].section} ${listed[0].title} p. ${listed[0].page}`);
    assert.match(first.querySelector('a').getAttribute('href'), /^#29061-6f0\/[\d.]+$/);
    assert.equal(findings.querySelector('li a').getAttribute('href'), '#29061-6f0/5.1');
    assert.ok(holes.querySelector('li a'), 'a hole links to its clause');
    assert.match(holes.querySelector('li a').getAttribute('href'), /^#29061-6f0\/[\d.]+$/);
    await page.go('#29061-6f0?raw=1');
    assert.match(document.querySelector('#diagnostic-sections li a').getAttribute('href'), /\?raw=1$/);
  } finally { await page.close(); }
});

test('the strip\'s toggles open one panel at a time, and one with nothing to show stays off', async () => {
  const page = await boot({
    hash: '#29061-6f0',
    transform: (path, data) => path === 'data/documents/29061-6f0.json' ? { ...data, findings: [{ severity: 'warning', rule: 'r', message: 'm', section: '5.1', accepted_by: null }], holes: [] } : data,
  });
  try {
    const { document } = page;
    const [findings, holes, sections] = document.querySelectorAll('#diagnostics .disclosure');
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
    click(page, name);
    await settle();
    assert.ok(window.location.hash.startsWith(`${name.getAttribute('href')}?name=DIAMETER_ERROR_SERVICE_AREA&`), 'with only a placeholder, its link is followed');
    assert.ok(document.querySelector('.target-line').contains(name), 'to its row');
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

test('self-hosted: opening a value\'s popup leaves the pane where it was, and choosing a row moves it', async () => {
  const page = await boot({ hash: '#29217-j00', mode: 'self-hosted' });
  try {
    const { document } = page;
    const pane = () => new URLSearchParams(new URL(frameSrc(document)).hash.slice(1)).get('name');
    const doc = await readFixture('documents/29217-j00.json');
    const { valueTables } = await import('../../src/values.ts');
    const [first, second] = valueTables(doc.lines).find(table => table.kind === 'bits').rows;
    click(page, rowOf(document, first.name));
    await settle();
    assert.equal(pane(), first.name);
    rightClick(page, rowOf(document, second.name));
    await settle();
    assert.equal(document.querySelector('.avp-popup').dataset.value, second.name);
    assert.equal(pane(), first.name, 'the popup opening moves nothing');
    document.querySelector('.avp-popup .usage-link[aria-current]').click();
    await settle();
    assert.equal(pane(), second.name);
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

// A page laid out as a browser would, for what the view reads back: lines of 20 pixels under a pane at the top of the window.
const layOut = page => {
  const { HTMLElement } = page.window;
  const rect = HTMLElement.prototype.getBoundingClientRect;
  HTMLElement.prototype.getBoundingClientRect = function () {
    if (this.id === 'document') return { top: 0, bottom: 500 };
    if (!this.classList.contains('dad-line')) return rect.call(this);
    const top = Number(this.dataset.line) * 20 - this.closest('#document').scrollTop;
    return { top, bottom: top + 20 };
  };
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get() { return 1e7; } });
};
const press = (page, init, target = page.document.body) => {
  const event = new page.window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
};
const follow = async (page, hash) => {
  const anchor = page.document.createElement('a');
  anchor.setAttribute('href', hash);
  page.document.body.append(anchor);
  click(page, anchor);
  anchor.remove();
  await settle();
};
const button = (document, walk) => document.querySelector(`.jump-button[data-walk="${walk}"]`);
const pane = document => document.querySelector('#document');
const easing = () => new Promise(resolve => setTimeout(resolve, 320));

test('ctrl+o and ctrl+i walk jumps exactly, within a document and between documents, and alt does too', async () => {
  const page = await boot({ hash: '#29153-j00' });
  try {
    const { document, window } = page;
    layOut(page);
    pane(document).scrollTop = 407;
    await follow(page, `#29153-j00/${document.querySelector('.section-list a').textContent}`);
    await easing();
    const atSection = pane(document).scrollTop;
    assert.notEqual(atSection, 407);
    const back = press(page, { key: 'o', ctrlKey: true });
    assert.equal(back.defaultPrevented, true);
    await settle();
    assert.equal(pane(document).scrollTop, 407, 'to the pixel');
    assert.match(window.location.hash, /top=20/);
    press(page, { key: 'i', ctrlKey: true });
    await settle();
    assert.equal(pane(document).scrollTop, atSection);
    await follow(page, '#rfc7944');
    assert.ok(document.querySelector('.document-header h1').textContent.startsWith('RFC 7944'));
    press(page, { key: 'o', altKey: true });
    await settle();
    assert.ok(document.querySelector('.document-header h1').textContent.startsWith('3GPP TS 29.153'));
    assert.equal(pane(document).scrollTop, atSection);
    press(page, { key: 'I', code: 'KeyI', altKey: true });
    await settle();
    assert.ok(document.querySelector('.document-header h1').textContent.startsWith('RFC 7944'));
  } finally { await page.close(); }
});

test('the walks skip what is in the document for [d and ]d, [j and ]j are the plain ones, and a chord lapses', async () => {
  const page = await boot({ hash: '#29153-j00' });
  try {
    const { document } = page;
    layOut(page);
    const heading = () => document.querySelector('.document-header h1').textContent;
    await follow(page, '#29153-j00?line=40');
    await follow(page, '#rfc7944');
    await follow(page, '#rfc7944?line=30');
    press(page, { key: '[' });
    assert.equal(press(page, { key: 'd' }).defaultPrevented, true);
    await settle();
    assert.match(heading(), /^3GPP TS 29\.153/, 'past the RFC\'s other place');
    press(page, { key: ']' });
    press(page, { key: 'd' });
    await settle();
    assert.match(heading(), /^RFC 7944/);
    press(page, { key: '[' });
    press(page, { key: 'j' });
    await settle();
    assert.match(heading(), /^RFC 7944/, 'one place back is still the RFC');
    const lapsed = press(page, { key: 'q' });
    assert.equal(lapsed.defaultPrevented, false);
    assert.equal(press(page, { key: 'd' }).defaultPrevented, false, 'a d alone is nothing');
    assert.equal(press(page, { key: '[', ctrlKey: true }).defaultPrevented, false);
  } finally { await page.close(); }
});

test('the keys leave what takes typing alone, and work from a checkbox', async () => {
  const page = await boot({ hash: '#search?q=DRMP' });
  try {
    const { document } = page;
    const input = document.querySelector('.search-form input');
    input.focus();
    assert.equal(document.activeElement, input);
    assert.equal(press(page, { key: 'o', ctrlKey: true }, input).defaultPrevented, false);
    press(page, { key: '[' }, input);
    assert.equal(press(page, { key: 'd' }, input).defaultPrevented, false);
    await follow(page, '#rfc7944');
    const uses = document.querySelector('.uses-toggle input');
    uses.focus();
    assert.equal(press(page, { key: 'o', ctrlKey: true }, uses).defaultPrevented, true);
    await settle();
    assert.equal(document.querySelector('.search-form input').value, 'DRMP', 'back at the search');
    assert.notEqual(document.activeElement, document.querySelector('.search-form input'), 'with the keys still walking');
    assert.equal(press(page, { key: 'i', ctrlKey: true }).defaultPrevented, true);
    await settle();
    assert.ok(document.querySelector('#document'));
  } finally { await page.close(); }
});

test('the header\'s buttons name their key and target, stay in the tab order at the ends, and keep the focus across documents', async () => {
  const page = await boot({ hash: '#29153-j00' });
  try {
    const { document } = page;
    layOut(page);
    assert.deepEqual([...document.querySelectorAll('.jump-button')].map(node => node.textContent), ['‹', '›', '«', '»']);
    assert.equal(document.querySelector('.document-header').firstElementChild, document.querySelector('.jump-controls'), 'left of the title');
    assert.equal(document.querySelector('.source-header .jump-controls'), null);
    for (const node of document.querySelectorAll('.jump-button')) {
      assert.equal(node.getAttribute('aria-disabled'), 'true');
      assert.equal(node.disabled, false);
    }
    assert.equal(button(document, 'back').title, 'No earlier position (Ctrl+O)');
    pane(document).scrollTop = 2240;
    await follow(page, '#rfc7944');
    assert.equal(button(document, 'back').title, 'Back to TS 29.153 line 113 (Ctrl+O)');
    assert.equal(button(document, 'backDocument').title, 'Back to TS 29.153 line 113 ([d)');
    assert.equal(button(document, 'back').getAttribute('aria-disabled'), 'false');
    assert.equal(button(document, 'forward').getAttribute('aria-disabled'), 'true');
    assert.equal(button(document, 'forward').title, 'No later position (Ctrl+I)');
    button(document, 'back').focus();
    button(document, 'back').click();
    await settle();
    assert.ok(document.querySelector('.document-header h1').textContent.startsWith('3GPP TS 29.153'));
    assert.equal(pane(document).scrollTop, 2240);
    assert.equal(document.activeElement, button(document, 'back'));
    assert.equal(button(document, 'forward').title, 'Forward to RFC 7944 line 1 (Ctrl+I)');
    assert.equal(button(document, 'back').getAttribute('aria-disabled'), 'true');
    button(document, 'back').click();
    await settle();
    assert.ok(document.querySelector('.document-header h1').textContent.startsWith('3GPP TS 29.153'), 'at the end it does nothing');
    button(document, 'forwardDocument').click();
    await settle();
    assert.ok(document.querySelector('.document-header h1').textContent.startsWith('RFC 7944'));
    assert.equal(button(document, 'backDocument').title, 'Back to TS 29.153 line 113 ([d)');
    await follow(page, '#');
    await follow(page, '#search');
    assert.equal(document.querySelector('.jump-button'), null, 'only a document\'s header has them');
    document.activeElement.blur();
    press(page, { key: 'o', altKey: true });
    await settle();
    assert.ok(document.querySelector('.index-view'), 'the keys work everywhere');
  } finally { await page.close(); }
});

test('following a link pushes history only for a new page, and in a page it replaces', async () => {
  const page = await boot({ hash: '#29153-j00' });
  try {
    const { document, window } = page;
    const length = window.history.length;
    let pushed = 0;
    const pushState = window.history.pushState.bind(window.history);
    window.history.pushState = (...args) => { pushed++; pushState(...args); };
    click(page, document.querySelector('.section-list a'));
    await settle();
    assert.match(window.location.hash, /^#29153-j00\//);
    assert.equal(window.history.length, length);
    await follow(page, '#29153-j00?line=20');
    assert.equal(window.location.hash, '#29153-j00?line=20');
    assert.equal(pushed, 0);
    await follow(page, '#rfc7944');
    assert.equal(window.location.hash, '#rfc7944');
    assert.equal(window.history.length, length + 1);
    await follow(page, '#');
    await follow(page, '#search?q=DRMP');
    await follow(page, '#search?q=Ns');
    assert.equal(pushed, 3, 'index and search are pages, and another search is the same one');
    await follow(page, '#29153-j00');
    await follow(page, '#29153-j00?raw=1');
    assert.equal(pushed, 5, 'raw text has its own lines, so it is a page');
  } finally { await page.close(); }
});

test('a document comes back where it was left unless its route says otherwise, and raw keeps its own place', async () => {
  const page = await boot({ hash: '#29153-j00' });
  try {
    const { document } = page;
    layOut(page);
    pane(document).scrollTop = 1237;
    await follow(page, '#');
    await follow(page, '#29153-j00');
    assert.equal(pane(document).scrollTop, 1237);
    await follow(page, '#29153-j00?raw=1');
    assert.equal(pane(document).scrollTop, 0, 'the raw text\'s lines are not these');
    await follow(page, '#');
    await follow(page, '#29153-j00?top=9');
    assert.equal(pane(document).scrollTop, 180, 'a line in the route wins');
    assert.ok(page.window.sessionStorage.getItem('seanchai-positions').includes('"29153-j00"'));
  } finally { await page.close(); }
});

test('a second walk before a document has loaded keeps the exact place of the first', async () => {
  const page = await boot({ hash: '#29153-j00' });
  try {
    const { document } = page;
    layOut(page);
    pane(document).scrollTop = 1237;
    await follow(page, '#rfc7944');
    press(page, { key: 'o', ctrlKey: true });
    press(page, { key: 'i', ctrlKey: true });
    await settle();
    assert.ok(document.querySelector('.document-header h1').textContent.startsWith('RFC 7944'));
    press(page, { key: 'o', ctrlKey: true });
    await settle();
    assert.equal(pane(document).scrollTop, 1237);
  } finally { await page.close(); }
});

test('the index comes back as far down as it was left', async () => {
  const page = await boot({ hash: '' });
  try {
    const { document } = page;
    const content = document.querySelector('#content');
    content.scrollTop = 300;
    await follow(page, '#rfc7944');
    assert.equal(button(document, 'back').title, 'Back to Index (Ctrl+O)');
    press(page, { key: 'o', ctrlKey: true });
    await settle();
    assert.ok(document.querySelector('.index-view'));
    assert.equal(content.scrollTop, 300);
  } finally { await page.close(); }
});

test('a reload keeps the jump list and the position, and steps over a document no longer in the corpus', async () => {
  const entry = (document, top, offset) => ({ document, top, offset, hash: `#${document}?top=${top}` });
  const page = await boot({
    hash: '#29153-j00',
    session: {
      'seanchai-positions': JSON.stringify({ '29153-j00': { top: 50, offset: 3 } }),
      'seanchai-jumps': JSON.stringify({ entries: [entry('rfc7944', 10, 4), entry('gone', 1, 0)], index: 2 }),
    },
    prepare: layOut,
  });
  try {
    const { document } = page;
    assert.equal(pane(document).scrollTop, 1003);
    assert.equal(button(document, 'back').title, 'Back to RFC 7944 line 11 (Ctrl+O)');
    press(page, { key: 'o', ctrlKey: true });
    await settle();
    assert.ok(document.querySelector('.document-header h1').textContent.startsWith('RFC 7944'));
    assert.equal(pane(document).scrollTop, 204);
    assert.equal(JSON.parse(page.window.sessionStorage.getItem('seanchai-jumps')).index, 0);
  } finally { await page.close(); }
});

test('the strip names the section at the top of the view, and opens the Sections panel at its entry', async () => {
  const page = await boot({ hash: '#29153-j00' });
  try {
    const { document, window } = page;
    layOut(page);
    const crumb = document.querySelector('.section-crumb');
    const rows = [...document.querySelectorAll('.dad-line[data-section]')];
    const row = rows.find(node => node.dataset.section !== rows[0].dataset.section);
    const section = row.dataset.section;
    const { title } = (await readFixture('documents/29153-j00.json')).sections.find(entry => entry.section === section);
    const toggle = document.querySelector('.section-control .disclosure');
    assert.deepEqual([...document.querySelectorAll('#diagnostics button')].map(node => node.textContent.split(' ')[0]).slice(0, 3), ['Findings', 'Holes', 'Sections']);
    assert.equal(toggle.nextElementSibling.firstElementChild, crumb, 'the crumb follows the Sections toggle');
    pane(document).scrollTop = Number(row.dataset.line) * 20 - 12;
    pane(document).dispatchEvent(new window.Event('scroll'));
    await new Promise(resolve => setTimeout(resolve, 200));
    assert.equal(crumb.textContent, `${section} · ${title}`);
    assert.match(window.location.hash, new RegExp(`top=${Number(row.dataset.line) - 1}$`), 'and the URL, once it has come to rest');
    click(page, crumb);
    const panel = document.querySelector('#diagnostic-sections');
    assert.equal(panel.hidden, false);
    assert.equal(toggle.getAttribute('aria-expanded'), 'true');
    const current = panel.querySelectorAll('[aria-current]');
    assert.equal(current.length, 1);
    assert.equal(current[0].dataset.section, section);
    assert.equal(document.activeElement, current[0].querySelector('a'));
    click(page, crumb);
    assert.equal(panel.hidden, false, 'a second click does not close it');
    assert.equal(panel.querySelectorAll('[aria-current]').length, 1);
    click(page, toggle);
    assert.equal(panel.hidden, true, 'the toggle does');
  } finally { await page.close(); }
});

test('moving the pane alone is no jump, moving both is, and going back moves both back with the reader\'s pane state', async () => {
  const page = await boot({ hash: '#29153-j00' });
  try {
    const { document, window } = page;
    layOut(page);
    pane(document).scrollTop = 407;
    const shows = () => document.querySelector('.source-document').textContent;
    const heading = () => document.querySelector('.document-header h1').textContent;
    const name = document.querySelector('pre a[data-avp][href^="#rfc7944"]');
    click(page, name);
    await settle();
    assert.match(shows(), /^RFC 7944/);
    assert.match(window.location.hash, /source=rfc7944/);
    assert.equal(pane(document).scrollTop, 407);
    assert.equal(button(document, 'back').getAttribute('aria-disabled'), 'true', 'nothing to go back to');
    assert.equal(window.sessionStorage.getItem('seanchai-jumps'), null);
    click(page, name, { altKey: true });
    await settle();
    assert.match(heading(), /^RFC 7944/);
    assert.equal(button(document, 'back').getAttribute('aria-disabled'), 'false');
    press(page, { key: 'o', ctrlKey: true });
    await settle();
    assert.match(heading(), /^3GPP TS 29\.153/);
    assert.equal(pane(document).scrollTop, 407);
    assert.match(window.location.hash, /source=rfc7944/, 'as the pane was left');
    assert.match(shows(), /^RFC 7944/);
    press(page, { key: 'i', ctrlKey: true });
    await settle();
    assert.match(heading(), /^RFC 7944/);
    const toggle = document.querySelector('.source-toggle input');
    toggle.checked = false;
    toggle.dispatchEvent(new window.Event('change'));
    press(page, { key: 'o', ctrlKey: true });
    await settle();
    assert.match(window.location.hash, /pane=0/);
    assert.equal(document.querySelector('.source-toggle input').checked, false);
  } finally { await page.close(); }
});

const commandNames = (document, key) => [...document.querySelectorAll(`pre [data-command="${key}"]`)];
const placeRows = (popup, selector) => [...popup.querySelectorAll(selector)].map(row => [...row.children].map(node => node.textContent));
const groupTitles = popup => [...popup.querySelectorAll('.popup-group-title')].map(node => node.textContent);

test('self-hosted: a command\'s name and abbreviation are names, which go to its block in the pane, in both with alt, and list with the control', async () => {
  const page = await boot({ hash: '#29061-6f0', mode: 'self-hosted' });
  try {
    const { document, window } = page;
    const names = commandNames(document, '265 answer');
    assert.deepEqual(names.map(node => [node.textContent, node.closest('.dad-line').dataset.line, node.tagName]), [['AA-Answer', '44', 'A'], ['AAA', '44', 'BUTTON'], ['AA-Answer', '47', 'A']]);
    const abbreviation = names[1];
    abbreviation.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }));
    assert.equal(abbreviation.title, 'Click: definition in pane · Alt-click: definition in both · Right-click: its definitions', 'it has no Details to choose, so Definition it is');
    const route = window.location.hash;
    click(page, abbreviation);
    await settle();
    assert.deepEqual([paneAt(document).get('search'), paneAt(document).get('name'), paneAt(document).get('page')], ['17.6.2', 'AA-Answer', '83']);
    assert.equal(window.location.hash.split('?')[0], route.split('?')[0], 'the view stays');
    click(page, commandNames(document, '265 request')[0], { altKey: true });
    await settle();
    assert.equal(document.querySelector('.target-line').dataset.line, '15', 'the block\'s Type line');
    assert.equal(paneAt(document).get('search'), '17.6.1');
    document.querySelector('.uses-toggle input').click();
    click(page, commandNames(document, '265 answer')[2]);
    await settle();
    assert.equal(document.querySelector('.avp-popup').dataset.command, '265 answer');
  } finally { await page.close(); }
});

test('self-hosted: a command\'s popup says its header, where its application comes from, and gives its block and partner both ways', async () => {
  const page = await boot({ hash: '#29061-6f0', mode: 'self-hosted' });
  try {
    const { document } = page;
    const popup = await popupOf(page, commandNames(document, '265 answer')[1]);
    assert.equal(popup.querySelector('.popup-title strong').textContent, 'AA-Answer (AAA)');
    assert.equal(popup.getAttribute('aria-label'), 'AA-Answer (AAA)');
    assert.deepEqual(identities(popup), ['Code 265 · Answer · PXY', 'Application-ID 16777223 · Gmb · from 17, not the header']);
    assert.deepEqual(placeRows(popup, '.popup-place'), [['Definition:', '17.6.2', 'Jump to', 'Show on the right'], ['Request:', '17.6.1 · AAR', 'Jump to', 'Show on the right']]);
    assert.deepEqual(groupTitles(popup), [], 'no other document prints it, nor a registry');
    assert.match(popup.querySelector('.place-partner .view-action').getAttribute('href'), /^#29061-6f0\/17\.6\.1\?name=AA-Request&source=29061-6f0&sourceSection=17\.6\.1&page=82&sourceName=AA-Request&line=15$/);
    popup.querySelector('.place-partner .pane-action').click();
    await settle();
    assert.deepEqual([paneAt(document).get('search'), paneAt(document).get('name')], ['17.6.1', 'AA-Request']);
    assert.ok(document.querySelector('.avp-popup'), 'still open');
  } finally { await page.close(); }
});

test('a header printing its own id says no more, and one printing none with no scope says so', async () => {
  const bare = (path, data) => path !== 'data/documents/29109-j00.json' ? data : { ...data, lines: data.lines.map(line => ({ ...line, tokens: line.tokens.map(token => ({ ...token, text: token.text.replace('303, PXY, 16777221 >', '303, PXY >') })) })) };
  const page = await boot({ hash: '#29109-j00', transform: bare });
  try {
    const popup = await popupOf(page, commandNames(page.document, '303 answer')[0]);
    assert.deepEqual(identities(popup), ['Code 303 · Answer · PXY', 'No Application-ID: the header prints none']);
    popup.querySelector('.popup-title button').click();
    assert.deepEqual(identities(await popupOf(page, commandNames(page.document, '303 request')[0])), ['Code 303 · Request · REQ, PXY', 'Application-ID 16777221']);
  } finally { await page.close(); }
});

test('self-hosted: a command\'s popup lists its registry row and every other document printing it, and those printing its name for another command apart', async () => {
  const elsewhere = (document, fields) => ({ document, name: 'AA-Answer', abbreviation: 'AAA', section: '4.2', page: 9, line: 40, code: 265, flags: ['PXY'], header: null, application: 16777223, scope: { name: 'Gmb', section: '4' }, ...fields });
  const transform = (path, data) => path !== 'data/commands.json' ? data : {
    ...data,
    commands: [...data.commands, elsewhere('29109-j00'), elsewhere('29153-j00', { name: 'AA-Answer-Renamed', section: '5.6.2', line: 50 }), elsewhere('29217-j00', { section: '5.6.1', line: 60, application: 1, scope: null, header: 1 })],
    registry: [{ document: '29217-j00', code: 265, name: 'AA-Request/Answer', abbreviation: 'AAR/AAA', section: '5.1', page: 12, line: 7, table: '5.1/1', defined: ['29061-6f0'] }],
  };
  const page = await boot({ hash: '#29061-6f0', mode: 'self-hosted', transform });
  try {
    const { document, window } = page;
    const popup = await popupOf(page, commandNames(document, '265 answer')[0]);
    assert.deepEqual(groupTitles(popup), ['Other definitions 2', 'Same name, other command 1']);
    assert.deepEqual(placeRows(popup, '.place-registry'), [['Registry:', 'TS 29.217 · 5.1 · table 5.1/1', 'Jump to', 'Show on the right']]);
    assert.deepEqual(placeRows(popup, '.popup-others .place-other'), [
      ['TS 29.109:', '4.2', 'Jump to', 'Show on the right'],
      ['TS 29.153:', '5.6.2 · AA-Answer-Renamed', 'Jump to', 'Show on the right'],
    ]);
    assert.deepEqual(placeRows(popup, '.popup-differing .place-differs'), [['≠ TS 29.217:', '5.6.1 · Application-ID 1', 'Jump to', 'Show on the right']]);
    assert.equal(popup.querySelector('.command-places').childElementCount > 0, true, 'in the one grid');
    assert.match(popup.querySelector('.place-other .view-action').getAttribute('href'), /^#29109-j00\/4\.2\?name=AA-Answer&line=40$/);
    popup.querySelector('.place-other .pane-action').click();
    await settle();
    assert.equal(new URL(frameSrc(document)).searchParams.get('file').endsWith('sources/29109-j00.pdf'), true, 'the other document in the pane');
    assert.deepEqual([paneAt(document).get('search'), paneAt(document).get('name')], ['4.2', 'AA-Answer']);
    click(page, popup.querySelector('.place-registry .view-action'));
    await settle();
    assert.equal(window.location.hash.split('?')[0], '#29217-j00/5.1');
    assert.equal(document.querySelector('.target-line').dataset.line, '7');
  } finally { await page.close(); }
});

test('a build with no command index still gives a command its block and partner, and loads it once', async () => {
  const page = await boot({ hash: '#29061-6f0', commands: false });
  try {
    const popup = await popupOf(page, commandNames(page.document, '275 request')[0]);
    assert.deepEqual(placeRows(popup, '.popup-place').map(cells => cells.slice(0, 2)), [['Definition:', '17.6.3'], ['Answer:', '17.6.4 · STA']]);
    await page.go('#29109-j00');
    assert.equal(page.fetched.filter(path => path === 'data/commands.json').length, 1);
  } finally { await page.close(); }
});

test('self-hosted: a result code\'s origin goes to its row there, the pane alone on a click and both on alt', async () => {
  const page = await boot({ hash: '#29283-j00', mode: 'self-hosted' });
  try {
    const { document, window } = page;
    const name = rowOf(document, 'DIAMETER_ERROR_USER_DATA_NOT_RECOGNIZED');
    const origin = [...name.closest('.dad-line').querySelectorAll('a')].find(node => node.textContent === 'TS29.329');
    assert.equal(origin.getAttribute('href'), '#29329-j10/6.2.2.1?name=DIAMETER_ERROR_USER_DATA_NOT_RECOGNIZED');
    assert.match(origin.className, /spec-ref/);
    const before = window.location.hash;
    click(page, origin);
    await settle();
    assert.equal(window.location.hash.split('?')[0], before.split('?')[0], 'the text stays where it is');
    const pane = new URL(frameSrc(document));
    assert.match(pane.searchParams.get('file'), /29329-j10\.pdf$/);
    const params = new URLSearchParams(pane.hash.slice(1));
    assert.deepEqual(Object.fromEntries(['search', 'name', 'row', 'titled', 'value', 'page'].map(key => [key, params.get(key)])), { search: '6.2.2.1', name: 'DIAMETER_ERROR_USER_DATA_NOT_RECOGNIZED', row: '1', titled: '1', value: '5100', page: '16' });
    click(page, origin, { altKey: true });
    await settle();
    assert.ok(window.location.hash.startsWith('#29329-j10/6.2.2.1?name=DIAMETER_ERROR_USER_DATA_NOT_RECOGNIZED&source=29329-j10&'));
    assert.ok(document.querySelector('.target-line').textContent.startsWith('DIAMETER_ERROR_USER_DATA_NOT_RECOGNIZED'), 'the view on its row there');
  } finally { await page.close(); }
});

test('a value\'s popup says the document defining it, both ways to its row there, or only its name where the corpus lacks it', async () => {
  const page = await boot({ hash: '#29283-j00', mode: 'self-hosted' });
  try {
    const { document } = page;
    rightClick(page, rowOf(document, 'DIAMETER_ERROR_USER_DATA_NOT_RECOGNIZED'));
    await settle();
    let popup = document.querySelector('.avp-popup');
    const origin = popup.querySelector('.place-origin');
    assert.equal(origin.querySelector('span').textContent, 'Defined in:');
    assert.equal(origin.querySelector('.place-where').textContent, 'TS 29.329 · 6.2.2.1');
    assert.match(origin.querySelector('a.view-action').getAttribute('href'), /^#29329-j10\/6\.2\.2\.1\?name=DIAMETER_ERROR_USER_DATA_NOT_RECOGNIZED&source=29329-j10&sourceSection=6\.2\.2\.1&/);
    assert.ok(origin.querySelector('.pane-action'));
    assert.equal(popup.querySelector('.usage-link[aria-current]').textContent, '5100 · DIAMETER_ERROR_USER_DATA_NOT_RECOGNIZED · from TS 29.329');
    origin.querySelector('.pane-action').click();
    await settle();
    assert.match(new URL(frameSrc(document)).searchParams.get('file'), /29329-j10\.pdf$/);
    rightClick(page, rowOf(document, 'DIAMETER_ERROR_USER_UNKNOWN'));
    await settle();
    popup = document.querySelector('.avp-popup');
    assert.equal(popup.querySelector('.place-origin'), null);
    assert.equal(popup.querySelector('.value-origin').textContent, 'Defined in TS29.229');
    assert.equal(popup.querySelector('.usage-link[aria-current]').textContent, '5001 · DIAMETER_ERROR_USER_UNKNOWN · from TS29.229');
  } finally { await page.close(); }
});

test('self-hosted: a row of a clause\'s stated origin is no row to find: its use goes to the clause, as its name\'s Details do', async () => {
  const page = await boot({ hash: '#29329-j10', mode: 'self-hosted' });
  try {
    const { document } = page;
    const pane = () => new URLSearchParams(new URL(frameSrc(document)).hash.slice(1));
    const line = [...document.querySelectorAll('.dad-line[data-section="6.3.9"]')].find(node => node.querySelector('[data-avp="Server-Name"]'));
    const name = line.querySelector('[data-avp="Server-Name"]');
    click(page, name);
    await settle();
    assert.deepEqual(Object.fromEntries(['search', 'page'].map(key => [key, pane().get(key)])), { search: '6.3.9', page: '21' }, 'the clause its table row points to');
    rightClick(page, name);
    await settle();
    const popup = document.querySelector('.avp-popup');
    assert.equal(popup.querySelector('.place-details .place-where').textContent, '6.3.9');
    popup.querySelector('.usage-link[aria-current]').click();
    await settle();
    assert.deepEqual(Object.fromEntries(['search', 'name', 'row', 'exact', 'page'].map(key => [key, pane().get(key)])), { search: '6.3.9', name: 'Server-Name', row: null, exact: '1', page: '21' }, 'the name in the clause\'s prose');
    const section = [...document.querySelectorAll('#diagnostic-sections li')].find(item => item.dataset.section === '6.3.9');
    assert.match(section.textContent, /Reused AVPs Server-Name/);
  } finally { await page.close(); }
});
