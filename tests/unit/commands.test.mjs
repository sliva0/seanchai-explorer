import assert from 'node:assert/strict';
import test from 'node:test';
import {
  allCommands,
  blockPlace,
  commandOf,
  commandPlaces,
  definitionsOf,
  partnerOf,
  registryRows,
  rowPlace,
  tablesOf,
} from '../../src/command-places.ts';
import { commandFacts, commandIndex, commandKey } from '../../src/commands.ts';
import { readFixture } from './helpers.mjs';

/** A file's lines from its text, one plain token each but a `;;` comment, as the export has it, and a span `links` gives its own. */
const file = (text, links = {}) =>
  text
    .split('\n')
    .map((line, index, all) => {
      const full = index < all.length - 1 ? `${line}\n` : line;
      const comment = full.indexOf(';;');
      if (comment >= 0)
        return {
          tokens: [
            { text: full.slice(0, comment) },
            { text: full.slice(comment).trimEnd(), kind: 'comment' },
            { text: '\n' },
          ],
        };
      for (const [word, fields] of Object.entries(links)) {
        const at = full.indexOf(word);
        if (at >= 0)
          return {
            tokens: [
              { text: full.slice(0, at) },
              { text: word, ...fields },
              { text: full.slice(at + word.length) },
            ].filter(token => token.text),
          };
      }
      return { tokens: [{ text: full }] };
    })
    .filter(line => line.tokens.length);
const texts = lines => lines.map(line => line.tokens.map(token => token.text).join('')).join('');
/** Where `text` stands on a line, after `from`: a command span's `line`, `start` and `end`. */
const at = (lines, line, text, from = 0) => {
  const start = lines[line].tokens
    .map(token => token.text)
    .join('')
    .indexOf(text, from);
  return { line, start, end: start + text.length };
};
/** A Message block as the export writes one, its name and abbreviation in `; Name:` on the line after its `; Type:` and its rule's head at `head`. */
function message(lines, index, { line, last, head, name, abbreviation, section, page = null, command }) {
  const ref = { code: command.code, request: command.request, name, abbreviation, block: index };
  return {
    type: 'Message',
    line,
    last,
    section,
    page,
    fields: { Name: `${name}, ${abbreviation}`, Section: section, ...(page ? { Page: String(page) } : {}) },
    name,
    abbreviation,
    command,
    rule: { name, line: head, members: [{ line: head + 1, name: 'Session-Id', presence: 'fixed', min: 1, max: 1 }] },
    commands: [
      { ...at(lines, line + 1, name), ...ref },
      { ...at(lines, line + 1, abbreviation, 8 + name.length), ...ref },
      { ...at(lines, head, name), ...ref },
    ],
  };
}
const scoped = { application: 'Diameter base accounting', application_clause: '9.3' };
const named = lines =>
  lines.flatMap((line, at) =>
    line.tokens.filter(token => token.command).map(token => [at, token.text, commandKey(token.command)]),
  );

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

/** The accounting text, its blocks as the export reads them. */
function accountingFile() {
  const lines = file(accounting);
  const blocks = [
    {
      type: 'Application Scope',
      line: 0,
      last: 4,
      section: '9.3',
      page: null,
      fields: { Name: 'Diameter base accounting', Section: '9.3', 'Application-ID': '3', 'Applies-To': '9.*' },
      name: 'Diameter base accounting',
    },
  ];
  blocks.push(
    message(lines, 1, {
      line: 6,
      last: 11,
      head: 10,
      name: 'Accounting-Request',
      abbreviation: 'ACR',
      section: '9.7.1',
      page: 127,
      command: {
        code: 271,
        request: true,
        flags: ['REQ', 'PXY'],
        header_application_id: null,
        application_id: 3,
        ...scoped,
      },
    }),
  );
  blocks.push(
    message(lines, 2, {
      line: 13,
      last: 18,
      head: 17,
      name: 'Accounting-Answer',
      abbreviation: 'ACA',
      section: '9.7.2',
      page: 128,
      command: { code: 271, request: false, flags: ['PXY'], header_application_id: null, application_id: 3, ...scoped },
    }),
  );
  blocks.push(
    message(lines, 3, {
      line: 20,
      last: 24,
      head: 23,
      name: 'Gx-Answer',
      abbreviation: 'GXA',
      section: '4.2',
      command: { code: 272, request: false, flags: ['PXY'], header_application_id: 16777238, application_id: 16777238 },
    }),
  );
  const columns = ['Name', 'Code', 'ACR', 'ACA', 'CCR', 'Type'];
  const column = (abbreviation, index) => ({
    ...at(lines, 30, abbreviation),
    code: 271,
    request: abbreviation === 'ACR',
    name: blocks[index].name,
    abbreviation,
    block: index,
  });
  blocks.push({
    type: 'AVP Table',
    line: 26,
    last: 31,
    section: '7.1',
    page: 94,
    fields: { Section: '7.1', Table: '7.1.0.1', Page: '94', Columns: 'Name    Code   ACR   ACA   CCR   Type' },
    columns,
    rows: [{ line: 31, name: 'Session-Id', cells: ['Session-Id', '263', 'M', 'M', '-', 'UTF8String'] }],
    commands: [column('ACR', 1), column('ACA', 2)],
  });
  return { id: 'rfc6733', lines, blocks };
}

