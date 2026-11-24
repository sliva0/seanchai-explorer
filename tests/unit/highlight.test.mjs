import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { createHighlighter } from '../../src/highlight.ts';
import { fixture } from './helpers.mjs';

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
  assert.throws(() => createHighlighter({ ...empty, patterns: [{ begin: 'a' }] }), /without an end/);
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
  const [row] = highlight([
    {
      tokens: [
        { text: 'Mode ' },
        { text: ';; plain 1 note', kind: 'comment' },
        { text: ';; inserted: (TS.py#x)', kind: 'correction-note', correction: 'TS.py#x' },
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
