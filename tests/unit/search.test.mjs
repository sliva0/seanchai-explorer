import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ALL_WORDS,
  definitions,
  EXACT,
  filterMentions as filterFolded,
  foldMentions,
  groupFacts,
  identityLabel,
  indexEntries,
  INITIALS,
  interfaceSpans,
  isApproximate,
  matchSpans,
  mentionSpans,
  ONE_TYPO,
  PREFIX,
  searchEntries as searchIndex,
  searchSpecifications,
  sortMentions,
  SUBSEQUENCE,
  SUBSTRING,
  TWO_TYPOS,
  TYPO_IN_WORD,
  WORD,
} from '../../src/search.ts';
import { absent, boot, readFixture, same } from './helpers.mjs';

const avp = (name, vendor_id, code, more = {}) => ({
  name,
  kind: 'avp',
  document: 'a',
  identity: { kind: 'avp', vendor_id, code },
  wireshark_name: null,
  abbreviation: null,
  defined_in: [],
  ...more,
});
const command = (name, command_code, application_id, more = {}) => ({
  name,
  kind: 'command',
  document: 'a',
  identity: { kind: 'command', command_code, application_id, header_application_id: application_id, application: null },
  wireshark_name: null,
  abbreviation: null,
  defined_in: [],
  ...more,
});
const application = (name, application_id) => ({
  name,
  kind: 'application',
  document: 'a',
  identity: { kind: 'application', application_id },
  wireshark_name: null,
  abbreviation: null,
  defined_in: [],
});
const registry = (name, code) => ({
  name,
  kind: 'registry',
  document: 'a',
  identity: { kind: 'registry', registry: 'Application IDs', code },
  wireshark_name: null,
  abbreviation: null,
  defined_in: [],
});
const names = groups => groups.map(group => group.name);
const searchEntries = (entries, ...rest) => searchIndex(indexEntries(entries), ...rest);
const filterMentions = (mentions, ...rest) => filterFolded(foldMentions(mentions), ...rest);

test('every kind of name is searched, and a number means what it identifies for each kind', () => {
  const entries = [
    avp('Session-Id', 0, 263),
    avp('Other', 10415, 300),
    command('Capabilities-Exchange-Request', 257, 0, { abbreviation: 'CER' }),
    command('Three-Hundred', 300, 16777216),
    application('Cx', 16777216),
    registry('3GPP Cx/Px', 16777216),
    registry('Code-300', 300),
  ];
  const code = searchEntries(entries, '300');
  assert.deepEqual(names(code.avp), ['Other']);
  assert.deepEqual(names(code.command), ['Three-Hundred']);
  assert.deepEqual(names(code.registry), ['Code-300']);
  assert.deepEqual(names(code.application), []);
  const id = searchEntries(entries, '16777216');
  assert.deepEqual(names(id.application), ['Cx']);
  assert.deepEqual(names(id.registry), ['3GPP Cx/Px']);
  assert.deepEqual(names(id.command), ['Three-Hundred']);
  assert.deepEqual(names(id.avp), []);
  assert.deepEqual(names(searchEntries(entries, '30').avp), [], 'not part of a code');
  assert.deepEqual(names(searchEntries(entries, '10415:300').avp), ['Other']);
  assert.deepEqual(names(searchEntries(entries, '10415/300').avp), ['Other']);
  assert.deepEqual(names(searchEntries(entries, '0:300').avp), []);
  assert.deepEqual(names(searchEntries(entries, '16777216:300').command), ['Three-Hundred']);
  assert.deepEqual(names(searchEntries(entries, 'cer').command), ['Capabilities-Exchange-Request']);
  assert.deepEqual(names(searchEntries(entries, 'cx').application), ['Cx']);
});

test('a command is found by its resolved application name too', () => {
  const entry = command('Update-Location-Request', 316, 16777251);
  entry.identity.application = 'S6a/S6d';
  assert.deepEqual(names(searchEntries([entry], 's6a').command), ['Update-Location-Request']);
});

test('results go exact, prefix, word, then substring, the shorter of equals first', () => {
  const entries = ['Mid-Session', 'Session', 'Session-Id', 'A-Session-B', 'Session-Binding', 'Obsessions'].map(
    (name, code) => avp(name, 0, code),
  );
  assert.deepEqual(names(searchEntries(entries, 'session').avp), [
    'Session',
    'Session-Id',
    'Session-Binding',
    'A-Session-B',
    'Mid-Session',
    'Obsessions',
  ]);
  const ranks = Object.fromEntries(searchEntries(entries, 'session').avp.map(group => [group.name, group.rank]));
  assert.deepEqual(
    [ranks.Session, ranks['Session-Id'], ranks['Mid-Session'], ranks.Obsessions],
    [EXACT, PREFIX, WORD, SUBSTRING],
  );
});

const avps = (...list) => list.map((name, code) => avp(name, 0, code));
const found = (entries, query) => names(searchEntries(entries, query).avp);
const ranked = (entries, query) => searchEntries(entries, query).avp.map(group => [group.name, group.rank]);

test('a query of several words needs no separators, and may come in any order', () => {
  const entries = avps('OC-OLR', 'Session-Id', 'User-Authorization-Type', 'Abort', 'A-Bort', 'Other');
  assert.deepEqual(ranked(entries, 'oc olr'), [['OC-OLR', EXACT]]);
  assert.deepEqual(ranked(entries, 'oc_olr'), [['OC-OLR', EXACT]]);
  assert.deepEqual(ranked(entries, 'session id'), [['Session-Id', EXACT]]);
  assert.deepEqual(ranked(entries, 'sessionid'), [['Session-Id', EXACT]]);
  assert.deepEqual(ranked(entries, 'User Auth'), [['User-Authorization-Type', PREFIX]]);
  assert.deepEqual(ranked(entries, 'auth user'), [['User-Authorization-Type', ALL_WORDS]]);
  assert.deepEqual(ranked(entries, 'id session'), [['Session-Id', ALL_WORDS]]);
  assert.deepEqual(found(entries, 'a b'), ['A-Bort'], 'not Abort, the query breaks where the name does not');
  assert.deepEqual(found(avps('Destination-Realm'), 'nr'), [], 'separators are not skipped from inside a word');
});

test('a query may be the initials or word prefixes of a name', () => {
  const entries = avps(
    'Vendor-Specific-Application-Id',
    'Destination-Realm',
    'Destination-Host',
    'Other-Destination-Realm',
  );
  assert.deepEqual(ranked(entries, 'vsai'), [['Vendor-Specific-Application-Id', INITIALS]]);
  assert.deepEqual(ranked(entries, 'vsa'), [['Vendor-Specific-Application-Id', INITIALS]]);
  assert.deepEqual(ranked(entries, 'destrealm'), [
    ['Destination-Realm', INITIALS],
    ['Other-Destination-Realm', INITIALS],
  ]);
  assert.deepEqual(found(entries, 'vendapp'), ['Vendor-Specific-Application-Id'], 'words may be skipped');
  assert.deepEqual(found(entries, 'sai'), [], 'short initials start at the first word');
  assert.deepEqual(found(entries, 'vs'), [], 'nothing approximate under three letters');
  assert.deepEqual(found(entries, 'realmdest'), [], 'prefixes keep their order');
});

