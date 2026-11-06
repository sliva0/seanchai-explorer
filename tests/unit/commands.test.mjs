import assert from 'node:assert/strict';
import test from 'node:test';
import { allCommands, blockPlace, commandOf, commandPlaces, definitionsOf, partnerOf, registryRows, rowPlace, tablesOf } from '../../src/command-places.ts';
import { commandFacts, commandIndex, commandKey } from '../../src/commands.ts';
import { readFixture } from './helpers.mjs';

/** A file's lines from its text, one plain token each but a `;;` comment, as the export has it, and a span `links` gives its own. */
const file = (text, links = {}) => text.split('\n').map((line, index, all) => {
  const full = index < all.length - 1 ? `${line}\n` : line;
  const comment = full.indexOf(';;');
  if (comment >= 0) return { tokens: [{ text: full.slice(0, comment) }, { text: full.slice(comment).trimEnd(), kind: 'comment' }, { text: '\n' }] };
  for (const [word, fields] of Object.entries(links)) {
    const at = full.indexOf(word);
    if (at >= 0) return { tokens: [{ text: full.slice(0, at) }, { text: word, ...fields }, { text: full.slice(at + word.length) }].filter(token => token.text) };
  }
  return { tokens: [{ text: full }] };
}).filter(line => line.tokens.length);
const texts = lines => lines.map(line => line.tokens.map(token => token.text).join('')).join('');
const named = lines => lines.flatMap((line, at) => line.tokens.filter(token => token.command).map(token => [at, token.text, commandKey(token.command)]));

const accounting = `; Type: Application Scope
; Name: Diameter base accounting
; Section: 9.3
; Application-ID: 3
; Applies-To: 9.*

; Type: Message
; Name: Accounting-Request, ACR
; Section: 9.7.1
; Page: 127
<Accounting-Request> ::= < Diameter Header: 271, REQ, PXY >
        < Session-Id >

; Type: Message
; Name: Accounting-Answer, ACA ;; corrected: (X.py#y)
; Section: 9.7.2
; Page: 128
<Accounting-Answer> ::= < Diameter Header: 271, PXY >
        < Session-Id >

; Type: Message
; Name: Gx-Answer, GXA
; Section: 4.2
<Gx-Answer> ::= < Diameter Header: 272, PXY, 16777238 >
        < Session-Id >

; Type: AVP Table
; Section: 7.1
; Table: 7.1.0.1
; Page: 94
; Columns: Name    Code   ACR   ACA   CCR   Type
Session-Id 263 M M - UTF8String
`;

test('a block names its command in its Name line and its rule, and its header says the rest', () => {
  const lines = file(accounting);
  const before = texts(lines);
  const { blocks, tables } = commandFacts(lines);
  assert.equal(texts(lines), before, 'every token joined is still the file');
  assert.deepEqual(blocks.map(({ name, abbreviation, section, page, line, code, flags, header, application, scope }) => [name, abbreviation, section, page, line, code, flags, header, application, scope]), [
    ['Accounting-Request', 'ACR', '9.7.1', 127, 6, 271, ['REQ', 'PXY'], null, 3, { name: 'Diameter base accounting', section: '9.3' }],
    ['Accounting-Answer', 'ACA', '9.7.2', 128, 13, 271, ['PXY'], null, 3, { name: 'Diameter base accounting', section: '9.3' }],
    ['Gx-Answer', 'GXA', '4.2', null, 20, 272, ['PXY'], 16777238, 16777238, null],
  ]);
  assert.deepEqual(named(lines).slice(0, 6), [
    [7, 'Accounting-Request', '271 request'], [7, 'ACR', '271 request'], [10, 'Accounting-Request', '271 request'],
    [14, 'Accounting-Answer', '271 answer'], [14, 'ACA', '271 answer'], [17, 'Accounting-Answer', '271 answer'],
  ]);
  assert.deepEqual(lines[14].tokens.slice(-3).map(token => token.text), [' ', ';; corrected: (X.py#y)', '\n'], 'a comment after it is left whole');
  assert.deepEqual(tables, [{ section: '7.1', page: 94, line: 26, table: '7.1.0.1', columns: ['ACR', 'ACA'] }]);
  assert.deepEqual(named(lines).filter(([line]) => line === 30).map(([, text]) => text), ['ACR', 'ACA'], 'a column for no command of the file is no name');
  assert.equal(commandFacts(lines), commandFacts(lines), 'read once');
});

