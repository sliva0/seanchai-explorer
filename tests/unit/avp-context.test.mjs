import assert from 'node:assert/strict';
import test from 'node:test';
import { avpRows, bitRule, bounds, countText, encryptOf, flagRules, flagTable, groupedRules, otherCells, presenceText, printed, ruleAt, useAt } from '../../src/avp-context.ts';
import { readFixture } from './helpers.mjs';

const lines = async id => (await readFixture(`documents/${id}.json`)).lines;
const line = text => ({ tokens: [{ text: `${text}\n` }] });

test('a member says its rule, its brackets and how many of it there may be', async () => {
  const udr = await lines('29329-j10');
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

test('qualifiers count as RFC 6733 says', () => {
  const cases = [['optional', '', '', false, 'at most once'], ['optional', '', '', true, 'any number of times'], ['optional', '', '2', true, 'at most 2 times'],
    ['optional', '2', '2', true, 'exactly 2 times'], ['required', '', '1', true, 'exactly once'], ['required', '1', '', true, 'once or more'],
    ['optional', '2', '5', true, '2 to 5 times'], ['fixed', '', '', false, 'exactly once']];
  for (const [presence, min, max, qualified, expected] of cases) assert.equal(countText(bounds(presence, min, max, qualified)), expected, `${min}*${max} ${presence}`);
});

test('a Grouped AVP\'s rule lists its members, a struck one kept as struck', async () => {
  const [rule] = groupedRules(await lines('29329-j10'), 'User-Identity');
  assert.deepEqual(rule.members.map(printed), ['[ Public-Identity ]', '[ MSISDN ]', '[ External-Identifier ]', '* [ AVP ]']);
  const struck = [line('; Type: Grouped AVP'), line('; Name: G'), line('G ::= < AVP header: 1 10415 >'), line('        { A }'), { tokens: [{ text: ';;      [ B ] ; strikethrough\n', kind: 'comment' }] }, line('    2*3 [ C ]'), line('')];
  const [g] = groupedRules(struck, 'G');
  assert.deepEqual(g.members.map(item => [printed(item), item.struck, countText(item)]), [['{ A }', false, 'exactly once'], ['[ B ]', true, 'at most once'], ['2*3 [ C ]', false, '2 to 3 times']]);
  assert.equal(useAt(struck, 4, 'B').member.struck, true);
});

test('a row\'s flags in M, V, P order with what each means, P left out as deprecated, then its other cells as words', async () => {
  const udr = await lines('29329-j10');
  const [row] = avpRows(udr, 'User-Identity');
  assert.deepEqual([row.type, row.table, row.line], ['AVP Table', '6.3.1', 236]);
  assert.deepEqual(flagRules(row).map(({ bit, rule }) => [bit, rule]), [['M', 'must'], ['V', 'must']]);
  assert.match(flagRules(row)[0].meaning, /Mandatory/);
  assert.deepEqual(otherCells(row), [], 'Encrypt is left out');
  assert.deepEqual(flagTable(row), [['must', ['M', 'V']]]);
  const reused = avpRows(udr, 'External-Identifier')[0];
  assert.deepEqual([flagRules(reused).map(({ bit, rule }) => `${bit} ${rule}`), otherCells(reused)], [['M must'], [['From', 'TS29.336']]], 'an M-bit cell is the M flag');
  const gx = [line('; Type: AVP Table'), line('; Columns: Name   Code   Type   Must   May   S.not   M.not   Acc-Type   Applicability'), line('X   1   Enumerated   V   P   -   M   3GPP-GPRS,"Non-3GPP-EPS (NOTE 6)"   ""'), line('')];
  const [x] = avpRows(gx, 'X');
  assert.deepEqual(flagRules(x).map(({ bit, rule }) => `${bit} ${rule}`), ['M must not', 'V must']);
  assert.deepEqual(flagTable(x), [['must', ['V']], ['must not', ['M']]], 'the May column holds only P, so it goes');
  assert.deepEqual([bitRule(x, 'P'), encryptOf(x), encryptOf(row)], ['may', undefined, 'No']);
  assert.deepEqual(otherCells(x), [['Acc-Type', '3GPP-GPRS, Non-3GPP-EPS (NOTE 6)'], ['Applicability', '(blank)']]);
});