test('typos are within one from five letters and two from nine, separators ignored', () => {
  const entries = avps('Result', 'Destination-Realm', 'Session-Id');
  assert.deepEqual(ranked(entries, 'reslt'), [['Result', ONE_TYPO]], 'a letter missing');
  assert.deepEqual(ranked(entries, 'resutl'), [['Result', ONE_TYPO]], 'letters swapped');
  assert.deepEqual(ranked(entries, 'reesult'), [['Result', ONE_TYPO]], 'a letter added');
  assert.deepEqual(ranked(entries, 'destinaton-relm'), [['Destination-Realm', TWO_TYPOS]]);
  assert.deepEqual(ranked(entries, 'DESTINATON_REALM'), [['Destination-Realm', ONE_TYPO]]);
  assert.deepEqual(found(entries, 'rslt'), [], 'no typo under five letters');
  assert.deepEqual(found(entries, 'rezult2'), [], 'a digit is not a typo');
  assert.deepEqual(found(avps('Abcdefgh'), 'abxdxfgh'), [], 'two typos under nine letters');
  assert.deepEqual(found(avps('Abcdefghi'), 'abxdxfghi'), ['Abcdefghi']);
  assert.deepEqual(found(avps('Abcdefghi'), 'axxdxfghi'), [], 'three typos');
});

test('a typo may be in one word of a name, ending on a word unless the query is long', () => {
  const entries = avps('Session-Id', 'Mid-Session-Key', 'Status-Code', 'Authorization-Lifetime');
  assert.deepEqual(ranked(entries, 'sesion'), [
    ['Session-Id', TYPO_IN_WORD],
    ['Mid-Session-Key', TYPO_IN_WORD],
  ]);
  assert.deepEqual(ranked(entries, 'authorisat'), [['Authorization-Lifetime', TYPO_IN_WORD]]);
  assert.deepEqual(found(entries, 'stat'), ['Status-Code'], 'its own prefix');
  assert.deepEqual(found([...entries, ...avps('State')], 'state'), ['State'], 'Status is two off');
  assert.deepEqual(
    found(avps('Request-Type', 'CC-Request'), 'cc request'),
    ['CC-Request'],
    'a word two short is not two typos',
  );
});

test('precise names rank above approximate ones, which are kept few and labelled by rank', () => {
  const entries = avps('Sesion', 'Session-Id', 'Mid-Sesion-X', 'Obsesion');
  const results = searchEntries(entries, 'sesion').avp;
  assert.deepEqual(
    results.map(group => [group.name, group.rank]),
    [
      ['Sesion', EXACT],
      ['Mid-Sesion-X', WORD],
      ['Obsesion', SUBSTRING],
      ['Session-Id', TYPO_IN_WORD],
    ],
  );
  assert.deepEqual(results.map(isApproximate), [false, false, false, true]);
  const many = Array.from({ length: 80 }, (_, index) => avp(`Session-${'x'.repeat(index + 1)}`, 0, index));
  assert.equal(searchEntries(many, 'sesion').avp.length, 30, 'approximate names are capped');
  assert.equal(searchEntries([...many, ...avps('Sesion')], 'sesion').avp.length, 31, 'precise ones are not');
  assert.equal(searchEntries(many, 'session').avp.length, 80);
  const typos = avps('Abcdefghiz', 'Abcdefghij', 'Abcxefghij', 'Abxxefghij');
  assert.deepEqual(
    ranked(typos, 'abcdefghij').map(([, rank]) => rank),
    [EXACT, ONE_TYPO, ONE_TYPO, TWO_TYPOS],
  );
});

test('letters merely in order are the last resort', () => {
  const entries = avps('Destination-Realm', 'Client-Address', 'Class');
  assert.deepEqual(ranked(entries, 'dstrlm'), [['Destination-Realm', SUBSEQUENCE]]);
  assert.deepEqual(found(entries, 'class'), ['Class'], 'not Client-Address, with something better');
  assert.deepEqual(found(entries, 'xdstrlm'), []);
  assert.deepEqual(found(avps('Destination-Realm-And-So-On-And-So-Forth'), 'dstrlm'), [], 'too little of the name');
});

test('numbers and spec numbers are never approximate', () => {
  const entries = [
    ...avps('Code-29229', 'A26', 'Rel-16', 'Rel-15'),
    avp('Result-Code', 0, 268),
    avp('Other', 10415, 268),
  ];
  assert.deepEqual(found(entries, '29229'), [], 'a number is not part of a name');
  assert.deepEqual(found(entries, '29.228'), [], 'and one off is not a spec number');
  assert.deepEqual(found(entries, '267'), []);
  assert.deepEqual(found(entries, '268'), ['Other', 'Result-Code']);
  assert.deepEqual(found(entries, 'Rel-15'), ['Rel-15']);
  assert.deepEqual(found(avps('Rel-16'), 'Rel-15'), [], 'digits are not typos');
  assert.deepEqual(found(avps('Release-16'), 'relase16'), ['Release-16']);
  assert.deepEqual(found(avps('Release-17'), 'relase16'), []);
});

test("an AVP's code brings the result codes of its table, and no other value", () => {
  const value = (name, value_kind, value, avp) => ({
    name,
    kind: 'value',
    document: 'd',
    target: null,
    defined_in: [],
    wireshark_name: null,
    abbreviation: null,
    identity: { kind: 'value', value_kind, value, avp, application: null, feature_list_id: null },
  });
  const entries = [
    avp('Result-Code', 0, 268),
    avp('Experimental-Result-Code', 0, 298),
    avp('Feature-List', 10415, 630),
    value('DIAMETER_SUCCESS', 'result-codes', 2001, 'Result-Code'),
    value('DIAMETER_ERROR', 'result-codes', 5001, 'Experimental-Result-Code'),
    value('Bit', 'bits', 268, 'Other'),
    value('Feature', 'features', 1, 'Feature-List'),
    value('Numbered', 'result-codes', 268, 'Other'),
  ];
  const code = searchEntries(entries, '268');
  assert.deepEqual(names(code.avp), ['Result-Code']);
  assert.deepEqual(
    code.value.map(group => [group.name, group.rank]),
    [
      ['Numbered', EXACT],
      ['DIAMETER_SUCCESS', SUBSTRING],
    ],
  );
  assert.deepEqual(names(searchEntries(entries, '0:268').value), ['DIAMETER_SUCCESS']);
  assert.deepEqual(names(searchEntries(entries, '10415:268').value), []);
  assert.deepEqual(names(searchEntries(entries, '630').value), [], 'only result codes');
  assert.deepEqual(names(searchEntries(entries, '2001').value), ['DIAMETER_SUCCESS']);
});

test('what to mark in a name says how it matched', () => {
  const words = (name, query) => matchSpans(name, query).map(([start, end]) => name.slice(start, end));
  assert.deepEqual(words('Vendor-Specific-Application-Id', 'vsai'), ['V', 'S', 'A', 'I']);
  assert.deepEqual(words('Destination-Realm', 'destrealm'), ['Dest', 'Realm']);
  assert.deepEqual(words('Session-Id', 'sesion'), ['Session']);
  assert.deepEqual(words('Session-Id', 'session id'), ['Session-Id']);
  assert.deepEqual(words('Session-Id', 'ion-i'), ['ion-I']);
  assert.deepEqual(words('Session-Id', 'id session'), ['Session', 'Id']);
  assert.deepEqual(words('Mission-Session', 'session'), ['Session'], 'a word over a substring');
  assert.deepEqual(words('Destination-Realm', 'destinaton-realm'), ['Destination-Realm']);
  assert.deepEqual(words('Destination-Realm', 'dstrlm'), ['D', 'st', 'R', 'lm']);
  assert.deepEqual(words('Session-Id', 'zzz'), []);
});

