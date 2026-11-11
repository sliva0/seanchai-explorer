import assert from 'node:assert/strict';
import test from 'node:test';
import { createHighlighter } from '../../src/highlight.ts';
import { readFile } from 'node:fs/promises';
import { printedRow, correctedRow } from '../../src/printed-row.ts';
import { valueRowAt, valueTables } from '../../src/values.ts';
import { readFixture } from './helpers.mjs';

const fresh = async id => readFixture(`documents/${id}.json`);
/** A Value Table block over lines `line` to `last`, as the export writes one: its directives in `fields`, its rows in `value_rows`. */
const valueBlock = (line, last, fields, value_rows) => ({ type: 'Value Table', line, last, section: fields.Section, page: fields.Page ? Number(fields.Page) : null, fields, name: fields.AVP, value_rows });
const grammar = JSON.parse(await readFile(new URL('../fixtures/export/syntax/dad.tmLanguage.json', import.meta.url), 'utf8'));

test('result codes: the row, its number, its clause and where the source prints it', async () => {
  const doc = await fresh('29061-6f0');
  const { lines } = doc;
  const [table] = valueTables(doc);
  assert.equal(table.kind, 'result-codes');
  assert.equal(table.avp.name, 'Experimental-Result-Code');
  assert.deepEqual(table.avp.target, lines[table.line + 1].tokens.find(token => token.avp === 'Experimental-Result-Code').target, 'where its `; AVP:` line links');
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
  const tables = valueTables(await fresh('29217-j00'));
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
  const doc = await fresh('29061-6f0');
  assert.equal(valueRowAt(doc, '17.8.2', 'DIAMETER_ERROR_SERVICE_AREA').value, 5123);
  assert.equal(valueRowAt(doc, '17.8', 'DIAMETER_ERROR_SERVICE_AREA').value, 5123);
  assert.equal(valueRowAt(doc, '17.8.3', 'DIAMETER_ERROR_SERVICE_AREA'), undefined);
  assert.equal(valueRowAt(doc, '17.8.2', 'Session-Id'), undefined);
  assert.deepEqual(valueTables(await fresh('rfc7944')), []);
});

test('a table\'s rows are its block\'s: a name after it or in the next block is none of them', () => {
  const line = (text, section = '1') => ({ section, tokens: [{ text: `${text}\n` }] });
  const name = (text, rest) => ({ section: '1', tokens: [{ text, target: { document: 'd', section: '1' } }, { text: `${rest}\n` }] });
  const lines = [
    line('; Type: Value Table'), line('; AVP: A'), line('; Kind: bits'), line('; Section: 1'), line('; Page: 3'),
    name('One', ' = 0'), line(';; 1-31 None'), name('"Two words"', ' = 1 ;; note'),
    line(''), line(''), name('Other', ' = 2'),
    line('; Type: Enumerated AVP'), name('Three', ' = 3'),
  ];
  const blocks = [
    valueBlock(0, 7, { AVP: 'A', Kind: 'bits', Section: '1', Page: '3' }, [{ line: 5, name: 'One', value: 0 }, { line: 7, name: 'Two words', value: 1 }]),
    { type: 'Enumerated AVP', line: 11, last: 12, section: '1', page: null, fields: {}, values: [{ line: 12, kind: 'value', name: 'Three', first: 3, last: 3 }] },
  ];
  const [table, ...rest] = valueTables({ lines, blocks });
  assert.deepEqual(rest, []);
  assert.deepEqual(table.rows.map(row => [row.name, row.value, row.line]), [['One', 0, 5], ['Two words', 1, 7]]);
  assert.deepEqual([table.section, table.page, table.avp], ['1', 3, { name: 'A', target: null }]);
  assert.equal(lines[7].tokens[0].valueRow, table.rows[1], 'the name token is the row\'s, quoted as printed');
  assert.equal(lines[10].tokens[0].valueRow, undefined);
  assert.equal(lines[12].tokens[0].valueRow, undefined);
});

