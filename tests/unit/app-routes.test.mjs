// Routes, their titles and focus, what each fetches, and the index page.
import assert from 'node:assert/strict';
import test from 'node:test';
import { SCHEMA_VERSION } from '../../src/types.ts';
import { absent, boot, click, notSame, readFixture, same, settle } from './helpers.mjs';

test('an unknown document and an unsupported export say so, the second before any other fetch', async () => {
  const page = await boot({ hash: '#does-not-exist' });
  try {
    assert.equal(page.document.querySelector('main h1').textContent, 'Document not found');
    assert.equal(page.document.title, 'Document not found — Seanchaí');
  } finally {
    await page.close();
  }
  const old = await boot({ transform: (_path, data) => ({ ...data, schema_version: SCHEMA_VERSION + 1 }) });
  try {
    assert.match(
      old.document.querySelector('main').textContent,
      new RegExp(`Unsupported export schema ${SCHEMA_VERSION + 1}\\b`),
    );
    assert.deepEqual(old.fetched, ['data/index.json']);
  } finally {
    await old.close();
  }
});

test('search data is fetched on the search page only', async () => {
  const page = await boot();
  try {
    assert.ok(!page.fetched.includes('data/search.json'));
    await page.go('#29153-j00');
    assert.ok(!page.fetched.includes('data/search.json'));
    await page.go('#search?q=Sd');
    assert.ok(page.fetched.includes('data/search.json'));
  } finally {
    await page.close();
  }
});

const summary = (id, publisher, release, pinned = null, more = {}) => ({
  id,
  publisher,
  release,
  pinned,
  path: `documents/${id}.json`,
  raw: null,
  reference: id,
  specification: id,
  title: `Title ${id}`,
  version: null,
  interfaces: null,
  source: { kind: 'other', url: null, local: null, text: null },
  ...more,
});
const withDocuments = documents => (path, data) => (path === 'data/index.json' ? { ...data, documents } : data);
const tabsOf = (document, selector) =>
  [...document.querySelectorAll(`${selector} a`)].map(a => [
    a.firstChild.textContent,
    a.querySelector('.tab-count').textContent,
    a.getAttribute('href'),
    a.getAttribute('aria-current'),
  ]);
const rowIds = document => [...document.querySelectorAll('main tbody .doc-number a')].map(a => a.getAttribute('href'));

const tabbed = [
  summary('a-18', '3GPP', 18),
  summary('a-6', '3GPP', 6, 'Held for TS 29.210.', { specification: 'a' }),
  summary('a-11', '3GPP', 11, 'Held for TS 32.299.', { specification: 'a' }),
  summary('b-11', '3GPP', 11),
  summary('b-18', '3GPP', 18),
  summary('es1', 'ETSI', null),
  summary('rfc1', 'IETF', null),
  summary('rfc2', 'IETF', null),
  summary('mine', 'Private', null),
];

test('the index has a tab per publisher, and in one with releases a tab per release, newest first, then the older copies', async () => {
  const page = await boot({ transform: withDocuments(tabbed) });
  try {
    const { document } = page;
    absent(document.querySelector('main h1'));
    assert.equal(document.querySelectorAll('main .versions').length, 2, 'the status line and the hint, no footer');
    absent(document.querySelector('main footer'));
    absent(document.querySelector('.demo-badge'));
    assert.deepEqual(tabsOf(document, 'nav.index-tabs[aria-label="Publishers"]'), [
      ['3GPP', '2', '#', 'true'],
      ['IETF', '2', '#index/ietf', null],
      ['ETSI', '1', '#index/etsi', null],
      ['Private', '1', '#index/private', null],
    ]);
    assert.deepEqual(tabsOf(document, 'nav.release-tabs[aria-label="3GPP releases"]'), [
      ['Release 18', '2', '#', 'page'],
      ['Release 11', '1', '#index/3gpp/11', null],
      ['Older copies', '2', '#index/3gpp/older', null],
    ]);
    assert.equal(document.querySelector('main section h2').textContent, '3GPP · Release 18');
    assert.deepEqual(rowIds(document), ['#a-18', '#b-18'], "only the tab's documents");
    absent(document.querySelector('.tab-note'));
    absent(document.querySelector('details'), 'nothing folded');
    assert.equal(document.title, 'Seanchaí');

    await page.go('#index/3gpp/older');
    assert.equal(document.title, '3GPP · Older copies — Seanchaí');
    assert.deepEqual(
      tabsOf(document, '.release-tabs').map(tab => tab[3]),
      [null, null, 'page'],
    );
    assert.equal(document.querySelector('main section h2').textContent, '3GPP · Older copies');
    assert.deepEqual(rowIds(document), ['#a-11', '#a-6'], 'whatever their release, by number, newest first');
    assert.deepEqual(
      [...document.querySelectorAll('main tbody .doc-reason')].map(node => node.textContent),
      ['Release 11 · Held for TS 32.299.', 'Release 6 · Held for TS 29.210.'],
    );
    assert.match(document.querySelector('.tab-note').textContent, /^Older releases kept because/);

    await page.go('#index/ietf');
    assert.equal(document.title, 'IETF — Seanchaí');
    assert.deepEqual(
      tabsOf(document, '.index-tabs').map(tab => tab[3]),
      [null, 'page', null, null],
    );
    absent(document.querySelector('.release-tabs'), 'one release and no older copies: no second row');
    assert.deepEqual(rowIds(document), ['#rfc1', '#rfc2']);
    assert.deepEqual(
      [...document.querySelectorAll('main thead th')].map(th => th.textContent),
      ['Number', 'Interfaces', 'Title'],
      'no version column where nothing has a release',
    );

    await page.go('#index/Private');
    assert.deepEqual(rowIds(document), ['#mine'], 'a private publisher is a tab like any other, its name in any case');
    await page.go('#index/nobody/7');
    assert.deepEqual(rowIds(document), ['#a-18', '#b-18'], 'an unknown publisher is the first');
    await page.go('#index/3gpp/17');
    assert.deepEqual(rowIds(document), ['#a-18', '#b-18'], 'an unknown release the newest');
    assert.equal(document.title, 'Seanchaí');
  } finally {
    await page.close();
  }
});

