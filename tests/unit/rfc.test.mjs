import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { locateRow, rfcPages, rowLines } from '../../src/rfc-text.ts';
import { boot, fixture, readFixture } from './helpers.mjs';

const text = await readFile(new URL('sources/rfc7944.txt', fixture), 'utf8');

test('RFC reader preserves the source and anchors every clause of the document', async () => {
  const pages = rfcPages(text);
  assert.equal(pages.map(page => page.text).join('\f'), text);
  const anchors = new Set(pages.flatMap(page => page.lines.map(line => line.section)));
  const doc = await readFixture('documents/rfc7944.json');
  for (const { section } of doc.sections) assert.ok(anchors.has(section), section);
  const contents = rfcPages('Table of Contents\n   1.  Intro ........ 3\n\f1.  Intro\n');
  assert.deepEqual(
    contents.flatMap(page => page.lines.filter(line => line.section).map(line => [page.page, line.section])),
    [[2, '1']],
  );
});

const start = async (file, hash, over = {}) =>
  boot({
    url: `http://localhost/rfc.html?file=${encodeURIComponent(file)}#${hash}`,
    entry: 'rfc',
    html: '<main id="rfc"></main>',
    ...over,
  });

test('the reader navigates clause and page fragments and marks the name', async () => {
  const page = await start('http://localhost/data/sources/rfc7944.txt', 'section=9.1&query=DRMP', { stored: 'dark' });
  try {
    const doc = page.document;
    assert.deepEqual(page.fetched, ['data/sources/rfc7944.txt']);
    assert.equal(doc.documentElement.dataset.theme, 'dark');
    assert.ok(doc.getElementById('section-9.1'));
    assert.equal(doc.querySelector('mark.rfc-match').textContent, 'DRMP');
  } finally {
    await page.close();
  }
});

test('the reader fetches an RFC with no shipped text from rfc-editor.org, and nothing else', async () => {
  const page = await start('https://www.rfc-editor.org/rfc/rfc7944.txt', 'section=9.1', {
    transform: () => {
      throw new Error('unused');
    },
  });
  try {
    assert.deepEqual(page.fetched, ['https://www.rfc-editor.org/rfc/rfc7944.txt']);
  } finally {
    await page.close();
  }
  const denied = await start('https://example.org/rfc7944.txt', 'section=9.1');
  try {
    assert.deepEqual(denied.fetched, []);
    assert.match(denied.document.querySelector('#rfc').textContent, /Invalid RFC source/);
  } finally {
    await denied.close();
  }
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
  assert.deepEqual(rowLines(tableLines, 'Basic-Location-Policy-Rules', '6', 2), [
    at('   |Basic-Location-'),
    at('   |Basic-Location-') + 1,
  ]);
  assert.deepEqual(rowLines(tableLines, 'Extended-Location-Policy-Rules', '6', 2), [
    at('   |Extended-'),
    at('   |Extended-') + 1,
  ]);
  assert.deepEqual(rowLines(tableLines, 'Requested-Location-Info', '6', 2), [
    at('   |Requested-'),
    at('   |Requested-') + 1,
  ]);
  assert.deepEqual(rowLines(tableLines, 'Location-Data', '6', 2), [at('   |Location-Data'), at('   |Location-Data')]);
});

test('prose, a part of a name, and another section hold no row', () => {
  assert.equal(rowLines(tableLines, 'Basic-Location', '6', 2), null);
  assert.equal(rowLines(tableLines, 'Other-Name', '6', 2), null);
  assert.deepEqual(rowLines(tableLines, 'Other-Name', '7', 2), [at('   |Other-Name'), at('   |Other-Name')]);
  assert.equal(
    rowLines(
      rfcPages('6.  Heading\n   Basic-Location-Policy-Rules Attribute is here.\n').flatMap(page =>
        page.lines.map(line => ({ ...line, page: page.page })),
      ),
      'Basic-Location-Policy-Rules',
      '6',
      1,
    ),
    null,
  );
});

