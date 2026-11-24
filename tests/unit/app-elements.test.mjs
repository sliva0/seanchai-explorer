// Information Elements tables: what they say of a command's members, and the ways between a member and its row.
import assert from 'node:assert/strict';
import test from 'node:test';
import { memberPlaces } from '../../src/element-places.ts';
import { categoryNote, elementIndex, elementsTitle, memberMarks, tablesFor } from '../../src/elements.ts';
import { absent, boot, commandNames, elementsOfFixture, popupOf, present, readFixture } from './helpers.mjs';

const nameOn = (document, name, line) =>
  [...document.querySelectorAll('pre [data-avp]')].find(
    node => node.dataset.avp === name && node.closest('.dad-line').dataset.line === line,
  );
const lineAt = (document, line) => document.querySelector(`.dad-line[data-line="${line}"]`);
const texts = (popup, selector) => [...popup.querySelectorAll(selector)].map(node => node.textContent);
const jump = row => row.querySelector('.view-action').getAttribute('href');

test('the element index has a table once for each Message block it describes, in its document or another', async () => {
  const index = await elementsOfFixture();
  const udr = index.tables.find(table => table.document === '29328-j20' && table.command === 'User-Data-Request');
  assert.deepEqual(udr.message, {
    document: '29329-j10',
    section: '6.1.1',
    name: 'User-Data-Request',
    line: 10,
    ordinal: 0,
  });
  assert.equal(udr.table, '6.1.1.1');
  assert.deepEqual(udr.rows[0], {
    line: 17,
    name: 'User Identity (See 7.1)',
    avps: ['User-Identity'],
    either: false,
    printed: null,
    category: 'M',
    depth: 0,
    parents: [],
    members: [{ name: 'User-Identity', line: 24 }],
  });
  const result = index.tables.find(table => table.command === 'Data-Update-Answer').rows[0];
  assert.equal(result.either, true);
  assert.deepEqual(
    result.members.map(member => member.name),
    ['Result-Code', 'Experimental-Result'],
  );
  const tables = { ...(await readFixture('documents/29328-j20.json')), id: '29328-j20' };
  const commands = { ...(await readFixture('documents/29329-j10.json')), id: '29329-j10' };
  assert.ok(elementIndex([tables, commands], 3).tables.length > 0);
  const unlisted = { ...commands, blocks: commands.blocks.map(block => ({ ...block, described_by: undefined })) };
  assert.deepEqual(elementIndex([tables, unlisted], 3).tables, [], 'a block listing no table is described by none');
});

// TS 29.272's clause 7.2.9 prints IDR twice, for S6a's application id and S6d's, each described by its own table.
const IDR = { corrected: [174, 197], raw: [166, 189], member: 13 };

test('of two blocks of one command in a clause, each has the tables its described_by lists, in the raw view too', async () => {
  const index = await elementsOfFixture();
  const file = await readFixture('documents/29272-j60.json');
  const raw = await readFixture('documents/29272-j60.raw.json');
  const idr = index.tables.filter(table => table.command === 'Insert-Subscriber-Data-Request');
  assert.deepEqual(
    idr.map(({ table, message }) => [table, message.line, message.ordinal]),
    [
      ['5.2.2.1.1/1', 174, 0],
      ['5A.2.2.1.1/1', 197, 1],
    ],
  );
  const block = (from, line) => from.blocks.find(other => other.line === line);
  const said = (from, line) => tablesFor(index, '29272-j60', block(from, line), from).map(table => table.table);
  assert.deepEqual(said(file, IDR.corrected[0]), ['5.2.2.1.1/1']);
  assert.deepEqual(said(file, IDR.corrected[1]), ['5A.2.2.1.1/1']);
  assert.deepEqual(said(raw, IDR.raw[0]), ['5.2.2.1.1/1'], "a raw block by its place among its clause's");
  assert.deepEqual(said(raw, IDR.raw[1]), ['5A.2.2.1.1/1']);
  const byLine = tablesFor(index, '29272-j60', block(file, IDR.corrected[1]));
  assert.deepEqual(
    byLine.map(table => table.table),
    ['5A.2.2.1.1/1'],
    "without a file, a block of the corrected text by its line, as commands.json gives another document's",
  );
  const marked = (from, line) =>
    memberMarks(from, '29272-j60', index)
      .get(line)
      ?.elements.map(({ table }) => table.table);
  assert.deepEqual(marked(file, IDR.corrected[0] + IDR.member), ['5.2.2.1.1/1']);
  assert.deepEqual(marked(file, IDR.corrected[1] + IDR.member), ['5A.2.2.1.1/1']);
  assert.deepEqual(marked(raw, IDR.raw[1] + IDR.member), ['5A.2.2.1.1/1']);
  const s6d = idr.find(table => table.table === '5A.2.2.1.1/1');
  const members = memberPlaces(s6d, s6d.rows[0], file, { id: '29272-j60' });
  assert.ok(members.length > 0);
  for (const { place } of members) assert.ok(place.line > IDR.corrected[1], "the S6d block's member, not S6a's");
});

