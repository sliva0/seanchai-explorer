// Interpreted Constraints across documents: a value a rule names that another document defines, linked to its row
// there; the blocks of the document defining a grouped AVP, holding on its members where another reads them; and the
// commands a document says an AVP is never sent in.
import assert from 'node:assert/strict';
import test from 'node:test';
import { heldPosition } from '../../src/avp-places.ts';
import { constraintBlocks, markConstraints, withinOrigin } from '../../src/constraints.ts';
import { absentElsewhere, constraintsHere } from '../../src/popup/constraints.tsx';

const line = (...tokens) => ({
  section: '1',
  tokens: tokens.map(token => (typeof token === 'string' ? { text: token } : token)),
});

/** A block on `avp` of a file, its rules each `[kind, line, fields]`, its scope `fields`. */
const block = (avp, at, last, rules, { fields = {}, target } = {}) => ({
  type: 'Interpreted Constraints',
  interpreted: true,
  name: avp,
  fields: { AVP: avp, Section: '1', ...fields },
  section: '1',
  page: 1,
  line: at,
  last,
  ...(target ? { avp_target: target } : {}),
  readings: [{ quotes: [], rules: rules.map(([kind, ruleLine, more]) => ({ kind, line: ruleLine, ...more })) }],
});

/**
 * TS 29.128 as it reads Monitoring-Type, which TS 29.336 defines: a rule on C naming one of its values, a default of C,
 * whose document is this one and which has no row of it, and a default of D, which another document defines.
 */
function reader() {
  return {
    id: 'reader',
    lines: [
      line(
        { text: 'Monitoring-Type', avp: 'Monitoring-Type', target: { document: 'defining', section: '8.4.7' } },
        '\n',
      ),
      line('; Type: Interpreted Constraints\n'),
      line('    present-if Monitoring-Type = LOCATION_REPORTING\n'),
      line('    default "OWN_VALUE"\n'),
      line('; Type: Interpreted Constraints\n'),
      line('    default ELSEWHERE\n'),
    ],
    blocks: [
      block(
        'C',
        1,
        3,
        [
          ['present-if', 2, { conditions: [[{ path: ['Monitoring-Type'], value: 'LOCATION_REPORTING' }]] }],
          ['default', 3, { value: 'OWN_VALUE' }],
        ],
        { target: { document: 'reader', section: '1' } },
      ),
      block('D', 4, 5, [['default', 5, { value: 'ELSEWHERE' }]], { target: { document: 'other', section: '5.3' } }),
    ],
  };
}

test('a value a rule names that another document defines links to its row there, by its clause and name', () => {
  const file = reader();
  markConstraints(file);
  const named = (index, text) => file.lines[index].tokens.find(token => token.text === text);
  assert.deepEqual(
    { ...named(2, 'LOCATION_REPORTING') },
    {
      text: 'LOCATION_REPORTING',
      target: { document: 'defining', section: '8.4.7', name: 'LOCATION_REPORTING' },
      elsewhereOf: 'Monitoring-Type',
    },
    "where the AVP's link goes",
  );
  assert.deepEqual(
    named(5, 'ELSEWHERE')?.target,
    { document: 'other', section: '5.3', name: 'ELSEWHERE' },
    "its ; AVP: line's",
  );
  assert.equal(
    file.lines[3].tokens.map(token => token.text).join(''),
    '    default "OWN_VALUE"\n',
    'this document defines C and names no such value: text',
  );
  assert.ok(!file.lines[3].tokens.some(token => token.target), 'no link');
  assert.equal(
    file.lines[2].tokens.map(token => token.text).join(''),
    '    present-if Monitoring-Type = LOCATION_REPORTING\n',
  );
});

test("a value's row of another document is where the pane goes once it is loaded, a line as before", () => {
  const defining = {
    id: 'defining',
    lines: [
      line('; Type: Value Table\n'),
      line({ text: 'LOCATION_REPORTING', target: { document: 'defining', section: '8.4.7' } }, ' = 2\n'),
    ],
    blocks: [
      {
        type: 'Value Table',
        name: 'Monitoring-Type',
        value_kind: 'values',
        fields: {},
        section: '8.4.7',
        page: 56,
        line: 0,
        last: 1,
        value_rows: [{ name: 'LOCATION_REPORTING', value: 2, line: 1 }],
      },
    ],
  };
  const target = { document: 'defining', section: '8.4.7', name: 'LOCATION_REPORTING' };
  assert.deepEqual(heldPosition(defining, { target }), {
    section: '8.4.7',
    page: 56,
    name: 'LOCATION_REPORTING',
    row: true,
    value: 2,
  });
  assert.deepEqual(heldPosition(defining, { line: 1, target }), {
    section: '8.4.7',
    page: 56,
    name: 'LOCATION_REPORTING',
    row: true,
    value: 2,
  });
  assert.equal(heldPosition(defining, { target: { ...target, name: 'NO_SUCH_VALUE' } }), undefined, 'the clause alone');
  assert.equal(heldPosition(defining, { target: { document: 'defining', section: '8.4.7' } }), undefined);
});

