import assert from 'node:assert/strict';
import test from 'node:test';
import { avpIdentities, avpTables } from '../../src/avp-facts.ts';
import { readFixture } from './helpers.mjs';

const fresh = async id => (await readFixture(`documents/${id}.json`)).lines;
const file = (...texts) => texts.map(text => ({ tokens: [{ text: `${text}\n` }] }));
const head = ['; Specification: X', '; Vendor-ID: 10415', ''];

test('a table row says code, type and vendor, by its V flag, and a rule\'s header the same folds into it', async () => {
  assert.deepEqual(avpIdentities([{ lines: await fresh('29217-j00'), name: 'Congestion-Level-Range' }]), [{ code: 4003, vendor: 10415, type: 'Unsigned32' }]);
  assert.deepEqual(avpIdentities([{ lines: await fresh('29217-j00'), name: 'Congestion-Location-Id' }]), [{ code: 4006, vendor: 10415, type: 'Grouped' }]);
  assert.deepEqual(avpIdentities([{ lines: await fresh('rfc7944'), name: 'DRMP' }]), [{ code: 301, vendor: 0, type: 'Enumerated' }], 'V under Must-not is IETF\'s, which the header leaves unsaid');
  assert.deepEqual(avpIdentities([{ lines: await fresh('rfc7944'), name: 'Nothing' }]), []);
});

test('every identity that disagrees is kept, in the order of the files', () => {
  const lines = file(...head,
    '; Type: AVP Table', '; Section: 5', '; Columns: Name Code Section Type Must M.not', 'A 5 5.1 Unsigned32 M,V -', '"B" 7 5.2 Typo - -', '', '',
    '; Type: Grouped AVP', '; Name: A', '; Section: 5.1', 'A ::= < AVP header: 6 10415 >', '  [ B ]', '', '',
    '; Type: Reused AVPs', '; Table: 5/2', '; Section: 5', '; Columns: Name Code From Type', 'A 5 RFC6733 Unsigned32', '', '',
    '; Type: AVP Table', '; Section: 6', '; Columns: Name Vendor-ID Code Section Type', 'A 0 5 6.1 Unsigned32 ; bold');
  assert.deepEqual(avpIdentities([{ lines, name: 'A' }]), [{ code: 5, vendor: 10415, type: 'Unsigned32' }, { code: 6, vendor: 10415, type: 'Grouped' }, { code: 5, vendor: 0, type: 'Unsigned32' }]);
  assert.deepEqual(avpIdentities([{ lines, name: 'B' }]), [{ code: 7 }], 'a quoted name, no flag and no Diameter type say only the code');
  const other = file(...head, '; Type: AVP Table', '; Section: 1', '; Columns: Name Code Section Type Must', 'A 9 1.1 OctetString M,V');
  assert.deepEqual(avpIdentities([{ lines: other, name: 'A' }, { lines, name: 'A' }])[0], { code: 9, vendor: 10415, type: 'OctetString' });
});

test('a registry of AVP codes is the file\'s own vendor\'s, and other tables say nothing of AVPs', () => {
  const lines = file(...head,
    '; Type: Registry', '; Registry: AVP Codes', '; Section: 7.1', '; Columns: Code Name Type Defined-In', '100 R OctetString TS29.234', '', '',
    '; Type: Registry', '; Registry: Command Codes', '; Section: 6', '; Columns: Code Name Defined-In', '8388734 R TS29.128');
  assert.deepEqual(avpIdentities([{ lines, name: 'R' }]), [{ code: 100, vendor: 10415, type: 'OctetString' }]);
});

test('an AVP\'s tables: its value tables and its Enumerated AVP block, in file order', async () => {
  const lines = await fresh('29217-j00');
  const [bits] = avpTables(lines, 'Congestion-Level-Range');
  assert.equal(bits.kind, 'bits');
  assert.equal(bits.line, 244);
  assert.equal(bits.section, '5.3.5');
  assert.deepEqual(avpTables(lines, 'Feature-List').map(table => [table.kind, table.featureListId, table.application]), [['features', 1, 'Np']]);
  assert.deepEqual(avpTables(await fresh('rfc7944'), 'DRMP'), [{ name: 'DRMP', section: '9.1', page: 12, line: 13 }]);
  assert.deepEqual(avpTables(lines, 'Congestion-Location-Id'), []);
});

test('a note the export reads as a comment, as the * [ AVP ] wildcard\'s, leaves the table going on', () => {
  const lines = file(...head, '; Type: AVP Table', '; Section: 7.1', '; Columns: Name Code Type Must', 'A 258 Unsigned32 M');
  lines.push({ tokens: [{ text: ';; AVP * - Grouped - ; the * [ AVP ] wildcard', kind: 'comment' }, { text: '\n' }] });
  lines.push({ tokens: [{ text: ";; deleted: AVP table row 'X' (a.py#b)", kind: 'correction-note', correction: 'a.py#b' }, { text: '\n' }] });
  lines.push(...file('B 30 UTF8String M', '', 'C 31 UTF8String M'));
  assert.deepEqual(avpIdentities([{ lines, name: 'B' }]), [{ code: 30, type: 'UTF8String' }]);
  assert.deepEqual(avpIdentities([{ lines, name: 'C' }]), [], 'a blank line still ends it');
});
