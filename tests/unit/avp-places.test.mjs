import assert from 'node:assert/strict';
import test from 'node:test';
import { fallbackPlace, markDetails, namePlaces, placeRoute, tokenPlace } from '../../src/avp-places.ts';
import { resolveClickTarget } from '../../src/click-target.ts';
import { correctedRow, printedRow } from '../../src/printed-row.ts';

const doc = { id: 'd', sections: [{ section: '16.4.7', page: 86, title: 'AVP Y' }, { section: '20.5', page: 172, title: 'AVP Table' }] };
const name = (avp, section, target) => ({ text: avp, avp, source: { section, page: 129, name: avp, row: true }, ...(target ? { target } : {}) });
const marked = tokens => {
  const lines = [{ tokens }];
  markDetails(lines, doc);
  return tokens;
};
const details = { section: '16.4.7', page: 86, name: 'Y', row: true, titled: true };

test('a Section cell in this document gives a row its Details, on the name and on the cell', () => {
  const [row, , cell] = marked([name('Y', '16a.5', { document: 'd', section: '16.4.7' }), { text: ' 12 ' }, { text: '16.4.7', source: { section: '16.4.7', page: 129 } }]);
  assert.deepEqual(row.details, details);
  assert.deepEqual(cell.details, details);
  assert.equal(row.source.section, '16a.5', 'the Definition stays');
  assert.deepEqual(cell.source, { section: '16.4.7', page: 129 }, 'and so does the browser\'s link');
});

test('the Section cell decides, even where the name links elsewhere or nowhere', () => {
  const cell = () => ({ text: '16.4.7', source: { section: '16.4.7', page: 129 } });
  assert.deepEqual(marked([name('Y', '16a.5'), cell()])[0].details, details);
  assert.deepEqual(marked([name('Y', '16a.5', { document: 'other', section: '6.3.2' }), cell()])[0].details, details);
});

test('an origin cell naming this document gives Details, under the name it links', () => {
  const [row, cell] = marked([name('X', '20.5', { document: 'd', section: '16.4.7' }), { text: 'TS29.061', target: { document: 'd', section: '16.4.7', name: 'Y' } }]);
  assert.deepEqual(row.details, details);
  assert.deepEqual(cell.details, details);
});

test('a table with no such column takes the clause the name links to', () => {
  assert.deepEqual(marked([name('Y', '7.1', { document: 'd', section: '16.4.7' })])[0].details, details);
});

test('one place is one target: no Details where the clause is the table\'s own', () => {
  assert.equal(marked([name('Y', '7.3', { document: 'd', section: '7.1' }), { text: '7.3', source: { section: '7.3', page: 19 } }])[0].details, undefined);
  assert.equal(marked([name('Y', '7.1', { document: 'd', section: '7.1' })])[0].details, undefined);
});

test('a cell naming another document leaves the row as it is', () => {
  const [row, cell] = marked([name('Y', '20.5', { document: 'rfc7155', section: '4.2.5' }), { text: 'RFC7155', target: { document: 'rfc7155', section: '4.2.5', name: 'Y' } }]);
  assert.equal(row.details, undefined);
  assert.equal(cell.details, undefined);
  const same = marked([name('Y', '6.4.1', { document: 'd', section: '6.4.2' }), { text: 'TS29.336', target: { document: '29336', section: '8.4.2', name: 'Y' } }]);
  assert.equal(same[0].details, undefined);
  assert.equal(marked([name('Y', '5.4'), { text: ' TS29.061 ' }])[0].details, undefined);
});

test('a later column naming another AVP is not the row\'s cell, and other lines are left alone', () => {
  const [row] = marked([name('Y', '5.4', { document: 'rfc8506', section: '8.52' }), { text: 'Z', avp: 'Z', target: { document: 'd', section: '16.4.7' } }]);
  assert.equal(row.details, undefined);
  const [page] = marked([{ text: '129', source: { section: '16a.5', page: 129 } }]);
  assert.equal(page.details, undefined);
});