test('a table without borders, wrapped at a hyphen a line starts with', () => {
  const lines = rfcPages(
    '8.  AVPs\n   Multiple-Services 456  8.16   Grouped    | M  |  P  |\n    -Credit-Control                         |    |     |\n',
  ).flatMap(page => page.lines.map(line => ({ ...line, page: page.page })));
  assert.deepEqual(rowLines(lines, 'Multiple-Services-Credit-Control', '8', 1), [1, 2]);
});

const rfcLines = text => rfcPages(text).flatMap(page => page.lines.map(line => ({ ...line, page: page.page })));
const placed = (lines, found) =>
  found && [lines.slice(found.lines[0], found.lines[1] + 1).map(line => line.text.trim()), found.found];

test('RFC 4005 misprints its row: found loosely, wrap and all, and only after the name itself', () => {
  const lines = rfcLines(`8.  NAS Session AVPs

                                            +---------------------+
                                            |    AVP Flag rules   |
                                            |----+-----+----+-----|----+
                   AVP  Section             |    |     |SHLD| MUST|    |
   Attribute Name  Code Defined  Value Type |MUST| MAY | NOT|  NOT|Encr|
   -----------------------------------------|----+-----+----+-----|----|
   Acct-Link-Count  51  8.13    Unsigned32 | M  |  P  |    |  V  | Y  |
   Acounting-Auth-  406  8.7     Enumerated | M  |  P  |    |  V  | Y  |
     Method                                 |    |     |    |     |    |
`);
  assert.equal(rowLines(lines, 'Accounting-Auth-Method', '8', 1), null);
  assert.deepEqual(placed(lines, locateRow(lines, 'Accounting-Auth-Method', '8', 1)), [
    [
      'Acounting-Auth-  406  8.7     Enumerated | M  |  P  |    |  V  | Y  |',
      'Method                                 |    |     |    |     |    |',
    ],
    'loose',
  ]);
  assert.deepEqual(placed(lines, locateRow(lines, 'Acct-Link-Count', '8', 1))[1], 'row');
  // Letters changed, or a word missing, are another AVP.
  assert.equal(locateRow(lines, 'Acct-Link-Cost', '8', 1), null);
  assert.equal(locateRow(lines, 'Acct-Link', '8', 1), null);
});

test('the spelling the source prints is looked for before anything loose', () => {
  const lines = rfcLines(`8.  AVPs

   Printed-Name     1  8.1  OctetString
`);
  assert.deepEqual(placed(lines, locateRow(lines, 'Corrected-Name', '8', 1, 'Printed-Name')), [
    ['Printed-Name     1  8.1  OctetString'],
    'printed',
  ]);
});

test('RFC 4072: a section with no table goes to the AVP occurrence table', () => {
  const lines = rfcLines(`4.1.1.  EAP-Payload AVP

   The EAP-Payload AVP (AVP Code 462) is of type OctetString and is used
   to encapsulate the actual EAP packet.
\f4.3.  AVP Occurrence Table

   Attribute Name                       DER      DEA
   ------------------------------------+-------+-------+
   EAP-Master-Session-Key              |   0   |  0-1  |
   EAP-Key-Name                        |  0-1  |  0-1  |
   EAP-Payload                         |   1   |  0-1  |
`);
  assert.deepEqual(placed(lines, locateRow(lines, 'EAP-Payload', '4.1.1', 1)), [
    ['EAP-Payload                         |   1   |  0-1  |'],
    'other-table',
  ]);
});

test("RFC 5447: an example's braces are no row, and the clause named after the AVP is the place", () => {
  const lines = rfcLines(`4.2.4.  MIP6-Home-Link-Prefix AVP

   The MIP6-Home-Link-Prefix AVP (AVP Code 125) is of type OctetString
\f5.  Examples
    |  Diameter-EAP-Request                                           |
    |  MIP6-Feature-Vector=(LOCAL_HOME_AGENT_ASSIGNMENT               |
    |  MIP6-Agent-Info{                                               |
    |       MIP-Home-Agent-Address(2001:db8:1:c020::1)}               |
    |  }                                                              |
`);
  assert.deepEqual(placed(lines, locateRow(lines, 'MIP6-Home-Link-Prefix', '4.2.1', 1)), [
    ['4.2.4.  MIP6-Home-Link-Prefix AVP'],
    'clause',
  ]);
  assert.equal(locateRow(lines, 'MIP6-Agent-Info', '4.2.1', 1), null);
});