test('a result code another document defines: its clause, its origin linking to the row there, and no mark', async () => {
  const doc = await fresh('29283-j00');
  const { lines } = doc;
  const rows = valueTables(doc).flatMap(table => table.rows);
  const row = rows.find(row => row.name === 'DIAMETER_ERROR_USER_DATA_NOT_RECOGNIZED');
  assert.equal(row.mark, null);
  assert.equal(row.position.section, '7.4.3.3');
  assert.deepEqual(row.origin, { reference: 'TS29.329', target: { document: '29329-j10', section: '6.2.2.1', name: row.name } });
  const origin = lines[row.line].tokens.find(token => token.text === 'TS29.329');
  assert.equal(origin.originOf, row);
  assert.equal(origin.target, row.origin.target, 'the link names the row');
  assert.equal(lines[row.line].tokens.find(token => token.valueRow), lines[row.line].tokens[0], 'the name stays the row\'s');
  const own = valueTables(await fresh('29329-j10')).flatMap(table => table.rows);
  assert.equal(own.find(row => row.name === 'DIAMETER_ERROR_USER_DATA_NOT_RECOGNIZED').origin, null);
  assert.equal(own.find(row => row.name === 'DIAMETER_ERROR_TOO_MUCH_DATA').origin.reference, 'TS29.229');
});

test('an origin with no clause is no mark, nor one whose document the export cannot link', () => {
  const line = text => ({ section: '7', tokens: [{ text: `${text}\n` }] });
  const name = (text, ...rest) => ({ section: '7', tokens: [{ text, target: { document: 'd', section: '7' } }, ...rest, { text: '\n' }] });
  const lines = [
    line('; Type: Value Table'), line('; AVP: Result-Code'), line('; Kind: result-codes'), line('; Section: 7'),
    name('DIAMETER_USER_UNKNOWN', { text: ' = 5030 ; from ' }, { text: 'RFC8506', target: { document: 'rfc8506', section: '9.1', name: 'DIAMETER_USER_UNKNOWN' } }),
    name('DIAMETER_ELSEWHERE', { text: ' = 5031 ; ' }, { text: '7.2', source: { section: '7.2', page: 4 } }, { text: '  from TS99.999' }),
    line(''),
    line('; Type: Value Table'), line('; AVP: Supported-Features'), line('; Kind: features'), line('; Section: 8'),
    name('Feature', { text: ' = 0 ; M' }),
  ];
  const blocks = [
    valueBlock(0, 5, { AVP: 'Result-Code', Kind: 'result-codes', Section: '7' }, [
      { line: 4, name: 'DIAMETER_USER_UNKNOWN', value: 5030, origin: 'RFC8506', origin_target: { document: 'rfc8506', section: '9.1', name: 'DIAMETER_USER_UNKNOWN' } },
      { line: 5, name: 'DIAMETER_ELSEWHERE', value: 5031, section: '7.2', origin: 'TS99.999' },
    ]),
    valueBlock(7, 11, { AVP: 'Supported-Features', Kind: 'features', Section: '8' }, [{ line: 11, name: 'Feature', value: 0, mark: 'M' }]),
  ];
  const [codes, features] = valueTables({ lines, blocks });
  assert.deepEqual(codes.rows.map(row => [row.mark, row.origin]), [
    [null, { reference: 'RFC8506', target: { document: 'rfc8506', section: '9.1', name: 'DIAMETER_USER_UNKNOWN' } }],
    [null, { reference: 'TS99.999', target: null }],
  ]);
  assert.equal(lines[4].tokens[2].originOf, codes.rows[0]);
  assert.deepEqual(codes.rows.map(row => row.position.section), ['7', '7.2'], 'the first one\'s place is the table\'s');
  assert.equal(lines[5].tokens[2].source, codes.rows[1].position, 'its clause links to the row');
  assert.deepEqual(features.rows.map(row => [row.mark, row.origin]), [['M', null]]);
  assert.deepEqual([features.kind, features.featureListId, features.application], ['features', null, null]);
});