test('a clause of tables is titled by the commands they describe, and by the number or count of those naming none', () => {
  const table = (name, number) => ({
    type: 'Information Elements',
    section: '5',
    line: 0,
    last: 0,
    page: null,
    fields: { Table: number },
    ...(name ? { name } : {}),
  });
  const short = { 'Abc-Request': 'ABR', 'Abc-Answer': 'ABA' };
  const title = (...blocks) => elementsTitle({ lines: [], blocks }, '5', 'Information Elements', name => short[name]);
  assert.equal(title(table('Abc-Request', '5/1'), table('Abc-Answer', '5/2')), 'Information Elements ABR, ABA');
  assert.equal(title(table(null, '5/1')), 'Information Elements table 5/1');
  assert.equal(
    title(table(null, '5/1'), table(null, '5/2'), table('Abc-Request', '5/3')),
    'Information Elements ABR, 2 tables',
  );
  assert.equal(
    elementsTitle({ lines: [], blocks: [] }, '5', 'Message Abc', String),
    'Message Abc',
    'another title stays',
  );
});

test('a category is noted where it says what the brackets do not: a C, or one contradicting them as the linter reads them', () => {
  const member = (presence, min = 1) => ({ name: 'X', presence, min });
  const row = (category, either = false) => ({ table: { table: '1/1', section: '1' }, row: { category, either } });
  const kind = (presence, category, min) => categoryNote(member(presence, min), [row(category)])?.kind;
  assert.equal(kind('required', 'M'), undefined);
  assert.equal(kind('fixed', 'M'), undefined);
  assert.equal(kind('optional', 'O', 0), undefined);
  assert.equal(kind('optional', 'C', 0), 'conditional');
  assert.equal(kind('optional', 'M', 0), 'disagrees');
  assert.equal(kind('required', 'O'), 'disagrees');
  assert.equal(kind('fixed', 'C'), 'disagrees');
  assert.equal(kind('required', 'O', 0), undefined, 'a { } any number of times, none too, does not require it');
  assert.deepEqual(categoryNote(member('required'), [row('C')]).disagreements, [
    'ABNF brackets mark X as required, but table 1/1 lists it as C, conditional (element-required-in-abnf)',
  ]);
  assert.equal(categoryNote(member('optional', 0), [row('M', true)]), undefined, 'one of several AVPs');
  assert.equal(categoryNote(member('optional', 0), [row('M', true), row('C')])?.kind, 'conditional');
  assert.equal(categoryNote(member('optional', 0), [row(null)]), undefined);
});

test("a C member is marked with its category after its line, which the line's text leaves out; an M on { } or an O on [ ] is not", async () => {
  const page = await boot({ hash: '#29329-j10' });
  try {
    const { document } = page;
    const line = lineAt(document, '27');
    const mark = line.querySelector('.element-mark');
    present(mark);
    assert.equal(mark.dataset.category, 'C');
    assert.ok(!mark.classList.contains('element-disagrees'));
    assert.equal(mark.getAttribute('aria-hidden'), 'true');
    assert.equal(mark.title, 'C: conditional · Application Server Name (See 7.10) · table 6.1.1.1');
    assert.equal(mark.textContent, '', 'drawn by CSS, so a copy of the text leaves it');
    assert.equal(line.textContent, '        [ Server-Name ]                    ; bold\n', 'the text as it was');
    assert.equal(mark.nextSibling.textContent, '\n', 'before the newline, where it lies after the text');
    absent(lineAt(document, '24').querySelector('.line-mark'), '{ } says M already');
    absent(lineAt(document, '25').querySelector('.line-mark'), '[ ] says O already');
    absent(lineAt(document, '10').querySelector('.element-mark'), "the rule's head is no member");
  } finally {
    await page.close();
  }
});

test('a category its brackets contradict is marked as a disagreement, and a row offering one of several AVPs is not', async () => {
  const page = await boot({ hash: '#29283-j00' });
  try {
    const { document } = page;
    const mark = lineAt(document, '21').querySelector('.element-mark');
    present(mark);
    assert.equal(mark.dataset.category, 'M');
    assert.ok(mark.classList.contains('element-disagrees'));
    assert.equal(
      mark.title,
      [
        'M: mandatory · MC Service ID · table 6.2.1-1',
        'ABNF brackets mark User-Identifier as optional, but table 6.2.1-1 lists it as M, mandatory (element-optional-in-abnf)',
      ].join('\n'),
    );
    absent(lineAt(document, '23').querySelector('.line-mark'), 'an O on [ ]');
    absent(
      lineAt(document, '39').querySelector('.line-mark'),
      'Result, M, is one of Result-Code and Experimental-Result',
    );
  } finally {
    await page.close();
  }
});