test('a name a link already spans is marked in place, and one inside a link is not split', () => {
  const lines = file('; Type: Message\n; Name: AA-Answer, AAA\n; Section: 17.6.2\n<AA-Answer> ::= < Diameter Header: 265, PXY >\n', { 'AA-Answer>': { target: { document: 'd', section: '17.6.2' } } });
  commandFacts(lines);
  assert.deepEqual(named(lines).map(([line, text]) => [line, text]), [[1, 'AA-Answer'], [1, 'AAA']]);
  const [link] = lines[3].tokens.filter(token => token.target);
  assert.equal(link.command, undefined);
});

test('a Command Codes row names its request and its answer, by name and abbreviation, quoted or not', () => {
  const lines = file(`; Type: Registry
; Registry: Command Codes
; Section: 5.1
; Table: 5.1/1
; Page: 11
; Columns: Code   Name                                     Abbreviation   Defined-In
300               User-Authorization-Request/-Answer       UAR/UAA        TS29.229
319               "Insert Subscriber Data-Request/Answer"  IDR/IDA        TS29.272
313               -                                        -              -
`, { 'TS29.229': { target: { document: '29229-j10' } } });
  const before = texts(lines);
  const { rows } = commandFacts(lines);
  assert.equal(texts(lines), before);
  assert.deepEqual(rows.map(({ code, name, abbreviation, line, table, defined }) => [code, name, abbreviation, line, table, defined]), [
    [300, 'User-Authorization-Request/-Answer', 'UAR/UAA', 6, '5.1/1', ['29229-j10']],
    [319, 'Insert Subscriber Data-Request/Answer', 'IDR/IDA', 7, '5.1/1', []],
  ]);
  assert.deepEqual(named(lines), [
    [6, 'User-Authorization-Request', '300 request'], [6, 'Answer', '300 answer'], [6, 'UAR', '300 request'], [6, 'UAA', '300 answer'],
    [7, 'Insert Subscriber Data-Request', '319 request'], [7, 'Answer', '319 answer'], [7, 'IDR', '319 request'], [7, 'IDA', '319 answer'],
  ]);
  const answer = lines[6].tokens.find(token => token.text === 'Answer').command;
  assert.equal(answer.name, 'User-Authorization-Answer');
  assert.equal(lines[7].tokens.find(token => token.text === 'IDA').command.name, 'Insert Subscriber Data-Answer');
});

test('a bare header takes the first covering scope\'s id, and one printing an id is named by the scope stating it for its interface', () => {
  const lines = file(`; Type: Application Scope
; Name: S7a
; Section: 7.1.1
; Application-ID: 16777308
; Applies-To: 7.2.25.*

; Type: Application Scope
; Name: S6a
; Section: 7.1
; Application-ID: 16777251
; Applies-To: 7.*

; Type: Message
; Name: Insert-Subscriber-Data-Request, IDR
; Section: 7.2.9
<Insert-Subscriber-Data-Request> ::= < Diameter Header: 319, REQ, PXY, 16777308 >

; Type: Message
; Name: Update-VCSG-Location-Request, UVR
; Section: 7.2.25.1
<Update-VCSG-Location-Request> ::= < Diameter Header: 8388638, REQ, PXY >
`);
  const [insert, vcsg] = commandFacts(lines).blocks;
  assert.deepEqual([insert.application, insert.scope], [16777308, { name: 'S7a', section: '7.1.1' }]);
  assert.deepEqual([vcsg.application, vcsg.scope], [16777308, { name: 'S7a', section: '7.1.1' }]);
});

const doc = { id: 'rfc6733' };
const other = (document, fields) => ({ document, name: 'Accounting-Answer', abbreviation: 'ACA', section: '6.2.3', page: 60, line: 52, code: 271, flags: ['PXY'], header: null, application: 3, scope: null, ...fields });

test('a block is its Definition, here in the pane at its name and in the view at its line, elsewhere only its clause', () => {
  const lines = file(accounting);
  const answer = { document: 'rfc6733', ...commandFacts(lines).blocks[1] };
  assert.deepEqual(blockPlace(answer, doc), {
    document: 'rfc6733', position: { section: '9.7.2', page: 128, name: 'Accounting-Answer' },
    target: { document: 'rfc6733', section: '9.7.2', name: 'Accounting-Answer' }, line: 13,
  });
  assert.deepEqual(blockPlace(other('32299-j00'), doc), { document: '32299-j00', target: { document: '32299-j00', section: '6.2.3', name: 'Accounting-Answer' }, line: 52 });
  const token = lines[14].tokens.find(token => token.text === 'ACA');
  assert.deepEqual(commandPlaces(token.command, doc, undefined), { definition: blockPlace(answer, doc) });
});

