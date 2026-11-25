import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { createHighlighter } from '../../src/highlight.ts';
import { fixture, readFixture } from './helpers.mjs';

const grammar = JSON.parse(await readFile(new URL('../../syntax/dad.tmLanguage.json', import.meta.url), 'utf8'));
const highlight = createHighlighter(grammar);
const line = text => ({ tokens: [{ text: `${text}\n` }] });
const scopeFor = (line, text) => line.tokens.find(token => token.text === text)?.scope;

test('viewer uses the editor grammar for directives, presence, enums, types, flags and references', () => {
  const lines = highlight([
    line('; Type: Message'),
    line('; Bases: RFC6733'),
    line('        < Session-Id >'),
    line('        { Origin-Host }'),
    line('      * [ Proxy-Info ] ; bold ; strikethrough'),
    line('Mode ::= < Enumerated AVP header: 10 10415 >'),
    line('    Active = 1'),
    line('; Columns: Name   Code   Type   Must   From'),
    line('Mode   10   Enumerated   M,V   RFC6733'),
    line('Other   11   UTF8String   -   RFC6733'),
    line('; Link: https://example.org/a.pdf'),
  ]);
  assert.equal(scopeFor(lines[0], 'Type'), 'keyword.other.directive.dad');
  assert.equal(scopeFor(lines[0], 'Message'), 'storage.type.section.dad');
  assert.equal(scopeFor(lines[1], 'RFC6733'), 'entity.name.tag.spec-ref.dad');
  assert.equal(scopeFor(lines[2], 'Session-Id'), 'support.class.avp.fixed.dad');
  assert.equal(scopeFor(lines[3], 'Origin-Host'), 'support.function.avp.required.dad');
  assert.equal(scopeFor(lines[4], 'Proxy-Info'), 'variable.other.avp.optional.dad');
  assert.ok(lines[4].decoration.includes('bold-rule'));
  assert.ok(lines[4].decoration.includes('struck-rule'));
  assert.equal(scopeFor(lines[6], 'Active'), 'variable.other.enum.dad');
  assert.equal(scopeFor(lines[8], 'Enumerated'), 'storage.type.data-type.dad');
  assert.equal(scopeFor(lines[8], 'M,V'), 'constant.language.avp-flag.dad');
  assert.ok(lines[9].decoration.includes('striped'));
  assert.equal(scopeFor(lines[10], 'https://example.org/a.pdf'), 'markup.underline.link.dad');
});

test("a directive's list gives each entry its own scope, past the first comma", () => {
  // The value's tokens, past `; `, the key and `: `, leaving out the spaces between them.
  const value = line =>
    line.tokens
      .slice(3)
      .filter(token => token.text.trim())
      .map(token => [token.text, token.scope]);
  const [applies, bases, obsoletes, versions, open, transcribed, name] = highlight([
    line('; Applies-To: 7.2.21.*, 7.2.22.*, E.6.*, 7.2.24.*'),
    line('; Bases: RFC6733, TS29.229, ETSI-ES283.035 ;; corrected: (TS29.109.py#bases-cx)'),
    line('; Obsoletes: RFC3588, RFC5719'),
    line('; Versions: 18.7.0..19.6.0'),
    line('; Versions: *..19.6.0'),
    line('; Transcribed: by hand from https://example.org/a.pdf'),
    line('; Name: Update-Location-Request, ULR'),
  ]);
  const comma = [',', 'punctuation.separator.comma.dad'];
  const clause = text => [text, 'constant.other.section.wildcard.dad'];
  const ref = text => [text, 'entity.name.tag.spec-ref.dad'];
  assert.equal(scopeFor(applies, 'Applies-To'), 'keyword.other.directive.dad');
  assert.deepEqual(value(applies), [
    clause('7.2.21.*'),
    comma,
    clause('7.2.22.*'),
    comma,
    clause('E.6.*'),
    comma,
    clause('7.2.24.*'),
  ]);
  assert.deepEqual(value(bases), [
    ref('RFC6733'),
    comma,
    ref('TS29.229'),
    comma,
    ref('ETSI-ES283.035'),
    [';; ', 'comment.line.double-semicolon.dad'],
    ['corrected', 'keyword.other.note.dad'],
    [': (', 'comment.line.double-semicolon.dad'],
    ['TS29.109.py#bases-cx', 'markup.underline.link.declaration.dad'],
    [')', 'comment.line.double-semicolon.dad'],
  ]);
  assert.deepEqual(value(obsoletes), [ref('RFC3588'), comma, ref('RFC5719')]);
  assert.deepEqual(value(versions), [
    ['18.7.0', 'constant.other.section.dad'],
    ['..', 'keyword.operator.range.dad'],
    ['19.6.0', 'constant.other.section.dad'],
  ]);
  assert.deepEqual(value(open), [
    ['*', 'keyword.operator.dad'],
    ['..', 'keyword.operator.range.dad'],
    ['19.6.0', 'constant.other.section.dad'],
  ]);
  assert.equal(scopeFor(transcribed, 'https://example.org/a.pdf'), 'markup.underline.link.dad', 'a link past words');
  assert.equal(scopeFor(transcribed, 'hand'), 'string.unquoted.directive-value.dad');
  assert.equal(
    scopeFor(name, 'Update-Location-Request, ULR'),
    'string.unquoted.directive-value.dad',
    'a free-text value stays one string',
  );
});

