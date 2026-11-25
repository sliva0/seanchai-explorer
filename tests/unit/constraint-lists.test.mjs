// Interpreted Constraints: a condition's `in` list, a rule wrapped over lines, the AVPs a command never sends said
// together, and the Session-Id codec.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  alternativesOf,
  constraintLines,
  interpretedLines,
  listWords,
  markConstraints,
  markTitle,
  onlyAbsent,
  ruleLines,
  ruleLineText,
  ruleNote,
  rulePieces,
  ruleWords,
} from '../../src/constraints.ts';
import { clauseAndParents } from '../../src/quote-text.ts';
import { codecs } from '../../src/text/rules.ts';

const words = (rule, printed = '') => ruleWords({ line: 0, ...rule }, printed);
const codes = Array.from({ length: 14 }, (_, index) => `CODE_${index + 1}`);
const on = (path, values, more = {}) => ({ path, values, ...more });

test('a condition holding one of a list is said with the list, a long one cut after its first value in a title', () => {
  assert.equal(
    words({ kind: 'absent-if', conditions: [[on(['Experimental-Result', 'Experimental-Result-Code'], codes)]] }),
    'absent if Experimental-Result-Code in Experimental-Result is one of CODE_1, … (14 values)',
  );
  assert.equal(
    words({ kind: 'requires', conditions: [[on(['Result-Code'], ['DIAMETER_SUCCESS', 'DIAMETER_MULTI_ROUND_AUTH'])]] }),
    'present only if Result-Code is one of DIAMETER_SUCCESS, DIAMETER_MULTI_ROUND_AUTH',
  );
  assert.equal(
    words({ kind: 'present-if', conditions: [[on(['Result-Code'], ['A', 'B', 'C', 'D'])]] }),
    'present if Result-Code is one of A, B, C, D',
    'four are said whole: cutting one would save nothing',
  );
  assert.equal(
    words({
      kind: 'present-if',
      conditions: [[on(['Result-Code'], ['DIAMETER_SUCCESS', 2001, { low: 5000, high: 5999 }])]],
    }),
    'present if Result-Code is one of DIAMETER_SUCCESS, 2001, 5000 to 5999',
    'a number and a range of numbers',
  );
  assert.equal(
    words({ kind: 'excludes', conditions: [[on(['Result-Code'], ['A', 'B'], { negated: true })]] }),
    'never present if Result-Code is none of A, B',
  );
  assert.equal(words({ kind: 'present-if', conditions: [[on(['X'], ['A'])]] }), 'present if X is A');
  assert.equal(
    words({ kind: 'present-if', conditions: [[on(['X'], ['A'], { negated: true })]] }),
    'present if X is not A',
  );
  assert.equal(
    words({ kind: 'present-if', conditions: [[on(['X'], ['16', 17], { root: 'request' })]] }),
    "present if the request's X is one of “16”, 17",
    'a name of digits only quoted, as a single value is',
  );
  assert.equal(
    words({ kind: 'present-if', conditions: [[on(['A'], ['X', 'Y']), { path: ['B'] }], [{ path: ['C'], value: 1 }]] }),
    'present if A is one of X, Y and B is present, or C is 1',
  );
  assert.equal(
    words({
      kind: 'values',
      values: [1],
      conditions: [[on(['Monitoring-Type'], ['UE_REACHABILITY', 'LOCATION_REPORTING'])]],
    }),
    'is 1 if Monitoring-Type is one of UE_REACHABILITY, LOCATION_REPORTING',
  );
  assert.equal(listWords(['A', 'B', 'C', 'D', 'E']), 'A, … (5 values)');
  assert.equal(
    words({ kind: 'present-if', conditions: [[{ path: ['X'], value: 3, values: [] }]] }),
    'present if X is 3',
    'an empty list is a test of another kind',
  );
});