test('a block names its command in its Name line and its rule, and its header says the rest', () => {
  const doc = accountingFile();
  const { lines } = doc;
  const before = texts(lines);
  const { blocks, tables } = commandFacts(doc);
  assert.equal(texts(lines), before, 'every token joined is still the file');
  assert.deepEqual(
    blocks.map(({ name, abbreviation, section, page, line, code, flags, header, application, scope }) => [
      name,
      abbreviation,
      section,
      page,
      line,
      code,
      flags,
      header,
      application,
      scope,
    ]),
    [
      [
        'Accounting-Request',
        'ACR',
        '9.7.1',
        127,
        6,
        271,
        ['REQ', 'PXY'],
        null,
        3,
        { name: 'Diameter base accounting', section: '9.3' },
      ],
      [
        'Accounting-Answer',
        'ACA',
        '9.7.2',
        128,
        13,
        271,
        ['PXY'],
        null,
        3,
        { name: 'Diameter base accounting', section: '9.3' },
      ],
      ['Gx-Answer', 'GXA', '4.2', null, 20, 272, ['PXY'], 16777238, 16777238, null],
    ],
  );
  assert.deepEqual(named(lines).slice(0, 6), [
    [7, 'Accounting-Request', '271 request'],
    [7, 'ACR', '271 request'],
    [10, 'Accounting-Request', '271 request'],
    [14, 'Accounting-Answer', '271 answer'],
    [14, 'ACA', '271 answer'],
    [17, 'Accounting-Answer', '271 answer'],
  ]);
  assert.equal(lines[7].tokens.find(token => token.text === 'ACR').command.block, blocks[0], "a name is its block's");
  assert.deepEqual(
    lines[14].tokens.slice(-3).map(token => token.text),
    [' ', ';; corrected: (X.py#y)', '\n'],
    'a comment after it is left whole',
  );
  assert.deepEqual(tables, [{ section: '7.1', page: 94, line: 26, table: '7.1.0.1', columns: ['ACR', 'ACA'] }]);
  assert.deepEqual(
    named(lines)
      .filter(([line]) => line === 30)
      .map(([, text]) => text),
    ['ACR', 'ACA'],
    'a column for no command of the file is no name',
  );
  assert.equal(commandFacts(doc), commandFacts(doc), 'read once');
});

test('a name a link already spans is marked in place, and one inside a link is not split', () => {
  const lines = file(
    '; Type: Message\n; Name: AA-Answer, AAA\n; Section: 17.6.2\n<AA-Answer> ::= < Diameter Header: 265, PXY >\n',
    { 'AA-Answer>': { target: { document: 'd', section: '17.6.2' } } },
  );
  const block = message(lines, 0, {
    line: 0,
    last: 3,
    head: 3,
    name: 'AA-Answer',
    abbreviation: 'AAA',
    section: '17.6.2',
    command: { code: 265, request: false, flags: ['PXY'], header_application_id: null, application_id: null },
  });
  commandFacts({ lines, blocks: [block] });
  assert.deepEqual(
    named(lines).map(([line, text]) => [line, text]),
    [
      [1, 'AA-Answer'],
      [1, 'AAA'],
    ],
  );
  const link = lines[3].tokens.find(token => token.target);
  assert.equal(link.command, undefined);
});