const here = { document: 'd', section: '16.4.7' };
const file = () => {
  const lines = [
    { tokens: [{ text: 'Y', avp: 'Y', target: here }] },
    { tokens: [name('Y', '30')] },
    { tokens: [name('Y', '16a.5', here)] },
    { tokens: [name('Y', '20.5', here)] },
    { anchor: '16.4.7', tokens: [{ text: 'Z', avp: 'Z', target: here }] },
  ];
  markDetails(lines, doc);
  return lines;
};

test('a name has one Definition and Details wherever in the file it is asked', () => {
  const lines = file();
  const row = lines[2].tokens[0];
  const expected = {
    definition: { document: 'd', position: row.source, target: { document: 'd', section: '16a.5', name: 'Y' }, line: 2 },
    details: { document: 'd', position: details, target: { document: 'd', section: '16.4.7', name: 'Y' } },
  };
  assert.deepEqual(namePlaces(lines[0].tokens[0], lines, doc), expected, 'a mention');
  assert.deepEqual(namePlaces(row, lines, doc), expected, 'its row');
  assert.deepEqual(namePlaces(lines[3].tokens[0], lines, doc), expected, 'another table listing it');
});

test('rows of the name that link elsewhere answer for themselves, and a name no row lists has only its link', () => {
  const lines = file();
  const hole = lines[1].tokens[0];
  assert.deepEqual(namePlaces(hole, lines, doc), { definition: { document: 'd', position: hole.source, target: { document: 'd', section: '30', name: 'Y' }, line: 1 } });
  assert.deepEqual(namePlaces(lines[4].tokens[0], lines, doc), { definition: { document: 'd', target: { ...here, name: 'Z' } } });
  assert.deepEqual(namePlaces({ text: 'Q', avp: 'Q' }, lines, doc), {});
});

test('a Definition in another document is its clause there, and a Details row is never made from it', () => {
  const lines = [{ tokens: [{ text: 'R', avp: 'R', target: { document: 'rfc6733', section: '6.7.1' } }] }];
  assert.deepEqual(namePlaces(lines[0].tokens[0], lines, doc), { definition: { document: 'rfc6733', target: { document: 'rfc6733', section: '6.7.1', name: 'R' } } });
  const listed = [{ tokens: [name('R', '20.5', { document: 'rfc6733', section: '6.7.1', name: 'S' })] }];
  markDetails(listed, doc);
  assert.deepEqual(namePlaces(listed[0].tokens[0], listed, doc), { definition: { document: 'rfc6733', target: { document: 'rfc6733', section: '6.7.1', name: 'S' } } });
});

test('Details the file has no line for are only in the source', () => {
  const lines = [{ tokens: [name('Y', '16a.5', here)] }];
  markDetails(lines, doc);
  assert.deepEqual(namePlaces(lines[0].tokens[0], lines, doc).details, { document: 'd', position: details });
});

test('a click\'s place: a value\'s row, a cell\'s Details, a link\'s own, and a lost name\'s search of its clause', () => {
  const lines = file();
  const source = { section: '6.3', page: 17, name: 'V', row: true };
  assert.deepEqual(tokenPlace({ text: 'V', target: { document: 'd', section: '6.3' }, source, valueRow: { name: 'V' } }, lines, doc, '6'), { document: 'd', position: source, target: { document: 'd', section: '6.3', name: 'V' } });
  const cell = { text: '16.4.7', source: { section: '16.4.7', page: 129 }, details };
  assert.deepEqual(tokenPlace(cell, lines, doc, '6'), { document: 'd', position: details, target: { document: 'd', section: '16.4.7' } });
  const unlined = { text: '9', source: { section: '9', page: 9 } };
  assert.deepEqual(tokenPlace(unlined, lines, doc, '6'), { document: 'd', position: unlined.source });
  const base = { text: 'RFC6733', target: { document: 'rfc6733' } };
  assert.deepEqual(tokenPlace(base, lines, doc, '6'), { document: 'rfc6733', target: base.target });
  assert.deepEqual(tokenPlace({ text: 'Q', avp: 'Q' }, lines, doc, '6'), { document: 'd', position: { section: '6', page: null, name: 'Q', exact: true, occurrence: true } });
  assert.equal(tokenPlace({ text: 'Q', avp: 'Q' }, lines, doc, undefined), undefined);
  assert.equal(tokenPlace({ text: 'plain' }, lines, doc, '6'), undefined);
});

