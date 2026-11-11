import assert from 'node:assert/strict';
import test from 'node:test';
import { avpRows, bitRule, countText, encryptOf, flagRules, flagTable, groupedRules, otherCells, presenceText, printed, ruleAt, useAt } from '../../src/avp-context.ts';
import { readFixture } from './helpers.mjs';

const fresh = id => readFixture(`documents/${id}.json`);
const line = text => ({ tokens: [{ text: `${text}\n` }] });
/** A member as the export writes one, its defaults left out. */
const member = (line, name, presence, min, max, extra = {}) => ({ line, name, presence, min, max, ...extra });

test('a member says its rule, its brackets and how many of it there may be', async () => {
  const udr = await fresh('29329-j10');
  const use = useAt(udr, 24, 'User-Identity');
  assert.equal(use.kind, 'member');
  assert.deepEqual([use.rule.name, use.rule.label, use.rule.short, use.rule.section], ['User-Data-Request', 'User-Data-Request (UDR)', 'UDR', '6.1.1']);
  assert.equal(presenceText(use.member), 'Required { } · must be present, in any position · exactly once');
  assert.equal(use.member.bold, true);
  assert.equal(presenceText(useAt(udr, 15, 'Session-Id').member), 'Fixed < > · must be present, at this position in the order · exactly once');
  assert.equal(presenceText(useAt(udr, 16, 'DRMP').member), 'Optional [ ] · may be present, in any position · at most once');
  const data = useAt(udr, 29, 'Data-Reference').member;
  assert.deepEqual([printed(data), countText(data)], ['* { Data-Reference }', 'once or more'], 'a required member is there at least once');
  assert.equal(useAt(udr, 24, 'MSISDN'), undefined, 'not a name the line has');
  assert.equal(useAt(udr, 14, 'User-Data-Request').kind, 'head');
  assert.equal(ruleAt(udr, 10), ruleAt(udr, 29), 'its `; Type:` line is in the block');
  assert.equal(ruleAt(udr, 236), undefined, 'a table is no rule');
});

test('a member\'s bounds read as RFC 6733 counts them', () => {
  const cases = [[0, 1, 'at most once'], [0, null, 'any number of times'], [0, 2, 'at most 2 times'], [2, 2, 'exactly 2 times'], [1, 1, 'exactly once'],
    [1, null, 'once or more'], [2, 5, '2 to 5 times'], [3, null, '3 or more times']];
  for (const [min, max, expected] of cases) assert.equal(countText({ min, max }), expected, `${min}*${max}`);
  assert.equal(presenceText(member(0, 'ICV', 'fixed', 0, 1, { qualifier: '0*1' })), 'Fixed < > · may be present, at this position in the order · at most once', 'a fixed member a qualifier lets be absent keeps only its position');
});

test('the fixture\'s members count as their qualifiers say', async () => {
  const members = (await Promise.all(['29061-6f0', '29109-j00', '29153-j00', '29217-j00', '29283-j00', '29329-j10'].map(fresh)))
    .flatMap(doc => doc.blocks.flatMap(block => block.rule?.members ?? []));
  const said = new Map(members.map(item => [`${item.qualifier ?? ''} ${item.presence}`, countText(item)]));
  assert.deepEqual(Object.fromEntries([...said].sort()), {
    ' fixed': 'exactly once', ' optional': 'at most once', ' required': 'exactly once', '* optional': 'any number of times', '* required': 'once or more',
    '*1 required': 'exactly once', '1* optional': 'once or more', '1* required': 'once or more',
  });
});

test('a Grouped AVP\'s rule lists its members, a struck one kept as struck', async () => {
  const [rule] = groupedRules(await fresh('29329-j10'), 'User-Identity');
  assert.deepEqual(rule.members.map(printed), ['[ Public-Identity ]', '[ MSISDN ]', '[ External-Identifier ]', '* [ AVP ]']);
  const lines = [line('; Type: Grouped AVP'), line('; Name: G'), line('G ::= < AVP header: 1 10415 >'), line('        { A }'), { tokens: [{ text: ';;      [ B ] ; strikethrough\n', kind: 'comment' }] }, line('    2*3 [ C ]'), line('      < D > ; strikethrough'), line('')];
  const members = [member(3, 'A', 'required', 1, 1), member(4, 'B', 'optional', 0, 1, { struck: true }), member(5, 'C', 'optional', 2, 3, { qualifier: '2*3' }), member(6, 'D', 'fixed', 1, 1, { strikethrough: true })];
  const struck = { lines, blocks: [{ type: 'Grouped AVP', line: 0, last: 6, section: '1', page: null, fields: { Name: 'G' }, name: 'G', avp: { code: 1, vendor_id: 10415 }, rule: { name: 'G', line: 2, members } }] };
  const [g] = groupedRules(struck, 'G');
  assert.deepEqual(g.members.map(item => [printed(item), Boolean(item.struck), Boolean(item.strikethrough), countText(item)]), [
    ['{ A }', false, false, 'exactly once'], ['[ B ]', true, false, 'at most once'], ['2*3 [ C ]', false, false, '2 to 3 times'], ['< D >', false, true, 'exactly once'],
  ]);
  assert.equal(useAt(struck, 4, 'B').member.struck, true);
  assert.equal(useAt(struck, 2, 'G').kind, 'head');
  assert.equal(ruleAt(struck, 7), undefined, 'the blank line after it is no line of it');
});