test('a note the export reads as a comment, as the * [ AVP ] wildcard\'s, stays inside the table and is no row', () => {
  const line = text => ({ section: '1', tokens: [{ text: `${text}\n` }] });
  const name = (text, rest) => ({ section: '1', tokens: [{ text, target: { document: 'd', section: '1' } }, { text: `${rest}\n` }] });
  const lines = [
    line('; Type: Value Table'), line('; AVP: A'), line('; Kind: bits'), line('; Section: 1'),
    name('One', ' = 0'), { section: '1', tokens: [{ text: ';; AVP * - - - - Grouped - - - - ; the * [ AVP ] wildcard', kind: 'comment' }, { text: '\n' }] },
    { section: '1', tokens: [{ text: ";; deleted: row 'X' (a.py#b)", kind: 'correction-note', correction: 'a.py#b' }, { text: '\n' }] },
    name('Two', ' = 1'),
  ];
  const blocks = [valueBlock(0, 7, { AVP: 'A', Kind: 'bits', Section: '1' }, [{ line: 4, name: 'One', value: 0 }, { line: 7, name: 'Two', value: 1 }])];
  assert.deepEqual(valueTables({ lines, blocks })[0].rows.map(row => row.name), ['One', 'Two']);
  assert.ok(lines.slice(5, 7).every(line => line.tokens.every(token => !token.valueRow && !token.source)));
});

test('a corrected row is looked up in the raw mirror as a table row is', () => {
  const lines = (name, correction) => {
    const list = [
      { section: '1', tokens: [{ text: '; Type: Value Table\n' }] }, { section: '1', tokens: [{ text: '; Kind: bits\n' }] }, { section: '1', tokens: [{ text: '; Section: 1\n' }] },
      { section: '1', tokens: [{ text: name, target: { document: 'd', section: '1' } }, { text: ' = 0 ' }, ...(correction ? [{ text: ';; corrected: (a#b)', correction: 'a#b' }] : []), { text: '\n' }] },
    ];
    const file = { lines: list, blocks: [valueBlock(0, 3, { Kind: 'bits', Section: '1' }, [{ line: 3, name, value: 0 }])] };
    valueTables(file);
    return file;
  };
  const doc = { ...lines('Spelled', true), corrections: { 'a#b': { kind: 'replace', reason: 'r' } } };
  const raw = lines('Mispelled', false);
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
  const features = (await scoped('29217-j00')).find(line => /= \d+\s+; [MO]\n$/.test(line.tokens.map(token => token.text).join('')));
  assert.equal(features.tokens[0].scope, 'variable.other.enum.dad');
  assert.equal(scopeOf(features, 'M') ?? scopeOf(features, 'O'), 'string.unquoted.enum-note.dad');
  const reprint = await scoped('29109-j00');
  const from = reprint.find(line => line.tokens.map(token => token.text).join('') === '; From: RFC6733\n');
  assert.equal(scopeOf(from, 'From'), 'keyword.other.directive.dad');
  assert.equal(scopeOf(from, 'RFC6733'), 'entity.name.tag.spec-ref.dad');
  const type = reprint.find(line => line.tokens.map(token => token.text).join('') === '; Type: Reprinted AVP\n');
  assert.equal(scopeOf(type, 'Reprinted AVP'), 'storage.type.section.dad');
  const origin = (await scoped('29283-j00')).find(line => line.tokens[0].text === 'DIAMETER_ERROR_USER_UNKNOWN');
  assert.equal(scopeOf(origin, '7.4.3.2'), 'string.unquoted.enum-note.dad');
  assert.equal(origin.tokens.find(token => token.text === 'from').scope, 'keyword.other.from.dad');
  const reference = origin.tokens.find(token => token.text === 'TS29.229');
  assert.equal(reference.scope, 'entity.name.tag.spec-ref.dad');
  assert.equal(reference.target.document, '29229-j10', 'the origin stays a link of its own');
});