test('RFC 6734 and RFC 6942: the clause named after the AVP, whichever the section cited', () => {
  const lines = rfcLines(`3.1.  Key AVP

             < Key-Type >
             [ Key-SPI ]

3.1.5.  Key-SPI

   The Key-SPI AVP (AVP Code 585) is of type Unsigned32
`);
  assert.deepEqual(placed(lines, locateRow(lines, 'Key', '3.1', 1)), [['3.1.  Key AVP'], 'clause']);
  assert.deepEqual(placed(lines, locateRow(lines, 'Key-SPI', '3.1', 1)), [['3.1.5.  Key-SPI'], 'clause']);
  const erp = rfcLines(`8.1.  ERP-RK-Request AVP

         ERP-RK-Request ::= < AVP Header: 618 >
                            { ERP-Realm }

8.2.  ERP-Realm AVP

   The ERP-Realm AVP (AVP Code 619) is of type DiameterIdentity.
`);
  assert.deepEqual(placed(erp, locateRow(erp, 'ERP-RK-Request', '8.1', 1)), [['8.1.  ERP-RK-Request AVP'], 'clause']);
  assert.deepEqual(placed(erp, locateRow(erp, 'ERP-Realm', '8.1', 1)), [['8.2.  ERP-Realm AVP'], 'clause']);
});

test('RFC 4590: a RADIUS attribute with no table in its section goes to the IANA table, nearest first', () => {
  const lines = rfcLines(`3.1. Digest-Response attribute

   Description
      If this attribute is present in an Access-Request message
\f3.20. SIP-AOR Attribute
\f7.  IANA Considerations

      +-------------------------+------------------------+
      | Digest-Response         | 103                    |
      | Digest-Realm            | 104                    |
      +-------------------------+------------------------+
`);
  assert.deepEqual(placed(lines, locateRow(lines, 'Digest-Response', '3.1', 1)), [
    ['| Digest-Response         | 103                    |'],
    'other-table',
  ]);
  assert.deepEqual(placed(lines, locateRow(lines, 'SIP-AOR', '3.1', 1)), [['3.20. SIP-AOR Attribute'], 'clause']);
});

test('a format naming an inserted row, and nothing when the source never names it', () => {
  const lines = rfcLines(`4.  AVPs

      Some-AVP ::= < AVP Header: 1 >
                 *2[ Member-Name ]
`);
  assert.deepEqual(placed(lines, locateRow(lines, 'Member-Name', '4', 1)), [['*2[ Member-Name ]'], 'format']);
  assert.equal(locateRow(lines, 'Elsewhere', '4', 1), null);
});

test('the reader goes to the row, marking the name in it or else the line it landed on', async () => {
  const pad = Array.from({ length: 60 }, (_, index) => `   filler line ${index}\n`).join('');
  const body = `${pad}${table}`;
  const file = 'http://localhost/data/sources/rfc5580.txt';
  // happy-dom lays nothing out, so the reader's place shows only in what it marks.
  const page = await start(file, 'section=6&query=Location-Data&row=1&page=1', { text: body });
  const doc = page.document;
  const fallback = () => [...doc.querySelectorAll('.rfc-match-line')].map(line => line.textContent.trim());
  try {
    assert.deepEqual(
      [...doc.querySelectorAll('.rfc-match')].map(mark => mark.textContent),
      ['Location-Data'],
    );
    assert.match(
      doc.querySelector('.rfc-match').closest('.rfc-line').textContent,
      /^ {3}\|Location-Data {9}OctetString/,
    );
    assert.deepEqual(fallback(), []);
    // Wrapped in the table, whole in the prose above it: the row still shows.
    await page.go('#section=6&query=Basic-Location-Policy-Rules&row=1&page=1');
    assert.deepEqual(
      [...doc.querySelectorAll('.rfc-match')].map(mark => mark.closest('.rfc-line').textContent.trim()),
      ['Basic-Location-Policy-Rules Attribute is described below.'],
    );
    assert.deepEqual(fallback(), ['|Basic-Location-                  |    |     |      |     |    |']);
    await page.go('#section=6&query=Not-In-Table&row=1&page=1');
    assert.equal(doc.querySelectorAll('.rfc-match').length, 0);
    assert.deepEqual(fallback(), []);
  } finally {
    await page.close();
  }
});

