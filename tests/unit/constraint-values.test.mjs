// The values an interpreted rule names, linked to their rows; a block's ; Command: to its print; the newer codecs.
import assert from 'node:assert/strict';
import test from 'node:test';
import { constraintBlocks, markConstraints, namedValues, ruleNote, ruleWords } from '../../src/constraints.ts';
import { interpretedCount, tableIndex } from '../../src/tables.ts';
import { enumeratedTables, namedValueRow, valueRowAt } from '../../src/values.ts';
import { readFixture } from './helpers.mjs';

const words = (rule, printed = '') => ruleWords({ line: 0, ...rule }, printed);
const line = text => ({ tokens: [{ text: `${text}\n` }] });
const lineText = ({ tokens }) => tokens.map(token => token.text).join('');

/**
 * A file printing CC-Request for two applications, as TS 29.212 does for Gx and Gxx, an Enumerated AVP with names
 * beginning with a digit, holding parentheses or of digits only, a bit table, and blocks whose rules name them.
 */
function fixture() {
  const lines = [
    '; Type: Message',
    'CC-Request ::= < Diameter Header: 272, REQ, PXY >',
    '; Type: Message',
    'CC-Request ::= < Diameter Header: 272, REQ, PXY >',
    '; Type: Enumerated AVP',
    '        SGSN_CHANGE                       = 0',
    '        "H(E)NB_LOCAL_IP_ADDRESS_CHANGE"  = 44',
    '        3GPP_PS_DATA_OFF_CHANGE           = 55',
    '        "16"                              = 4',
    '; Type: Value Table',
    '0      "Alpha"',
    '; Type: Interpreted Constraints',
    '; Command: CC-Request',
    '    present-if Event-Trigger = "H(E)NB_LOCAL_IP_ADDRESS_CHANGE" and not Other',
    '    present-if Event-Trigger = 3GPP_PS_DATA_OFF_CHANGE or Event-Trigger = "16" or Event-Trigger = 16 or Result-Code = DIAMETER_SUCCESS or Flags bit "Alpha"',
    '; Type: Interpreted Constraints',
    '    default SGSN_CHANGE',
    '    present-if Unread = SGSN_CHANGE',
  ].map(line);
  const message = (at, section, application) => ({
    type: 'Message',
    name: 'CC-Request',
    line: at,
    last: at + 1,
    section,
    page: 1,
    fields: {},
    command: { application_id: application, request: true },
  });
  const condition = (path, value) => ({ path: [path], value });
  return {
    id: 'x',
    lines,
    blocks: [
      message(0, '5.6.2', 1),
      message(2, '5a.6.2', 2),
      {
        type: 'Enumerated AVP',
        name: 'Event-Trigger',
        avp: { code: 1006, vendor_id: 10415 },
        line: 4,
        last: 8,
        section: '5.3.7',
        page: 131,
        fields: {},
        values: [
          { kind: 'value', first: 0, last: 0, line: 5, name: 'SGSN_CHANGE' },
          { kind: 'value', first: 44, last: 44, line: 6, name: 'H(E)NB_LOCAL_IP_ADDRESS_CHANGE' },
          { kind: 'value', first: 55, last: 55, line: 7, name: '3GPP_PS_DATA_OFF_CHANGE' },
          { kind: 'value', first: 4, last: 4, line: 8, name: '16' },
          { kind: 'reserved', first: 5, last: 9, line: 8 },
        ],
      },
      {
        type: 'Value Table',
        name: 'Flags',
        value_kind: 'bits',
        line: 9,
        last: 10,
        section: '5.3.9',
        page: 132,
        fields: {},
        value_rows: [{ name: 'Alpha', value: 0, line: 10 }],
      },
      {
        type: 'Interpreted Constraints',
        interpreted: true,
        name: 'UDP-Source-Port',
        line: 11,
        last: 14,
        section: '5.3.7',
        page: 131,
        fields: { AVP: 'UDP-Source-Port', Command: 'CC-Request', 'Application-ID': '2' },
        readings: [
          {
            quotes: [],
            rules: [
              {
                kind: 'present-if',
                line: 13,
                conditions: [
                  [condition('Event-Trigger', 'H(E)NB_LOCAL_IP_ADDRESS_CHANGE'), { path: ['Other'], negated: true }],
                ],
              },
              {
                kind: 'present-if',
                line: 14,
                conditions: [
                  [condition('Event-Trigger', '3GPP_PS_DATA_OFF_CHANGE')],
                  [condition('Event-Trigger', '16')],
                  [condition('Event-Trigger', 16)],
                  [condition('Result-Code', 'DIAMETER_SUCCESS')],
                  [{ path: ['Flags'], bit: 'Alpha' }],
                ],
              },
            ],
          },
        ],
      },
      {
        type: 'Interpreted Constraints',
        interpreted: true,
        name: 'Event-Trigger',
        line: 15,
        last: 17,
        section: '5.3.7',
        page: 131,
        fields: { AVP: 'Event-Trigger' },
        readings: [
          {
            quotes: [],
            rules: [
              { kind: 'default', line: 16, value: 'SGSN_CHANGE' },
              { kind: 'present-if', line: 17, conditions: [[condition('Unread', 'SGSN_CHANGE')]] },
            ],
          },
        ],
      },
    ],
  };
}

