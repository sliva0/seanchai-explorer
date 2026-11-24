// A block's `; Table:` number as a link to the source, and the index of every document's tables.
import assert from 'node:assert/strict';
import test from 'node:test';
import { fileTables, markTables, tableIndex, tablePlace } from '../../src/tables.ts';
import { readFixture } from './helpers.mjs';

const lineText = line => line.tokens.map(token => token.text).join('');

test("a block's ; Table: number is a token of its own, linking to the source at that table, its line's text kept", async () => {
  const doc = await readFixture('documents/29328-j20.json');
  const before = doc.lines.map(lineText);
  markTables(doc);
  markTables(doc);
  assert.deepEqual(doc.lines.map(lineText), before, 'once, and the text as it was');
  assert.deepEqual(doc.lines[42].tokens, [
    { text: '; Table: ' },
    { text: '6.1.1.2', source: { section: '6.1.1', page: 14, table: '6.1.1.2' } },
    { text: '\n' },
  ]);
});

test("the index has each document's tables by number, at the block printing them, an interpreted block's at the table it was read from", async () => {
  const { documents, schema_version } = await readFixture('index.json');
  const docs = await Promise.all(documents.map(async doc => ({ ...(await readFixture(doc.path)), id: doc.id })));
  const index = tableIndex(docs, schema_version);
  assert.equal(index.schema_version, schema_version);
  assert.deepEqual(index.tables['29328-j20']['6.1.1.2'], { line: 38, section: '6.1.1' });
  assert.deepEqual(index.tables['29272-j60']['5A.2.1.1.1/1'], { line: 1591, section: '5A.2.1.1.1' });
  assert.equal(index.tables.rfc7944, undefined, 'a document with no tables is left out');
  const held = docs.find(doc => doc.id === '29328-j20');
  assert.deepEqual(tablePlace(held, undefined, '29328-j20', '6.1.1.1'), { line: 10, section: '6.1.1' });
  assert.deepEqual(tablePlace(undefined, index, '29328-j20', '6.1.1.1'), { line: 10, section: '6.1.1' });
  assert.equal(tablePlace(undefined, index, '29328-j20', '9.9'), undefined);
  assert.equal(Object.keys(fileTables(held)).length, 10, 'its Command Result Codes block a table too');
});