test('a mention marks the query, or its words, and any AVP found by it', () => {
  const mention = (text, avps = []) => foldMentions([{ text, avps, document: 'd', section: null, line: 0 }])[0];
  const marks = (item, query, names = []) =>
    mentionSpans(item, query, new Set(names)).map(([start, end]) => item.text.slice(start, end));
  assert.deepEqual(marks(mention('Session Id and SESSION ID'), 'session id'), ['Session Id', 'SESSION ID']);
  assert.deepEqual(marks(mention('id of a session'), 'session id'), ['id', 'session']);
  assert.deepEqual(marks(mention('names Result-Code here', ['Result-Code']), '268', ['Result-Code']), ['Result-Code']);
  assert.deepEqual(marks(mention('a session only'), 'session id'), [], 'not every word, so no word');
  assert.deepEqual(marks(mention('aaa'), 'aa'), ['aaa'], 'overlaps merge');
});

test('a name is one group per kind, whatever its wire identities, and a number finds only what it identifies', () => {
  const entry = avp('Call-Barring-Info', 10415, 1488, { wireshark_name: 'Call-Barring-Infor-List', document: 'a' });
  const other = { ...entry, identity: { kind: 'avp', vendor_id: 0, code: 1489 }, document: 'c' };
  const entries = [entry, { ...entry, document: 'b' }, other];
  assert.deepEqual(
    searchEntries(entries, '  infor-list ').avp.map(group => group.entries.length),
    [3],
  );
  assert.deepEqual(
    searchEntries(entries, '1489').avp.map(group => group.entries.map(item => item.document)),
    [['c']],
  );
  assert.deepEqual(names(searchEntries([entry], '').avp), []);
  assert.deepEqual(names(searchEntries([entry], 'missing').avp), []);
  const value = (value_kind, document) => ({
    name: 'V',
    kind: 'value',
    document,
    target: null,
    defined_in: [],
    wireshark_name: null,
    abbreviation: null,
    identity: { kind: 'value', value_kind, value: 1, avp: 'A', application: null, feature_list_id: null },
  });
  assert.equal(
    searchEntries([value('bits', 'a'), value('features', 'b'), value('bits', 'c')], 'v').value.length,
    2,
    'a value table of each kind has its own section',
  );
});

test('a command spelled shorter by some documents joins the name spelled out', () => {
  const entries = [
    command('AC-Answer', 271, 1, { abbreviation: 'ACA', document: 'a' }),
    command('AC-Answer', 271, 1, { abbreviation: 'ACA', document: 'b' }),
    command('AC-Answer', 271, 1, { abbreviation: 'ACA', document: 'c' }),
    command('Accounting-Answer', 271, 3, { abbreviation: 'ACA', document: 'd' }),
    command('Multimedia-Auth-Answer', 303, 1, { abbreviation: 'MAA', document: 'e' }),
    command('Multimedia-Auth-Answer', 303, 1, { abbreviation: 'MAA', document: 'f' }),
    command('Multimedia-Authentication-Answer', 303, 1, { abbreviation: 'MAA', document: 'g' }),
    command('Same-Code', 271, 1, { document: 'h' }),
  ];
  const documents = groups => groups.map(group => [group.name, group.entries.map(entry => entry.document)]);
  assert.deepEqual(documents(searchEntries(entries, 'aca').command), [['Accounting-Answer', ['a', 'b', 'c', 'd']]]);
  assert.deepEqual(
    searchEntries(entries, 'ac-answer').command.map(group => [group.name, group.rank]),
    [['Accounting-Answer', EXACT]],
    'the shorter spelling still finds it',
  );
  assert.deepEqual(
    documents(searchEntries(entries, 'accounting-answer').command),
    [['Accounting-Answer', ['d']]],
    'and each spelling only its own documents',
  );
  assert.deepEqual(
    names(searchEntries(entries, 'maa').command),
    ['Multimedia-Auth-Answer'],
    'neither shortened: the commoner',
  );
  assert.deepEqual(
    names(searchEntries(entries, 'same-code').command),
    ['Same-Code'],
    'a code alone does not make one command',
  );
});

test("what a name's entries agree on is said once, the rest beside each document", () => {
  const said = (...entries) => {
    const facts = groupFacts(entries);
    return [facts.shared, entries.map(facts.differing)];
  };
  const named = (application, application_id, header_application_id = null, command_code = 271) => {
    const entry = command('X', command_code, application_id);
    Object.assign(entry.identity, { application, header_application_id });
    return entry;
  };
  assert.deepEqual(
    said(named('Rf', 3), named('Rf', 3)),
    [
      ['command 271', 'application 3 (Rf)'],
      [[], []],
    ],
    'a header all agree on goes unsaid',
  );
  assert.deepEqual(said(named('Rf', 3), named('Diameter base accounting', 3), named(null, null)), [
    ['command 271'],
    [['Rf'], ['base accounting'], []],
  ]);
  assert.deepEqual(said(named(null, 3), named('Rf', 3)), [['command 271'], [['application 3'], ['Rf']]]);
  assert.deepEqual(said(named('Rf', 3, 3), named('Rf', 3, null)), [
    ['command 271', 'application 3 (Rf)'],
    [['header 3'], ['header none']],
  ]);
  assert.deepEqual(said(named('Rf', 3, null, 283), named('Rf', 3, null, 300)), [
    ['application 3 (Rf)'],
    [['command 283'], ['command 300']],
  ]);
  assert.deepEqual(said(avp('X', 0, 1, { data_type: 'Unsigned32' }), avp('X', 10415, 1, { data_type: 'Unsigned32' })), [
    ['Unsigned32'],
    [['0:1'], ['10415:1']],
  ]);
  const hole = avp('X', 0, 1, { identity: null });
  assert.deepEqual(said(avp('X', 0, 1), hole), [['0:1'], [[], []]], 'a hole disagrees with nothing');
  assert.deepEqual(said(hole), [[], [[]]]);
});

test('a group lists its newest release first', () => {
  const release = { old: { release: 6 }, new: { release: 18 } };
  const found = searchEntries(
    [avp('X', 0, 1, { document: 'old' }), avp('X', 0, 1, { document: 'new' })],
    'x',
    id => release[id],
  ).avp;
  assert.deepEqual(
    found[0].entries.map(entry => entry.document),
    ['new', 'old'],
  );
});

test('identities read per kind', () => {
  assert.equal(identityLabel(avp('X', 10415, 505)), '10415:505');
  assert.equal(identityLabel(application('X', 4)), 'Application 4');
  assert.equal(identityLabel(registry('X', 4)), 'Application IDs 4');
  const bare = command('X', 316, 16777251);
  bare.identity.header_application_id = null;
  bare.identity.application = 'S6a';
  assert.equal(identityLabel(bare), 'Command 316 · application 16777251 (S6a) · header none');
  assert.equal(identityLabel(command('X', 316, 4)), 'Command 316 · application 4');
  assert.equal(identityLabel({ identity: null }), '');
});