test('a list is a piece of its own, which a popup folds after its first few', () => {
  assert.deepEqual(
    rulePieces(
      { kind: 'absent-if', line: 0, conditions: [[on(['Experimental-Result', 'Experimental-Result-Code'], codes)]] },
      '',
    ),
    ['absent if ', 'Experimental-Result-Code in Experimental-Result is one of ', { values: codes }],
  );
  assert.deepEqual(
    rulePieces({ kind: 'values', line: 0, values: [1, 2], conditions: [[on(['A'], [{ low: 1, high: 3 }, 7])]] }, ''),
    ['is one of 1, 2 if ', 'A is one of ', { values: ['1 to 3', '7'] }],
  );
  assert.deepEqual(rulePieces({ kind: 'length', line: 0, unit: 'octets', low: 3, high: 3 }, ''), ['3 octets']);
});

test('a list of a shape the site does not know makes the rule said as the file prints it, never thrown on', () => {
  const printed = '    present-if X in A, B';
  for (const condition of [
    { path: ['X'], values: 'A' },
    { path: ['X'], values: ['A'], value: 'B' },
    { path: ['X'], values: ['A'], bit: 1 },
    { path: ['X'], values: [{ low: 1 }] },
    { path: ['X'], values: [{ low: 1, high: 2, step: 1 }] },
    { path: ['X'], values: [null] },
    { path: ['X'], values: [['A']] },
  ]) {
    const rule = { kind: 'present-if', line: 0, conditions: [[condition]] };
    assert.equal(alternativesOf(rule), undefined, JSON.stringify(condition));
    assert.equal(ruleWords(rule, printed), printed.trim(), JSON.stringify(condition));
  }
});

/** A file of one Interpreted Constraints block on C, its rule wrapped over three lines, and a one-line rule after it. */
function wrapped() {
  const text = [
    '; Type: Interpreted Constraints\n',
    '; AVP: C\n',
    '"A quote of it."\n',
    '    absent-if A in X,\n',
    '        Y,\n',
    '        Z and B = Q\n',
    '    length 3\n',
    '\n',
  ];
  const rule = {
    kind: 'absent-if',
    line: 5,
    conditions: [
      [
        { path: ['A'], values: ['X', 'Y', 'Z'] },
        { path: ['B'], value: 'Q' },
      ],
    ],
  };
  return {
    id: 'doc',
    lines: text.map(line => ({ section: '1', tokens: [{ text: line }] })),
    blocks: [
      {
        type: 'Interpreted Constraints',
        interpreted: true,
        name: 'C',
        fields: { AVP: 'C', Section: '1' },
        section: '1',
        page: 1,
        line: 0,
        last: 6,
        readings: [
          {
            quotes: [{ line: 2, text: 'A quote of it.' }],
            rules: [rule, { kind: 'length', line: 6, low: 3, high: 3 }],
          },
        ],
      },
    ],
  };
}

test('a rule the formatter wrapped is read over all its lines, from its first, whichever the export names', () => {
  const file = wrapped();
  const [rule, length] = file.blocks[0].readings[0].rules;
  assert.deepEqual(ruleLines(file, rule), [3, 4, 5], 'the export names its last line');
  assert.deepEqual(ruleLines(file, { ...rule, line: 3 }), [3, 4, 5], 'or its first');
  assert.deepEqual(ruleLines(file, length), [6], 'a rule of one line');
  assert.deepEqual(ruleLines(file, { kind: 'requires', line: 5 }), [5], 'a line its kind opens no rule above: alone');
  assert.equal(ruleLineText(file, rule), '    absent-if A in X, Y, Z and B = Q');
  const kinds = interpretedLines(file);
  assert.deepEqual(
    [3, 4, 5, 6].map(line => kinds.get(line)),
    ['rule', 'rule', 'rule', 'rule'],
  );
  assert.equal(kinds.get(2), 'quote');
  markConstraints(file);
  const named = line => file.lines[line].tokens.filter(token => token.avp).map(token => token.text);
  assert.deepEqual(
    [named(3), named(4), named(5)],
    [['A'], [], ['B']],
    "each path where its line prints it, B's after the list",
  );
  assert.equal(file.lines[5].tokens.map(token => token.text).join(''), '        Z and B = Q\n', 'the text as it was');
});

