import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { clauseOnPage, formatOnPage, headingOnPage, looseRowOnPage, matchOnRow, mentionOnPage, rowOnPage, valueRowOnPage } from '../../src/pdf-navigation.ts';

// Text items captured from the ETSI PDFs: [str, x, y, width, height], in content order.
const pages = JSON.parse(await readFile(new URL('../fixtures/pdf-rows.json', import.meta.url), 'utf8'));
const items = (doc, page) => pages.find(entry => entry.doc === doc && entry.page === page).items
  .map(([str, x, y, width, height]) => ({ str, transform: [1, 0, 0, 1, x, y], width, height, hasEOL: false }));
const top = (y, height = 9) => y + height + 10;

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

test('a tall row: the reference well above or below the name, the description between', () => {
  const page = items('29219-i00', 19);
  assert.equal(rowOnPage(page, 'Logical-Access-ID'), top(613.5));
  assert.equal(rowOnPage(page, 'Physical-Access-ID'), top(498.2));
  assert.equal(rowOnPage(page, 'Supported-Features'), top(435.6));
  assert.equal(rowOnPage(page, 'OC-Supported-Features'), top(550.5));
});

test('a clause cited as 5b.3.4, or as Clause 20.5a.5', () => {
  const page = items('29212-i20', 237);
  assert.equal(rowOnPage(page, 'ADC-Rule-Base-Name'), top(739));
  assert.equal(rowOnPage(page, 'ADC-Rule-Name'), top(560.8));
  assert.equal(rowOnPage(items('29061-i10', 155), 'MBMS-GW-UDP-Port'), top(728.9));
});

test('a name marked (NOTE n), on the line of its end or its only line', () => {
  assert.equal(rowOnPage(items('29212-i20', 222), 'Event-Report-Indication'), top(750.4));
  assert.equal(rowOnPage(items('29214-i40', 36), 'Sponsored-Connectivity-Data'), top(332.8));
  assert.equal(rowOnPage(items('29212-i20', 123), 'Conditional-APN-Aggregate-Max-Bitrate'), top(241.1));
});

test('the next column touching the name, at its start or between its lines', () => {
  assert.equal(rowOnPage(items('29273-i60', 198), 'Equipment-Status'), top(688.5));
  assert.equal(rowOnPage(items('29273-i60', 198), 'User-Name'), top(699.3));
  const page = items('29338-i20', 29);
  assert.equal(rowOnPage(page, 'SM-Delivery-Failure-Cause'), top(527.2));
  assert.equal(rowOnPage(page, 'SMSMI-Correlation-ID'), top(463.6));
});

test('a reference the table misprints, and a name printed with an en dash', () => {
  assert.equal(rowOnPage(items('29273-i60', 146), 'User-Name'), top(672.9));
  assert.equal(rowOnPage(items('32299-i00', 113), 'User-Session-Id'), top(714.2));
});

test('a name the table cuts short is found loosely, under what it prints, and only then', () => {
  const page = items('29272-i70', 91);
  assert.equal(rowOnPage(page, 'Additional-Context-Identifier'), null);
  const { top: at, text } = looseRowOnPage(page, 'Additional-Context-Identifier');
  assert.equal(rowOnPage(page, 'Additional-Context-ID'), at);
  assert.equal(text, 'Additional-Context-ID');
});

test('loosely is not another name: a changed letter, or a word more or less', () => {
  const page = items('29061-i10', 131);
  assert.ok(rowOnPage(page, '3GPP-SGSN-Address'));
  assert.equal(looseRowOnPage(page, '3GPP-XGSN-Address'), null);
  assert.equal(looseRowOnPage(page, '3GPP-SGSN'), null);
  assert.equal(looseRowOnPage(page, '3GPP-SGSN-Address-Extra'), null);
  assert.equal(looseRowOnPage(items('32299-i00', 113), 'User-Session-Name'), null);
  assert.equal(looseRowOnPage(items('32299-i00', 113), 'User-Session-Identity').text, 'User–Session-Id');
});

test('a row the source does not print: the clause named after it, not its contents line', () => {
  const width = 595;
  assert.equal(clauseOnPage(items('29229-i10', 32), 'Wildcarded-IMPU', width), top(287.6, 14));
  assert.equal(clauseOnPage(items('29229-i10', 5), 'Wildcarded-IMPU', width), null);
  assert.equal(clauseOnPage(items('29229-i10', 32), 'Wildcarded', width), null);
});

test('an inserted row: the AVP format naming it, as a whole word', () => {
  const page = items('29128-i00', 49);
  assert.equal(formatOnPage(page, 'IMEI'), top(612.3, 10));
  assert.equal(formatOnPage(page, 'Software-Version'), top(591.8, 10));
  assert.equal(formatOnPage(items('29128-i00', 48), 'IMEI'), null);
  assert.equal(mentionOnPage(items('29128-i00', 48), 'IMEI'), null);
});