test("TS 29.272's Applies-To line scopes each of its clauses alike, none of them a link", async () => {
  const { lines } = await readFixture('documents/29272-j60.json');
  const original = lines.find(line =>
    line.tokens
      .map(token => token.text)
      .join('')
      .startsWith('; Applies-To:'),
  );
  const [highlighted] = highlight([original]);
  const clauses = highlighted.tokens.filter(token => token.scope === 'constant.other.section.wildcard.dad');
  assert.deepEqual(
    clauses.map(token => token.text),
    ['7.2.21.*', '7.2.22.*', '7.2.23.*', '7.2.24.*'],
  );
  assert.ok(clauses.every(token => !token.target && !token.source));
});

test('void values highlight like reserved ones, single or ranged', () => {
  const [reserved, single, ranged] = highlight([
    line('    ; RESERVED = 5'),
    line('    ; VOID = 5'),
    line('    ; VOID = 6-7'),
  ]);
  assert.equal(scopeFor(reserved, '; RESERVED'), 'keyword.other.reserved.dad');
  assert.equal(scopeFor(reserved, '5'), 'constant.numeric.dad');
  assert.equal(scopeFor(single, '; VOID'), 'keyword.other.void.dad');
  assert.equal(scopeFor(single, '='), 'keyword.operator.assignment.dad');
  assert.equal(scopeFor(single, '5'), 'constant.numeric.dad');
  assert.equal(scopeFor(ranged, '; VOID'), 'keyword.other.void.dad');
  assert.equal(scopeFor(ranged, '-'), 'keyword.operator.range.dad');
  assert.equal(scopeFor(ranged, '7'), 'constant.numeric.dad');
});

test('a grammar rule the scanner cannot run is refused rather than ignored', () => {
  const empty = { patterns: [], repository: {} };
  assert.doesNotThrow(() =>
    createHighlighter({
      ...empty,
      patterns: [{ comment: 'note', match: 'x', name: 'y', captures: { 1: { name: 'z' } } }],
    }),
  );
  assert.doesNotThrow(() => createHighlighter({ ...empty, patterns: [{ begin: 'a', end: 'b', contentName: 'c' }] }));
  assert.throws(
    () => createHighlighter({ ...empty, patterns: [{ begin: 'a', end: 'b', applyEndPatternLast: 1 }] }),
    /"applyEndPatternLast" at patterns\[0\]/,
  );
  assert.throws(() => createHighlighter({ ...empty, patterns: [{ begin: 'a' }] }), /must define both/);
  assert.throws(
    () => createHighlighter({ ...empty, patterns: [{ begin: 'a', end: 'b', beginCaptures: { 1: { match: 'x' } } }] }),
    /"match" at patterns\[0\]\.beginCaptures\[1\]/,
  );
  assert.throws(
    () => createHighlighter({ ...empty, repository: { block: { patterns: [{ match: 'x', while: 'y' }] } } }),
    /"while" at repository\.block\.patterns\[0\]/,
  );
  assert.throws(
    () => createHighlighter({ ...empty, patterns: [{ match: 'x', captures: { 1: { contentName: 'y' } } }] }),
    /"contentName" at patterns\[0\]\.captures\[1\]/,
  );
});