test('a tab is a page of its own in the history, its link keeps the focus, and the header goes back to the last one', async () => {
  const page = await boot({ transform: withDocuments(tabbed) });
  try {
    const { document, window } = page;
    const length = window.history.length;
    const ietf = document.querySelector('.index-tabs a[href="#index/ietf"]');
    ietf.focus();
    click(page, ietf);
    await settle();
    assert.equal(window.location.hash, '#index/ietf');
    assert.equal(window.history.length, length + 1, 'a new entry, which Back returns from');
    same(document.activeElement, document.querySelector('.index-tabs a[href="#index/ietf"]'), 'the focus stays');
    assert.deepEqual(rowIds(document), ['#rfc1', '#rfc2']);
    assert.equal(window.localStorage.getItem('seanchai-index-tab'), 'ietf');
    const index = () => document.querySelector('header nav a');
    assert.equal(index().getAttribute('href'), '#index/ietf');
    assert.equal(index().getAttribute('aria-current'), 'page');

    click(page, document.querySelector('.index-tabs a[href="#"]'));
    await settle();
    click(page, document.querySelector('.release-tabs a[href="#index/3gpp/older"]'));
    await settle();
    assert.equal(window.location.hash, '#index/3gpp/older');
    assert.equal(window.localStorage.getItem('seanchai-index-tab'), '3gpp/older');
    click(page, document.querySelector('main tbody a'));
    await settle();
    assert.equal(window.location.hash, '#a-11');
    assert.equal(index().getAttribute('href'), '#index/3gpp/older', 'the header goes back to the tab left');
    assert.equal(index().getAttribute('aria-current'), null);
    click(page, index());
    await settle();
    assert.equal(window.location.hash, '#index/3gpp/older');
    assert.deepEqual(rowIds(document), ['#a-11', '#a-6']);
    same(document.activeElement, document.querySelector('main'), 'from another page, the focus goes to the page');

    await page.go('#index/ietf');
    assert.deepEqual(rowIds(document), ['#rfc1', '#rfc2'], 'Back and Forward, or an address, show their tab');
    await page.go('');
    assert.deepEqual(rowIds(document), ['#a-18', '#b-18'], 'the plain index is the first tab');
    assert.equal(window.localStorage.getItem('seanchai-index-tab'), '');
    assert.equal(index().getAttribute('href'), '#');
  } finally {
    await page.close();
  }
  const returning = await boot({
    hash: '#index/ietf',
    transform: withDocuments(tabbed),
    prepare: ({ window }) => window.localStorage.setItem('seanchai-index-tab', '3gpp/older'),
  });
  try {
    const { document } = returning;
    assert.deepEqual(rowIds(document), ['#rfc1', '#rfc2'], 'an address wins over the tab kept');
  } finally {
    await returning.close();
  }
  const kept = await boot({
    hash: '#29153-j00',
    prepare: ({ window }) => window.localStorage.setItem('seanchai-index-tab', 'ietf'),
  });
  try {
    assert.equal(
      kept.document.querySelector('header nav a').getAttribute('href'),
      '#index/ietf',
      'kept in the browser',
    );
  } finally {
    await kept.close();
  }
});