test('an Answer Message block\'s rule is a rule its members are in', async () => {
  const lines = ['; Type: Answer Message', '; Section: 7.2', '<answer-message> ::= < Diameter Header: code, ERR [, PXY] >', '        0*1 < Session-Id >', '        { Origin-Host }'].map(line);
  const file = { lines, blocks: [{ type: 'Answer Message', line: 0, last: 4, section: '7.2', page: null, fields: { Section: '7.2' }, rule: { name: 'answer-message', line: 2, members: [member(3, 'Session-Id', 'fixed', 0, 1, { qualifier: '0*1' }), member(4, 'Origin-Host', 'required', 1, 1)] } }] };
  const use = useAt(file, 3, 'Session-Id');
  assert.deepEqual([use.kind, use.rule.kind, use.rule.label, use.rule.short, use.rule.section], ['member', 'Answer Message', 'answer-message', 'answer-message', '7.2']);
  assert.equal(presenceText(use.member), 'Fixed < > · may be present, at this position in the order · at most once');
  assert.deepEqual(groupedRules(file, 'answer-message'), [], 'no Grouped AVP');
});

test('a row\'s flags in M, V, P order with what each means, P left out as deprecated, then its other cells as words', async () => {
  const udr = await fresh('29329-j10');
  const [row] = avpRows(udr, 'User-Identity');
  assert.deepEqual([row.type, row.table, row.line], ['AVP Table', '6.3.1', 236]);
  assert.deepEqual(flagRules(row).map(({ bit, rule }) => [bit, rule]), [['M', 'must'], ['V', 'must']]);
  assert.match(flagRules(row)[0].meaning, /Mandatory/);
  assert.deepEqual(otherCells(row), [], 'Encrypt is left out');
  assert.deepEqual(flagTable(row), [['must', ['M', 'V']]]);
  const reused = avpRows(udr, 'External-Identifier')[0];
  assert.deepEqual([flagRules(reused).map(({ bit, rule }) => `${bit} ${rule}`), otherCells(reused)], [['M must'], [['From', 'TS29.336']]], 'an M-bit cell is the M flag');
  const columns = ['Name', 'Code', 'Type', 'Must', 'May', 'S.not', 'M.not', 'Acc-Type', 'Applicability'];
  const gx = {
    lines: [line('; Type: AVP Table'), line('; Columns: Name   Code   Type   Must   May   S.not   M.not   Acc-Type   Applicability'), line('X   1   Enumerated   V   P   -   M   3GPP-GPRS,"Non-3GPP-EPS (NOTE 6)"   ""'), line('')],
    blocks: [{ type: 'AVP Table', line: 0, last: 2, section: '7', page: null, fields: { Columns: columns.join('   ') }, columns, rows: [{ line: 2, name: 'X', cells: ['X', '1', 'Enumerated', 'V', 'P', '-', 'M', '3GPP-GPRS,"Non-3GPP-EPS (NOTE 6)"', '""'], vendor: 10415 }] }],
  };
  const [x] = avpRows(gx, 'X');
  assert.deepEqual(flagRules(x).map(({ bit, rule }) => `${bit} ${rule}`), ['M must not', 'V must']);
  assert.deepEqual(flagTable(x), [['must', ['V']], ['must not', ['M']]], 'the May column holds only P, so it goes');
  assert.deepEqual([bitRule(x, 'P'), encryptOf(x), encryptOf(row)], ['may', undefined, 'No']);
  assert.deepEqual(otherCells(x), [['Acc-Type', '3GPP-GPRS, Non-3GPP-EPS (NOTE 6)'], ['Applicability', '(blank)']]);
});
