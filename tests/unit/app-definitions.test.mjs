// An AVP another document defines: where it is declared, each place one click away, and the way to its definition
// there, followed through the documents reusing it, by the popup, an alt-click and its row's From cell. TS 29.272 reuses
// Communication-Pattern-Set from TS 29.336 in table 7.3.1/2 and prints its own Grouped rule in 7.3.194; the fixture
// holds no TS 29.336, so a test that needs it serves a stand-in of its AVP table and clause.
import assert from 'node:assert/strict';
import test from 'node:test';
import { followOrigin } from '../../src/avp-places.ts';
import { standIn, standInSummary } from '../fixtures/stand-in-29336.mjs';
import { absent, boot, click, factText, popupOf, present, readFixture, rightClick, settle } from './helpers.mjs';

const AVP = 'Communication-Pattern-Set';
/** TS 29.272's lines: its Reused AVPs row, and the head of its Grouped rule in 7.3.194. */
const ROW = '939';
const RULE = '4146';

const at = (document, line, name = AVP) =>
  [...document.querySelectorAll(`.dad-line[data-line="${line}"] [data-avp]`)].find(node => node.dataset.avp === name);
const places = popup =>
  [...popup.querySelectorAll('.popup-places > .popup-place')].map(row =>
    [...row.children].slice(0, 2).map(node => node.textContent),
  );

/** Boots TS 29.272 with TS 29.336 in the build as the stand-in, its summary in the index beside the fixture's. */
async function withDefiningDocument(options) {
  const index = await readFixture('index.json');
  const doc = standIn(index);
  const summary = standInSummary(index);
  return boot({
    ...options,
    transform: (path, data) =>
      path === 'data/index.json'
        ? { ...data, documents: [...data.documents, { ...summary, interfaces: ['S6m'] }] }
        : data,
    serve: path =>
      path === 'data/documents/29336-j10.json'
        ? { ok: true, status: 200, statusText: 'OK', headers: new Map(), json: async () => structuredClone(doc) }
        : undefined,
  });
}

test('a reused row follows its From to the definition, through a document reusing it in turn, and stops at a loop', () => {
  const row = (document, from) => ({
    id: document,
    lines: [
      {
        tokens: [
          { avp: 'X', source: { section: '1', row: true }, target: { document, section: '2' }, text: 'X' },
          { text: ' ' },
          ...(from ? [{ text: from.text, target: { document: from.document, section: '9', name: 'X' } }] : []),
        ],
      },
    ],
    blocks: [
      {
        type: from ? 'Reused AVPs' : 'AVP Table',
        section: '1',
        line: 0,
        last: 0,
        columns: from ? ['Name', 'From'] : ['Name', 'Code'],
        fields: {},
        rows: [{ line: 0, name: 'X', cells: from ? ['X', from.text] : ['X', '7'], code: from ? null : 7 }],
      },
    ],
  });
  const files = {
    a: row('a', { document: 'b', text: 'TS2' }),
    b: row('b', { document: 'c', text: 'TS3' }),
    c: row('c'),
  };
  const resolve = (held = files) => ({
    held: id => held[id],
    known: id => id in files,
    edition: reference => (reference === 'TS3' ? 'c' : undefined),
  });
  assert.deepEqual(followOrigin({ document: 'b', section: '9' }, 'X', resolve()), {
    place: { document: 'c', target: { document: 'c', section: '9', name: 'X' } },
  });
  assert.deepEqual(
    followOrigin({ document: 'b', section: '9' }, 'X', resolve({ a: files.a })),
    { place: { document: 'b', target: { document: 'b', section: '9', name: 'X' } }, pending: 'b' },
    'as far as the documents loaded go, and the one to load next',
  );
  const loop = { a: files.a, b: row('b', { document: 'a', text: 'TS1' }) };
  assert.equal(followOrigin({ document: 'a', section: '9' }, 'X', resolve(loop)).place.document, 'a', 'no loop');
  assert.deepEqual(followOrigin({ document: 'z', section: '9' }, 'X', resolve(), 'TS9'), { missing: 'TS9' });
  assert.equal(
    followOrigin({ document: 'z', section: '9' }, 'X', resolve(), 'TS3').place.document,
    'c',
    'another edition of the reference where the build lacks the one linked',
  );
});