test('specifications match by number or title, best match and newest first', () => {
  const doc = (id, reference, specification, title, release) => ({
    id,
    reference,
    specification,
    title,
    version: null,
    release,
  });
  const documents = [
    doc('29214-7c0', 'TS29.214', '3GPP TS 29.214', 'Policy and charging control over Rx', 7),
    doc('29214-i40', 'TS29.214', '3GPP TS 29.214', 'Policy and charging control over Rx', 18),
    doc('32299-i00', 'TS32.299', '3GPP TS 32.299', 'Mentions TS29.214 only in title 29214', 18),
    doc('rfc2', 'RFC2', 'RFC 2', 'Other', null),
    doc('rfc29', 'RFC29', 'RFC 29', 'Other', null),
  ];
  const ids = query => searchSpecifications(documents, query).map(doc => doc.id);
  assert.deepEqual(ids('29214'), ['29214-i40', '29214-7c0', '32299-i00']);
  assert.deepEqual(ids('29.214'), ['29214-i40', '29214-7c0', '32299-i00']);
  assert.deepEqual(ids('policy rx'), ['29214-i40', '29214-7c0']);
  assert.deepEqual(ids('29.215'), []);
  assert.deepEqual(ids('rfc2'), ['rfc2', 'rfc29']);
  assert.deepEqual(ids(' '), []);
});

test('specifications match by interface, not loosely, and an exact one beats a title', () => {
  const doc = (id, reference, interfaces, title = 'Other', release = 18) => ({
    id,
    reference,
    specification: reference,
    title,
    version: null,
    release,
    interfaces,
  });
  const documents = [
    doc('titled', 'TS99.999', null, 'A protocol, its Cx clause'),
    doc('29229', 'TS29.229', ['Cx', 'Dx']),
    doc('x-s0013', '3GPP2-X.S0013-006', ['Cx'], 'Other', null),
    doc('183033', 'ETSI-TS183.033', ['Cx', 'Dx'], 'Other', 12),
    doc('29272', 'TS29.272', ['S6a', 'S6d', 'S7a', 'S7d', 'S13', "S13'"]),
    doc('29273', 'TS29.273', ['SWa', 'STa', 'SWd', 'SWm', 'SWx', 'S6b', "SWa'", "SWd'"]),
    doc('29336', 'TS29.336', ['S6m', 'S6n', 'S6t']),
    doc('29283', 'TS29.283', ['MCPTT-2', 'MCVideo-2', 'MCData-2', 'CSC-13']),
    doc('oma', 'OMA-DDS-Charging_Data', ['CH-1', 'CH-2']),
    doc('rfc8581', 'RFC8581', ['DOIC agent overload']),
    doc('none', 'TS29.230', []),
  ];
  const ids = query => searchSpecifications(documents, query).map(doc => doc.id);
  assert.deepEqual(ids('S6a'), ['29272']);
  assert.deepEqual(ids('s6A'), ['29272'], 'in any case');
  assert.deepEqual(ids('Cx'), ['29229', '183033', 'x-s0013', 'titled']);
  assert.deepEqual(ids('S6'), ['29272', '29273', '29336'], "from a name's start");
  assert.deepEqual(ids('agent'), ['rfc8581'], "from a word's");
  assert.deepEqual(ids('mcptt2'), ['29283'], 'across a separator');
  assert.deepEqual(ids('6a'), [], 'never inside a word');
  assert.deepEqual(ids('s6z'), [], 'never approximately');
  assert.ok(!ids('2').includes('oma'), "digits are no name's, `CH-2` being only a number away");
  assert.deepEqual(ids('s6a s6d'), ['29272'], 'word by word');
  assert.deepEqual(ids('s6a other'), ['29272'], 'or beside words of the title');
});

test('an interfaces list marks each name a query matches', () => {
  const list = "S6a, S6d, S7a, S13, S13'";
  const marked = query => interfaceSpans(list, query).map(([start, end]) => list.slice(start, end));
  assert.deepEqual(marked('s6a'), ['S6a']);
  assert.deepEqual(marked('s6'), ['S6', 'S6']);
  assert.deepEqual(marked('s6a s7a'), ['S6a', 'S7a']);
  assert.deepEqual(marked('s13'), ['S13', 'S13']);
  assert.deepEqual(marked('6a'), []);
  assert.deepEqual(interfaceSpans('', 'cx'), []);
});

test('a specification found by an interface shows it marked, even where its title names it', async () => {
  const documents = [
    {
      ...summaryOf('29272-x', '3GPP', '3GPP TS 29.272', 18),
      reference: 'TS29.272',
      title: 'Mobility Management; Diameter protocol',
      interfaces: ['S6a', 'S6d', 'S7a', 'S7d', 'S13', "S13'"],
    },
    {
      ...summaryOf('29229-x', '3GPP', '3GPP TS 29.229', 18),
      reference: 'TS29.229',
      title: 'Cx and Dx interfaces; Protocol details',
      interfaces: ['Cx', 'Dx'],
    },
    {
      ...summaryOf('29061-x', '3GPP', '3GPP TS 29.061', 18),
      reference: 'TS29.061',
      title: 'Interworking',
      interfaces: ['Gi', 'SGi', 'Gmb', 'SGmb', 'Mz'],
    },
  ];
  const facts = async query => {
    const page = await boot({ hash: `#search?q=${query}`, transform: withCorpus(documents, []) });
    try {
      const rows = [...page.document.querySelectorAll('.search-specifications .search-entry')];
      return rows.map(row => [
        row.querySelector('.entry-facts').textContent,
        [...row.querySelectorAll('mark')].map(node => node.textContent),
      ]);
    } finally {
      await page.close();
    }
  };
  assert.deepEqual(await facts('S6a'), [
    ["· S6a, S6d, S7a, S7d, S13, S13' — Mobility Management; Diameter protocol", ['S6a']],
  ]);
  assert.deepEqual(await facts('Dx'), [['· Cx, Dx — Cx and Dx interfaces; Protocol details', ['Dx']]]);
  assert.deepEqual(
    await facts('gmb'),
    [['· Gi, SGi, Gmb, SGmb, Mz — Interworking', ['Gmb', 'Gmb']]],
    'an edition differing marks its own too, and not `SGmb`',
  );
  const page = await boot({ hash: '#search?q=gmb', transform: withCorpus(documents, []) });
  try {
    assert.equal(page.document.querySelector('.search-specifications .doc-detail mark').textContent, 'Gmb');
  } finally {
    await page.close();
  }
});

test('mentions match on every word or a found AVP, newest release first', () => {
  const mentions = [
    { document: 'old', section: '1', line: 1, text: 'Session Id here', avps: [] },
    { document: 'new', section: '1', line: 2, text: 'names it', avps: ['Session-Id'] },
    { document: 'rfc', section: '1', line: 3, text: 'id session', avps: [] },
    { document: 'new', section: '1', line: 4, text: 'session only', avps: [] },
  ];
  const summary = id => ({ old: { release: 6 }, new: { release: 18 }, rfc: { release: null } })[id];
  const sorted = sortMentions(mentions, summary);
  assert.deepEqual(
    sorted.map(mention => mention.line),
    [2, 4, 1, 3],
  );
  assert.deepEqual(
    filterMentions(sorted, 'session id', new Set()).map(mention => mention.line),
    [1, 3],
  );
  assert.deepEqual(
    filterMentions(sorted, 'session id', new Set(['Session-Id'])).map(mention => mention.line),
    [2, 1, 3],
  );
  assert.deepEqual(filterMentions(sorted, '', new Set(['Session-Id'])), []);
});

