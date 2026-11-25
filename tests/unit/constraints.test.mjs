// Interpreted Constraints: what the site reads of the blocks, and how it says their rules.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  admittedBy,
  alternativesOf,
  blockContext,
  commandConstraints,
  constraintBlocks,
  constraintLines,
  constraintsFor,
  markConstraints,
  readersFor,
  readsRequest,
  referenceContext,
  requestMessage,
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
import { constraintsSection, elementDepth } from '../../src/text/rules.ts';
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
  assert.equal(
    words({ kind: 'unique' }, '', { within: 'APN-Configuration' }),
    'unique across APN-Configuration instances',
  );
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
  assert.deepEqual(['bits', 'members', 'unique', 'values'].map(count), [10, 3, 2, 2]);
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
    command: { name: 'Delete-Subscriber-Data-Request', application: message.command.application_id, section: '7.2.11' },
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

const cond = (path, more = {}) => ({ path: path.split('/'), ...more });

test('conditions joined by and and or, negated, on a path or the request, are said in words', () => {
  assert.equal(
    words({
      kind: 'present-if',
      conditions: [
        [
          cond('IDR-Flags', { root: 'request', bit: 'EPS User State Request' }),
          cond('Result-Code', { value: 'DIAMETER_SUCCESS' }),
        ],
      ],
    }),
    "present if the request's IDR-Flags has bit “EPS User State Request” set and Result-Code is DIAMETER_SUCCESS",
  );
  assert.equal(
    words({
      kind: 'present-if',
      conditions: [[cond('MIP6-Agent-Info'), cond('MIP6-Agent-Info/MIP-Home-Agent-Host', { negated: true })]],
    }),
    'present if MIP6-Agent-Info is present and MIP-Home-Agent-Host in MIP6-Agent-Info is absent',
  );
  assert.equal(
    words({
      kind: 'present-if',
      conditions: [
        [cond('Server-Assignment-Type', { root: 'request', value: 'REGISTRATION' }), cond('Result-Code', { value: 1 })],
        [cond('Server-Assignment-Type', { root: 'request', value: 'PGW_UPDATE' })],
      ],
    }),
    "present if the request's Server-Assignment-Type is REGISTRATION and Result-Code is 1, or the request's Server-Assignment-Type is PGW_UPDATE",
    'a comma before or where an alternative joins several, as and binds tighter',
  );
  assert.equal(
    words({ kind: 'absent-if', conditions: [[cond('A')], [cond('B')]] }),
    'absent if A is present or B is present',
  );
  assert.equal(
    words({
      kind: 'requires',
      conditions: [[cond('Subscription-Data/Monitoring-Event-Configuration', { root: 'request' })]],
    }),
    "present only if Monitoring-Event-Configuration in the request's Subscription-Data is present",
  );
  assert.equal(
    words({ kind: 'excludes', conditions: [[cond('A/B/C', { value: 0 })]] }),
    'never present if C in A › B is 0',
  );
  assert.equal(
    words({
      kind: 'excludes',
      conditions: [[cond('Flags', { bit: 3, negated: true }), cond('X', { value: 2, negated: true })]],
    }),
    'never present if Flags does not have bit 3 set and X is not 2',
  );
  assert.equal(
    words({
      kind: 'present-if',
      conditions: [[cond('Result-Code', { value: { root: 'request', path: ['Result-Code'] } })]],
    }),
    "present if Result-Code equals the request's Result-Code",
    'a value read from another AVP',
  );
  assert.equal(
    words({
      kind: 'present-if',
      conditions: [[cond('Result-Code', { value: { root: 'request', path: ['Result-Code'] }, negated: true })]],
    }),
    "present if Result-Code differs from the request's Result-Code",
  );
  assert.equal(
    words({
      kind: 'values',
      values: [0, 1],
      conditions: [[cond('Monitoring-Type', { value: 2 }), cond('L/M', { value: 1 })]],
    }),
    'is one of 0, 1 if Monitoring-Type is 2 and M in L is 1',
  );
  assert.equal(
    words({ kind: 'equals', reference: { root: 'request', path: ['User-Name'] } }),
    "holds the same value as the request's User-Name",
  );
  assert.equal(
    words({ kind: 'equals', reference: { root: null, path: ['A', 'B'] } }),
    'holds the same value as B in A',
  );
  assert.equal(words({ kind: 'absent' }, '', { command: 'STR' }), 'never sent in STR');
  assert.equal(words({ kind: 'absent' }, '', { within: 'Non-3GPP-User-Data' }), 'never sent in Non-3GPP-User-Data');
  assert.equal(words({ kind: 'absent' }), 'never sent');
  assert.equal(
    words({ kind: 'absent' }, '', { within: 'G', command: 'STR' }),
    'never sent in G',
    'a grouped AVP is its own scope',
  );
});