test('an Enumerated AVP block gives its names as rows a rule links to, a range of numbers none', () => {
  const file = fixture();
  const [table] = enumeratedTables(file);
  assert.deepEqual(table.avp, { name: 'Event-Trigger', target: { document: 'x', section: '5.3.7' } });
  assert.deepEqual(
    table.rows.map(row => [row.name, row.value, row.line]),
    [
      ['SGSN_CHANGE', 0, 5],
      ['H(E)NB_LOCAL_IP_ADDRESS_CHANGE', 44, 6],
      ['3GPP_PS_DATA_OFF_CHANGE', 55, 7],
      ['16', 4, 8],
    ],
  );
  assert.deepEqual(table.rows[1].position, {
    section: '5.3.7',
    page: 131,
    name: 'H(E)NB_LOCAL_IP_ADDRESS_CHANGE',
    row: true,
    value: 44,
  });
  assert.equal(valueRowAt(file, '5.3.7', 'H(E)NB_LOCAL_IP_ADDRESS_CHANGE')?.line, 6, 'a link finds it');
  assert.equal(valueRowAt(file, '5.3.9', 'Alpha')?.line, 10, "a value table's row as before");
  assert.equal(namedValueRow(file, 'Event-Trigger', '16', false)?.value, 4);
  assert.equal(namedValueRow(file, 'Event-Trigger', '16', true), undefined, 'no bit of that name');
  assert.equal(namedValueRow(file, 'Flags', 'Alpha', true)?.value, 0);
  assert.equal(namedValueRow(file, 'Result-Code', 'DIAMETER_SUCCESS', false), undefined, "another document's");
});

test("a rule's values link to their rows, quoted, bare, beginning with a digit or of digits only; a number is none", () => {
  const file = fixture();
  markConstraints(file);
  const before = fixture().lines.map(lineText);
  assert.deepEqual(file.lines.map(lineText), before, 'the text as it was');
  const valued = at => file.lines[at].tokens.filter(token => token.valueRow);
  assert.deepEqual(
    valued(13).map(token => [token.text, token.valueRow.value, token.target]),
    [
      [
        'H(E)NB_LOCAL_IP_ADDRESS_CHANGE',
        44,
        { document: 'x', section: '5.3.7', name: 'H(E)NB_LOCAL_IP_ADDRESS_CHANGE' },
      ],
    ],
    'the name inside its quotes',
  );
  assert.equal(valued(13)[0].source.value, 44, 'found in the source as its row is');
  assert.deepEqual(
    valued(14).map(token => [token.text, token.valueRow.value, token.valueRow.table.kind]),
    [
      ['3GPP_PS_DATA_OFF_CHANGE', 55, 'values'],
      ['16', 4, 'values'],
      ['Alpha', 0, 'bits'],
    ],
    'the number 16 and the result code the file does not define left as text',
  );
  assert.ok(
    file.lines[14].tokens.some(token => token.text.includes(' = 16 or ')),
    'the number stays in its text',
  );
  assert.deepEqual(
    valued(16).map(token => token.valueRow.name),
    ['SGSN_CHANGE'],
    "a default's value, of the block's own AVP",
  );
  assert.deepEqual(valued(17), [], 'a value of an AVP the file gives no values');
  markConstraints(file);
  assert.equal(valued(14).length, 3, 'marked once');
});

test('the values a rule names are listed in the order its line prints them, and a shape the site does not know is none', () => {
  assert.deepEqual(
    namedValues(
      {
        kind: 'values',
        values: [1, 'A'],
        conditions: [
          [
            { path: ['G', 'M'], value: 'B' },
            { path: ['F'], bit: 'C' },
            { path: ['N'], value: 3 },
          ],
        ],
      },
      'Own',
    ),
    [
      { avp: 'Own', name: 'A', bit: false },
      { avp: 'M', name: 'B', bit: false },
      { avp: 'F', name: 'C', bit: true },
    ],
  );
  assert.deepEqual(namedValues({ kind: 'bits', bits: [1, 'Two'], relation: 'set' }, 'Own'), [
    { avp: 'Own', name: 'Two', bit: true },
  ]);
  for (const rule of [
    { kind: 'values', values: [{}], conditions: 'x' },
    { kind: 'bits', bits: null },
    { kind: 'default', value: { name: 'x' } },
    { kind: 'present-if', conditions: [[{ path: ['A'], value: { root: 'request', path: ['A'] } }]] },
    { kind: 'future', values: 'A' },
  ])
    assert.deepEqual(namedValues(rule, 'Own'), [], JSON.stringify(rule));
});