test('a Command Codes row names its request and its answer, by name and abbreviation, quoted or not', () => {
  const lines = file(
    `; Type: Registry
; Registry: Command Codes
; Section: 5.1
; Table: 5.1/1
; Page: 11
; Columns: Code   Name                                     Abbreviation   Defined-In
300               User-Authorization-Request/-Answer       UAR/UAA        TS29.229
319               "Insert Subscriber Data-Request/Answer"  IDR/IDA        TS29.272
313               -                                        -              -
`,
    { 'TS29.229': { target: { document: '29229-j10' } } },
  );
  const halves = (line, allocation, code, [request, answer], [short, long], [requestName, answerName]) => [
    { ...at(lines, line, request), code, request: true, name: requestName, abbreviation: short, allocation },
    {
      ...at(
        lines,
        line,
        answer,
        lines[line].tokens
          .map(token => token.text)
          .join('')
          .indexOf('/'),
      ),
      code,
      request: false,
      name: answerName,
      abbreviation: long,
      allocation,
    },
    { ...at(lines, line, short), code, request: true, name: requestName, abbreviation: short, allocation },
    { ...at(lines, line, long), code, request: false, name: answerName, abbreviation: long, allocation },
  ];
  const block = {
    type: 'Registry',
    line: 0,
    last: 8,
    section: '5.1',
    page: 11,
    fields: {
      Registry: 'Command Codes',
      Section: '5.1',
      Table: '5.1/1',
      Page: '11',
      Columns: 'Code Name Abbreviation Defined-In',
    },
    columns: ['Code', 'Name', 'Abbreviation', 'Defined-In'],
    allocations: [
      {
        line: 6,
        cells: ['300', 'User-Authorization-Request/-Answer', 'UAR/UAA', 'TS29.229'],
        code: 300,
        name: 'User-Authorization-Request/-Answer',
        abbreviation: 'UAR/UAA',
        documents: ['29229-j10'],
      },
      {
        line: 7,
        cells: ['319', '"Insert Subscriber Data-Request/Answer"', 'IDR/IDA', 'TS29.272'],
        code: 319,
        name: 'Insert Subscriber Data-Request/Answer',
        abbreviation: 'IDR/IDA',
      },
      { line: 8, cells: ['313', '-', '-', '-'], code: 313 },
    ],
    commands: [
      ...halves(
        6,
        0,
        300,
        ['User-Authorization-Request', 'Answer'],
        ['UAR', 'UAA'],
        ['User-Authorization-Request', 'User-Authorization-Answer'],
      ),
      ...halves(
        7,
        1,
        319,
        ['Insert Subscriber Data-Request', 'Answer'],
        ['IDR', 'IDA'],
        ['Insert Subscriber Data-Request', 'Insert Subscriber Data-Answer'],
      ),
    ],
  };
  const before = texts(lines);
  const { rows } = commandFacts({ lines, blocks: [block] });
  assert.equal(texts(lines), before);
  assert.deepEqual(
    rows.map(({ code, name, abbreviation, line, table, defined }) => [code, name, abbreviation, line, table, defined]),
    [
      [300, 'User-Authorization-Request/-Answer', 'UAR/UAA', 6, '5.1/1', ['29229-j10']],
      [319, 'Insert Subscriber Data-Request/Answer', 'IDR/IDA', 7, '5.1/1', []],
    ],
  );
  assert.deepEqual(named(lines), [
    [6, 'User-Authorization-Request', '300 request'],
    [6, 'Answer', '300 answer'],
    [6, 'UAR', '300 request'],
    [6, 'UAA', '300 answer'],
    [7, 'Insert Subscriber Data-Request', '319 request'],
    [7, 'Answer', '319 answer'],
    [7, 'IDR', '319 request'],
    [7, 'IDA', '319 answer'],
  ]);
  const answer = lines[6].tokens.find(token => token.text === 'Answer').command;
  assert.equal(answer.name, 'User-Authorization-Answer');
  assert.equal(answer.row, rows[0], "a half is its row's");
  assert.equal(lines[7].tokens.find(token => token.text === 'IDA').command.name, 'Insert Subscriber Data-Answer');
  assert.equal(
    lines[7].tokens.find(token => token.text === 'IDA').command.row,
    rows[1],
    'by its allocation, not its line',
  );
});

