import assert from 'node:assert/strict';
import test from 'node:test';
import { pageOf, parseRoute, routeFor } from '../../src/navigation.ts';

test('section and raw links survive encoding and parsing', () => {
  const hash = routeFor({ document: '29272-i70', section: '7.3.138' }, { raw: true });
  assert.equal(hash, '#29272-i70/7.3.138?raw=1');
  assert.deepEqual(parseRoute(hash), { document: '29272-i70', section: '7.3.138', raw: true, query: '' });
  assert.equal(routeFor({ document: 'rfc6733' }), '#rfc6733');
  assert.equal(routeFor({ document: 'a b', section: null, name: 'X/Y' }), '#a%20b?name=X%2FY');
  assert.equal(parseRoute('#search?q=call%20barring').query, 'call barring');
  assert.equal(parseRoute('#%ZZ').document, '');
  assert.equal(parseRoute('').document, '');
});

test('a route keeps the pane, raw mode and line it was shared with', () => {
  const source = { document: '29061-i10', position: { section: '16.4.7', page: 120, name: '3GPP-MS-TimeZone', exact: true, row: true } };
  const route = parseRoute(routeFor({ document: '29214-i40', section: '5.4.0' }, { raw: true, source, line: 125, top: 90, paneHidden: true }));
  assert.equal(route.raw, true);
  assert.deepEqual(route.source, source);
  assert.equal(route.line, 125);
  assert.equal(route.top, 90);
  assert.equal(route.paneHidden, true);
});

test('a source position survives the route whole', () => {
  const source = { document: '29061-i10', position: { section: '16.4.7', page: 120, name: 'Ns', exact: true, occurrence: true, row: true } };
  assert.deepEqual(parseRoute(routeFor({ document: '29061-i10' }, { source })).source, source);
  const plain = { document: '29061-i10', position: { section: '16.4.7', page: null } };
  assert.deepEqual(parseRoute(routeFor({ document: '29061-i10' }, { source: plain })).source, plain);
});

test('a malformed route falls back rather than failing', () => {
  assert.equal(parseRoute('#doc?source=other&page=-2&line=-1').source.position.page, null);
  assert.equal(parseRoute('#doc?source=other&page=-2&line=-1').line, undefined);
  assert.equal(parseRoute('#doc?line=bad').line, undefined);
  assert.equal(parseRoute('#doc').source, undefined);
});

test('a page is what a route shows, apart from where in it', () => {
  const page = hash => pageOf(parseRoute(hash));
  assert.equal(page('#29214-i40/5.4.0?line=3&top=2&name=X'), '29214-i40');
  assert.equal(page('#29214-i40?raw=1'), '29214-i40?raw');
  assert.equal(page('#search?q=x'), 'search');
  assert.equal(page(''), '');
  assert.equal(page('#'), '');
});
