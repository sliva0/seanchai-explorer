import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { createHighlighter } from '../src/highlight.ts';

const grammar = JSON.parse(await readFile(new URL('../public/syntax/dad.tmLanguage.json', import.meta.url), 'utf8'));
const highlight = createHighlighter(grammar);
const line = text => ({ anchor: null, section: null, tokens: [{ text: `${text}\n`, class: '' }] });
const scopeFor = (line, text) => line.tokens.find(token => token.text === text)?.class;

test('viewer uses the editor grammar for directives, presence, enums, types, flags and references', () => {
  const lines = highlight([
    line('; Type: Message'), line('; Bases: RFC6733'),
    line('        < Session-Id >'), line('        { Origin-Host }'), line('      * [ Proxy-Info ] ; bold ; strikethrough'),
    line('Mode ::= < Enumerated AVP header: 10 10415 >'), line('    Active = 1'),
    line('; Columns: Name   Code   Type   Must   From'),
    line('Mode   10   Enumerated   M,V   RFC6733'),
    line('Other   11   UTF8String   -   RFC6733'),
  ]);
  assert.equal(scopeFor(lines[0], 'Type'), 'keyword.other.directive.dad');
  assert.equal(scopeFor(lines[0], 'Message'), 'storage.type.section.dad');
  assert.equal(scopeFor(lines[1], 'RFC6733'), 'entity.name.tag.spec-ref.dad');
  assert.equal(scopeFor(lines[2], 'Session-Id'), 'support.class.avp.fixed.dad');
  assert.equal(scopeFor(lines[3], 'Origin-Host'), 'support.function.avp.required.dad');
  assert.equal(scopeFor(lines[4], 'Proxy-Info'), 'variable.other.avp.optional.dad');
  assert.ok(lines[4].class.includes('bold-rule'));
  assert.ok(lines[4].class.includes('struck-rule'));
  assert.equal(scopeFor(lines[6], 'Active'), 'variable.other.enum.dad');
  assert.equal(scopeFor(lines[8], 'Enumerated'), 'storage.type.data-type.dad');
  assert.equal(scopeFor(lines[8], 'M,V'), 'constant.language.avp-flag.dad');
  assert.ok(lines[9].class.includes('striped'));
});

test('syntax splitting preserves corpus bytes and every navigation or correction annotation', async () => {
  const directory = new URL('../public/data/documents/', import.meta.url);
  for (const file of await readdir(directory)) {
    const doc = JSON.parse(await readFile(new URL(file, directory), 'utf8'));
    for (const original of [doc.lines, doc.raw]) {
      if (!original) continue;
      const highlighted = highlight(original);
      for (let i = 0; i < original.length; i++) {
        assert.equal(highlighted[i].tokens.map(token => token.text).join(''), original[i].tokens.map(token => token.text).join(''));
        const annotations = tokens => tokens.filter(token => token.target || token.source || token.correction)
          .flatMap(token => [...token.text].map(text => JSON.stringify([text, token.target, token.source, token.correction])));
        assert.deepEqual(annotations(highlighted[i].tokens), annotations(original[i].tokens));
      }
    }
  }
});
