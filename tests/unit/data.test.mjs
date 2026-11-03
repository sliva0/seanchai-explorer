import assert from 'node:assert/strict';
import test from 'node:test';
import { docLabel, docTitle, paneFile, paneKind, paneURL, publisherURL, sourceHref } from '../../src/data.ts';

globalThis.location = new URL('http://localhost/site/index.html#doc');

const etsi = { source: { kind: 'etsi-pdf', url: 'https://www.etsi.org/a.pdf', local: null, text: null } };
const hosted = { source: { ...etsi.source, local: 'sources/a.pdf' } };
const rfc = { source: { kind: 'rfc-text', url: 'https://www.rfc-editor.org/rfc/rfc6733.txt', local: null, text: 'sources/rfc6733.txt' } };
const fetchedRfc = { source: { ...rfc.source, text: null } };
const other = { source: { kind: 'other', url: 'http://www.3gpp2.org/a.pdf', local: null, text: null } };
const position = { section: '6.4', page: 83 };

test('labels name the version and leave out a title repeating the name', () => {
  const doc = { specification: '3GPP TS 29.272', version: '18.7.0', reference: 'TS29.272', title: 'EPS interfaces' };
  assert.equal(docLabel(doc), '3GPP TS 29.272 V18.7.0');
  assert.equal(docLabel({ ...doc, version: null }), '3GPP TS 29.272');
  assert.equal(docTitle(doc), '3GPP TS 29.272 V18.7.0 — EPS interfaces');
  for (const title of ['3GPP TS 29.272', '3gpp ts 29272', 'TS29.272', '3GPP TS 29.272 V18.7.0', '']) assert.equal(docTitle({ ...doc, title }), '3GPP TS 29.272 V18.7.0');
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