test('the search page shows a section per kind with matches over the fixture, and focuses its input', async () => {
  const { entries } = await readFixture('search.json');
  const named = kind => entries.find(entry => entry.kind === kind && entry.identity && entry.target);
  const page = await boot({ hash: `#search?q=${encodeURIComponent(named('command').name)}` });
  try {
    const { document, window } = page;
    const headings = [...document.querySelectorAll('#search-results h2')].map(node => node.textContent);
    assert.ok(headings.some(heading => heading.startsWith('Commands ')));
    assert.ok(!headings.some(heading => heading.endsWith(' 0')), 'groups without matches are left out');
    assert.ok(document.querySelector('.search-command strong').textContent.includes(named('command').name));
    const input = document.querySelector('.search-form input');
    same(document.activeElement, input);
    input.value = named('application').name;
    input.dispatchEvent(new window.Event('input'));
    assert.match(window.location.hash, /^#search\?q=/);
    document.querySelector('.search-form').dispatchEvent(new window.Event('submit', { cancelable: true }));
    assert.ok(document.querySelector('.search-application strong').textContent.includes(named('application').name));
    const mention = document.querySelector('.search-mentions .mention-link');
    assert.match(mention.getAttribute('href'), /line=\d+/);
  } finally {
    await page.close();
  }
});

test('more shows every remaining entry of its group, and only of that group', async () => {
  const { entries } = await readFixture('search.json');
  const base = entries.find(entry => entry.kind === 'avp' && entry.identity && entry.target);
  const extra = Array.from({ length: 47 }, (_, index) => ({
    ...base,
    name: `Zzexpand-${index}`,
    abbreviation: null,
    wireshark_name: null,
    identity: { ...base.identity, code: 900000 + index },
  }));
  const mentions = Array.from({ length: 47 }, (_, index) => ({
    document: base.document,
    section: null,
    line: index + 1,
    text: `zzexpand ${index}`,
    avps: [],
  }));
  const page = await boot({
    hash: '#search?q=zzexpand',
    transform: (path, data) =>
      path === 'data/search.json'
        ? { ...data, entries: [...data.entries, ...extra], mentions: [...data.mentions, ...mentions] }
        : data,
  });
  try {
    const { document } = page;
    assert.deepEqual(
      [...document.querySelectorAll('#search-results h2')].map(node => node.textContent),
      ['AVPs 47', 'Mentions 47'],
    );
    assert.equal(document.querySelectorAll('.search-avp .search-entry').length, 20);
    assert.equal(document.querySelectorAll('.search-mentions li').length, 20);
    document.querySelector('.search-avp > button').click();
    assert.equal(document.querySelectorAll('.search-avp .search-entry').length, 47);
    absent(document.querySelector('.search-avp > button'));
    assert.equal(document.querySelectorAll('.search-mentions li').length, 20);
    assert.ok(document.querySelector('.search-mentions > button'));
  } finally {
    await page.close();
  }
});

test('a search matching nothing has no headings', async () => {
  const page = await boot({ hash: '#search?q=zzznothing' });
  try {
    const results = page.document.querySelector('#search-results');
    absent(results.querySelector('h2'));
    assert.equal(results.textContent, 'No matches.');
  } finally {
    await page.close();
  }
});

test('the header links to the index, search and the Wireshark plugin, and / is left to the browser', async () => {
  const page = await boot({ hash: '#29153-j00' });
  try {
    const { document, window } = page;
    assert.deepEqual(
      [...document.querySelectorAll('header nav a')].map(node => [node.textContent, node.getAttribute('href')]),
      [
        ['Index', '#'],
        ['Search', '#search'],
        ['Wireshark', '#wireshark'],
      ],
    );
    assert.ok(document.querySelector('header .theme-toggle'));
    absent(document.querySelector('header input'));
    assert.equal(
      document.body.dispatchEvent(new window.KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true })),
      true,
    );
    assert.notEqual(document.activeElement?.tagName, 'INPUT');
    await page.go('#search');
    same(document.activeElement, document.querySelector('.search-form input'));
  } finally {
    await page.close();
  }
});

test('a value is found by name, a result code by number too, and read with its AVP', () => {
  const value = (name, value_kind, value, more = {}) => ({
    name,
    kind: 'value',
    document: 'd',
    target: { document: 'd', section: '1' },
    defined_in: ['D'],
    identity: { kind: 'value', value_kind, value, avp: 'A', application: null, feature_list_id: null, ...more },
  });
  const entries = [
    value('DIAMETER_SUCCESS', 'result-codes', 2001),
    value('Flag', 'bits', 3),
    value('Rel8', 'features', 2001, { application: 'Rx', feature_list_id: 1 }),
  ];
  assert.deepEqual(
    searchEntries(entries, 'success').value.map(group => group.name),
    ['DIAMETER_SUCCESS'],
  );
  assert.deepEqual(
    searchEntries(entries, '2001').value.map(group => group.name),
    ['DIAMETER_SUCCESS'],
    "a bit's number is no search",
  );
  assert.deepEqual(searchEntries(entries, '3').value, []);
  assert.equal(identityLabel(entries[0]), 'Result code 2001 of A');
  assert.equal(identityLabel(entries[1]), 'Bit 3 of A');
  assert.equal(identityLabel(entries[2]), 'Feature bit 2001 of A list 1 (Rx)');
});

test("the search page groups values per kind, and a row's link opens its table at the row", async () => {
  const page = await boot({ hash: `#search?q=${encodeURIComponent('DIAMETER_ERROR_SERVICE_AREA')}` });
  try {
    const { document } = page;
    assert.deepEqual(
      [...document.querySelectorAll('#search-results h2')].map(node => node.textContent)[0],
      'Result codes 1',
    );
    const line = document.querySelector('.search-result-codes .entry-line').textContent;
    assert.match(line, /DIAMETER_ERROR_SERVICE_AREA/);
    assert.match(line, /Result code 5123 of Experimental-Result-Code/);
    const anchor = document.querySelector('.search-result-codes .entry-document a');
    assert.equal(anchor.textContent, 'TS 29.061 · 17.8.2');
    assert.equal(anchor.getAttribute('href'), '#29061-6f0/17.8.2?name=DIAMETER_ERROR_SERVICE_AREA');
    await page.go(anchor.getAttribute('href'));
    const marked = document.querySelector('.target-line');
    assert.ok(marked.textContent.startsWith('DIAMETER_ERROR_SERVICE_AREA'));
    assert.equal(document.querySelectorAll('.target-line').length, 1);
  } finally {
    await page.close();
  }
});