test("a command's scope is its application and the clause the export cites for it, and none where no scope names it", () => {
  const lines = file(
    '; Type: Message\n; Name: Bare-Request, BRR\n<Bare-Request> ::= < Diameter Header: 1, REQ >\n\n; Type: Message\n; Name: Own-Request, OWR\n<Own-Request> ::= < Diameter Header: 2, REQ, 16777308 >\n\n; Type: Message\n; Name: Unnamed-Request, UNR\n<Unnamed-Request> ::= < Diameter Header: 3, REQ, 7 >\n',
  );
  const blocks = [
    message(lines, 0, {
      line: 0,
      last: 2,
      head: 2,
      name: 'Bare-Request',
      abbreviation: 'BRR',
      section: '7.2.25.1',
      command: {
        code: 1,
        request: true,
        flags: ['REQ'],
        header_application_id: null,
        application_id: 16777308,
        application: 'S7a',
        application_clause: '7.2',
      },
    }),
    message(lines, 1, {
      line: 4,
      last: 6,
      head: 6,
      name: 'Own-Request',
      abbreviation: 'OWR',
      section: '7.2.9',
      command: {
        code: 2,
        request: true,
        flags: ['REQ'],
        header_application_id: 16777308,
        application_id: 16777308,
        application: 'S7a',
        application_clause: '7.1.1',
      },
    }),
    message(lines, 2, {
      line: 8,
      last: 10,
      head: 10,
      name: 'Unnamed-Request',
      abbreviation: 'UNR',
      section: '8.1',
      command: { code: 3, request: true, flags: ['REQ'], header_application_id: 7, application_id: 7 },
    }),
  ];
  const [bare, own, unnamed] = commandFacts({ lines, blocks }).blocks;
  assert.deepEqual([bare.application, bare.scope], [16777308, { name: 'S7a', section: '7.2' }]);
  assert.deepEqual([own.application, own.scope], [16777308, { name: 'S7a', section: '7.1.1' }]);
  assert.deepEqual([unnamed.application, unnamed.scope], [7, null], 'no scope names its application');
});

const doc = { id: 'rfc6733' };
const other = (document, fields) => ({
  document,
  name: 'Accounting-Answer',
  abbreviation: 'ACA',
  section: '6.2.3',
  page: 60,
  line: 52,
  code: 271,
  flags: ['PXY'],
  header: null,
  application: 3,
  scope: null,
  ...fields,
});

test('a block is its Definition, here in the pane at its name and in the view at its line, elsewhere only its clause', () => {
  const doc = accountingFile();
  const { lines } = doc;
  const answer = { document: 'rfc6733', ...commandFacts(doc).blocks[1] };
  assert.deepEqual(blockPlace(answer, doc), {
    document: 'rfc6733',
    position: { section: '9.7.2', page: 128, name: 'Accounting-Answer' },
    target: { document: 'rfc6733', section: '9.7.2', name: 'Accounting-Answer' },
    line: 13,
  });
  assert.deepEqual(blockPlace(other('32299-j00'), doc), {
    document: '32299-j00',
    target: { document: '32299-j00', section: '6.2.3', name: 'Accounting-Answer' },
    line: 52,
  });
  const token = lines[14].tokens.find(token => token.text === 'ACA');
  assert.deepEqual(commandPlaces(token.command, doc, undefined), { definition: blockPlace(answer, doc) });
});

