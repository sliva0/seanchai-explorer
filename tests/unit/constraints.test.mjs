// Interpreted Constraints: what the site reads of the blocks, and how it says their rules.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  blockContext,
  constraintBlocks,
  constraintLines,
  constraintsFor,
  elementEntry,
  elementParts,
  holdsIn,
  interpretedLines,
  markTitle,
  referenceText,
  ruleKinds,
  ruleNote,
  ruleWords,
  scopeWords,
} from '../../src/constraints.ts';
import { elementDepth } from '../../src/text/rules.ts';
import { readFixture } from './helpers.mjs';

const words = (rule, printed = '', within) => ruleWords({ line: 0, ...rule }, printed, within);

test('a rule is said in plain words, and a kind the site does not know as the file prints it', () => {
  assert.equal(words({ kind: 'length', unit: 'octets', low: 3, high: 3 }), '3 octets');
  assert.equal(words({ kind: 'length', unit: 'digits', low: 14, high: 15 }), '14 to 15 digits');
  assert.equal(words({ kind: 'length', unit: 'characters', low: 1 }), 'at least 1 character');
  assert.equal(words({ kind: 'length', unit: 'octets', high: 1 }), 'at most 1 octet');
  assert.equal(words({ kind: 'range', low: 0, high: 255 }), '0 to 255');
  assert.equal(words({ kind: 'range', low: -1 }), 'at least -1');
  assert.equal(words({ kind: 'exclude', values: [0] }), 'not 0');
  assert.equal(words({ kind: 'exclude', values: [0, 1] }), 'none of 0, 1');
  assert.equal(words({ kind: 'encoding', codec: 'e164-tbcd' }), 'TBCD-encoded E.164 number');
  assert.equal(
    words({
      kind: 'encoding',
      codec: 'element',
      document: 'TS24.008',
      clause: '10.5.5.32',
      element: 'Extended DRX parameter',
    }),
    'encoded as TS 24.008 section 10.5.5.32 “Extended DRX parameter”',
  );
  assert.equal(words({ kind: 'encoding', codec: 'element', document: 'TS29.002' }), 'encoded as TS 29.002');
  assert.equal(
    words({ kind: 'encoding', codec: 'element', document: '3GPP2-A.S0022', clause: 'A' }),
    'encoded as 3GPP2-A.S0022 section A',
  );
  assert.equal(
    words({
      kind: 'requires',
      conditions: [
        { avp: 'DSR-Flags', bit: 'PDN subscription contexts Withdrawal' },
        { avp: 'DSR-Flags', bit: 5 },
      ],
    }),
    'present only if DSR-Flags has bit “PDN subscription contexts Withdrawal” set or DSR-Flags has bit 5 set',
  );
  assert.equal(
    words({ kind: 'present-if', conditions: [{ avp: 'Result-Code', value: 'DIAMETER_SUCCESS' }] }),
    'present if Result-Code is DIAMETER_SUCCESS',
  );
  assert.equal(words({ kind: 'absent-if', conditions: [{ avp: 'Other' }] }), 'absent if Other is present');
  assert.equal(words({ kind: 'excludes', conditions: [{ avp: 'Other' }] }), 'never present if Other is present');
  assert.equal(words({ kind: 'text-only' }), 'cannot be checked on a single message');
  assert.equal(words({ kind: 'default', value: 0 }), 'defaults to 0 when absent');
  assert.equal(words({ kind: 'default', value: 'NOT_RELAY_NODE' }), 'defaults to NOT_RELAY_NODE when absent');
  assert.equal(words({ kind: 'bits', relation: 'at-most-one', bits: [3, 6] }), 'at most one of bits 3, 6 set');
  assert.equal(words({ kind: 'bits', relation: 'at-least-one', bits: [0, 1] }), 'at least one of bits 0, 1 set');
  assert.equal(words({ kind: 'bits', relation: 'at-most-one', bits: ['A', 2] }), 'at most one of bits “A”, 2 set');
  assert.equal(words({ kind: 'bits', relation: 'set', bits: [1] }), 'bit 1 set');
  assert.equal(words({ kind: 'bits', relation: 'clear', bits: [4, 5, 6, 7] }), 'bits 4, 5, 6, 7 clear');
  assert.equal(words({ kind: 'bits', relation: 'only', bits: [9] }), 'no bits set except 9');
  assert.equal(words({ kind: 'bits', relation: 'only', bits: [9, 'A'] }), 'no bits set except 9, “A”');
  assert.equal(words({ kind: 'bits', relation: 'every', bits: [1] }, '    bits every 1'), 'bits every 1');
  assert.equal(
    words({ kind: 'members', relation: 'at-least-one', members: ['A', 'B'] }),
    'at least one of A, B present',
  );
  assert.equal(words({ kind: 'members', relation: 'at-least-one', members: ['SCEF-Realm'] }), 'SCEF-Realm present');
  assert.equal(
    words({ kind: 'members', relation: 'only', members: ['IMEI', 'Software-Version'] }),
    'no members present except IMEI, Software-Version',
  );
  assert.equal(words({ kind: 'members', relation: 'every', members: ['A'] }, '    members every A'), 'members every A');
  assert.equal(words({ kind: 'unique' }, '', 'APN-Configuration'), 'unique across APN-Configuration instances');
  assert.equal(words({ kind: 'unique' }), 'unique across grouped AVP instances');
  assert.equal(
    words({ kind: 'values', values: [1], conditions: [{ avp: 'Monitoring-Type', value: 1 }] }),
    'is 1 if Monitoring-Type is 1',
  );
  assert.equal(
    words({ kind: 'values', values: [1, 2], conditions: [{ avp: 'A', value: 1 }, { avp: 'B' }] }),
    'is one of 1, 2 if A is 1 or B is present',
  );
  assert.equal(words({ kind: 'pattern', value: 5 }, '    pattern 5'), 'pattern 5', 'an unknown kind, not a failure');
});

