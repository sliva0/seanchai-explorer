import assert from 'node:assert/strict';
import test from 'node:test';
import { avpPlaces, markDetails } from '../../src/avp-places.ts';
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

test('a name knows both places, from its row or the AVP\'s row anywhere in the file', () => {
  const lines = [
    { tokens: [{ text: 'Y', avp: 'Y', target: { document: 'd', section: '16.4.7' } }] },
    { tokens: [name('Y', '30')] },
    { tokens: [name('Y', '16a.5', { document: 'd', section: '16.4.7' })] },
  ];
  markDetails(lines, doc);
  const row = lines[2].tokens[0];
  assert.deepEqual(avpPlaces(row, lines), { definition: row.source, details });
  assert.deepEqual(avpPlaces(lines[0].tokens[0], lines), { definition: row.source, details }, 'a mention, from the row with both');
  assert.deepEqual(avpPlaces(lines[1].tokens[0], lines), { definition: lines[1].tokens[0].source, details: undefined }, 'a row answers for itself');
  assert.deepEqual(avpPlaces({ text: 'Q', avp: 'Q' }, lines), { definition: undefined, details: undefined });
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