test('an index row is number, version, interfaces and title, every cell a link to its document with one stop for the keyboard', async () => {
  const doc = (id, publisher, specification, reference, release, version, title, interfaces, pinned = null) =>
    summary(id, publisher, release, pinned, { specification, reference, version, title, interfaces });
  const documents = [
    doc('29229-j10', '3GPP', '3GPP TS 29.229', 'TS29.229', 19, '19.1.0', 'Cx and Dx interfaces based on Diameter', [
      'Cx',
      'Dx',
    ]),
    doc('29212-j10', '3GPP', '3GPP TS 29.212', 'TS29.212', 19, '19.1.0', 'PCC', ['Gx', 'Gxx', 'Sd', 'St', 'S15']),
    doc(
      '29212-bj0',
      '3GPP',
      '3GPP TS 29.212',
      'TS29.212',
      11,
      '11.19.0',
      'PCC',
      ['Gx', 'Gxx', 'Sd', 'S15'],
      'Held for TS 32.299.',
    ),
    doc('29230-j30', '3GPP', '3GPP TS 29.230', 'TS29.230', 19, '19.3.0', 'Codes', []),
    doc('es283026-010600', 'ETSI', 'ETSI ES 283 026', 'ETSI-ES283.026', null, '1.6.0', 'TISPAN; Rq', ['Rq']),
    doc('es283026-010500', 'ETSI', 'ETSI ES 283 026', 'ETSI-ES283.026', null, '1.5.0', 'TISPAN; Rq', ['Rq']),
    doc('rfc6733', 'IETF', 'RFC 6733', 'RFC6733', null, null, 'RFC 6733', ['Base']),
    doc('xs0013-006-b_v1.0', '3GPP2', '3GPP2 X.S0013-006', '3GPP2-X.S0013-006', null, '1.0', 'Cx', ['Cx']),
  ];
  const page = await boot({ transform: withDocuments(documents) });
  try {
    const { document } = page;
    const rows = () =>
      [...document.querySelectorAll('main tbody tr')].map(row => [...row.children].map(cell => cell.textContent));
    const widths = () => {
      const group = document.querySelector('.publisher-group');
      return ['--number-width', '--version-width', '--interfaces-width'].map(name =>
        group.style.getPropertyValue(name),
      );
    };
    assert.deepEqual(rows(), [
      ['29.212', 'V19.1.0', 'Gx, Gxx, Sd, St, S15', 'PCC'],
      ['29.229', 'V19.1.0', 'Cx, Dx', 'Cx and Dx interfaces based on Diameter'],
      ['29.230', 'V19.3.0', '', 'Codes'],
    ]);
    assert.deepEqual(widths(), ['6ch', '8ch', '20ch'], "the widest of the publisher's in any tab");
    const row = document.querySelector('main tbody tr');
    assert.deepEqual(
      [...row.querySelectorAll('a')].map(anchor => [anchor.className, anchor.getAttribute('href'), anchor.tabIndex]),
      [['row-link', '#29212-j10', 0]],
      "one link, the number's, which reaches over the row under the other cells' text",
    );
    for (const cell of ['.doc-version', '.doc-interfaces', '.doc-title']) {
      await page.go('');
      click(page, document.querySelector(`main tbody tr ${cell} .cell-text`));
      await settle();
      assert.equal(page.window.location.hash, '#29212-j10', `a click on ${cell}'s text opens the document`);
    }

    await page.go('#index/3gpp/older');
    assert.deepEqual(rows(), [['29.212', 'V11.19.0', 'Gx, Gxx, Sd, S15', 'PCCRelease 11 · Held for TS 32.299.']]);
    assert.deepEqual(widths(), ['6ch', '8ch', '20ch'], 'as wide as in the other tabs');
    await page.go('#index/etsi');
    assert.deepEqual(rows(), [
      ['ES 283 026 V1.5.0', 'Rq', 'TISPAN; Rq'],
      ['ES 283 026', 'Rq', 'TISPAN; Rq'],
    ]);
    await page.go('#index/ietf');
    assert.deepEqual(rows(), [['RFC 6733', 'Base', '']]);
    await page.go('#index/3gpp2');
    assert.deepEqual(rows(), [['3GPP2 X.S0013-006', 'Cx', 'Cx']]);
  } finally {
    await page.close();
  }
});

