import assert from 'node:assert/strict';
import test from 'node:test';
import { createSite, docHeading, docLabel, docName, docNumber, docSubject, docTitle, docVersioned, interfacesOf, paneFile, paneKind, paneURL, publisherURL, sourceHref } from '../../src/data.ts';

globalThis.location = new URL('http://localhost/site/index.html#doc');

const etsi = { source: { kind: 'etsi-pdf', url: 'https://www.etsi.org/a.pdf', local: null, text: null } };
const hosted = { source: { ...etsi.source, local: 'sources/a.pdf' } };
const rfc = { source: { kind: 'rfc-text', url: 'https://www.rfc-editor.org/rfc/rfc6733.txt', local: null, text: 'sources/rfc6733.txt' } };
const fetchedRfc = { source: { ...rfc.source, text: null } };
const other = { source: { kind: 'other', url: 'http://www.3gpp2.org/a.pdf', local: null, text: null } };
const position = { section: '6.4', page: 83 };

test('labels name the version and leave out a title repeating the name', () => {
  const doc = { id: 'unmapped', specification: '3GPP TS 29.999', version: '18.7.0', reference: 'TS29.999', title: 'EPS interfaces' };
  assert.equal(docLabel(doc), '3GPP TS 29.999 V18.7.0');
  assert.equal(docLabel({ ...doc, version: null }), '3GPP TS 29.999');
  assert.equal(docTitle(doc), '3GPP TS 29.999 V18.7.0 — EPS interfaces');
  for (const title of ['3GPP TS 29.999', '3gpp ts 29999', 'TS29.999', '3GPP TS 29.999 V18.7.0', '']) {
    assert.equal(docSubject({ ...doc, title }), '');
    assert.equal(docTitle({ ...doc, title }), '3GPP TS 29.999 V18.7.0');
  }
});

test('a document\'s interfaces are the index\'s, blank for none and where the corpus does not say', () => {
  assert.equal(interfacesOf({ interfaces: ['Gx', 'Gxx', 'Sd', 'St', 'S15'] }), 'Gx, Gxx, Sd, St, S15');
  assert.equal(interfacesOf({ interfaces: [] }), '');
  assert.equal(interfacesOf({ interfaces: null }), '');
  assert.equal(docTitle({ id: 'x', specification: 'X', version: null, reference: 'X', title: 'T', interfaces: null }), 'X — T');
});

test('a heading names the interfaces unless the title already says them all', () => {
  const doc = { id: '29272-j60', specification: '3GPP TS 29.272', version: '19.6.0', reference: 'TS29.272', title: 'EPS MME/SGSN interfaces based on Diameter', interfaces: ['S6a', 'S6d', 'S7a', 'S7d', 'S13', "S13'"] };
  assert.equal(docTitle(doc), "3GPP TS 29.272 V19.6.0 · S6a, S6d, S7a, S7d, S13, S13' — EPS MME/SGSN interfaces based on Diameter");
  const named = { id: '29229-j10', specification: '3GPP TS 29.229', version: '19.1.0', reference: 'TS29.229', title: 'Cx and Dx interfaces based on Diameter', interfaces: ['Cx', 'Dx'] };
  assert.equal(docTitle(named), '3GPP TS 29.229 V19.1.0 — Cx and Dx interfaces based on Diameter');
  assert.equal(docHeading('TS 29.229', { ...named, title: 'Cx only' }), 'TS 29.229 · Cx, Dx — Cx only');
  assert.equal(docHeading('RFC 6733', { id: 'rfc6733', specification: 'RFC 6733', version: null, reference: 'RFC6733', title: 'Diameter Base Protocol', interfaces: [] }), 'RFC 6733 — Diameter Base Protocol');
  assert.equal(docHeading('X', { id: 'x', specification: 'X', version: null, reference: 'X', title: '' }), 'X');
});

test('a name keeps of its publisher what its context does not say', () => {
  const cases = [
    ['3GPP', '3GPP TS 29.229', 'TS 29.229', '29.229'],
    ['3GPP', '3GPP TR 29.999', 'TR 29.999', 'TR 29.999'],
    ['IETF', 'RFC 6733', 'RFC 6733', 'RFC 6733'],
    ['ETSI', 'ETSI ES 283 026', 'ETSI ES 283 026', 'ES 283 026'],
    ['ETSI', 'ETSI TS 183 059-1', 'ETSI TS 183 059-1', 'TS 183 059-1'],
    ['3GPP2', '3GPP2 X.S0013-006', '3GPP2 X.S0013-006', '3GPP2 X.S0013-006'],
    ['oneM2M', 'oneM2M TS-0004', 'oneM2M TS-0004', 'oneM2M TS-0004'],
    ['OMA', 'OMA-DDS-Charging_Data', 'OMA-DDS-Charging_Data', 'OMA-DDS-Charging_Data'],
  ];
  for (const [publisher, specification, name, number] of cases) {
    assert.equal(docName({ publisher, specification }), name);
    assert.equal(docNumber({ publisher, specification }), number);
  }
  assert.equal(docVersioned({ publisher: '3GPP', specification: '3GPP TS 29.229', version: '19.1.0' }), 'TS 29.229 V19.1.0');
  assert.equal(docVersioned({ publisher: 'IETF', specification: 'RFC 6733', version: null }), 'RFC 6733');
});