test('a specification is one entry, with what its newest edition is about, and editions saying where they differ', async () => {
  const older = (data, id) => ({
    ...data.documents.find(doc => doc.id === '29109-j00'),
    id,
    release: 6,
    version: '6.0.0',
    title: 'GAA',
  });
  const transform = (path, data) =>
    path === 'data/index.json' ? { ...data, documents: [...data.documents, older(data, '29109-600')] } : data;
  const page = await boot({ hash: `#search?q=${encodeURIComponent('29.109')}`, transform });
  try {
    const { document } = page;
    assert.equal(document.querySelectorAll('.search-specifications .search-entry').length, 1);
    assert.equal(
      document.querySelector('.search-specifications .entry-line').textContent,
      'TS 29.109· Zh, Dz, Zn, Zpn — GAA; Zh and Zn interfaces based on Diameter',
    );
    assert.equal(document.querySelector('.search-specifications .family').textContent, '3GPP:');
    assert.deepEqual(
      [...document.querySelectorAll('.search-specifications .entry-document a')].map(anchor => [
        anchor.textContent,
        anchor.getAttribute('href'),
      ]),
      [
        ['TS 29.109', '#29109-j00'],
        ['TS 29.109 Rel-6 (GAA)', '#29109-600'],
      ],
    );
  } finally {
    await page.close();
  }
});

test('bits and features get their own groups', async () => {
  const { entries } = await readFixture('search.json');
  const named = kind => entries.find(entry => entry.kind === 'value' && entry.identity.value_kind === kind);
  for (const [kind, heading] of [
    ['bits', 'Bits '],
    ['features', 'Features '],
  ]) {
    const page = await boot({ hash: `#search?q=${encodeURIComponent(named(kind).name)}` });
    try {
      assert.ok(
        [...page.document.querySelectorAll('#search-results h2')].some(node => node.textContent.startsWith(heading)),
        kind,
      );
      assert.ok(page.document.querySelector(`.search-${kind} strong`).textContent.includes(named(kind).name));
    } finally {
      await page.close();
    }
  }
});

const manyMentions = (document, count, more = {}) =>
  Array.from({ length: count }, (_, index) => ({
    document,
    section: `5.${index}`,
    line: index,
    text: `Zzgroup line ${index} and zzgroup`,
    avps: [],
    ...more,
  }));
const withMentions =
  (mentions, entries = []) =>
  (path, data) =>
    path === 'data/search.json' ? { ...data, entries: [...data.entries, ...entries], mentions } : data;
const documentHeadings = document =>
  [...document.querySelectorAll('.mention-document h3 a')].map(node => [node.textContent, node.getAttribute('href')]);

test('mentions group under one heading per document, newest release first', async () => {
  const mentions = [
    ...manyMentions('29061-6f0', 2),
    ...manyMentions('29153-j00', 2),
    { document: '29061-6f0', section: null, line: 7, text: 'zzgroup late', avps: [] },
  ];
  const page = await boot({ hash: '#search?q=zzgroup', transform: withMentions(mentions) });
  try {
    const { document } = page;
    assert.deepEqual(documentHeadings(document), [
      ['TS 29.153', '#29153-j00'],
      ['TS 29.061', '#29061-6f0'],
    ]);
    const groups = [...document.querySelectorAll('.mention-document')];
    assert.deepEqual(
      groups.map(group => group.querySelectorAll('li').length),
      [2, 3],
      "a document's mentions stay together",
    );
    const anchor = groups[0].querySelector('li .mention-link');
    assert.equal(anchor.textContent, '· 5.0');
    assert.equal(anchor.getAttribute('href'), '#29153-j00/5.0?line=0');
    assert.ok(!groups[0].querySelector('li').textContent.includes('29.153'), 'the label is only in the heading');
    assert.deepEqual(
      [...groups[0].querySelector('li code').querySelectorAll('mark')].map(mark => mark.textContent),
      ['Zzgroup', 'zzgroup'],
    );
    assert.equal(groups[0].querySelector('li code').textContent, 'Zzgroup line 0 and zzgroup');
    const bare = groups[1].querySelectorAll('li')[2].querySelector('.mention-link');
    assert.equal(bare.textContent, '· line 8');
    assert.equal(bare.getAttribute('href'), '#29061-6f0?line=7');
  } finally {
    await page.close();
  }
});

test('the limit counts mentions, and more continues a group it cut', async () => {
  const mentions = [
    ...manyMentions('29153-j00', 15),
    ...manyMentions('29061-6f0', 15),
    ...manyMentions('29109-j00', 5),
  ].map((mention, line) => ({ ...mention, line }));
  // Two documents of one release keep their file order, so the newest come first whichever they are.
  const page = await boot({ hash: '#search?q=zzgroup', transform: withMentions(mentions) });
  try {
    const { document } = page;
    assert.equal(document.querySelector('.search-mentions h2').textContent, 'Mentions 35');
    const counts = () =>
      [...document.querySelectorAll('.mention-document')].map(group => [
        group.querySelector('h3 a').getAttribute('href'),
        group.querySelectorAll('li').length,
      ]);
    assert.deepEqual(
      counts(),
      [
        ['#29153-j00', 15],
        ['#29109-j00', 5],
      ],
      'whole groups fit',
    );
    document.querySelector('.search-mentions > button').click();
    assert.deepEqual(counts(), [
      ['#29153-j00', 15],
      ['#29109-j00', 5],
      ['#29061-6f0', 15],
    ]);
    absent(document.querySelector('.search-mentions > button'));
  } finally {
    await page.close();
  }
  const cut = await boot({
    hash: '#search?q=zzgroup',
    transform: withMentions([...manyMentions('29153-j00', 25), ...manyMentions('29061-6f0', 3)]),
  });
  try {
    const { document } = cut;
    const counts = () =>
      [...document.querySelectorAll('.mention-document')].map(group => group.querySelectorAll('li').length);
    assert.deepEqual(counts(), [20], 'a group is shown in part');
    document.querySelector('.search-mentions > button').click();
    assert.deepEqual(counts(), [25, 3], 'and finished in place');
    assert.equal(document.querySelectorAll('.mention-document h3').length, 2);
  } finally {
    await cut.close();
  }
});

test('approximate hits are labelled, counted apart, marked, and bring no mentions', async () => {
  const { entries } = await readFixture('search.json');
  const base = entries.find(entry => entry.kind === 'avp' && entry.identity && entry.target);
  const named = (name, code) => ({
    ...base,
    name,
    abbreviation: null,
    wireshark_name: null,
    identity: { ...base.identity, code: 910000 + code },
  });
  const added = [named('Zzsesion', 0), named('Zzsesion-Extra', 1), named('Zzsession-Other', 2)];
  const mentions = [
    { document: base.document, section: '1', line: 0, text: 'names the other one', avps: ['Zzsession-Other'] },
    { document: base.document, section: '2', line: 1, text: 'has zzsesion', avps: ['Zzsesion'] },
  ];
  const page = await boot({ hash: '#search?q=zzsesion', transform: withMentions(mentions, added) });
  try {
    const { document } = page;
    const rows = [...document.querySelectorAll('.search-avp .search-entry')];
    assert.deepEqual(
      rows.map(row => [row.querySelector('strong').textContent, row.classList.contains('approximate')]),
      [
        ['Zzsesion', false],
        ['Zzsesion-Extra', false],
        ['Zzsession-Other', true],
      ],
    );
    assert.equal(rows[2].querySelector('em').textContent, 'approximate');
    absent(rows[0].querySelector('em'));
    assert.equal(rows[2].querySelector('strong mark').textContent, 'Zzsession');
    assert.equal(document.querySelector('.search-avp h2').textContent, 'AVPs 2+1 approximate');
    assert.deepEqual(
      [...document.querySelectorAll('.search-mentions li code')].map(node => node.textContent),
      ['has zzsesion'],
    );
  } finally {
    await page.close();
  }
  const alone = await boot({ hash: '#search?q=zzsesion', transform: withMentions([], added.slice(2)) });
  try {
    assert.equal(alone.document.querySelector('.search-avp h2').textContent, 'AVPs 1approximate');
  } finally {
    await alone.close();
  }
});