test("a click ending a drag that selected a row's text leaves the selection, and does not open the document", async () => {
  const page = await boot();
  try {
    const { document, window } = page;
    const before = window.location.hash;
    const title = document.querySelector('main tbody .doc-title .cell-text');
    window.getSelection().selectAllChildren(title);
    title.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, clientX: 10, clientY: 5 }));
    click(page, title, { clientX: 90, clientY: 5 });
    await settle();
    assert.equal(window.location.hash, before);
    assert.ok(window.getSelection().toString().length > 0, 'the selection stays');
    title.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, clientX: 10, clientY: 5 }));
    click(page, title, { clientX: 10, clientY: 5, ctrlKey: false });
    await settle();
    assert.equal(
      window.location.hash,
      title.closest('tr').querySelector('.row-link').getAttribute('href'),
      'a click where it was pressed is not a drag, whatever is selected',
    );
  } finally {
    await page.close();
  }
});

test('the index opens with a search box, what the site is, its corpus and links, and once what a click does', async () => {
  const page = await boot();
  try {
    const { document, window } = page;
    const main = document.querySelector('main');
    const form = main.firstElementChild;
    assert.ok(form.matches('form.search-form[role="search"]'), 'the search box first');
    const input = form.querySelector('input');
    assert.equal(input.placeholder, 'Search AVP name, vendor:code, command, or interface');
    const intro = main.querySelector('.index-intro');
    assert.ok(intro.compareDocumentPosition(main.querySelector('.publisher-group')) & 4, 'above the list');
    assert.equal(
      intro.querySelector('p').textContent,
      'Diameter command and AVP definitions extracted from 3GPP specifications, RFCs and other documents, searchable and cross-linked to their sources. Unofficial, and not affiliated with any publisher.',
    );
    const { corpus_version: corpus } = await readFixture('index.json');
    const meta = intro.querySelectorAll('p')[1];
    assert.match(
      meta.textContent,
      new RegExp(
        `^Corpus ${corpus.replaceAll('.', '\\.')} · seanchai \\d+\\.\\d+\\.\\d+ · public build · GitHub · PyPI$`,
      ),
      'one line: what it was built from, and the project',
    );
    assert.deepEqual(
      [...meta.querySelectorAll('a')].map(a => a.href),
      ['https://github.com/sliva0/seanchai', 'https://pypi.org/project/seanchai/'],
    );
    const hint = 'Click a name to view it in the source pane, right-click for uses, or press ? for help.';
    assert.equal([...main.querySelectorAll('p')].filter(node => node.textContent === hint).length, 1);
    const headings = main.querySelector('.document-table thead');
    assert.ok(!headings.classList.contains('sr-only'), 'the column headings show');
    assert.deepEqual(
      [...headings.querySelectorAll('th')].map(th => th.textContent),
      ['Number', 'Version', 'Interfaces', 'Title'],
    );
    input.value = ' Session-Id ';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await settle();
    assert.equal(window.location.hash, '#search?q=Session-Id');
    assert.equal(document.querySelector('main .search-form input').value, 'Session-Id');
  } finally {
    await page.close();
  }
});

test('the versions an export leaves out are left out', async () => {
  const page = await boot({
    transform: (path, data) => (path === 'data/index.json' ? { ...data, corpus_version: null } : data),
  });
  try {
    assert.ok(!page.document.querySelector('.versions').textContent.includes('Corpus'));
  } finally {
    await page.close();
  }
});

test('each route sets its title and heading, and navigation moves focus', async () => {
  const page = await boot();
  try {
    const { document, window } = page;
    assert.equal(document.title, 'Seanchaí');
    notSame(document.activeElement, document.querySelector('main'), 'not on first load');
    await page.go('#29153-j00');
    assert.equal(document.title, 'TS 29.153 — Seanchaí');
    const heading = document.querySelector('main h1');
    assert.match(heading.textContent, /^3GPP TS 29\.153 V19\.0\.0 — /);
    same(document.activeElement, heading);
    await page.go('#29153-j00/5.1');
    same(document.activeElement, document.getElementById('section-5.1'));
    await page.go('#search');
    assert.equal(document.title, 'Search — Seanchaí');
    assert.equal(document.querySelector('main h1').textContent, 'Search');
    same(document.activeElement, document.querySelector('.search-form input'));
    await page.go('');
    same(document.activeElement, document.querySelector('main'));
    const skip = document.querySelector('.skip-link');
    same(document.querySelector('#app').firstElementChild, skip);
    await page.go('#29153-j00');
    const before = window.location.hash;
    click(page, skip);
    same(document.activeElement, document.querySelector('#document'));
    assert.equal(window.location.hash, before);
  } finally {
    await page.close();
  }
});
