import assert from 'node:assert/strict';
import test from 'node:test';
import { avpIdentities, avpTables } from '../../src/avp-facts.ts';
import { readFixture } from './helpers.mjs';

const fresh = id => readFixture(`documents/${id}.json`);
/**
 * A table block at `line` as the export writes one: each row `[name, cells, read]`, one line after another below its directives,
 * `read` being the `code`, `type` and `vendor` the export reads from its cells.
 */
const table = (type, line, columns, rows, fields = {}) => ({
  type,
  line,
  last: line + 2 + rows.length,
  section: '5',
  page: null,
  fields: { Columns: columns.join(' '), ...fields },
  columns,
  ...(type === 'Registry'
    ? {
        allocations: rows.map(([name, cells, read], at) => ({ line: line + 3 + at, cells, code: null, name, ...read })),
      }
    : { rows: rows.map(([name, cells, read], at) => ({ line: line + 3 + at, name, cells, ...read })) }),
});
/** A file of blocks alone: what the facts are read from, the lines being only what a view shows. */
const file = (...blocks) => ({ lines: [], blocks });

test("a table row says code, type and vendor, by its V flag, and a rule's header the same folds into it", async () => {
  assert.deepEqual(avpIdentities([{ file: await fresh('29217-j00'), name: 'Congestion-Level-Range' }]), [
    { code: 4003, vendor: 10415, type: 'Unsigned32' },
  ]);
  assert.deepEqual(avpIdentities([{ file: await fresh('29217-j00'), name: 'Congestion-Location-Id' }]), [
    { code: 4006, vendor: 10415, type: 'Grouped' },
  ]);
  assert.deepEqual(
    avpIdentities([{ file: await fresh('rfc7944'), name: 'DRMP' }]),
    [{ code: 301, vendor: 0, type: 'Enumerated' }],
    "V under Must-not is IETF's, which the header leaves unsaid",
  );
  assert.deepEqual(avpIdentities([{ file: await fresh('rfc7944'), name: 'Nothing' }]), []);
});

test('every identity that disagrees is kept, in the order of the files', () => {
  const blocks = file(
    table(
      'AVP Table',
      3,
      ['Name', 'Code', 'Section', 'Type', 'Must', 'M.not'],
      [
        ['A', ['A', '5', '5.1', 'Unsigned32', 'M,V', '-'], { code: 5, type: 'Unsigned32', vendor: 10415 }],
        ['B', ['"B"', '7', '5.2', 'Typo', '-', '-'], { code: 7 }],
      ],
    ),
    {
      type: 'Grouped AVP',
      line: 10,
      last: 15,
      section: '5.1',
      page: null,
      fields: { Name: 'A', Section: '5.1' },
      name: 'A',
      avp: { code: 6, vendor_id: 10415 },
      rule: { name: 'A', line: 13, members: [{ line: 14, name: 'B', presence: 'optional', min: 0, max: 1 }] },
    },
    table(
      'Reused AVPs',
      17,
      ['Name', 'Code', 'From', 'Type'],
      [['A', ['A', '5', 'RFC6733', 'Unsigned32'], { code: 5, type: 'Unsigned32' }]],
      { Table: '5/2' },
    ),
    table(
      'AVP Table',
      24,
      ['Name', 'Vendor-ID', 'Code', 'Section', 'Type'],
      [['A', ['A', '0', '5', '6.1', 'Unsigned32'], { code: 5, type: 'Unsigned32', vendor: 0 }]],
    ),
  );
  assert.deepEqual(avpIdentities([{ file: blocks, name: 'A' }]), [
    { code: 5, vendor: 10415, type: 'Unsigned32' },
    { code: 6, vendor: 10415, type: 'Grouped' },
    { code: 5, vendor: 0, type: 'Unsigned32' },
  ]);
  assert.deepEqual(
    avpIdentities([{ file: blocks, name: 'B' }]),
    [{ code: 7 }],
    'no vendor and no Diameter type say only the code',
  );
  const other = file(
    table(
      'AVP Table',
      3,
      ['Name', 'Code', 'Section', 'Type', 'Must'],
      [['A', ['A', '9', '1.1', 'OctetString', 'M,V'], { code: 9, type: 'OctetString', vendor: 10415 }]],
    ),
  );
  assert.deepEqual(
    avpIdentities([
      { file: other, name: 'A' },
      { file: blocks, name: 'A' },
    ])[0],
    { code: 9, vendor: 10415, type: 'OctetString' },
  );
});

test('a registry of AVP codes is the vendor the export gives its rows, and other tables say nothing of AVPs', () => {
  const blocks = file(
    table(
      'Registry',
      3,
      ['Code', 'Name', 'Type', 'Defined-In'],
      [['R', ['100', 'R', 'OctetString', 'TS29.234'], { code: 100, type: 'OctetString', vendor: 10415 }]],
      { Registry: 'AVP Codes' },
    ),
    table('Registry', 10, ['Code', 'Name', 'Defined-In'], [['R', ['8388734', 'R', 'TS29.128'], { code: 8388734 }]], {
      Registry: 'Command Codes',
    }),
  );
  assert.deepEqual(avpIdentities([{ file: blocks, name: 'R' }]), [{ code: 100, vendor: 10415, type: 'OctetString' }]);
});

test("an AVP's tables: its value tables and its Enumerated AVP block, in file order", async () => {
  const doc = await fresh('29217-j00');
  const [bits] = avpTables(doc, 'Congestion-Level-Range');
  assert.equal(bits.kind, 'bits');
  assert.equal(bits.line, 244);
  assert.equal(bits.section, '5.3.5');
  assert.deepEqual(
    avpTables(doc, 'Feature-List').map(table => [table.kind, table.featureListId, table.application]),
    [['features', 1, 'Np']],
  );
  assert.deepEqual(avpTables(await fresh('rfc7944'), 'DRMP'), [{ name: 'DRMP', section: '9.1', page: 12, line: 13 }]);
  assert.deepEqual(avpTables(doc, 'Congestion-Location-Id'), []);
});

test("a table's rows are its block's, a comment between them none, and a name after the block no row", () => {
  const blocks = file(
    table(
      'AVP Table',
      3,
      ['Name', 'Code', 'Type', 'Must'],
      [
        ['A', ['A', '258', 'Unsigned32', 'M'], { code: 258, type: 'Unsigned32' }],
        ['B', ['B', '30', 'UTF8String', 'M'], { code: 30, type: 'UTF8String' }],
      ],
    ),
  );
  assert.deepEqual(avpIdentities([{ file: blocks, name: 'B' }]), [{ code: 30, type: 'UTF8String' }]);
  assert.deepEqual(avpIdentities([{ file: blocks, name: 'AVP' }]), [], "the * [ AVP ] wildcard's commented row");
  assert.deepEqual(avpIdentities([{ file: blocks, name: 'C' }]), []);
});
