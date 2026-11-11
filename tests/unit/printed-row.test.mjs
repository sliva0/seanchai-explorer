import assert from 'node:assert/strict';
import test from 'node:test';
import { correctedRow, printedRow } from '../../src/printed-row.ts';

const row = (section, name, note) => ({
  section,
  tokens: [
    { avp: name, source: { name, page: 1, row: true, section }, text: name },
    ...(note ? [{ correction: note, kind: 'correction-note', text: `;; (${note})` }] : []),
  ],
});
const corrections = {
  rename: { kind: 'correction', reason: 'misspelt' },
  type: { kind: 'correction', reason: 'wrong type' },
  added: { kind: 'insert', reason: 'omitted' },
};

// Table 5.2.3.1/2 of TS 29.273, whose QoS-Capability stands twice.
const doc = {
  corrections,
  lines: [
    row('5.2.3.1', 'QoS-Capability'),
    row('5.2.3.1', 'Service-Selection'),
    row('5.2.3.1', 'QoS-Capability'),
    row('5.2.3.1', 'Acct-Interim-Interval', 'rename'),
    row('5.2.3.1', 'Auth-Request-Type'),
    row('5.2.3.1', 'Subscription-Id', 'type'),
    row('5.2.3.1', 'MME-Name', 'added'),
    row('5.2.3.1', 'User-Name'),
    row('6.5', 'ProSe-App-Code-Suffix-Range', 'rename'),
    row('7', 'Dropped-Before', 'rename'),
  ],
};
const raw = {
  lines: [
    row('5.2.3.1', 'QoS-Capability'),
    row('5.2.3.1', 'Service-Selection'),
    row('5.2.3.1', 'QoS-Capability'),
    row('5.2.3.1', 'Accounting-Interim-Interval'),
    row('5.2.3.1', 'Auth-Request-Type'),
    row('5.2.3.1', 'Subscription-ID'),
    row('5.2.3.1', 'User-Name'),
    row('6.5', 'ProSe-Application-Code-Suffix-Range'),
  ],
};

test('a renamed row pairs with the raw row at its place, whatever stands twice', () => {
  assert.equal(
    printedRow(doc, raw, { section: '5.2.3.1', name: 'Acct-Interim-Interval' }),
    'Accounting-Interim-Interval',
  );
  assert.equal(
    printedRow(doc, raw, { section: '6.5', name: 'ProSe-App-Code-Suffix-Range' }),
    'ProSe-Application-Code-Suffix-Range',
  );
});

test('inserted rows, unchanged names, and rows the raw mirror lacks have no other spelling', () => {
  assert.equal(printedRow(doc, raw, { section: '5.2.3.1', name: 'MME-Name' }), null);
  assert.equal(printedRow(doc, raw, { section: '5.2.3.1', name: 'User-Name' }), null);
  assert.equal(printedRow(doc, raw, { section: '5.2.3.1', name: 'Subscription-Id' }), null);
  assert.equal(printedRow(doc, raw, { section: '7', name: 'Dropped-Before' }), null);
  assert.equal(printedRow(doc, raw, { section: '5.2.3.1', name: 'Not-A-Row' }), null);
});

test('rows after one the corpus dropped still pair', () => {
  const after = { corrections, lines: [row('8', 'Kept'), row('8', 'New-Name', 'rename')] };
  const before = { lines: [row('8', 'Dropped'), row('8', 'Kept'), row('8', 'Old-Name')] };
  assert.equal(printedRow(after, before, { section: '8', name: 'New-Name' }), 'Old-Name');
});

test('only a row whose note says it was changed can read otherwise in the source', () => {
  assert.equal(correctedRow(doc, { section: '5.2.3.1', name: 'Acct-Interim-Interval' }), true);
  assert.equal(correctedRow(doc, { section: '5.2.3.1', name: 'MME-Name' }), false);
  assert.equal(correctedRow(doc, { section: '5.2.3.1', name: 'User-Name' }), false);
});