test("a block's ; Command: links to the print its application scopes it to, where the export gave it no link", () => {
  const file = fixture();
  markConstraints(file);
  assert.deepEqual(file.lines[12].tokens, [
    { text: '; Command: ' },
    { text: 'CC-Request', target: { document: 'x', section: '5a.6.2' } },
    { text: '\n' },
  ]);
  const scoped = constraintBlocks(file)[0];
  assert.equal(scoped.scope.application, 2);
});

test("a block's ; Command: the export links to another print of the command goes to the print it is scoped to", async () => {
  const doc = { ...(await readFixture('documents/29273-j20.json')), id: '29273-j20' };
  markConstraints(doc);
  for (const item of constraintBlocks(doc).filter(item => item.scope.command)) {
    const linked = doc.lines
      .slice(item.block.line, item.block.last + 1)
      .flatMap(line => line.tokens)
      .filter(token => token.target && token.text === item.scope.command);
    assert.equal(linked.length, 1, `${item.avp} at ${item.block.line}`);
    const print = doc.blocks.find(
      block =>
        block.type === 'Message' && block.section === linked[0].target.section && block.name === item.scope.command,
    );
    assert.ok(print, `${item.avp} at ${item.block.line} links a print of its command`);
    if (item.scope.application !== undefined) assert.equal(print.command.application_id, item.scope.application);
    if (item.scope.commandSection) assert.equal(print.section, item.scope.commandSection);
  }
});

test('a value of digits only is quoted in words, as it would read as a number; a number is not', () => {
  const said = value => words({ kind: 'present-if', conditions: [[{ path: ['Report-Amount'], value }]] });
  assert.equal(said('16'), 'present if Report-Amount is “16”');
  assert.equal(said(16), 'present if Report-Amount is 16');
  assert.equal(said('3GPP_PS_DATA_OFF_CHANGE'), 'present if Report-Amount is 3GPP_PS_DATA_OFF_CHANGE');
  assert.equal(said('H(E)NB_LOCAL_IP_ADDRESS_CHANGE'), 'present if Report-Amount is H(E)NB_LOCAL_IP_ADDRESS_CHANGE');
  assert.equal(words({ kind: 'default', value: '16' }), 'defaults to “16” when absent');
  assert.equal(words({ kind: 'default', value: 0 }), 'defaults to 0 when absent');
  assert.equal(
    words({ kind: 'values', values: ['16', 2], conditions: [[{ path: ['A'], value: '7' }]] }),
    'is one of “16”, 2 if A is “7”',
  );
});

test('the IP filter codecs are said in words, with their layouts for a title', () => {
  assert.equal(words({ kind: 'encoding', codec: 'ip-filter' }), 'IP filter rule (permit, no options)');
  assert.equal(words({ kind: 'encoding', codec: 'ip-filter-out' }), 'IP filter rule of direction out');
  assert.equal(words({ kind: 'encoding', codec: 'ip-filter-flow' }), 'IP filter rule describing one flow');
  assert.match(ruleNote({ kind: 'encoding', codec: 'ip-filter-flow', line: 0 }), /no "assigned"/);
  assert.equal(words({ kind: 'encoding', codec: 'ip-filter-next' }), 'encoded as ip-filter-next', 'one to come');
});

test("the index of tables counts each document's interpreted blocks, and a count of no shape the site knows is none", async () => {
  const { documents, schema_version } = await readFixture('index.json');
  const docs = await Promise.all(documents.map(async doc => ({ ...(await readFixture(doc.path)), id: doc.id })));
  const index = tableIndex(docs, schema_version);
  assert.deepEqual(index.interpreted, { '29272-j60': 157, '29273-j20': 258, '29329-j10': 15 });
  assert.equal(interpretedCount(index, '29273-j20'), 258);
  assert.equal(interpretedCount(index, '29328-j20'), undefined, 'none');
  assert.equal(interpretedCount({ tables: {} }, '29273-j20'), undefined, 'an index saying nothing of them');
  assert.equal(interpretedCount({ tables: {}, interpreted: { a: '3', b: -1, c: 1.5 } }, 'a'), undefined);
  assert.equal(interpretedCount({ tables: {}, interpreted: { a: '3', b: -1, c: 1.5 } }, 'b'), undefined);
  assert.equal(interpretedCount({ tables: {}, interpreted: null }, 'c'), undefined);
  assert.equal(interpretedCount(undefined, 'a'), undefined);
});