/**
 * TS 29.154 reading Vendor-Specific-Application-Id, which RFC 6733 defines, through a rule's path into it, and RFC 6733
 * holding a block on its Auth-Application-Id within it, one on Auth-Application-Id wherever read, and one in its CER.
 */
function grouped(own = []) {
  const doc = {
    id: 'reading',
    lines: [
      line(
        {
          text: 'Vendor-Specific-Application-Id',
          avp: 'Vendor-Specific-Application-Id',
          target: { document: 'base', section: '6.11' },
        },
        '\n',
      ),
      line('; Type: Interpreted Constraints\n'),
      line('    requires Vendor-Specific-Application-Id/Auth-Application-Id = 16777348\n'),
      line('\n'),
      line('    absent\n'),
    ],
    blocks: [
      block('Vendor-Specific-Application-Id', 1, 2, [
        [
          'requires',
          2,
          { conditions: [[{ path: ['Vendor-Specific-Application-Id', 'Auth-Application-Id'], value: 16777348 }]] },
        ],
      ]),
      ...own,
    ],
  };
  const base = {
    id: 'base',
    lines: Array.from({ length: 12 }, () => line('\n')),
    blocks: [
      block('Auth-Application-Id', 0, 2, [['excludes', 2, {}]], {
        fields: { Within: 'Vendor-Specific-Application-Id' },
      }),
      block('Auth-Application-Id', 3, 5, [['text-only', 5, {}]]),
      block('Auth-Application-Id', 6, 8, [['absent', 8, {}]], { fields: { Command: 'Capabilities-Exchange-Request' } }),
    ],
  };
  const site = { held: id => (id === 'base' ? base : undefined) };
  const use = {
    kind: 'constraint',
    block: doc.blocks[0],
    role: 'condition',
    ref: { root: null, path: ['Vendor-Specific-Application-Id', 'Auth-Application-Id'] },
  };
  const request = { doc, file: doc, token: { text: 'Auth-Application-Id', avp: 'Auth-Application-Id' } };
  return { doc, base, site, use, request };
}

test('within a grouped AVP another document defines, its blocks on the member hold, but where this one has its own', () => {
  const { doc, base, site, use, request } = grouped();
  assert.deepEqual(withinOrigin(doc, { within: 'Vendor-Specific-Application-Id' }), {
    document: 'base',
    section: '6.11',
    name: 'Vendor-Specific-Application-Id',
  });
  assert.equal(withinOrigin(doc, {}), undefined, 'read wherever');
  assert.equal(withinOrigin(base, { within: 'Vendor-Specific-Application-Id' }), undefined, 'linking nowhere');
  const found = constraintsHere(site, request, use);
  assert.deepEqual(
    found.map(({ doc: from, item }) => [from.id, item.block.line]),
    [['base', 0]],
    "the origin's block within it, not its wherever or its command's, as the member's own link names no document",
  );
  assert.deepEqual(constraintsHere({ held: () => undefined }, request, use), [], 'not loaded yet: nothing');

  const own = block('Auth-Application-Id', 3, 4, [['absent', 4, {}]], {
    fields: { Within: 'Vendor-Specific-Application-Id' },
  });
  const set = grouped([own]);
  assert.deepEqual(
    constraintsHere(set.site, set.request, set.use).map(({ doc: from, item }) => [from.id, item.block.line]),
    [['reading', 3]],
    "its own block within it sets the origin's aside",
  );
});

test('the commands a document says an AVP is never sent in, but those holding where it is read', () => {
  const { base } = grouped();
  const others = [
    block('Auth-Application-Id', 9, 11, [['absent', 11, {}]], { fields: { Command: 'Device-Watchdog-Request' } }),
  ];
  base.blocks.push(...others);
  const request = { doc: base, token: { avp: 'Auth-Application-Id' } };
  assert.deepEqual(
    absentElsewhere(request, []).map(item => item.scope.command),
    ['Capabilities-Exchange-Request', 'Device-Watchdog-Request'],
  );
  const cer = constraintBlocks(base).find(item => item.scope.command === 'Capabilities-Exchange-Request');
  assert.deepEqual(
    absentElsewhere(request, [{ item: cer }]).map(item => item.scope.command),
    ['Device-Watchdog-Request'],
    'read in CER, its block there is listed as its own',
  );
  assert.deepEqual(absentElsewhere({ doc: base, token: { avp: 'Session-Id' } }, []), []);
});