test("an Information Elements block's rows end in a category, which is no flag, until the next block", () => {
  const lines = highlight([
    line('; Type: Information Elements'),
    line('; Command: Update-Location-Request'),
    line('; Columns: Name   AVP   Cat'),
    line('IMSI   User-Name   M'),
    line('"Visited PLMN Id"   Visited-PLMN-Id   C'),
    line(''),
    line('; Type: Information Elements'),
    line('; Columns: Name   AVP   Cat'),
    line('Result   Result-Code   O'),
    line(''),
    line('; Type: AVP Table'),
    line('; Columns: Name   Code   Type   Must   From'),
    line('Mode   10   Enumerated   M   RFC6733'),
  ]);
  assert.equal(scopeFor(lines[0], 'Information Elements'), 'storage.type.section.dad');
  assert.equal(scopeFor(lines[3], 'M'), 'constant.language.category.dad');
  assert.equal(scopeFor(lines[4], '"Visited PLMN Id"'), 'string.quoted.double.mark.dad');
  assert.equal(scopeFor(lines[4], 'C'), 'constant.language.category.dad');
  assert.equal(scopeFor(lines[8], 'O'), 'constant.language.category.dad', 'a second block stays in the region');
  assert.equal(scopeFor(lines[10], 'AVP Table'), 'storage.type.section.dad');
  assert.equal(scopeFor(lines[12], 'M'), 'constant.language.avp-flag.dad', 'the next block ends it');
});

test('a region opens and closes over lines, with its scopes, and one empty at a place is not begun again there', () => {
  const regions = createHighlighter({
    patterns: [{ begin: '^<', end: '>', name: 'edge', contentName: 'inside', patterns: [{ match: 'x', name: 'x' }] }],
    repository: {},
  });
  const [open, middle, close] = regions([line('a <b x'), line('c x'), line('d> x')]);
  assert.deepEqual(
    open.tokens.map(token => [token.text, token.scope]),
    [['a <b x\n', '']],
    'a begin anchored at the start of a line opens nothing past it',
  );
  const anchored = regions([line('<b x'), line('c x'), line('d> x')]);
  assert.deepEqual(
    anchored[0].tokens.map(token => [token.text, token.scope]),
    [
      ['<', 'edge'],
      ['b ', 'inside'],
      ['x', 'x'],
      ['\n', 'inside'],
    ],
  );
  assert.equal(scopeFor(anchored[1], 'c '), 'inside');
  assert.deepEqual(
    anchored[2].tokens.map(token => [token.text, token.scope]),
    [
      ['d', 'inside'],
      ['>', 'edge'],
      [' x\n', ''],
    ],
    'past its end the text is outside it, where its patterns are not tried',
  );
  assert.equal(middle.tokens.length, 1);
  assert.equal(close.tokens.length, 1);
  const empty = createHighlighter({
    patterns: [{ begin: '(?=a)', end: '(?=a)', patterns: [{ match: 'a', name: 'a' }] }],
    repository: {},
  });
  assert.deepEqual(
    empty([line('aa')])[0].tokens.map(token => [token.text, token.scope]),
    [
      ['a', 'a'],
      ['a\n', ''],
    ],
    'it ends at the next place, and is not begun again where it ended',
  );
});

test('comment and correction-note tokens keep their kind and are not split by the grammar', () => {
  const [row, excluded, interpreted] = highlight([
    {
      tokens: [
        { text: 'Mode ' },
        { text: ';; plain 1 note', kind: 'comment' },
        { text: ';; inserted: (TS.py#x)', kind: 'correction-note', correction: 'TS.py#x' },
        { text: '\n' },
      ],
    },
    { tokens: [{ text: ';; excluded: clause 8 (Sh-ee), see TS29.329.toml', kind: 'comment' }, { text: '\n' }] },
    {
      tokens: [
        { text: '; Type: Interpreted Constraints ' },
        {
          text: ';; interpreted: (TS29.272.dadx#imei-digits)',
          kind: 'correction-note',
          correction: 'TS29.272.dadx#imei-digits',
        },
        { text: '\n' },
      ],
    },
  ]);
  assert.deepEqual(
    row.tokens.filter(token => token.kind).map(token => [token.text, token.scope]),
    [
      [';; plain 1 note', 'comment'],
      [';; inserted: (TS.py#x)', 'correction-note'],
    ],
  );
  const parts = token => token.parts?.map(part => [token.text.slice(part.from, part.to), part.scope]);
  assert.equal(parts(row.tokens[1]), undefined, 'a plain note has no parts');
  assert.deepEqual(
    parts(row.tokens[2]),
    [
      ['inserted', 'keyword.other.note.dad'],
      ['TS.py#x', 'markup.underline.link.declaration.dad'],
    ],
    "within a note, the grammar's scopes of its kind and the declaration it cites",
  );
  assert.deepEqual(parts(excluded.tokens[0]), [
    ['excluded', 'keyword.other.note.dad'],
    ['TS29.329.toml', 'markup.underline.link.declaration.dad'],
  ]);
  assert.deepEqual(parts(interpreted.tokens.find(token => token.correction)), [
    ['interpreted', 'keyword.other.note.dad'],
    ['TS29.272.dadx#imei-digits', 'markup.underline.link.declaration.dad'],
  ]);
});

