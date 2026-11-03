import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { matchOnRow, rowOnPage } from '../../src/pdf-navigation.ts';

// Text items captured from the ETSI PDFs: [str, x, y, width, height], in content order.
const pages = JSON.parse(await readFile(new URL('../fixtures/pdf-rows.json', import.meta.url), 'utf8'));
const items = (doc, page) => pages.find(entry => entry.doc === doc && entry.page === page).items
  .map(([str, x, y, width, height]) => ({ str, transform: [1, 0, 0, 1, x, y], width, height, hasEOL: false }));
const top = y => y + 9 + 10;

test('names on one line and wrapped over the AVP code column are rows, whatever the wrap', () => {
  const page = items('29061-i10', 131);
  assert.equal(rowOnPage(page, '3GPP-IMSI'), top(730.7));
  assert.equal(rowOnPage(page, '3GPP-SGSN-Address'), top(614.3));
  assert.equal(rowOnPage(page, '3GPP-GPRS-Negotiated-QoS-Profile'), top(645.9));
  assert.equal(rowOnPage(page, '3GPP-CG-Address'), top(667.1));
});

test('a name is a whole cell, not the start of another name or a header', () => {
  const page = items('29061-i10', 131);
  assert.equal(rowOnPage(page, '3GPP-SGSN'), null);
  assert.equal(rowOnPage(page, '3GPP-GPRS-Negotiated'), null);
  assert.equal(rowOnPage(page, 'Attribute Name'), null);
});

test('a message format above the table holds no row', () => {
  const page = items('29061-i10', 129);
  assert.equal(rowOnPage(page, 'Redirected-Host'), null);
  assert.equal(rowOnPage(page, 'Proxy-Info'), null);
});

test('re-used tables: a reference beside the name, on its line or centred between its lines', () => {
  const reused = items('29153-i00', 12);
  assert.equal(rowOnPage(reused, 'Congestion-Level-Range'), top(718.5));
  assert.equal(rowOnPage(reused, 'DRMP'), top(676.1));
  assert.equal(rowOnPage(reused, 'Monitoring-Duration'), top(613));
  assert.equal(rowOnPage(items('29128-i00', 42), 'Monitoring-Event-Configuration'), top(727.8));
});

test('other columns centred between the lines of a name do not break it', () => {
  assert.equal(rowOnPage(items('32299-i00', 110), 'RAN-Secondary-RAT-Usage-Report'), top(508));
});

test('a code of NOTE, a name with its code in one item, and a name written with AVP', () => {
  assert.equal(rowOnPage(items('29229-i10', 24), 'Load'), top(580.7));
  assert.equal(rowOnPage(items('32299-i00', 105), 'Carrier-Select-Routing-Information'), top(378.8));
  assert.equal(rowOnPage(items('29209-680', 17), 'Media-Sub-Component'), top(175.1));
});

test('wrapped with the code on the first line, in the table of TS 29.272', () => {
  assert.equal(rowOnPage(items('29272-i70', 88), 'Requested-EUTRAN-Authentication-Info'), top(643.4));
});

test('an information element named like the AVP in the next column is not a row', () => {
  assert.equal(rowOnPage(items('29234-b20', 83), 'Visited-Network-Identifier'), null);
});

test('the find match on a row is told by its place on the page, not by coming first', () => {
  const page = [
    { str: 'A mention of Session-Id above', transform: [1, 0, 0, 1, 56, 700], height: 10, hasEOL: true },
    { str: 'Session-Id', transform: [1, 0, 0, 1, 56, 600], height: 9, hasEOL: false },
    { str: '263', transform: [1, 0, 0, 1, 170, 600], height: 9, hasEOL: true },
    { str: 'and below: Session-Id', transform: [1, 0, 0, 1, 56, 500], height: 9, hasEOL: true },
  ];
  // Offsets count each item's string and one character for each line end, as the find controller joins them.
  const first = 'A mention of '.length;
  const second = 'A mention of Session-Id above\n'.length;
  const third = 'A mention of Session-Id above\nSession-Id263\nand below: '.length;
  assert.equal(matchOnRow(page, [first, second, third], 600 + 9 + 10), 1);
  assert.equal(matchOnRow(page, [first, second, third], 500 + 9 + 10), 2);
  assert.equal(matchOnRow(page, [second], 700 + 10 + 10), 0);
});