test('arrow keys walk the input and what is on screen', async () => {
  const page = await boot({ hash: '#search?q=zzgroup', transform: withMentions(manyMentions('29153-j00', 2)) });
  try {
    const { document, window } = page;
    const press = key =>
      document.activeElement.dispatchEvent(
        new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
      );
    const input = document.querySelector('.search-form input');
    same(document.activeElement, input);
    assert.equal(press('ArrowUp'), true, 'nothing above the input');
    same(document.activeElement, input);
    assert.equal(press('ArrowDown'), false);
    same(document.activeElement, document.querySelector('.mention-document h3 a'));
    press('ArrowDown');
    same(document.activeElement, document.querySelector('.mention-link'));
    press('ArrowUp');
    press('ArrowUp');
    same(document.activeElement, input);
    assert.equal(press('a'), true, 'other keys are left alone');
  } finally {
    await page.close();
  }
});

test('up and down step between entries by name, left and right within one', async () => {
  const page = await boot({ hash: `#search?q=${encodeURIComponent('DIAMETER_ERROR_SERVICE_AREA')}` });
  try {
    const { document, window } = page;
    const press = key =>
      document.activeElement.dispatchEvent(
        new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
      );
    const input = document.querySelector('.search-form input');
    assert.equal(press('ArrowRight'), true, "in the input they are the caret's");
    assert.equal(press('ArrowLeft'), true);
    same(document.activeElement, input);
    press('ArrowDown');
    const name = document.querySelector('.search-result-codes strong a');
    same(document.activeElement, name);
    assert.equal(press('ArrowLeft'), true, 'nothing before the name');
    same(document.activeElement, name);
    press('ArrowRight');
    const links = [...name.closest('.search-entry').querySelectorAll('a[href]')];
    same(document.activeElement, links[1]);
    assert.ok(links[1].closest('.search-entry') === name.closest('.search-entry'));
    press('ArrowLeft');
    same(document.activeElement, name);
    press('ArrowRight');
    press('ArrowUp');
    same(document.activeElement, input, 'up leaves from any link of the entry');
    assert.equal(press('ArrowRight'), true);
  } finally {
    await page.close();
  }
});

test("down passes an entry's many links at once, and comes back to the name", async () => {
  const documents = ['a', 'b', 'c', 'd'].map(id => summaryOf(id, '3GPP', `3GPP TS 99.00${id}`, 18));
  const entry = (name, document) => ({
    name,
    kind: 'avp',
    document,
    identity: { kind: 'avp', vendor_id: 10415, code: 900 + name.length },
    wireshark_name: null,
    abbreviation: null,
    target: { document, section: '1' },
  });
  const added = [...['a', 'b', 'c', 'd'].map(id => entry('Zzwalk', id)), entry('Zzwalk-Other', 'a')];
  const page = await boot({ hash: '#search?q=zzwalk', transform: withCorpus(documents, added) });
  try {
    const { document, window } = page;
    const press = key =>
      document.activeElement.dispatchEvent(
        new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
      );
    const names = [...document.querySelectorAll('.search-avp strong a')];
    assert.deepEqual(
      names.map(node => node.textContent),
      ['Zzwalk', 'Zzwalk-Other'],
    );
    press('ArrowDown');
    same(document.activeElement, names[0]);
    press('ArrowRight');
    press('ArrowRight');
    assert.ok(document.activeElement.closest('.entry-document'));
    press('ArrowDown');
    same(document.activeElement, names[1], 'whichever link it was on');
    press('ArrowUp');
    same(document.activeElement, names[0]);
  } finally {
    await page.close();
  }
});

const summaryOf = (id, publisher, specification, release = null, version = null) => ({
  id,
  publisher,
  specification,
  release,
  version,
  reference: specification,
  title: specification,
  pinned: null,
  interfaces: null,
  path: `documents/${id}.json`,
  raw: null,
  source: { kind: 'other', url: null, local: null, text: null },
});
const withCorpus = (documents, entries) => (path, data) =>
  path === 'data/index.json'
    ? { ...data, documents: [...data.documents, ...documents] }
    : path === 'data/search.json'
      ? { ...data, entries: [...data.entries, ...entries], mentions: [] }
      : data;

test("a name is one entry, with no fold, and its documents inline by publisher in the index's order", async () => {
  const documents = [
    summaryOf('oma', 'OMA', 'OMA-DDS-Charging_Data'),
    summaryOf('m2m', 'oneM2M', 'oneM2M TS-0004'),
    summaryOf('rfc6733x', 'IETF', 'RFC 6733'),
    summaryOf('rfc7155x', 'IETF', 'RFC 7155'),
    summaryOf('32299-bx', '3GPP', '3GPP TS 32.299', 11, '11.0.0'),
    summaryOf('29061-jx', '3GPP', '3GPP TS 29.061', 19, '19.0.0'),
    summaryOf('32299-jx', '3GPP', '3GPP TS 32.299', 19, '19.0.0'),
  ];
  const aca = (name, document, application_id, application) => ({
    ...command(name, 271, application_id, { abbreviation: 'ACA', document, defined_in: [] }),
    target: { document, section: '6.2' },
    identity: { kind: 'command', command_code: 271, application_id, header_application_id: null, application },
  });
  const entries = [
    aca('Accounting-Answer', 'oma', 3, 'CH-1'),
    aca('Accounting-Answer', 'm2m', 3, 'Mch'),
    aca('Accounting-Answer', 'rfc6733x', 3, 'Diameter base accounting'),
    aca('Accounting-Answer', 'rfc7155x', 1, 'NASREQ'),
    aca('Accounting-Answer', '32299-bx', 3, 'Rf'),
    aca('AC-Answer', '29061-jx', 1, 'NASREQ'),
    aca('Accounting-Answer', '32299-jx', 3, 'Rf'),
  ];
  const page = await boot({ hash: '#search?q=ACA', transform: withCorpus(documents, entries) });
  try {
    const { document } = page;
    const section = document.querySelector('.search-command');
    absent(document.querySelector('#search-results details, #search-results summary'));
    assert.equal(section.querySelector('h2').textContent, 'Commands 1');
    assert.equal(section.querySelector('.entry-line').textContent, 'Accounting-Answer (ACA)· command 271');
    const families = [...section.querySelectorAll('.entry-families li')].map(item => [
      item.querySelector('.family').textContent,
      [...item.querySelectorAll('.family-documents > .entry-document')].map(line => line.textContent),
    ]);
    assert.deepEqual(families, [
      ['3GPP:', ['TS 29.061 (as AC-Answer, NASREQ)', 'TS 32.299 (Rf)', 'TS 32.299 Rel-11 (Rf)']],
      ['IETF:', ['RFC 6733 (base accounting)', 'RFC 7155 (NASREQ)']],
      ['oneM2M:', ['TS-0004 (Mch)']],
      ['OMA:', ['DDS Charging_Data (CH-1)']],
    ]);
    assert.ok(!section.querySelector('.entry-families').textContent.includes('·'), 'nothing joins them');
    const anchor = section.querySelector('.entry-document a');
    assert.equal(anchor.getAttribute('href'), '#29061-jx/6.2');
    assert.equal(anchor.title, 'Command 271 · application 1 (NASREQ) · header none · TS 29.061 6.2');
  } finally {
    await page.close();
  }
});