test('a query marks the name as a whole word, not inside a longer name or word', async () => {
  const body =
    '   Load information is sent in the Load AVP.\n   The Load-Type AVP is loaded first.\n   Also LOAD here.\n';
  const page = await start('http://localhost/data/sources/rfc8583.txt', 'query=Load&page=1', { text: body });
  const doc = page.document;
  const marks = () => [...doc.querySelectorAll('.rfc-line > mark.rfc-match')].map(mark => mark.textContent);
  try {
    assert.deepEqual(marks(), ['Load', 'Load', 'LOAD']);
    assert.equal(
      doc.querySelectorAll('.rfc-line')[0].innerHTML,
      '   <mark class="rfc-match">Load</mark> information is sent in the <mark class="rfc-match">Load</mark> AVP.\n',
    );
    // Marks of an earlier fragment neither stay nor nest.
    await page.go('#query=Load&page=1');
    assert.deepEqual(marks(), ['Load', 'Load', 'LOAD']);
    await page.go('#query=Load-Type&page=1');
    assert.deepEqual(marks(), ['Load-Type']);
    assert.equal(doc.querySelectorAll('.rfc-line')[0].innerHTML, '   Load information is sent in the Load AVP.\n');
    assert.equal([...doc.querySelectorAll('.rfc-line')].map(line => line.textContent).join(''), body);
    await page.go('#page=1');
    assert.deepEqual(marks(), []);
  } finally {
    await page.close();
  }
});

test("result codes: on a line of their own, as a list's bullet, or with the code in brackets", () => {
  const lines = rfcLines(`7.1.2.  Success

   DIAMETER_SUCCESS 2001

      The request was successfully completed.

10.1.1.  Success

   o  DIAMETER_FIRST_REGISTRATION 2003

   DIAMETER_SUCCESS_RELOCATE_HA (Status Code 2009)

   See RESOURCE_FAILURE (4014) above, and DIAMETER_SUCCESS for more.

8.2.2.  Transient

      RESOURCE_FAILURE (4014)

      UNKNOWN_NAME (code: 5048)
`);
  const at = (name, section) => lines[locateRow(lines, name, section, 1).lines[0]].text.trim();
  assert.equal(at('DIAMETER_SUCCESS', '7.1.2'), 'DIAMETER_SUCCESS 2001');
  assert.equal(at('DIAMETER_FIRST_REGISTRATION', '10.1.1'), 'o  DIAMETER_FIRST_REGISTRATION 2003');
  assert.equal(at('DIAMETER_SUCCESS_RELOCATE_HA', '10.1.1'), 'DIAMETER_SUCCESS_RELOCATE_HA (Status Code 2009)');
  assert.equal(at('RESOURCE_FAILURE', '8.2.2'), 'RESOURCE_FAILURE (4014)');
  assert.equal(at('UNKNOWN_NAME', '8.2.2'), 'UNKNOWN_NAME (code: 5048)');
});

test("RFC 7075: a result code's own clause goes before a table elsewhere, if the link says the clause is its", () => {
  const lines = rfcLines(`3.4.  DIAMETER_REALM_REDIRECT_INDICATION Protocol Error Code

   This protocol error code is used.

8.  IANA Considerations

   DIAMETER_REALM_REDIRECT_INDICATION (3011) in the registry.
`);
  const {
    lines: [first],
    found,
  } = locateRow(lines, 'DIAMETER_REALM_REDIRECT_INDICATION', '3.4', 1, undefined, true);
  assert.equal(found, 'clause');
  assert.match(lines[first].text, /^3\.4\./);
  assert.equal(locateRow(lines, 'DIAMETER_REALM_REDIRECT_INDICATION', '3.4', 1).found, 'other-table');
});