test('a name\'s click goes to the place chosen, Details unless Definition, and falls back on the other', () => {
  const lines = file();
  const { definition, details: described } = namePlaces(lines[0].tokens[0], lines, doc);
  for (const token of [lines[0].tokens[0], lines[2].tokens[0]]) {
    assert.deepEqual(tokenPlace(token, lines, doc, '6'), { ...described, of: 'details' });
    assert.deepEqual(fallbackPlace(token, lines, doc), { ...definition, of: 'definition' });
    assert.deepEqual(tokenPlace(token, lines, doc, '6', 'definition'), { ...definition, of: 'definition' });
    assert.deepEqual(fallbackPlace(token, lines, doc, 'definition'), { ...described, of: 'details' });
  }
  const only = lines[4].tokens[0];
  assert.deepEqual(tokenPlace(only, lines, doc, '6'), { document: 'd', target: { ...here, name: 'Z' }, of: 'definition' }, 'a name with no Details goes to its Definition');
  assert.equal(fallbackPlace(only, lines, doc), undefined);
  assert.equal(fallbackPlace({ text: '16.4.7', source: { section: '16.4.7', page: 129 }, details }, lines, doc), undefined, 'a cell has one place');
});

test('a stored click target is Definition only if it says so', () => {
  assert.equal(resolveClickTarget('definition'), 'definition');
  assert.equal(resolveClickTarget('details'), 'details');
  assert.equal(resolveClickTarget(null), 'details');
  assert.equal(resolveClickTarget('both'), 'details');
});

test('a place\'s route takes the view to its line, the pane to its position, keeps this document\'s raw text and a switched-off pane', () => {
  const place = { document: 'd', position: { section: '16a.5', page: 129, name: 'Y', row: true }, target: { document: 'd', section: '16a.5', name: 'Y' }, line: 740 };
  assert.equal(placeRoute(place, doc, false), '#d/16a.5?name=Y&source=d&sourceSection=16a.5&page=129&sourceName=Y&row=1&line=740');
  assert.match(placeRoute(place, doc, true), /^#d\/16a\.5\?raw=1&/);
  assert.match(placeRoute(place, doc, false, true), /&pane=0&line=740$/);
  const away = { document: 'rfc6733', target: { document: 'rfc6733', section: '6.7.1', name: 'R' } };
  assert.equal(placeRoute(away, doc, true), '#rfc6733/6.7.1?name=R', 'another document\'s text is corrected, its pane its clause');
});

test('Details of a renamed row keep the spelling its table\'s raw row holds', () => {
  const row = (avp, extra = []) => ({ tokens: [name(avp, '16a.5'), ...extra] });
  const corrected = {
    corrections: { fix: { kind: 'correction' } },
    lines: [row('A'), row('Good-Name', [{ text: ';;', kind: 'correction-note', correction: 'fix' }]), row('C')],
  };
  const raw = { lines: [row('A'), row('Bad-Name'), row('C')] };
  const position = { section: '16.4.7', name: 'Good-Name', row: true, titled: true };
  assert.equal(correctedRow(corrected, position), true);
  assert.equal(printedRow(corrected, raw, position), 'Bad-Name');
  assert.equal(correctedRow(corrected, { section: '16.4.7', name: 'A' }), false);
});