/** A file printing CER, whose * [ AVP ] admits the AVPs `absent` names, each never sent in it, and one rule of another kind. */
function command(absent) {
  const text = ['<CER> ::= < Diameter Header: 257, REQ >\n', '  { Origin-Host }\n', '* [ AVP ]\n', '\n'];
  const blocks = [
    {
      type: 'Message',
      name: 'Capabilities-Exchange-Request',
      abbreviation: 'CER',
      fields: {},
      section: '5.3.1',
      page: 1,
      line: 0,
      last: 2,
      command: { application_id: 0, request: true },
      rule: {
        name: 'Capabilities-Exchange-Request',
        line: 0,
        members: [
          { name: 'Origin-Host', line: 1 },
          { name: 'AVP', line: 2 },
        ],
      },
    },
  ];
  const add = (avp, kind) => {
    const line = text.length;
    text.push('; Type: Interpreted Constraints\n', `; AVP: ${avp}\n`, '; Command: Capabilities-Exchange-Request\n');
    text.push('"0 The AVP MUST NOT be present in the message."\n', `    ${kind}\n`, '\n');
    blocks.push({
      type: 'Interpreted Constraints',
      interpreted: true,
      name: avp,
      // An RFC's block: no ; Versions:.
      fields: { AVP: avp, Command: 'Capabilities-Exchange-Request', Section: '10.1', Page: '133' },
      section: '10.1',
      page: 133,
      line,
      last: line + 4,
      readings: [
        {
          quotes: [{ line: line + 3, text: '0 The AVP MUST NOT be present in the message.' }],
          rules: [{ kind, line: line + 4 }],
        },
      ],
    });
  };
  for (const avp of absent) add(avp, 'absent');
  add('Host-IP-Address', 'text-only');
  return { id: 'rfc', lines: text.map(line => ({ section: '5.3.1', tokens: [{ text: line }] })), blocks };
}

test("many AVPs never sent in a command are one line of the ¶'s title on its * [ AVP ] line, a few each their own", () => {
  const many = command(['Acct-Interim-Interval', 'Destination-Host', 'Destination-Realm', 'Session-Id']);
  const lines = constraintLines(many, many);
  assert.equal(lines.get(2).length, 5);
  assert.deepEqual(markTitle(many, many, 2, lines.get(2)), [
    'From the prose of section 10.1:',
    '• never sent in CER: Acct-Interim-Interval, Destination-Host, Destination-Realm, Session-Id',
    '• Host-IP-Address: cannot be checked on a single message: “0 The AVP MUST NOT be present in the message.”',
    'Click to view each rule, its source quote, and a link to its block.',
  ]);
  const few = command(['Destination-Host', 'Destination-Realm']);
  const said = markTitle(few, few, 2, constraintLines(few, few).get(2));
  assert.ok(said.includes('• Destination-Host: never sent in CER'), said.join('\n'));
  assert.ok(said.includes('• Destination-Realm: never sent in CER'), said.join('\n'));
  assert.deepEqual(
    lines.get(2).map(onlyAbsent),
    [true, true, true, true, false],
    'a block saying only that is absent, a text-only one not',
  );
  assert.equal(onlyAbsent({ block: { readings: [] } }), false, 'nor one saying nothing');
});

test('a quote is looked for in its clause, then in each clause containing it', () => {
  assert.deepEqual(clauseAndParents('10.1'), ['10.1', '10']);
  assert.deepEqual(clauseAndParents('A.1.2'), ['A.1.2', 'A.1', 'A']);
  assert.deepEqual(clauseAndParents('5'), ['5']);
  assert.deepEqual(clauseAndParents(''), []);
});

test("RFC 6733's Session-Id layout is a codec of its own, in words and with its layout for a title", () => {
  assert.equal(words({ kind: 'encoding', codec: 'session-id' }), codecs['session-id'].words);
  assert.match(words({ kind: 'encoding', codec: 'session-id' }), /DiameterIdentity first/);
  assert.match(ruleNote({ kind: 'encoding', codec: 'session-id', line: 0 }), /"aaa\.example\.com;1876543210;523"/);
});
