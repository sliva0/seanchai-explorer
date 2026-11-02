import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRoute, routeFor, searchGroups, searchSpecifications, sharedRoute, sharedState } from '../src/navigation.ts';

test('section and raw links survive encoding and parsing', () => {
  const hash = routeFor({ document: '29272-i70', section: '7.3.138' }, true);
  assert.equal(hash, '#29272-i70/7.3.138?raw=1');
  assert.deepEqual(parseRoute(hash), { document: '29272-i70', section: '7.3.138', raw: true, query: '' });
  assert.equal(parseRoute('#search?q=call%20barring').query, 'call barring');
  assert.equal(parseRoute('#%ZZ').document, '');
});

test('sharing preserves the source PDF page, raw mode, and left text line', () => {
  const source = { document: '29061-i10', position: { section: '16.4.7', page: 120, name: '3GPP-MS-TimeZone' } };
  const hash = sharedRoute({ document: '29214-i40', section: '5.4.0' }, true, source, 125);
  assert.equal(parseRoute(hash).raw, true);
  assert.equal(sharedState(hash).source.document, '29061-i10');
  assert.equal(sharedState(hash).source.position.page, 120);
  assert.equal(sharedState(hash).source.position.exact, true);
  assert.equal(sharedState(hash).line, 125);
  assert.equal(sharedState('#doc?source=other&page=-2&line=-1').source.position.page, null);
  assert.equal(sharedState('#doc?line=bad').line, undefined);
});

test('search accepts exact AVP codes, vendor/code pairs, and compact spec numbers', () => {
  const avp = { kind: 'AVP', name: 'AF-Charging-Identifier', identity: [10415, 505] };
  assert.equal(searchGroups([avp], '505').length, 1);
  assert.equal(searchGroups([avp], '10415:505').length, 1);
  assert.equal(searchGroups([avp], '50').length, 0);
  const document = { id: '29214-i40', reference: 'TS29.214', specification: '3GPP TS 29.214', title: 'Policy and charging control over Rx', version: '18.4.0' };
  assert.equal(searchSpecifications([document], '29214').length, 1);
  assert.equal(searchSpecifications([document], 'policy rx').length, 1);
  assert.equal(searchSpecifications([document], '29.215').length, 0);
});

test('aliases find all occurrences without merging different wire identities', () => {
  const entry = { name: 'Call-Barring-Info', kind: 'AVP', identity: [10415, 1488], alias: 'Call-Barring-Infor-List', document: 'a' };
  const results = searchGroups([entry, { ...entry, document: 'b' }, { ...entry, identity: [0, 1488], document: 'c' }], '  infor-list ');
  assert.equal(results.length, 2);
  assert.equal(results[0].length, 2);
  assert.equal(results[1].length, 1);
  assert.equal(searchGroups([entry], '').length, 0);
  assert.equal(searchGroups([entry], 'missing').length, 0);
});