test('a registry half is the block of its code and half in the document its row cites, and nothing where none prints one', () => {
  const index = {
    schema_version: 2,
    registry: [],
    commands: [
      other('29229-j10', { name: 'User-Authorization-Answer', code: 300 }),
      other('29229-j10', { name: 'User-Authorization-Request', code: 300, flags: ['REQ', 'PXY'], line: 30 }),
    ],
  };
  const row = {
    code: 300,
    name: 'User-Authorization-Request/-Answer',
    abbreviation: 'UAR/UAA',
    section: '5.1',
    page: 11,
    line: 6,
    table: '5.1/1',
    defined: ['29229-j10'],
  };
  assert.equal(
    commandOf({ code: 300, request: true, name: 'User-Authorization-Request', abbreviation: 'UAR', row }, doc, index)
      .line,
    30,
  );
  assert.equal(
    commandOf({ code: 300, request: false, name: 'User-Authorization-Answer', abbreviation: 'UAA', row }, doc, index)
      .name,
    'User-Authorization-Answer',
  );
  assert.equal(commandOf({ code: 301, request: true, name: 'X', abbreviation: null, row }, doc, index), undefined);
  assert.deepEqual(commandPlaces({ code: 300, request: true, name: 'X', abbreviation: null, row }, doc, undefined), {});
});

test('the partner is the other half of the code and application, in the nearest clause', () => {
  const commands = [
    other('d', { section: '5.6.2', line: 1, flags: ['REQ'] }),
    other('d', { section: '6.2.2', line: 2, flags: ['REQ'] }),
    other('d', { section: '6.2.3', line: 3 }),
    other('d', { section: '6.2.9', line: 4, flags: ['REQ'], application: 4 }),
    other('e', { section: '6.2.2', line: 2, flags: ['REQ'] }),
  ];
  assert.equal(partnerOf(commands[2], commands), commands[1]);
  assert.equal(partnerOf(commands[0], commands), commands[2]);
  assert.equal(partnerOf(commands[3], commands), undefined, 'not of another application');
});

test("other definitions share code, application and half under any name; the name's others differ in code or application", () => {
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

test("this file's commands and rows come from its blocks, the others' from the index", () => {
  const file = accountingFile();
  const index = {
    schema_version: 2,
    commands: [other('rfc6733', { line: 999 }), other('32299-j00')],
    registry: [
      {
        document: '29230-j30',
        code: 271,
        name: 'Accounting',
        abbreviation: 'ACR/ACA',
        section: '5.1',
        page: 11,
        line: 9,
        table: null,
        defined: [],
      },
    ],
  };
  const all = allCommands(file, doc, index);
  assert.deepEqual(
    all.map(command => [command.document, command.line]),
    [
      ['rfc6733', 6],
      ['rfc6733', 13],
      ['rfc6733', 20],
      ['32299-j00', 52],
    ],
  );
  const [row] = registryRows({ code: 271 }, file, doc, index);
  assert.deepEqual(rowPlace(row, doc), {
    document: '29230-j30',
    target: { document: '29230-j30', section: '5.1', name: 'ACR/ACA' },
    line: 9,
  });
  assert.deepEqual(registryRows({ code: 272 }, file, doc, index), []);
  assert.deepEqual(
    tablesOf(all[0], file, doc).map(table => table.table),
    ['7.1.0.1'],
  );
  assert.deepEqual(tablesOf(all[2], file, doc), []);
  assert.deepEqual(tablesOf(all[3], file, doc), [], "another document's tables are not this file's");
});

test('the index of the fixture holds every command search does, with the application the model gives it', async () => {
  const index = await readFixture('index.json');
  const search = await readFixture('search.json');
  const documents = await Promise.all(index.documents.map(summary => readFixture(summary.path)));
  const built = commandIndex(documents, index.schema_version);
  const key = (document, section, name, code, application, header, scope) =>
    JSON.stringify([document, section, name, code, application, header, scope]);
  const expected = search.entries
    .filter(entry => entry.kind === 'command')
    .map(({ document, target, name, identity }) =>
      key(
        document,
        target.section,
        name,
        identity.command_code,
        identity.application_id,
        identity.header_application_id,
        identity.application,
      ),
    );
  const got = built.commands.map(command =>
    key(
      command.document,
      command.section,
      command.name,
      command.code,
      command.application,
      command.header,
      command.scope?.name ?? null,
    ),
  );
  assert.deepEqual(got.toSorted(), expected.toSorted());
  assert.equal(built.schema_version, index.schema_version);
});
