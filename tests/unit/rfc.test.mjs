import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { rfcPages, rowLines } from '../../src/rfc-text.ts';
import { boot, fixture, readFixture } from './helpers.mjs';

const text = await readFile(new URL('sources/rfc7944.txt', fixture), 'utf8');

test('RFC reader preserves the source and anchors every clause of the document', async () => {
  const pages = rfcPages(text);
  assert.equal(pages.map(page => page.text).join('\f'), text);
  const anchors = new Set(pages.flatMap(page => page.lines.map(line => line.section)));
  const doc = await readFixture('documents/rfc7944.json');
  for (const { section } of doc.sections) assert.ok(anchors.has(section), section);
  const contents = rfcPages('Table of Contents\n   1.  Intro ........ 3\n\f1.  Intro\n');
  assert.deepEqual(contents.flatMap(page => page.lines.filter(line => line.section).map(line => [page.page, line.section])), [[2, '1']]);
});

const start = async (file, hash, over = {}) => boot({
  url: `http://localhost/rfc.html?file=${encodeURIComponent(file)}#${hash}`,
  entry: 'rfc', html: '<main id="rfc"></main>', ...over,
});

test('the reader navigates clause and page fragments and marks the name', async () => {
  const page = await start('http://localhost/data/sources/rfc7944.txt', 'section=9.1&query=DRMP', { stored: 'dark' });
  try {
    const doc = page.document;
    assert.deepEqual(page.fetched, ['data/sources/rfc7944.txt']);
    assert.equal(doc.documentElement.dataset.theme, 'dark');
    assert.ok(doc.getElementById('section-9.1'));
    assert.match(doc.querySelector('.rfc-match').textContent, /DRMP/);
  } finally { await page.close(); }
});

test('the reader fetches an RFC with no shipped text from rfc-editor.org, and nothing else', async () => {
  const page = await start('https://www.rfc-editor.org/rfc/rfc7944.txt', 'section=9.1', {
    transform: () => { throw new Error('unused'); },
  });
  try {
    assert.deepEqual(page.fetched, ['https://www.rfc-editor.org/rfc/rfc7944.txt']);
  } finally { await page.close(); }
  const denied = await start('https://example.org/rfc7944.txt', 'section=9.1');
  try {
    assert.deepEqual(denied.fetched, []);
    assert.match(denied.document.querySelector('#rfc').textContent, /Invalid RFC source/);
  } finally { await denied.close(); }
});

const table = `6.  Diameter RADIUS Interoperability

   When used in Diameter, the attributes defined in this specification
   Basic-Location-Policy-Rules Attribute is described below.

                                     +---------------------+
                                     |    AVP Flag rules   |
                                     +----+-----+------+-----+----+
                                     |    |     |SHOULD| MUST|    |
    Attribute Name        Value Type |MUST| MAY | NOT  |  NOT|Encr|
   +---------------------------------+----+-----+------+-----+----+
   |Operator-Name         OctetString|    |  P  |      | V,M | Y  |
   |Location-Information  OctetString|    |  P  |      | V,M | Y  |
   |Location-Data         OctetString|    |  P  |      | V,M | Y  |
   |Basic-Location-                  |    |     |      |     |    |
   |   Policy-Rules       OctetString|    |  P  |      | V,M | Y  |
   |Extended-Location-               |    |     |      |     |    |
   |   Policy-Rules       OctetString|    |  P  |      | V,M | Y  |
   |Requested-                       |    |     |      |     |    |
   |   Location-Info      OctetString|    |  P  |      | V,M | Y  |
   |Location-Capable      OctetString|    |  P  |      | V,M | Y  |
   +---------------------------------+----+-----+------+-----+----+

7.  Security Considerations

   |Other-Name            OctetString|    |  P  |      | V,M | Y  |
`;
const tableLines = rfcPages(`\f${table}`).flatMap(page => page.lines.map(line => ({ ...line, page: page.page })));
const at = text => tableLines.findIndex(line => line.text.startsWith(text));

test('a row is found however the ASCII table wraps its name, within the section', () => {
  assert.deepEqual(rowLines(tableLines, 'Basic-Location-Policy-Rules', '6', 2), [at('   |Basic-Location-'), at('   |Basic-Location-') + 1]);
  assert.deepEqual(rowLines(tableLines, 'Extended-Location-Policy-Rules', '6', 2), [at('   |Extended-'), at('   |Extended-') + 1]);
  assert.deepEqual(rowLines(tableLines, 'Requested-Location-Info', '6', 2), [at('   |Requested-'), at('   |Requested-') + 1]);
  assert.deepEqual(rowLines(tableLines, 'Location-Data', '6', 2), [at('   |Location-Data'), at('   |Location-Data')]);
});

test('prose, a part of a name, and another section hold no row', () => {
  assert.equal(rowLines(tableLines, 'Basic-Location', '6', 2), null);
  assert.equal(rowLines(tableLines, 'Other-Name', '6', 2), null);
  assert.deepEqual(rowLines(tableLines, 'Other-Name', '7', 2), [at('   |Other-Name'), at('   |Other-Name')]);
  assert.equal(rowLines(rfcPages('6.  Heading\n   Basic-Location-Policy-Rules Attribute is here.\n').flatMap(page => page.lines.map(line => ({ ...line, page: page.page }))), 'Basic-Location-Policy-Rules', '6', 1), null);
});

test('a table without borders, wrapped at a hyphen a line starts with', () => {
  const lines = rfcPages('8.  AVPs\n   Multiple-Services 456  8.16   Grouped    | M  |  P  |\n    -Credit-Control                         |    |     |\n').flatMap(page => page.lines.map(line => ({ ...line, page: page.page })));
  assert.deepEqual(rowLines(lines, 'Multiple-Services-Credit-Control', '8', 1), [1, 2]);
});

test('the reader goes to the row and marks its lines, and to the heading when there is none', async () => {
  const pad = Array.from({ length: 60 }, (_, index) => `   filler line ${index}\n`).join('');
  const body = `${pad}${table}`;
  const file = 'http://localhost/data/sources/rfc5580.txt';
  // happy-dom lays nothing out, so the reader's place shows only in what it marks.
  const page = await start(file, 'section=6&query=Basic-Location-Policy-Rules&row=1&page=1', { text: body });
  try {
    const marked = [...page.document.querySelectorAll('.rfc-match')].map(line => line.textContent.trim());
    assert.deepEqual(marked.slice(-2), ['|Basic-Location-                  |    |     |      |     |    |', '|   Policy-Rules       OctetString|    |  P  |      | V,M | Y  |']);
    await page.go('#section=6&query=Not-In-Table&row=1&page=1');
    assert.equal(page.document.querySelectorAll('.rfc-match').length, 0);
  } finally { await page.close(); }
});