test('only an edition the corpus holds a newer one of says which it is', () => {
  const doc = (id, publisher, specification, release, version) => ({ id, publisher, specification, release, version });
  const documents = [
    doc('212-11', '3GPP', '3GPP TS 29.212', 11, '11.19.0'),
    doc('212-19', '3GPP', '3GPP TS 29.212', 19, '19.1.0'),
    doc('209-6', '3GPP', '3GPP TS 29.209', 6, '6.8.0'),
    doc('es-1.9', 'ETSI', 'ETSI ES 1', null, '1.9.0'),
    doc('es-1.10', 'ETSI', 'ETSI ES 1', null, '1.10.0'),
    doc('rfc', 'IETF', 'RFC 6733', null, null),
  ];
  const site = createSite({ documents, mode: 'public' });
  assert.deepEqual(documents.map(site.label), ['TS 29.212 Rel-11', 'TS 29.212', 'TS 29.209', 'ETSI ES 1 V1.9.0', 'ETSI ES 1', 'RFC 6733']);
  assert.deepEqual(documents.map(site.edition), ['Rel-11', '', '', 'V1.9.0', '', '']);
});

test('the pane kind comes from the source kind and the mode', () => {
  assert.equal(paneKind(etsi, 'public'), 'placeholder');
  assert.equal(paneKind(hosted, 'public'), 'placeholder');
  assert.equal(paneKind(hosted, 'self-hosted'), 'pdf');
  assert.equal(paneKind(rfc, 'public'), 'rfc');
  assert.equal(paneKind(other, 'public'), 'placeholder');
  assert.equal(paneKind(other, 'self-hosted'), null);
  assert.equal(paneKind({ source: { ...other.source, local: 'sources/b.pdf' } }, 'self-hosted'), 'pdf');
});

test('a public build has a placeholder only for a PDF, and it has no file to read', () => {
  assert.equal(paneKind({ source: { ...other.source, url: 'https://member.onem2m.org/Application/documentapp/downloadLatest.aspx?docID=1' } }, 'public'), null);
  assert.equal(paneKind({ source: { ...other.source, url: null } }, 'public'), null);
  assert.equal(paneKind({ source: { ...etsi.source, url: null } }, 'public'), null);
  assert.equal(paneFile(etsi, 'public'), null);
  assert.equal(paneURL(hosted, position, 'public'), null);
  assert.equal(sourceHref(hosted, position, 'public').href, 'https://www.etsi.org/a.pdf#page=83');
});

test('an RFC is read from the shipped text, or from rfc-editor.org without one', () => {
  assert.equal(paneFile(rfc, 'public'), 'http://localhost/site/data/sources/rfc6733.txt');
  assert.equal(paneFile(fetchedRfc, 'public'), 'https://www.rfc-editor.org/rfc/rfc6733.txt');
  const shipped = paneURL(rfc, position, 'public');
  assert.equal(shipped.pathname, '/site/rfc.html');
  assert.equal(shipped.searchParams.get('file'), paneFile(rfc, 'public'));
  assert.equal(new URLSearchParams(shipped.hash.slice(1)).get('section'), '6.4');
  assert.equal(paneURL(fetchedRfc, position, 'public').searchParams.get('file'), 'https://www.rfc-editor.org/rfc/rfc6733.txt');
  assert.equal(paneURL(etsi, position, 'public'), null);
});

test('the PDF viewer gets the page, clause, name and row', () => {
  const url = paneURL(hosted, { ...position, name: 'Y', row: true }, 'self-hosted');
  assert.equal(url.pathname, '/site/viewer.html');
  const hash = new URLSearchParams(url.hash.slice(1));
  assert.deepEqual(Object.fromEntries(hash), { page: '83', search: '6.4', name: 'Y', row: '1' });
});

test('the RFC reader gets the row too', () => {
  const hash = new URLSearchParams(paneURL(rfc, { ...position, name: 'Y', row: true }, 'public').hash.slice(1));
  assert.deepEqual(Object.fromEntries(hash), { page: '83', section: '6.4', query: 'Y', row: '1' });
});

test('source links open the publisher at the position, or the viewer of a self-hosted PDF', () => {
  assert.equal(publisherURL(etsi, position).href, 'https://www.etsi.org/a.pdf#page=83');
  assert.equal(publisherURL(rfc, position).href, 'https://www.rfc-editor.org/rfc/rfc6733.html#section-6.4');
  assert.equal(publisherURL(rfc, { ...position, exact: true }).href, 'https://www.rfc-editor.org/rfc/rfc6733.html#page-83');
  assert.equal(publisherURL({ source: { ...etsi.source, url: null } }, position), null);
  assert.equal(sourceHref(etsi, position, 'public').hostname, 'www.etsi.org');
  assert.equal(sourceHref(rfc, position, 'public').hostname, 'www.rfc-editor.org');
  assert.equal(sourceHref(hosted, position, 'self-hosted').pathname, '/site/viewer.html');
});
