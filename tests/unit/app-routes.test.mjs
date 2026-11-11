// Routes, their titles and focus, what each fetches, and the index page.
import assert from 'node:assert/strict';
import test from 'node:test';
import { SCHEMA_VERSION } from '../../src/types.ts';
import { absent, boot, click, notSame, same } from './helpers.mjs';

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

test('the index lists releases newest first with pinned ones folded, and versions below', async () => {
  const documents = [
    ['a-18', '3GPP', 18, null],
    ['a-6', '3GPP', 6, 'Held for TS 29.210.'],
    ['a-11', '3GPP', 11, 'Held for TS 32.299.'],
    ['a-11b', '3GPP', 11, null],
    ['es1', 'ETSI', null, null],
    ['rfc1', 'IETF', null, null],
  ].map(([id, publisher, release, pinned]) => ({
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
    source: { kind: 'other', url: null, local: null, text: null },
  }));
  const page = await boot({ transform: (path, data) => (path === 'data/index.json' ? { ...data, documents } : data) });
  try {
    const { document } = page;
    absent(document.querySelector('main h1'));
    assert.match(
      document.querySelector('main').lastElementChild.textContent,
      /^Corpus 2026\.\d+\.\d+ · seanchai \d+\.\d+\.\d+ · public build$/,
    );
    absent(document.querySelector('.demo-badge'));
    assert.deepEqual(
      [...document.querySelectorAll('main section > h2, .pinned-release > summary')].map(node => node.textContent),
      [
        '3GPP · Release 18',
        '3GPP · Release 11',
        '3GPP · Release 11: 1 held for later citations',
        '3GPP · Release 6: 1 held for later citations',
        'IETF',
        'ETSI',
      ],
    );
    const folded = document.querySelectorAll('.pinned-release');
    assert.equal(folded[0].open, false);
    assert.equal(folded[1].querySelector('.doc-title p').textContent, 'Held for TS 29.210.');
    assert.equal(document.querySelectorAll('main tbody .doc-number a').length, documents.length);
  } finally {
    await page.close();
  }
});

test('an index row is number, interfaces and title, with what its heading says left out', async () => {
  const doc = (id, publisher, specification, reference, release, version, title, interfaces, pinned = null) => ({
    id,
    publisher,
    specification,
    reference,
    release,
    version,
    title,
    interfaces,
    pinned,
    path: `documents/${id}.json`,
    raw: null,
    source: { kind: 'other', url: null, local: null, text: null },
  });
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
  const page = await boot({ transform: (path, data) => (path === 'data/index.json' ? { ...data, documents } : data) });
  try {
    const { document } = page;
    const rows = [...document.querySelectorAll('main tbody tr')].map(row =>
      [...row.children].map(cell => cell.firstChild?.textContent ?? ''),
    );
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
    assert.deepEqual(
      [...row.querySelectorAll('a')].map(anchor => [anchor.getAttribute('href'), anchor.tabIndex]),
      [
        ['#29212-j10', 0],
        ['#29212-j10', -1],
      ],
    );
    const groups = [...document.querySelectorAll('.publisher-group')];
    assert.deepEqual(
      groups.map(group => [
        group.style.getPropertyValue('--number-width'),
        group.style.getPropertyValue('--interfaces-width'),
      ]),
      [
        ['6ch', '20ch'],
        ['8ch', '4ch'],
        ['17ch', '2ch'],
        ['17ch', '2ch'],
      ],
    );
  } finally {
    await page.close();
  }
});

test('the index says once what clicks on a name do', async () => {
  const page = await boot();
  try {
    assert.equal(
      [...page.document.querySelectorAll('main > .versions')].filter(
        node =>
          node.textContent ===
          'Click an AVP or command name to see its details or its definition in the source pane, alt-click to move the text there too, right-click to see where an AVP is used or where else a command is printed.',
      ).length,
      1,
    );
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
