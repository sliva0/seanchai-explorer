import assert from 'node:assert/strict';
import test from 'node:test';
import { createHighlighter } from '../../src/highlight.ts';
import { readFile } from 'node:fs/promises';
import { printedRow, correctedRow } from '../../src/printed-row.ts';
import { valueRowAt, valueTables } from '../../src/values.ts';
import { readFixture } from './helpers.mjs';

const fresh = async id => readFixture(`documents/${id}.json`);
const grammar = JSON.parse(await readFile(new URL('../fixtures/export/syntax/dad.tmLanguage.json', import.meta.url), 'utf8'));

test('result codes: the row, its number, its clause and where the source prints it', async () => {
  const { lines } = await fresh('29061-6f0');
  const [table] = valueTables(lines);
  assert.equal(table.kind, 'result-codes');
  assert.equal(table.avp.avp, 'Experimental-Result-Code');
  assert.equal(table.section, '17.8');
  const row = table.rows.find(row => row.name === 'DIAMETER_ERROR_SERVICE_AREA');
  assert.equal(row.value, 5123);
  assert.equal(row.mark, null, 'a clause is no mark');
  assert.deepEqual(row.position, { section: '17.8.2', page: 92, name: row.name, row: true, value: 5123, titled: true });
  const tokens = lines[row.line].tokens;
  assert.equal(tokens.find(token => token.text === '17.8.2').source, row.position, 'its clause links to the row');
  assert.equal(tokens.find(token => token.target).valueRow, row);
  assert.equal(tokens.map(token => token.text).join('').startsWith('DIAMETER_ERROR_SERVICE_AREA'), true, 'the text stays as it is');
});

test('bits and features: unquoted names, a mark, the list and the number the source prints', async () => {
  const { lines } = await fresh('29217-i00');
  const tables = valueTables(lines);
  assert.deepEqual([...new Set(tables.map(table => table.kind))].sort(), ['bits', 'features', 'result-codes']);
  const features = tables.find(table => table.kind === 'features');
  assert.notEqual(features.featureListId, null);
  assert.ok(features.application);
  assert.ok(features.rows.every(row => row.mark === 'M' || row.mark === 'O'));
  assert.deepEqual(features.rows[0].position, { section: features.section, page: features.page, name: features.rows[0].name, row: true, value: features.rows[0].value });
  const bits = tables.find(table => table.kind === 'bits');
  assert.ok(bits.rows.every(row => row.mark === null && !row.position.titled && row.position.value === row.value && !row.name.startsWith('"')));
});

test('a link finds its row by its target or its table, and a table\'s other files have none', async () => {
  const { lines } = await fresh('29061-6f0');
  assert.equal(valueRowAt(lines, '17.8.2', 'DIAMETER_ERROR_SERVICE_AREA').value, 5123);
  assert.equal(valueRowAt(lines, '17.8', 'DIAMETER_ERROR_SERVICE_AREA').value, 5123);
  assert.equal(valueRowAt(lines, '17.8.3', 'DIAMETER_ERROR_SERVICE_AREA'), undefined);
  assert.equal(valueRowAt(lines, '17.8.2', 'Session-Id'), undefined);
  assert.deepEqual(valueTables((await fresh('rfc7944')).lines), []);
});

test('a row\'s comment stays inside the table; a blank line and the next block end it', () => {
  const line = (text, section = '1') => ({ section, tokens: [{ text: `${text}\n` }] });
  const name = (text, rest) => ({ section: '1', tokens: [{ text, target: { document: 'd', section: '1' } }, { text: `${rest}\n` }] });
  const lines = [
    line('; Type: Value Table'), line('; AVP: A'), line('; Kind: bits'), line('; Section: 1'), line('; Page: 3'),
    name('One', ' = 0'), line(';; 1-31 None'), name('"Two words"', ' = 1 ;; note'),
    line(''), line(''), name('Other', ' = 2'),
    line('; Type: Enumerated AVP'), name('Three', ' = 3'),
  ];
  const [table, ...rest] = valueTables(lines);
  assert.deepEqual(rest, []);
  assert.deepEqual(table.rows.map(row => [row.name, row.value]), [['One', 0], ['Two words', 1]]);
});

test('a corrected row is looked up in the raw mirror as a table row is', () => {
  const lines = (name, correction) => {
    const list = [
      { section: '1', tokens: [{ text: '; Type: Value Table\n' }] }, { section: '1', tokens: [{ text: '; Kind: bits\n' }] }, { section: '1', tokens: [{ text: '; Section: 1\n' }] },
      { section: '1', tokens: [{ text: name, target: { document: 'd', section: '1' } }, { text: ' = 0 ' }, ...(correction ? [{ text: ';; corrected: (a#b)', correction: 'a#b' }] : []), { text: '\n' }] },
    ];
    valueTables(list);
    return list;
  };
  const doc = { lines: lines('Spelled', true), corrections: { 'a#b': { kind: 'replace', reason: 'r' } } };
  const raw = { lines: lines('Mispelled', false) };
  assert.equal(correctedRow(doc, { section: '1', name: 'Spelled' }), true);
  assert.equal(printedRow(doc, raw, { section: '1', name: 'Spelled' }), 'Mispelled');
});

test('the exported grammar colours a row\'s name, number and clause or mark, and the new directives', async () => {
  const highlight = createHighlighter(grammar);
  const scoped = async id => highlight((await fresh(id)).lines);
  const scopeOf = (line, text) => line.tokens.find(token => token.text.includes(text))?.scope;
  const results = await scoped('29061-6f0');
  const row = results.find(line => line.tokens[0].text === 'DIAMETER_ERROR_SERVICE_AREA');
  assert.equal(row.tokens[0].scope, 'variable.other.enum.dad');
  assert.equal(scopeOf(row, '='), 'keyword.operator.assignment.dad');
  assert.equal(scopeOf(row, '5123'), 'constant.numeric.dad');
  assert.equal(scopeOf(row, '17.8.2'), 'string.unquoted.enum-note.dad');
  assert.ok(row.tokens.some(token => token.text === '17.8.2' && token.source), 'the clause stays a link of its own');
  const kind = results.find(line => line.tokens.map(token => token.text).join('') === '; Kind: result-codes\n');
  assert.equal(scopeOf(kind, 'result-codes'), 'constant.language.value-kind.dad');
  const features = (await scoped('29217-i00')).find(line => /= \d+\s+; [MO]\n$/.test(line.tokens.map(token => token.text).join('')));
  assert.equal(features.tokens[0].scope, 'variable.other.enum.dad');
  assert.equal(scopeOf(features, 'M') ?? scopeOf(features, 'O'), 'string.unquoted.enum-note.dad');
  const reprint = await scoped('29109-i10');
  const from = reprint.find(line => line.tokens.map(token => token.text).join('') === '; From: RFC6733\n');
  assert.equal(scopeOf(from, 'From'), 'keyword.other.directive.dad');
  assert.equal(scopeOf(from, 'RFC6733'), 'entity.name.tag.spec-ref.dad');
  const type = reprint.find(line => line.tokens.map(token => token.text).join('') === '; Type: Reprinted AVP\n');
  assert.equal(scopeOf(type, 'Reprinted AVP'), 'storage.type.section.dad');
});