test("a .dadx file's ; Interprets: header is a directive of free text, as ; Specification: is", () => {
  const [interprets, specification] = highlight([
    line('; Interprets: TS29.272'),
    line('; Specification: 3GPP TS 29.272'),
  ]);
  for (const [highlighted, key, value] of [
    [interprets, 'Interprets', 'TS29.272'],
    [specification, 'Specification', '3GPP TS 29.272'],
  ]) {
    assert.equal(scopeFor(highlighted, key), 'keyword.other.directive.dad');
    assert.equal(scopeFor(highlighted, value), 'string.unquoted.directive-value.dad');
  }
});

test('syntax splitting preserves corpus bytes and every navigation or correction annotation', async () => {
  const directory = new URL('documents/', fixture);
  for (const file of await readdir(directory)) {
    const { lines: original } = JSON.parse(await readFile(new URL(file, directory), 'utf8'));
    const highlighted = highlight(original);
    for (let i = 0; i < original.length; i++) {
      assert.equal(
        highlighted[i].tokens.map(token => token.text).join(''),
        original[i].tokens.map(token => token.text).join(''),
      );
      const annotations = tokens =>
        tokens
          .filter(token => token.target || token.source || token.correction)
          .flatMap(token =>
            [...token.text].map(text => JSON.stringify([text, token.target, token.source, token.correction])),
          );
      assert.deepEqual(annotations(highlighted[i].tokens), annotations(original[i].tokens));
    }
  }
});

test("an interpreted rule's in list is scoped as the rule is, on the lines the formatter wrapped it onto", () => {
  const lines = highlight([
    line('; Type: Interpreted Constraints'),
    line('; AVP: Result-Code'),
    line('"When one of the result codes defined here is included in a response ..."'),
    line('    absent-if Experimental-Result/Experimental-Result-Code in DIAMETER_ERROR_A,'),
    line('        "DIAMETER_ERROR_TRANSPARENT_DATA OUT_OF_SYNC", 5000..5999,'),
    line('        DIAMETER_ERROR_B and not Origin-Host in X, Y'),
    line('        < Session-Id >'),
  ]);
  assert.equal(scopeFor(lines[3], 'in'), 'keyword.operator.condition.dad');
  assert.equal(scopeFor(lines[3], 'DIAMETER_ERROR_A'), 'variable.other.avp.dad');
  assert.equal(scopeFor(lines[3], ','), 'punctuation.separator.comma.dad');
  assert.equal(scopeFor(lines[4], '"DIAMETER_ERROR_TRANSPARENT_DATA OUT_OF_SYNC"'), 'string.quoted.double.mark.dad');
  assert.equal(scopeFor(lines[4], '..'), 'keyword.operator.dad');
  assert.equal(scopeFor(lines[4], '5000'), 'constant.numeric.dad');
  assert.equal(scopeFor(lines[5], 'DIAMETER_ERROR_B'), 'variable.other.avp.dad');
  assert.equal(scopeFor(lines[5], 'not'), 'keyword.operator.condition.dad');
  assert.equal(scopeFor(lines[5], 'Origin-Host'), 'variable.other.avp.dad');
  assert.equal(scopeFor(lines[6], 'Session-Id'), 'support.class.avp.fixed.dad', 'a rule line indented as much is none');
});