test("a reused AVP's popup lists where it is declared, each one click away, and says a definition the build lacks", async () => {
  const page = await boot({ hash: '#29272-j60/7.3.1' });
  try {
    const { document } = page;
    let popup = await popupOf(page, at(document, ROW));
    assert.match(popup.querySelector('.popup-context p').textContent, /^Here: a row of Reused AVPs 7\.3\.1\/2/);
    assert.deepEqual(places(popup), [
      ['Definition:', 'TS 29.336, which this build does not hold'],
      ['Rule:', '7.3.194'],
    ]);
    absent(popup.querySelector('.place-definition a'), 'no dead control');
    assert.ok(popup.querySelector('.popup-contents'), 'its members, which the row does not print');
    popup.querySelector('.popup-title button').click();
    popup = await popupOf(page, at(document, RULE));
    assert.match(popup.querySelector('.popup-context p').textContent, /^Here: rule for Grouped AVP/);
    // Its Reused row is a row the popup shows: that row's title says so and goes there, no place repeating it.
    assert.deepEqual(places(popup), [['Definition:', 'TS 29.336, which this build does not hold']]);
    absent(popup.querySelector('.popup-contents'), 'its members are printed under its head');
    const reused = [...popup.querySelectorAll('.popup-row-title')].find(title =>
      title.textContent.includes('· Reused'),
    );
    present(reused);
    assert.match(reused.querySelector('a.claim-where').getAttribute('href'), /&line=939$/);
  } finally {
    await page.close();
  }
});

test('with the defining document in the build, its definition is one click from the row, the rule and the From cell, and Back returns', async () => {
  const page = await withDefiningDocument({ hash: '#29272-j60/7.3.1', mode: 'self-hosted' });
  try {
    const { document, window } = page;
    rightClick(page, at(document, ROW));
    await settle();
    await settle();
    let popup = document.querySelector('.avp-popup');
    assert.deepEqual(places(popup)[0], ['Definition:', 'TS 29.336 · 8.4.26']);
    assert.match(
      popup.querySelector('.place-definition .view-action').getAttribute('href'),
      /^#29336-j10\/8\.4\.26\?name=Communication-Pattern-Set/,
    );
    assert.deepEqual(
      [...popup.querySelectorAll('.popup-row-title')].map(factText),
      ['AVP Table 8.4.1/1 · TS 29.336'],
      "the definition's row, its flags and code, under the one-line form of the row opened on",
    );
    assert.match(
      popup.querySelector('.popup-row-title a.claim-where').getAttribute('href'),
      /^#29336-j10\/8\.4\.1\?/,
      'its table a link to the row there',
    );
    popup.querySelector('.popup-title button').click();
    // Alt on the rule, which is its Details here, goes to the definition there; Back comes back to the rule.
    click(page, at(document, RULE), { altKey: true });
    await settle();
    assert.match(window.location.hash, /^#29336-j10\/8\.4\.26\?name=Communication-Pattern-Set/);
    window.history.back();
    await settle();
    assert.match(window.location.hash, /^#29272-j60/);
    // Alt on the row goes to its Details here, the rule; its From cell to the definition there.
    click(page, at(document, ROW), { altKey: true });
    await settle();
    assert.match(window.location.hash, /^#29272-j60\/7\.3\.194/);
    const from = [...document.querySelectorAll(`.dad-line[data-line="${ROW}"] a`)].find(
      node => node.textContent === 'TS29.336',
    );
    assert.match(from.getAttribute('href'), /^#29336-j10\/8\.4\.26\?name=Communication-Pattern-Set/);
  } finally {
    await page.close();
  }
});