test("an element rule's document is apart from its words, for a popup to link", () => {
  const rule = { kind: 'encoding', codec: 'element', document: 'TS23.003', clause: '4.4', element: 'Zone Code' };
  assert.deepEqual(elementParts(rule), {
    before: 'encoded as',
    document: 'TS 23.003',
    after: 'section 4.4 “Zone Code”',
  });
  assert.deepEqual(elementParts({ document: 'TS29.002' }), { before: 'encoded as', document: 'TS 29.002', after: '' });
  assert.equal(
    words({ kind: 'encoding', codec: 'element', element: 'RAND' }),
    'encoded as an element from another specification “RAND”',
  );
  assert.equal(words({ kind: 'encoding', codec: 'element', clause: '4.4' }), 'encoded as section 4.4');
});

test('a reference the corpus holds no edition of is written as a reader writes it', () => {
  assert.equal(referenceText('TS23.003'), 'TS 23.003');
  assert.equal(referenceText('TR23.977'), 'TR 23.977');
  assert.equal(referenceText('RFC6733'), 'RFC 6733');
  assert.equal(referenceText('3GPP2-A.S0022'), '3GPP2-A.S0022');
  assert.equal(referenceText('TS 23.003'), 'TS 23.003');
});

test('every element rule of TS 29.272 carries its registry entry, said by how far it is checked', async () => {
  const file = await readFixture('documents/29272-j60.json');
  const items = constraintBlocks(file).flatMap(item =>
    (item.block.readings ?? []).flatMap(reading => reading.rules.map(rule => ({ item, rule }))),
  );
  const elements = items.filter(({ rule }) => rule.codec === 'element');
  assert.ok(elements.length > 0);
  for (const { rule } of elements) {
    const entry = elementEntry(rule);
    assert.ok(entry, `line ${rule.line}`);
    assert.ok(['full', 'partial', 'length', 'none'].includes(entry.depth));
    assert.equal(ruleNote(rule), undefined, 'the rows under the rule say it, not its title');
  }
  assert.equal(elementEntry({ kind: 'encoding', codec: 'plmn-id', line: 0 }), undefined);
  assert.match(ruleNote({ kind: 'encoding', codec: 'element', line: 0 }), /^An information element of another/);
  assert.deepEqual(['full', 'partial', 'length', 'none', 'deeper'].map(elementDepth), [
    'full layout',
    'partly',
    'length only',
    'not checked',
    'deeper',
  ]);
  const ecgi = elements.find(({ rule }) => rule.element === 'E-UTRAN-CGI');
  assert.equal(ruleWords(ecgi.rule, ''), 'encoded as TS 29.002 section 17.7.8 “E-UTRAN-CGI”');
  const title = markTitle(file, file, ecgi.rule.line, [ecgi.item]);
  assert.ok(
    title.some(line => line.endsWith('“E-UTRAN-CGI”\n  Checked: full layout')),
    title.join('\n'),
  );
  const none = elements.find(({ rule }) => elementEntry(rule).depth === 'none');
  const unchecked = markTitle(file, file, none.rule.line, [none.item]);
  assert.ok(
    unchecked.some(line => line.endsWith('\n  Not checked')),
    unchecked.join('\n'),
  );
});