test("a member's popup names its element and category, and goes to the row of another document's table", async () => {
  const page = await boot({ hash: '#29329-j10' });
  try {
    const popup = await popupOf(page, nameOn(page.document, 'User-Identity', '24'));
    assert.ok(texts(popup, '.popup-context p').includes('Element: User Identity (See 7.1) · M, mandatory'));
    const row = popup.querySelector('.place-element');
    present(row);
    assert.equal(row.querySelector('.place-cell').textContent, 'TS 29.328 · 6.1.1 · table 6.1.1.1');
    assert.equal(
      row.querySelector('.place-table a').getAttribute('href'),
      '#29328-j20/6.1.1?line=10',
      "the table a link to its block in another document's text, not loaded, through tables.json",
    );
    assert.match(jump(row), /^#29328-j20\/6\.1\.1\?/);
    const route = new URLSearchParams(jump(row).split('?')[1]);
    assert.equal(route.get('line'), '17');
    assert.equal(route.get('name'), 'User-Identity');
  } finally {
    await page.close();
  }
});

test("a table's row in a document that only prints the tables is a name, whose popup goes to the member", async () => {
  const page = await boot({ hash: '#29328-j20' });
  try {
    const { document } = page;
    const name = nameOn(document, 'User-Identity', '17');
    present(name, 'the export left it a link; the site makes it a name');
    const popup = await popupOf(page, name);
    assert.deepEqual(texts(popup, '.popup-context p'), [
      'Here: an element of User-Data-Request · table 6.1.1.1 · 6.1.1',
      'Element: User Identity (See 7.1) · M, mandatory',
    ]);
    const member = popup.querySelector('.place-member');
    assert.equal(member.querySelector('.place-where').textContent, 'TS 29.329 · 6.1.1 · User-Data-Request');
    const route = new URLSearchParams(jump(member).split('?')[1]);
    assert.match(jump(member), /^#29329-j10\/6\.1\.1\?/);
    assert.equal(route.get('line'), '24');
    const sections = texts(document, '.section-list li span:not(.section-page)');
    assert.ok(sections.includes('Information Elements UDR, UDA'), sections.join('\n'));
  } finally {
    await page.close();
  }
});

test("a row's either AVP and one the rule lacks say so, and in a document's own tables go to the member there", async () => {
  const page = await boot({ hash: '#29283-j00' });
  try {
    const { document } = page;
    const either = await popupOf(page, nameOn(document, 'Result-Code', '231'));
    assert.ok(
      texts(either, '.popup-context p').includes(
        'Element: Result · M, mandatory · one of Result-Code, Experimental-Result',
      ),
    );
    const member = either.querySelector('.place-member');
    assert.equal(member.querySelector('.place-where').textContent, '7.2.6 · Data-Update-Answer');
    assert.equal(new URLSearchParams(jump(member).split('?')[1]).get('line'), '88');
    const publisher = member.querySelector('a.place-where');
    present(publisher, "in this document, the publisher's copy at its page, which a public build's pane cannot show");
    assert.match(publisher.getAttribute('href'), /#page=\d+$/);
    const misspelled = await popupOf(page, nameOn(document, 'Result-Code', '208'));
    assert.equal(misspelled.querySelectorAll('.place-member').length, 1, 'Experimental_Result is no member');
    const category = lineAt(document, '231').querySelector('[class*="constant.language.category"]');
    present(category, "the grammar's scope for a row's category, which is no flag");
    assert.equal(category.textContent, 'M');
    absent(lineAt(document, '231').querySelector('[class*="avp-flag"]'));
  } finally {
    await page.close();
  }
});

test("a command's popup lists the tables describing it and each AVP's category", async () => {
  const page = await boot({ hash: '#29329-j10' });
  try {
    const popup = await popupOf(page, commandNames(page.document, '306 request')[0]);
    const rows = [...popup.querySelectorAll('.place-elements')];
    assert.deepEqual(
      rows.map(row => row.querySelector('.place-cell').textContent),
      ['TS 29.328 · 6.1.1 · table 6.1.1.1'],
    );
    const notes = texts(popup, '.popup-contents .fact-note');
    assert.ok(
      notes.some(note => note.endsWith('category M')),
      notes.join('\n'),
    );
  } finally {
    await page.close();
  }
});

test('without an element index the text has no marks and popups no elements', async () => {
  const page = await boot({ hash: '#29329-j10', elements: false });
  try {
    const { document } = page;
    absent(document.querySelector('.element-mark'));
    const popup = await popupOf(page, nameOn(document, 'User-Identity', '24'));
    absent(popup.querySelector('.place-element'));
  } finally {
    await page.close();
  }
});
