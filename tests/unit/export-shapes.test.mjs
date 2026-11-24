// What seanchai 067fae8's export writes that the site reads since: Information Elements tables naming their rows by
// their AVPs alone and setting rows off under a grouped AVP's, TS 32.299's categories, a table's ; Command-Section:,
// and value tables of the kind values; none of it may throw, and a kind the site does not know yet is named as written.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  categoryLabel,
  categoryNote,
  elementIndex,
  elementText,
  markElements,
  memberElements,
  rowParents,
} from '../../src/elements.ts';
import { valueKinds, valueRowLabel, valueTableTitle } from '../../src/values.ts';
import { boot, rightClick, settle } from './helpers.mjs';

const line = text => ({ tokens: [{ text: `${text}\n` }] });

/**
 * TS 32.299 table 6.4.2.1 as the export writes it, cut short: a Message block of CCR whose members are three AVPs, and
 * the block of its table, `; Columns: AVP Cat`, whose rows are set off under Subscription-Id and Requested-Service-Unit.
 */
function chargingFile() {
  const lines = [
    line('; Type: Message'),
    line('<CCR> ::= < Diameter Header: 272, REQ, PXY >'),
    line('    < Session-Id >'),
    line('    [ Subscription-Id ]'),
    line('    { CC-Time }'),
    line('    [ Requested-Service-Unit ]'),
    line(''),
    line('; Type: Information Elements'),
    line('; Command: Credit-Control-Request'),
    line('; Command-Section: 6.4.2'),
    line('; Section: 6.4.2'),
    line('; Table: 6.4.2.1'),
    line('; Columns: AVP Cat'),
    line('Session-Id                M'),
    line('Subscription-Id           OM'),
    line('    Subscription-Id-Type  M'),
    line('Requested-Service-Unit    -'),
    line('    CC-Time               -'),
    line('        Unit-Value        -'),
    line('CC-Time                   OC'),
  ];
  lines[8].tokens = [
    { text: '; Command: ' },
    { text: 'Credit-Control-Request', target: { document: '32299-j00', section: '6.4.2' } },
    { text: '\n' },
  ];
  const member = (name, at, presence, min) => ({ name, line: at, presence, min, max: 1 });
  const row = (at, avp, category, depth = 0) => ({
    line: at,
    name: null,
    cells: [avp, category],
    avps: [avp],
    category,
    ...(depth ? { depth } : {}),
  });
  return {
    id: '32299-j00',
    lines,
    blocks: [
      {
        type: 'Message',
        name: 'Credit-Control-Request',
        section: '6.4.2',
        page: 72,
        line: 0,
        last: 5,
        fields: { Section: '6.4.2' },
        rule: {
          name: 'Credit-Control-Request',
          line: 1,
          members: [
            member('Session-Id', 2, 'fixed', 1),
            member('Subscription-Id', 3, 'optional', 0),
            member('CC-Time', 4, 'required', 1),
            member('Requested-Service-Unit', 5, 'optional', 0),
          ],
        },
        described_by: [{ document: '32299-j00', section: '6.4.2', table: '6.4.2.1' }],
      },
      {
        type: 'Information Elements',
        name: 'Credit-Control-Request',
        section: '6.4.2',
        page: 72,
        line: 7,
        last: 19,
        columns: ['AVP', 'Cat'],
        fields: { Command: 'Credit-Control-Request', 'Command-Section': '6.4.2', Section: '6.4.2', Table: '6.4.2.1' },
        element_rows: [
          row(13, 'Session-Id', 'M'),
          row(14, 'Subscription-Id', 'OM'),
          row(15, 'Subscription-Id-Type', 'M', 1),
          row(16, 'Requested-Service-Unit', '-'),
          row(17, 'CC-Time', '-', 1),
          row(18, 'Unit-Value', '-', 2),
          row(19, 'CC-Time', 'OC'),
        ],
      },
    ],
  };
}

test("a row's parents are the grouped AVP rows it is set off under, a misprinted level under the nearest", () => {
  const rows = [0, 1, 2, 1, 0, 2, 0].map((depth, at) => ({ avps: [`A${at}`], cells: [`A${at}`], depth }));
  assert.deepEqual(rowParents(rows), [[], ['A0'], ['A0', 'A1'], ['A0'], [], ['A4'], []]);
});