test('every rule kind the schema has is said in words and in the help', async () => {
  const schema = await readFixture('schema.json');
  const kinds = schema.$defs.ConstraintRule.properties.kind.enum;
  assert.deepEqual(Object.keys(ruleKinds).toSorted(), kinds.toSorted());
  for (const kind of kinds) assert.match(ruleKinds[kind].printed, new RegExp(`^${kind}\\b`));
});

test("TS 29.272's default, bits, members, unique and values rules are read with the rest of their blocks", async () => {
  const file = await readFixture('documents/29272-j60.json');
  const rules = constraintBlocks(file).flatMap(({ avp, block }) =>
    (block.readings ?? []).flatMap(reading => reading.rules.map(rule => ({ avp, rule }))),
  );
  const said = (avp, kind) =>
    rules.filter(item => item.avp === avp && item.rule.kind === kind).map(({ rule }) => ruleWords(rule, ''));
  assert.deepEqual(said('DSR-Flags', 'bits'), [
    'at most one of bits 1, 3 set',
    'at most one of bits 5, 6 set',
    'at most one of bits 3, 6 set',
    'no bits set except 9',
  ]);
  assert.deepEqual(said('Reachability-Type', 'bits'), ['bit 0 clear', 'bit 1 set']);
  assert.deepEqual(said('eDRX-Cycle-Length-Value', 'bits'), ['bits 4, 5, 6, 7 clear']);
  assert.deepEqual(said('Terminal-Information', 'members'), ['no members present except IMEI, Software-Version']);
  assert.deepEqual(said('Monitoring-Event-Configuration', 'members'), ['SCEF-Realm present']);
  assert.deepEqual(said('Reachability-Information', 'values'), ['is 1 if Monitoring-Type is 1']);
  assert.deepEqual(said('Service-Selection', 'unique'), ['unique across grouped AVP instances']);
  const nor = rules.find(({ avp, rule }) => avp === 'NOR-Flags' && rule.kind === 'default');
  assert.equal(ruleWords(nor.rule, ''), 'defaults to 0 when absent');
  assert.equal(rules.filter(({ rule }) => rule.kind === 'default').length, 9);
  const count = kind => rules.filter(({ rule }) => rule.kind === kind).length;
  assert.deepEqual(['bits', 'members', 'unique', 'values'].map(count), [10, 3, 2, 1]);
  assert.deepEqual(said('CSG-Id', 'bits'), ['bits 0, 1, 2, 3, 4 clear']);
});

test('a block holds wherever its AVP is read, within its grouped AVP, or in its command of its application', () => {
  const block = scope => ({ scope });
  assert.ok(holdsIn(block({}), {}));
  assert.ok(holdsIn(block({}), { within: 'APN-Configuration' }));
  assert.ok(holdsIn(block({ within: 'APN-Configuration' }), { within: 'APN-Configuration' }));
  assert.ok(!holdsIn(block({ within: 'APN-Configuration' }), {}));
  assert.ok(!holdsIn(block({ within: 'APN-Configuration' }), { command: { name: 'APN-Configuration' } }));
  const dsr = block({ command: 'Delete-Subscriber-Data-Request', application: 16777251 });
  assert.ok(holdsIn(dsr, { command: { name: 'delete-subscriber-data-request', application: 16777251 } }));
  assert.ok(holdsIn(dsr, { command: { name: 'Delete-Subscriber-Data-Request' } }), 'an application not known');
  assert.ok(!holdsIn(dsr, { command: { name: 'Delete-Subscriber-Data-Request', application: 16777308 } }));
  assert.ok(!holdsIn(dsr, { within: 'Delete-Subscriber-Data-Request' }));
  assert.equal(
    scopeWords(dsr, () => 'DSR'),
    'in DSR',
  );
  assert.equal(scopeWords(block({ within: 'APN-Configuration' })), 'within APN-Configuration');
  assert.equal(scopeWords(block({})), 'wherever used');
});