test('a condition or reference of a shape the site does not know is said as the file prints it, never thrown on', () => {
  const printed = '    present-if Other bit 3';
  const said = rule => words(rule, printed);
  assert.equal(said({ kind: 'present-if', conditions: [[{ path: ['A'], root: 'answer' }]] }), printed.trim(), 'a root');
  assert.equal(said({ kind: 'present-if', conditions: [[{ path: [] }]] }), printed.trim(), 'no names');
  assert.equal(said({ kind: 'present-if', conditions: [[{ path: 'A' }]] }), printed.trim(), 'a path as text');
  assert.equal(said({ kind: 'present-if', conditions: [[{ path: ['A'], value: { avp: 'B' } }]] }), printed.trim());
  assert.equal(said({ kind: 'present-if', conditions: [[{ path: ['A'], value: 1, bit: 2 }]] }), printed.trim());
  assert.equal(said({ kind: 'present-if', conditions: [[{ path: ['A'], negated: 'yes' }]] }), printed.trim());
  assert.equal(said({ kind: 'present-if', conditions: [[]] }), printed.trim(), 'an empty alternative');
  assert.equal(said({ kind: 'present-if', conditions: { path: ['A'] } }), printed.trim(), 'no list');
  assert.equal(said({ kind: 'present-if' }), printed.trim(), 'no conditions');
  assert.equal(said({ kind: 'values', values: [1], conditions: [[7]] }), printed.trim());
  assert.equal(said({ kind: 'equals' }), printed.trim(), 'an equals naming nothing');
  assert.equal(said({ kind: 'equals', reference: { root: 'answer', path: ['A'] } }), printed.trim());
  assert.equal(
    said({ kind: 'present-if', conditions: [{ avp: 'Old' }] }),
    'present if Old is present',
    "an older export's flat list of conditions on a sibling",
  );
  assert.equal(alternativesOf({ conditions: [[{ path: ['A'], future: true }]] })?.length, 1, 'more fields are fine');
  assert.equal(readsRequest({ kind: 'present-if', conditions: [[{ path: ['A'], root: 'answer' }]] }), false);
  assert.equal(readsRequest({ kind: 'equals', reference: { root: 'request', path: ['A'] } }), true);
  assert.equal(readsRequest({ kind: 'absent' }), false);
});

test('a name an interpreted rule reads is its own name, linking to the member it is, the request and its / not names', async () => {
  const doc = { ...(await readFixture('documents/29272-j60.json')), id: '29272-j60' };
  markConstraints(doc);
  const named = line => doc.lines[line].tokens.filter(token => token.avp);
  // EPS-User-State in IDA: present-if request/IDR-Flags bit "EPS User State Request" and Result-Code = DIAMETER_SUCCESS
  const ida = named(1226);
  assert.deepEqual(
    ida.map(token => [token.text, token.constraintRef]),
    [
      ['IDR-Flags', { root: 'request', path: ['IDR-Flags'] }],
      ['Result-Code', { root: null, path: ['Result-Code'] }],
    ],
  );
  assert.deepEqual(ida[0].target, { document: '29272-j60', section: '7.3.103' }, "the IDR's member's link");
  assert.equal(
    doc.lines[1226].tokens.map(token => token.text).join(''),
    '    present-if request/IDR-Flags bit "EPS User State Request" and Result-Code = DIAMETER_SUCCESS\n',
    'the line as printed',
  );
  assert.ok(!doc.lines[1226].tokens.some(token => token.avp === 'request'), 'request/ is not a name');
  // Visited-Network-Identifier in NOR: present-if MIP6-Agent-Info and not MIP6-Agent-Info/MIP-Home-Agent-Host
  assert.deepEqual(
    named(1509).map(token => [token.text, token.constraintRef.path.join('/'), token.target?.document]),
    [
      ['MIP6-Agent-Info', 'MIP6-Agent-Info', '29272-j60'],
      ['MIP6-Agent-Info', 'MIP6-Agent-Info', '29272-j60'],
      ['MIP-Home-Agent-Host', 'MIP6-Agent-Info/MIP-Home-Agent-Host', 'rfc4004'],
    ],
    "each name of the path its own, the member's link where MIP6-Agent-Info's rule gives it",
  );
  assert.equal(markConstraints(doc), true, 'read once a file');
  assert.equal(named(1226).length, 2, 'not marked twice');
  const block = constraintBlocks(doc).find(item => item.block.line === 1217).block;
  assert.equal(requestMessage(doc, block).line, 174, "the IDR of the block's application, of the two 7.2.9 prints");
  assert.deepEqual(referenceContext(doc, block, { root: 'request', path: ['IDR-Flags'] }), {
    command: { name: 'Insert-Subscriber-Data-Request', application: 16777251, section: '7.2.9' },
  });
  assert.deepEqual(referenceContext(doc, block, { root: null, path: ['A', 'B'] }), { within: 'A' });
  const readers = readersFor(doc, 'IDR-Flags', referenceContext(doc, block, { root: 'request', path: ['IDR-Flags'] }));
  assert.deepEqual(
    readers.map(item => item.avp),
    ['EPS-User-State', 'EPS-Location-Information', 'Local-Time-Zone'],
    "the IDA's rules reading the IDR's IDR-Flags",
  );
  assert.deepEqual(
    readersFor(doc, 'IDR-Flags', { command: { name: 'Insert-Subscriber-Data-Answer', section: '7.2.10' } }),
    [],
    "the answer's own IDR-Flags is no request's",
  );
  assert.deepEqual(
    readersFor(doc, 'MIP-Home-Agent-Host', { within: 'MIP6-Agent-Info' }).map(item => item.avp),
    ['Visited-Network-Identifier'],
  );
});