test('a table of AVPs alone keeps each row its depth and parents, and maps a member only from its own level', () => {
  const file = chargingFile();
  const [table] = elementIndex([file], 3).tables;
  assert.equal(table.command, 'Credit-Control-Request');
  const shown = table.rows.map(row => [
    row.name,
    row.avps[0],
    row.category,
    row.depth,
    row.parents.join('>'),
    row.members.length,
  ]);
  assert.deepEqual(shown, [
    [null, 'Session-Id', 'M', 0, '', 1],
    [null, 'Subscription-Id', 'OM', 0, '', 1],
    [null, 'Subscription-Id-Type', 'M', 1, 'Subscription-Id', 0],
    [null, 'Requested-Service-Unit', '-', 0, '', 1],
    [null, 'CC-Time', '-', 1, 'Requested-Service-Unit', 0],
    [null, 'Unit-Value', '-', 2, 'Requested-Service-Unit>CC-Time', 0],
    [null, 'CC-Time', 'OC', 0, '', 1],
  ]);
  const ccTime = memberElements([table], 'CC-Time');
  assert.deepEqual(
    ccTime.map(({ row }) => row.category),
    ['OC'],
    "the command's CC-Time is the top-level row's, not Requested-Service-Unit's member",
  );
  assert.equal(elementText(table.rows[2]), 'M, mandatory', 'a row naming no element is its category alone');
});

test("TS 32.299's categories: OM and OC say what brackets cannot, and contradict them as the linter reads them", () => {
  const member = (presence, min = presence === 'optional' ? 0 : 1) => ({ name: 'X', presence, min });
  const row = category => ({ table: { table: '6.4.2.1', section: '6.4.2' }, row: { category, either: false } });
  const note = (presence, category) => categoryNote(member(presence), [row(category)]);
  assert.equal(note('optional', 'O'), undefined);
  assert.equal(note('required', 'M'), undefined);
  assert.equal(note('optional', 'OC').kind, 'conditional');
  assert.equal(note('optional', 'OM').kind, 'conditional');
  assert.deepEqual(note('required', 'OC').disagreements, [
    'ABNF brackets mark X as required, but table 6.4.2.1 lists it as OC, conditional where the operator provisions it (element-required-in-abnf)',
  ]);
  assert.equal(note('fixed', 'OM').kind, 'disagrees', 'an OM on < > is element-required-in-abnf too');
  assert.deepEqual(note('optional', '-').disagreements, [
    'The ABNF holds X, but table 6.4.2.1 marks it not used (element-unused-in-abnf)',
  ]);
  const struck = { ...member('optional'), struck: true };
  assert.equal(
    categoryNote(struck, [row('-')]),
    undefined,
    'a member struck out agrees with a dash, and its line says so',
  );
  assert.equal(categoryLabel('-'), 'not used');
  assert.equal(categoryLabel('OM'), 'OM, mandatory where the operator provisions it');
});

test("an AVP-only row's AVP is a name past its indent, and ; Command-Section: links to its clause", () => {
  const file = chargingFile();
  markElements(file);
  const avpOf = at => file.lines[at].tokens.find(token => token.avp);
  assert.equal(avpOf(13).text, 'Session-Id');
  assert.equal(avpOf(15).text, 'Subscription-Id-Type', 'past the four spaces of its level');
  assert.equal(avpOf(18).text, 'Unit-Value');
  assert.deepEqual(file.lines[9].tokens, [
    { text: '; Command-Section: ' },
    { text: '6.4.2', target: { document: '32299-j00', section: '6.4.2' } },
    { text: '\n' },
  ]);
});

test('a value table of the kind values is titled so, and a kind the site does not know yet by its own name', () => {
  assert.ok(valueKinds.some(entry => entry.kind === 'values' && entry.title === 'Values'));
  assert.equal(valueRowLabel('values'), 'Value');
  const table = { kind: 'values', featureListId: null, application: null };
  assert.equal(valueTableTitle(table), 'Values');
  assert.equal(valueTableTitle({ ...table, kind: 'novel' }), 'novel', 'no throw on a newer kind');
});

test("TS 29.272's Group-Service-Id values: its clause lists the table, and a value's popup names it", async () => {
  const page = await boot({ hash: '#29272-j60/7.3.190' });
  try {
    const { document } = page;
    const entry = document.querySelector('.section-list li[data-section="7.3.190"]');
    assert.match(entry.textContent, / · Values \(2\) p\. 161$/);
    const name = [...document.querySelectorAll('pre a.value-name')].find(node =>
      node.textContent.includes('Group specific NAS level congestion control'),
    );
    rightClick(page, name);
    await settle();
    assert.match(document.querySelector('.avp-popup').textContent, /Value 1 of Group-Service-Id/);
  } finally {
    await page.close();
  }
});

test('a document with a value table of a kind the site does not know is still drawn', async () => {
  const page = await boot({
    hash: '#29272-j60',
    transform: (path, data) =>
      path === 'data/documents/29272-j60.json'
        ? {
            ...data,
            blocks: data.blocks.map(block =>
              block.type === 'Value Table' && block.value_kind === 'values' ? { ...block, value_kind: 'novel' } : block,
            ),
          }
        : data,
  });
  try {
    assert.ok(page.document.querySelector('#document'));
    assert.equal(page.document.querySelector('main .failure'), null);
    assert.match(
      page.document.querySelector('.section-list li[data-section="7.3.190"]').textContent,
      / · novel \(2\) p\. 161$/,
    );
  } finally {
    await page.close();
  }
});