test("TS 29.272's blocks are read with their scope, and only the corrected file has them", async () => {
  const doc = await readFixture('documents/29272-j60.json');
  const raw = await readFixture('documents/29272-j60.raw.json');
  assert.equal(constraintBlocks(doc).length, 157);
  assert.equal(constraintBlocks(raw).length, 0);
  assert.equal(interpretedLines(raw).size, 0);
  const context = constraintsFor(doc, 'Context-Identifier', {}).map(item => item.block.section);
  assert.deepEqual(context, [], 'no rule on it wherever read');
  const apn = constraintsFor(doc, 'Context-Identifier', { within: 'APN-Configuration' });
  assert.deepEqual(
    apn.map(item => item.scope),
    [{ within: 'APN-Configuration' }],
  );
  const dsr = constraintsFor(doc, 'Context-Identifier', {
    command: { name: 'Delete-Subscriber-Data-Request', application: 16777251 },
  });
  assert.deepEqual(
    dsr.map(item => [item.block.section, item.scope]),
    [['5.2.2.2.1', { command: 'Delete-Subscriber-Data-Request', application: 16777251 }]],
  );
  const imei = constraintsFor(doc, 'IMEI', { within: 'Terminal-Information' });
  assert.ok(imei.length > 0 && imei.every(item => !item.scope.within && !item.scope.command), 'wherever used');

  const kinds = interpretedLines(doc);
  const block = dsr[0].block;
  assert.equal(kinds.get(block.line), 'interpreted');
  assert.equal(kinds.get(block.readings[0].quotes[0].line), 'quote');
  assert.equal(kinds.get(block.readings[0].rules[0].line), 'rule');
  assert.equal(kinds.get(block.line - 1), 'gap');
  assert.equal(kinds.get(block.last + 1), 'gap', 'the next block follows');
  const sole = constraintBlocks(doc).find(item => item.block.section === '7.3.9').block;
  assert.equal(kinds.get(sole.last + 1), undefined, 'the block after it in 7.3.9 is printed');
});

test("a line reading an AVP is marked where the corrected file's blocks hold for it there, in the raw file too", async () => {
  const doc = await readFixture('documents/29272-j60.json');
  const raw = await readFixture('documents/29272-j60.raw.json');
  const message = doc.blocks.find(block => block.type === 'Message' && block.name === 'Delete-Subscriber-Data-Request');
  assert.deepEqual(blockContext(doc, message), {
    command: { name: 'Delete-Subscriber-Data-Request', application: message.command.application_id },
  });
  const member = message.rule.members.find(item => item.name === 'Context-Identifier');
  const lines = constraintLines(doc, doc);
  assert.deepEqual(
    lines.get(member.line).map(item => item.block.section),
    ['5.2.2.2.1'],
  );
  const grouped = doc.blocks.find(block => block.type === 'Grouped AVP' && block.rule?.name === 'APN-Configuration');
  const inGrouped = grouped.rule.members.find(item => item.name === 'Context-Identifier');
  assert.deepEqual(
    lines.get(inGrouped.line).map(item => item.block.section),
    ['7.3.35'],
  );
  const rawMessage = raw.blocks.find(
    block => block.type === 'Message' && block.name === 'Delete-Subscriber-Data-Request',
  );
  const rawMember = rawMessage.rule.members.find(item => item.name === 'Context-Identifier');
  assert.ok(constraintLines(raw, doc).has(rawMember.line), "the raw file's member, by its block's name");
  assert.equal(constraintLines(raw, raw).size, 0, 'the raw file has no blocks of its own');
});