test('where documents using a name find it is said once, and at a document only where it differs', async () => {
  const documents = [
    summaryOf('use-a', '3GPP', '3GPP TS 29.001', 19),
    summaryOf('use-b', '3GPP', '3GPP TS 29.002', 19),
    summaryOf('def-a', 'IETF', 'RFC 9001'),
    summaryOf('def-b', 'IETF', 'RFC 9002'),
  ];
  const uses = (name, document, target) => avp(name, 0, 1, { document, target, data_type: 'Unsigned32' });
  const one = { document: 'def-a', section: '4' };
  const other = { document: 'def-b', section: '5' };
  const entries = [
    uses('Zzone', 'use-a', one),
    uses('Zzone', 'use-b', one),
    uses('Zzone', 'def-a', one),
    uses('Zztwo', 'use-a', one),
    uses('Zztwo', 'use-b', other),
    uses('Zztwo', 'def-a', one),
    uses('Zzthree', 'use-a', other),
    uses('Zzthree', 'use-b', other),
    uses('Zzthree', 'def-a', one),
    uses('Zztwice', 'def-a', one),
    uses('Zztwice', 'def-a', { document: 'def-a', section: '7' }),
  ];
  const page = await boot({ hash: '#search?q=zz', transform: withCorpus(documents, entries) });
  try {
    const { document } = page;
    const entry = name =>
      [...document.querySelectorAll('.search-avp .search-entry')].find(
        node => node.querySelector('strong').textContent === name,
      );
    assert.equal(entry('Zzone').querySelector('.entry-facts').textContent, '· 0:1 · Unsigned32 · defined in RFC 9001');
    const lines = name =>
      [...entry(name).querySelectorAll('.family-documents')].map(node =>
        [...node.querySelectorAll('.entry-document')].map(line => line.textContent),
      );
    assert.deepEqual(lines('Zzone'), [['TS 29.001', 'TS 29.002'], ['RFC 9001']]);
    assert.equal(entry('Zzone').querySelector('.entry-facts a').getAttribute('href'), '#def-a/4');
    assert.deepEqual(lines('Zztwo'), [['TS 29.001', 'TS 29.002 → RFC 9002'], ['RFC 9001']]);
    assert.equal(
      entry('Zzthree').querySelector('.entry-facts').textContent,
      '· 0:1 · Unsigned32 · defined in RFC 9002',
    );
    assert.deepEqual(lines('Zzthree'), [['TS 29.001', 'TS 29.002'], ['RFC 9001 (defines it)']]);
    assert.deepEqual(lines('Zztwice'), [['RFC 9001 (4)', 'RFC 9001 (7)']]);
    assert.equal(
      entry('Zztwice').querySelector('.entry-facts').textContent,
      '· 0:1 · Unsigned32',
      'all define their own',
    );
  } finally {
    await page.close();
  }
});

test("a value another document defines is defined there, at its row of that document's release, and one defining its own says so", async () => {
  const documents = [
    summaryOf('use-19', '3GPP', 'TS29.001', 19),
    summaryOf('use-11', '3GPP', 'TS29.001', 11),
    summaryOf('def-19', '3GPP', 'TS29.229', 19),
    summaryOf('def-11', '3GPP', 'TS29.229', 11),
    summaryOf('own', '3GPP', 'TS29.272', 19),
  ];
  const value = (name, document, section, defined_in) => ({
    name,
    kind: 'value',
    document,
    identity: {
      kind: 'value',
      value_kind: 'result-codes',
      avp: 'Experimental-Result-Code',
      value: 5001,
      feature_list_id: null,
      application: null,
    },
    wireshark_name: null,
    abbreviation: null,
    data_type: null,
    across_releases: null,
    defined_in,
    target: { document, section },
  });
  const entries = [
    value('ZZ_ERROR_USER_UNKNOWN', 'use-19', '7.4.3.2', ['TS29.229']),
    value('ZZ_ERROR_USER_UNKNOWN', 'use-11', '7.4.3.2', ['TS29.229']),
    value('ZZ_ERROR_USER_UNKNOWN', 'def-19', '6.2.2.1', ['TS29.229']),
    value('ZZ_ERROR_USER_UNKNOWN', 'def-11', '6.2.2.9', ['TS29.229']),
    value('ZZ_ERROR_USER_UNKNOWN', 'own', '7.4.3.1', ['TS29.272']),
    value('ZZ_ERROR_RENAMED', 'use-19', '7.4.3.9', ['TS29.229']),
  ];
  const summary = id => documents.find(doc => doc.id === id);
  // One name's entries, as a group holds them.
  const defined = new Map([
    ...definitions(entries.slice(0, 5), summary, documents),
    ...definitions(entries.slice(5), summary, documents),
  ]);
  assert.deepEqual(defined.get(entries[0]), { document: 'def-19', section: '6.2.2.1', name: 'ZZ_ERROR_USER_UNKNOWN' });
  assert.deepEqual(
    defined.get(entries[1]),
    { document: 'def-11', section: '6.2.2.9', name: 'ZZ_ERROR_USER_UNKNOWN' },
    "its own release's",
  );
  assert.equal(defined.get(entries[2]), entries[2].target);
  assert.equal(defined.get(entries[4]), entries[4].target);
  assert.deepEqual(
    defined.get(entries[5]),
    { document: 'def-19', section: null },
    'an origin listing it under another name is its newest edition',
  );
  const page = await boot({ hash: '#search?q=ZZ_ERROR', transform: withCorpus(documents, entries) });
  try {
    const { document } = page;
    const entry = name =>
      [...document.querySelectorAll('.search-result-codes .search-entry')].find(
        node => node.querySelector('strong').textContent === name,
      );
    const facts = entry('ZZ_ERROR_USER_UNKNOWN').querySelector('.entry-facts');
    assert.equal(facts.textContent, '· Result code 5001 of Experimental-Result-Code · defined in TS29.229');
    assert.equal(facts.querySelector('a').getAttribute('href'), '#def-19/6.2.2.1?name=ZZ_ERROR_USER_UNKNOWN');
    const lines = [...entry('ZZ_ERROR_USER_UNKNOWN').querySelectorAll('.entry-document')].map(line => line.textContent);
    assert.deepEqual(
      lines,
      [
        'TS29.001 · 7.4.3.2',
        'TS29.001 Rel-11 · 7.4.3.2 → TS29.229 Rel-11',
        'TS29.229 · 6.2.2.1',
        'TS29.229 Rel-11 · 6.2.2.9 (defines it)',
        'TS29.272 · 7.4.3.1 (defines it)',
      ],
      "a re-use says where it differs from the usual origin, as an AVP's does",
    );
  } finally {
    await page.close();
  }
});