test('a mention however it writes the name, not in the contents', () => {
  assert.equal(mentionOnPage(items('29061-i10', 98), '3GPP-Session-Stop-Indicator'), top(465.2, 12));
  assert.equal(mentionOnPage(items('29234-b20', 40), 'SIP-Authentication-Scheme'), top(320.2));
  assert.equal(mentionOnPage(items('29229-i10', 5), 'Wildcarded-IMPU'), null);
});

test('the find match on a row is told by its place on the page, not by coming first', () => {
  const page = [
    { str: 'A mention of Session-Id above', transform: [1, 0, 0, 1, 56, 700], height: 10, hasEOL: true },
    { str: 'Session-Id', transform: [1, 0, 0, 1, 56, 600], height: 9, hasEOL: false },
    { str: '263', transform: [1, 0, 0, 1, 170, 600], height: 9, hasEOL: true },
    { str: 'and below: Session-Id', transform: [1, 0, 0, 1, 56, 500], height: 9, hasEOL: true },
  ];
  // The find controller's offsets count the strings only, not the line ends between them.
  const first = 'A mention of '.length;
  const second = 'A mention of Session-Id above'.length;
  const third = 'A mention of Session-Id aboveSession-Id263and below: '.length;
  assert.equal(matchOnRow(page, [first, second, third], 600 + 9 + 10), 1);
  assert.equal(matchOnRow(page, [first, second, third], 500 + 9 + 10), 2);
  assert.equal(matchOnRow(page, [second], 700 + 10 + 10), 0);
});

test('a mention beside the name, on its line, does not take the selection from it', () => {
  // TS 29.153 table 5.4.1.1: "Load" and "The AVP used to convey load information", heights differing in the last bits.
  const page = [
    { str: 'Load', transform: [1, 0, 0, 1, 93.6, 654.9], height: 9, hasEOL: false },
    { str: 'The AVP used to convey load information', transform: [1, 0, 0, 1, 253.4, 654.9], height: 9.00001, hasEOL: true },
  ];
  assert.equal(matchOnRow(page, [0, 'LoadThe AVP used to convey '.length], 654.9 + 9.00001 + 10), 0);
});

test('a table of AVPs numbering its rows holds no value row, unless asked for: its name is its first cell or none', () => {
  assert.equal(rowOnPage(items('29272-i70', 125), 'UTRAN Not Allowed'), null);
});

test('a bit table: the name beside its number, on one line or wrapped', () => {
  const page = items('29272-i70', 125);
  assert.equal(valueRowOnPage(page, 'UTRAN Not Allowed'), top(730.8));
  assert.equal(valueRowOnPage(page, 'NR as Secondary RAT in E-UTRAN Not Allowed'), top(644.1));
  assert.equal(valueRowOnPage(page, 'WB-E-UTRAN(MEO) Not Allowed'), top(527.2));
  assert.equal(valueRowOnPage(page, 'UTRAN'), null);
  const wrapped = items('29272-i70', 102);
  assert.equal(valueRowOnPage(wrapped, 'Separation Indication'), top(518.6));
  assert.equal(valueRowOnPage(wrapped, 'MME Registered for SMS'), top(476.7));
  assert.equal(valueRowOnPage(wrapped, 'PDN Context Sync Up With UDM not requested'), top(762.2));
});

test('a feature table: the name after the feature bit, with M/O and a description beside it', () => {
  const page = items('29214-i40', 66);
  assert.equal(valueRowOnPage(page, 'Rel8'), top(740.6));
  assert.equal(valueRowOnPage(page, 'Rel9'), top(688));
  assert.equal(valueRowOnPage(page, 'Rel9', 1), top(688));
  assert.equal(valueRowOnPage(page, 'Rel9', 0), null);
});

test('a page\'s two tables repeating names: the number tells their rows apart', () => {
  const page = items('29468-i00', 27);
  assert.equal(valueRowOnPage(page, 'System error', 5), top(633.2));
  assert.equal(valueRowOnPage(page, 'No Traffic', 6), top(612));
  assert.equal(valueRowOnPage(page, 'System error', 6), top(352.5));
  assert.equal(valueRowOnPage(page, 'No Traffic', 7), top(331.4));
});

test('the end of another row\'s wrapped name is told by its number', () => {
  assert.equal(valueRowOnPage(items('29272-i70', 102), 'requested', 3), null);
  assert.equal(valueRowOnPage(items('29272-i70', 125), 'Allowed', 3), null);
});

test('result codes: an unnumbered line with the code, and a clause heading with it', () => {
  const lines = items('29212-i20', 197);
  assert.equal(rowOnPage(lines, 'DIAMETER_ERROR_TRIGGER_EVENT'), top(718.5, 10));
  assert.equal(rowOnPage(lines, 'DIAMETER_PCC_RULE_EVENT'), top(654.5, 10));
  assert.equal(rowOnPage(lines, 'DIAMETER_ERROR'), null);
  const headings = items('29272-i70', 176);
  assert.equal(rowOnPage(headings, 'DIAMETER_ERROR_USER_UNKNOWN'), null);
  assert.equal(clauseOnPage(headings, 'DIAMETER_ERROR_USER_UNKNOWN', 595), top(362.1, 12));
  assert.equal(headingOnPage(headings, '7.4.3.1', 595), top(362.1, 12));
});
