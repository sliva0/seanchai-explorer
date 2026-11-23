// Interpreted Constraints: what the site reads of the blocks, and how it says their rules.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  blockContext,
  constraintBlocks,
  constraintLines,
  constraintsFor,
  holdsIn,
  interpretedLines,
  ruleWords,
  scopeWords,
} from '../../src/constraints.ts';
import { readFixture } from './helpers.mjs';

const words = (rule, printed = '') => ruleWords({ line: 0, ...rule }, printed);

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
    'encoded as TS24.008 clause 10.5.5.32 “Extended DRX parameter”',
  );
  assert.equal(words({ kind: 'encoding', codec: 'element', document: 'TS29.002' }), 'encoded as TS29.002');
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
  assert.equal(words({ kind: 'text-only' }), 'not checkable: read the quote');
  assert.equal(words({ kind: 'default', value: 5 }, '    default 5'), 'default 5', 'an unknown kind, not a failure');
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
  assert.equal(scopeWords(block({})), 'wherever read');
});

test("TS 29.272's blocks are read with their scope, and only the corrected file has them", async () => {
  const doc = await readFixture('documents/29272-j60.json');
  const raw = await readFixture('documents/29272-j60.raw.json');
  assert.equal(constraintBlocks(doc).length, 154);
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
  assert.ok(imei.length > 0 && imei.every(item => !item.scope.within && !item.scope.command), 'wherever read');

  const kinds = interpretedLines(doc);
  const block = dsr[0].block;
  assert.equal(kinds.get(block.line), 'interpreted');
  assert.equal(kinds.get(block.readings[0].quotes[0].line), 'quote');
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
