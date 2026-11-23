// Information Elements tables: what they say of a command's members, and the ways between a member and its row.
import assert from 'node:assert/strict';
import test from 'node:test';
import { elementIndex, elementsTitle } from '../../src/elements.ts';
import { absent, boot, commandNames, elementsOfFixture, popupOf, present, readFixture, settle } from './helpers.mjs';

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
  assert.deepEqual(udr.message, { document: '29329-j10', section: '6.1.1', name: 'User-Data-Request', line: 10 });
  assert.equal(udr.table, '6.1.1.1');
  assert.deepEqual(udr.rows[0], {
    line: 17,
    name: 'User Identity (See 7.1)',
    avps: ['User-Identity'],
    either: false,
    printed: null,
    category: 'M',
    members: [{ name: 'User-Identity', line: 24 }],
  });
  const result = index.tables.find(table => table.command === 'Data-Update-Answer').rows[0];
  assert.equal(result.either, true);
  assert.deepEqual(
    result.members.map(member => member.name),
    ['Result-Code', 'Experimental-Result'],
  );
  const doc = await readFixture('documents/29328-j20.json');
  const named = { ...doc, blocks: doc.blocks.map(block => ({ ...block, described: [] })) };
  assert.deepEqual(elementIndex([named], 3).tables, [], 'a table the export finds no command for describes none');
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

test("a member a table describes is marked with its category after its line, which the line's text leaves out", async () => {
  const page = await boot({ hash: '#29329-j10' });
  try {
    const { document } = page;
    const line = lineAt(document, '24');
    const mark = line.querySelector('.element-mark');
    present(mark);
    assert.equal(mark.dataset.category, 'M');
    assert.equal(mark.getAttribute('aria-hidden'), 'true');
    assert.equal(mark.title, 'M: mandatory · User Identity (See 7.1) · table 6.1.1.1');
    assert.equal(mark.textContent, '', 'drawn by CSS, so a copy of the text leaves it');
    assert.equal(line.textContent, '        { User-Identity }                  ; bold\n', 'the text as it was');
    assert.equal(mark.nextSibling.textContent, '\n', 'before the newline, where it lies after the text');
    absent(lineAt(document, '10').querySelector('.element-mark'), "the rule's head is no member");
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
    assert.equal(row.querySelector('.place-where').textContent, 'TS 29.328 · 6.1.1 · table 6.1.1.1');
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
    assert.ok(lineAt(document, '231').classList.contains('element-row'), "its category takes no flag's colour");
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
      rows.map(row => row.querySelector('.place-where').textContent),
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

test('a schema-2 export, which the pinned release writes, is read', async () => {
  const page = await boot({
    hash: '#29329-j10',
    transform: (_path, data) => (typeof data === 'object' ? { ...data, schema_version: 2 } : data),
  });
  try {
    await settle();
    present(page.document.querySelector('.dad-line'));
  } finally {
    await page.close();
  }
});