test('a registry half is the block of its code and half in the document its row cites, and nothing where none prints one', () => {
  const index = { schema_version: 6, registry: [], commands: [other('29229-j10', { name: 'User-Authorization-Answer', code: 300 }), other('29229-j10', { name: 'User-Authorization-Request', code: 300, flags: ['REQ', 'PXY'], line: 30 })] };
  const row = { code: 300, name: 'User-Authorization-Request/-Answer', abbreviation: 'UAR/UAA', section: '5.1', page: 11, line: 6, table: '5.1/1', defined: ['29229-j10'] };
  assert.equal(commandOf({ code: 300, request: true, name: 'User-Authorization-Request', abbreviation: 'UAR', row }, doc, index).line, 30);
  assert.equal(commandOf({ code: 300, request: false, name: 'User-Authorization-Answer', abbreviation: 'UAA', row }, doc, index).name, 'User-Authorization-Answer');
  assert.equal(commandOf({ code: 301, request: true, name: 'X', abbreviation: null, row }, doc, index), undefined);
  assert.deepEqual(commandPlaces({ code: 300, request: true, name: 'X', abbreviation: null, row }, doc, undefined), {});
});

test('the partner is the other half of the code and application, in the nearest clause', () => {
  const commands = [
    other('d', { section: '5.6.2', line: 1, flags: ['REQ'] }), other('d', { section: '6.2.2', line: 2, flags: ['REQ'] }),
    other('d', { section: '6.2.3', line: 3 }), other('d', { section: '6.2.9', line: 4, flags: ['REQ'], application: 4 }), other('e', { section: '6.2.2', line: 2, flags: ['REQ'] }),
  ];
  assert.equal(partnerOf(commands[2], commands), commands[1]);
  assert.equal(partnerOf(commands[0], commands), commands[2]);
  assert.equal(partnerOf(commands[3], commands), undefined, 'not of another application');
});

test('other definitions share code, application and half under any name; the name\'s others differ in code or application', () => {
  const answer = other('rfc6733', { section: '9.7.2', line: 13 });
  const commands = [
    answer,
    other('32299-j00'),
    other('29061-j10', { name: 'AC-Answer', section: '16a.4.4' }),
    other('29061-j10', { section: '16a.4.6', application: 16777223 }),
    other('x', { code: 999 }),
    other('y', { flags: ['REQ', 'PXY'], name: 'Accounting-Request' }),
  ];
  const { same, differing } = definitionsOf(answer, commands);
  assert.deepEqual(same, [commands[1], commands[2]]);
  assert.deepEqual(differing, [commands[3], commands[4]]);
});

test('this file\'s commands and rows come from its lines, the others\' from the index', () => {
  const lines = file(accounting);
  const index = { schema_version: 6, commands: [other('rfc6733', { line: 999 }), other('32299-j00')], registry: [{ document: '29230-j30', code: 271, name: 'Accounting', abbreviation: 'ACR/ACA', section: '5.1', page: 11, line: 9, table: null, defined: [] }] };
  const all = allCommands(lines, doc, index);
  assert.deepEqual(all.map(command => [command.document, command.line]), [['rfc6733', 6], ['rfc6733', 13], ['rfc6733', 20], ['32299-j00', 52]]);
  const [row] = registryRows({ code: 271 }, lines, doc, index);
  assert.deepEqual(rowPlace(row, doc), { document: '29230-j30', target: { document: '29230-j30', section: '5.1', name: 'ACR/ACA' }, line: 9 });
  assert.deepEqual(registryRows({ code: 272 }, lines, doc, index), []);
  assert.deepEqual(tablesOf(all[0], lines, doc).map(table => table.table), ['7.1.0.1']);
  assert.deepEqual(tablesOf(all[2], lines, doc), []);
  assert.deepEqual(tablesOf(all[3], lines, doc), [], 'another document\'s tables are not this file\'s');
});

test('the index of the fixture holds every command search does, with the application the model gives it', async () => {
  const index = await readFixture('index.json');
  const search = await readFixture('search.json');
  const documents = await Promise.all(index.documents.map(async summary => ({ id: summary.id, lines: (await readFixture(summary.path)).lines })));
  const built = commandIndex(documents, index.schema_version);
  const key = (document, section, name, code, application, header, scope) => JSON.stringify([document, section, name, code, application, header, scope]);
  const expected = search.entries.filter(entry => entry.kind === 'command').map(({ document, target, name, identity }) =>
    key(document, target.section, name, identity.command_code, identity.application_id, identity.header_application_id, identity.application));
  const got = built.commands.map(command => key(command.document, command.section, command.name, command.code, command.application, command.header, command.scope?.name ?? null));
  assert.deepEqual(got.sort(), expected.sort());
  assert.equal(built.schema_version, index.schema_version);
});