test("TS 29.273's blocks hold in the print their Command-Section names, and an absent AVP only * [ AVP ] admits is marked there", async () => {
  const doc = { ...(await readFixture('documents/29273-j20.json')), id: '29273-j20' };
  markConstraints(doc);
  const message = section => doc.blocks.find(block => block.type === 'Message' && block.section === section);
  const sta = message('5.2.2.1.2');
  const swa = message('4.2.2.1.2');
  assert.deepEqual(blockContext(doc, sta), {
    command: { name: 'Diameter-EAP-Answer', application: 16777250, section: '5.2.2.1.2' },
  });
  const wlcp = blockContext(doc, sta);
  assert.deepEqual(
    constraintsFor(doc, 'WLCP-Key', wlcp).map(item => item.block.section),
    ['5.1.2.1.1', '5.1.2.3.1', '5.2.3.33'],
  );
  assert.deepEqual(
    constraintsFor(doc, 'WLCP-Key', { ...wlcp, command: { ...wlcp.command, section: '6.2.2.1.1.2' } }).map(
      item => item.block.section,
    ),
    ['5.2.3.33'],
    "SWd's print of the command under the same application holds only the AVP's own clause",
  );
  const members = rule => new Set(rule.members.map(member => member.name));
  const absentHere = commandConstraints(doc, blockContext(doc, sta), members(sta.rule));
  assert.deepEqual(
    absentHere.map(item => [item.avp, item.block.section]),
    [['Auth-Session-State', '5.2.4']],
    "STa's DEA leaves Auth-Session-State to its * [ AVP ]",
  );
  assert.deepEqual(commandConstraints(doc, blockContext(doc, swa), members(swa.rule)), [], "not SWa's");
  const lines = constraintLines(doc, doc);
  const wildcard = sta.rule.members.find(member => member.name === 'AVP').line;
  assert.ok(lines.get(wildcard).some(item => item.avp === 'Auth-Session-State'));
  assert.deepEqual(admittedBy(doc, wildcard, lines.get(wildcard)), ['Auth-Session-State']);
  assert.ok(
    markTitle(doc, doc, wildcard, lines.get(wildcard)).includes('• Auth-Session-State: never sent in DEA'),
    markTitle(doc, doc, wildcard, lines.get(wildcard)).join('\n'),
  );
  const swaWildcard = swa.rule.members.find(member => member.name === 'AVP').line;
  assert.ok(!lines.has(swaWildcard), "SWa's DEA has no such block");
  // ; Command-Section: and ; Request-Section: of an Interpreted Constraints block link to their clauses.
  const linked = (line, section) => doc.lines[line].tokens.find(token => token.text === section)?.target;
  assert.deepEqual(linked(5350, '9.2.2.2.2'), { document: '29273-j20', section: '9.2.2.2.2' });
  assert.deepEqual(linked(5351, '9.2.2.2.1'), { document: '29273-j20', section: '9.2.2.2.1' });
  const block = constraintBlocks(doc).find(item => item.block.line === 5346);
  assert.equal(block.scope.commandSection, '9.2.2.2.2');
  assert.equal(block.scope.requestSection, '9.2.2.2.1');
  assert.equal(requestMessage(doc, block.block).section, '9.2.2.2.1');
});

test('a block naming a Command-Section holds only there, where the place read says which print it is', () => {
  const block = { scope: { command: 'X', application: 1, commandSection: '5.2' } };
  assert.ok(holdsIn(block, { command: { name: 'X', application: 1, section: '5.2' } }));
  assert.ok(!holdsIn(block, { command: { name: 'X', application: 1, section: '4.2' } }));
  assert.ok(holdsIn(block, { command: { name: 'X', application: 1 } }), 'a place not saying which print');
  assert.ok(holdsIn({ scope: { command: 'X' } }, { command: { name: 'X', section: '4.2' } }));
});

test('the folded Interpreted heading says how many blocks are on the AVP and how many read it, each only where some are', () => {
  assert.equal(constraintsSection.gist(2, 3), '2 on this AVP · 3 reading it');
  assert.equal(constraintsSection.gist(1, 0), '1 on this AVP');
  assert.equal(constraintsSection.gist(0, 4), '4 reading it');
  assert.equal(constraintsSection.gist(0, 0), '');
});
