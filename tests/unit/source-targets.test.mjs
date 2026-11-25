// Where a place sends the source pane, as precisely as the data says: a quote's sentence, a row by any of its columns,
// a line of another document read once it loads, and the needles and matching behind them.
import assert from 'node:assert/strict';
import test from 'node:test';
import { linePosition } from '../../src/avp-places.ts';
import { parseRoute, routeFor } from '../../src/navigation.ts';
import { cellRowOnPage, quoteOnPage } from '../../src/pdf-navigation.ts';
import { findQuote, quoteNeedle, quoteNeedles, runningLine } from '../../src/quote-text.ts';
import { boot, click, paneAt, popupOf, present, readFixture, settle } from './helpers.mjs';

test('a quote is looked for by its first dozen words, up to an ellipsis, without its quotation marks', () => {
  assert.equal(
    quoteNeedle(
      '"The encoding of the value within this Octet String type AVP shall be as defined in RFC 3162 [20], clause 2.3."',
    ),
    'The encoding of the value within this Octet String type AVP shall',
  );
  assert.equal(
    quoteNeedle('“If the IP address is not available …  or if it is”'),
    'If the IP address is not available',
  );
  assert.equal(quoteNeedle('The AF shall set ... the Prefix Length'), 'The AF shall set');
  assert.equal(quoteNeedle('See [...] clause 4'), undefined, 'too little left to tell it apart');
  assert.equal(quoteNeedle('It is not.'), undefined, 'fewer than a dozen letters');
  assert.equal(quoteNeedle('alpha   beta\ngamma delta', 3), 'alpha beta gamma');
  assert.deepEqual(
    quoteNeedles('The P-CSCF acting as AF shall send an AAR command including the Rx-Request-Type AVP'),
    ['The P-CSCF acting as AF shall send an AAR command including the', 'The P-CSCF acting as AF shall'],
  );
});

test('a quote matches the lines it runs over, however they wrap, hyphenate, space or quote it, from a line on', () => {
  const lines = [
    '6.1.1  Data read',
    '   the exchange of a DPR/DPA',
    '   exchange completes, and the out-of-',
    '',
    'Fajardo, et al.              Standards Track                   [Page 81]',
    'RFC 6733                 Diameter Base Protocol             October 2012',
    '',
    '   order “messages” are discarded.',
  ];
  const texts = lines.map(line => (runningLine(line) ? '' : line));
  assert.ok(runningLine(lines[4]) && runningLine(lines[5]) && !runningLine(lines[2]));
  assert.deepEqual(findQuote(texts, 'a DPR/DPA exchange completes'), [1, 2]);
  assert.deepEqual(findQuote(texts, 'the out-of-order "messages" are'), [2, 7], 'over the page break and the hyphen');
  assert.equal(findQuote(lines, 'the out-of-order messages'), null, "the page's footer between, left in, breaks it");
  assert.equal(findQuote(texts, 'Data read', 1), null, 'only from the line asked for on');
  assert.equal(findQuote(texts, 'not there at all'), null);
});

/** A PDF page's text items, each [str, x, y, width], 9 high. */
const page = rows =>
  rows.map(([str, x, y, width]) => ({ str, transform: [1, 0, 0, 1, x, y], width, height: 9, hasEOL: false }));
const top = y => y + 9 + 10;

test('an Information Elements row is found by its AVP in a later column, wrapped or not, and never in a sentence', () => {
  const items = page([
    ['The Server-Name AVP is sent when the AS knows it and the element is present.', 50, 760, 420],
    ['Information element name', 50, 730, 150],
    ['Mapping to Diameter AVP', 260, 730, 120],
    ['Cat.', 420, 730, 20],
    ['Application Server Name (See 7.10)', 50, 700, 160],
    ['Server-Name', 260, 700, 60],
    ['C', 420, 700, 6],
    ['Wildcarded PSI (See 7.1A)', 50, 680, 120],
    ['Wildcarded-Public-', 260, 680, 90],
    ['Identity', 260, 669, 40],
    ['O', 420, 680, 6],
  ]);
  assert.deepEqual(cellRowOnPage(items, 'Server-Name'), { top: top(700), text: 'Server-Name' });
  assert.deepEqual(cellRowOnPage(items, 'Wildcarded-Public-Identity'), {
    top: top(680),
    text: 'Wildcarded-Public-Identity',
  });
  assert.equal(cellRowOnPage(items, 'Wildcarded-Public'), null, 'not the start of a longer name');
  assert.equal(cellRowOnPage(items, 'Application Server Name (See 7.10)'), null, 'the first column is not looked at');
});

test("a quote's first line is found on a PDF page, below the clause's heading where it is on the page", () => {
  const items = page([
    ['The encoding of the value within this Octet String type AVP shall be as de-', 50, 760, 420],
    ['fined in RFC 3162 [20], clause 2.3.', 50, 748, 200],
    ['5.4.0  Framed-IPv6-Prefix', 50, 700, 150],
    ['The encoding of the value within this Octet String type AVP shall be as de-', 50, 680, 420],
    ['fined in RFC 3162 [20], clause 2.3.', 50, 668, 200],
  ]);
  const needle = 'of the value within this Octet String type AVP shall be as defined in RFC';
  assert.deepEqual(quoteOnPage(items, needle), { top: top(760), text: needle });
  assert.deepEqual(quoteOnPage(items, needle, top(700)), { top: top(680), text: needle }, 'not above the heading');
  assert.equal(quoteOnPage(items, 'shall not be as defined'), null);
});

test('a line of a file is where the source prints its row or member, by the name asked for', async () => {
  const tables = await readFixture('documents/29328-j20.json');
  assert.deepEqual(linePosition(tables, 27, 'Server-Name'), {
    section: '6.1.1',
    page: 14,
    name: 'Server-Name',
    row: true,
  });
  assert.deepEqual(linePosition(tables, 27), { section: '6.1.1', page: 14, name: 'Server-Name', row: true });
  assert.equal(linePosition(tables, 27, 'User-Name'), undefined, 'a line naming another name says nothing');
  const commands = await readFixture('documents/29329-j10.json');
  const member = commands.lines.findIndex(line => /\[ Server-Name \]/.test(line.tokens.map(t => t.text).join('')));
  const position = linePosition(commands, member, 'Server-Name');
  assert.equal(position.name, 'Server-Name');
  assert.equal(position.occurrence, true, "the name's first mention on its block's page");
  assert.equal(linePosition(commands, 0), undefined, 'a line of no row or member');
});

test('a route keeps the quote the pane was sent to', () => {
  const hash = routeFor(
    { document: 'd', section: '5.4.0' },
    { source: { document: 'd', position: { section: '5.4.0', page: 16, quote: 'The AF shall set the' } }, line: 9 },
  );
  assert.match(hash, /sourceQuote=The\+AF\+shall\+set\+the/);
  assert.equal(parseRoute(hash).source.position.quote, 'The AF shall set the');
});

test("self-hosted: a member's element row in another document goes to that row, in the text and in the pane", async () => {
  const page = await boot({ hash: '#29329-j10/6.1.1', mode: 'self-hosted' });
  try {
    const { document } = page;
    const name = [...document.querySelectorAll('pre [data-avp="Server-Name"]')].find(node =>
      /\[ Server-Name \]/.test(node.closest('.dad-line').textContent),
    );
    const popup = await popupOf(page, name);
    const claim = popup.querySelector('.popup-claim');
    const route = new URLSearchParams(claim.querySelector('a.claim-where').getAttribute('href').split('?')[1]);
    assert.deepEqual(
      ['line', 'source', 'sourceSection', 'sourceName', 'row'].map(key => route.get(key)),
      ['27', '29328-j20', '6.1.1', 'Server-Name', '1'],
      "the row's line in the text, and the row in the pane",
    );
    claim.querySelector('.pane-action').click();
    await settle();
    const pane = paneAt(document);
    assert.ok(new URL(document.querySelector('iframe').src).searchParams.get('file').endsWith('29328-j20.pdf'));
    assert.deepEqual(
      ['search', 'name', 'row', 'page'].map(key => pane.get(key)),
      ['6.1.1', 'Server-Name', '1', '14'],
      "Show in source: the row naming it, from its table's page",
    );
  } finally {
    await page.close();
  }
});

test('self-hosted: a line gone to in another document moves the pane to the row it is', async () => {
  const page = await boot({ hash: '#29328-j20/6.1.1?name=Server-Name&line=27', mode: 'self-hosted' });
  try {
    await settle();
    const pane = paneAt(page.document);
    assert.deepEqual(
      ['search', 'name', 'row'].map(key => pane.get(key)),
      ['6.1.1', 'Server-Name', '1'],
    );
    assert.equal(page.document.querySelector('.target-line').dataset.line, '27');
  } finally {
    await page.close();
  }
});

test("self-hosted: an interpreted rule's place and each of its quotes send the pane to the sentence", async () => {
  const page = await boot({ hash: '#29272-j60/7.3.35', mode: 'self-hosted' });
  try {
    const { document } = page;
    const name = [...document.querySelectorAll('.dad-line[data-line="2315"] [data-avp="Context-Identifier"]')][0];
    const popup = await popupOf(page, name);
    const quotes = [...popup.querySelectorAll('.constraint-reading q')];
    const from = popup.querySelector('.place-constraint .view-action');
    const route = new URLSearchParams(from.getAttribute('href').split('?')[1]);
    assert.equal(route.get('sourceQuote'), quoteNeedle(quotes[0].textContent), "the block's place, at its first quote");
    const sources = [...popup.querySelectorAll('.constraint-quote-line')];
    assert.equal(sources.length, quotes.length);
    for (const line of sources) present(line.querySelector('.quote-source'), 'each quote its own way there');
    click(page, sources[1].querySelector('.quote-source'));
    await settle();
    const pane = paneAt(document);
    assert.equal(pane.get('quote'), quoteNeedle(quotes[1].textContent));
    assert.equal(pane.get('search'), '7.3.35');
  } finally {
    await page.close();
  }
});

test('public: where the pane cannot show the document, a quote has no way there of its own', async () => {
  const page = await boot({ hash: '#29272-j60/7.3.35' });
  try {
    const name = page.document.querySelector('.dad-line[data-line="2315"] [data-avp="Context-Identifier"]');
    const popup = await popupOf(page, name);
    assert.ok(popup.querySelectorAll('.constraint-quote-line').length > 0);
    assert.equal(popup.querySelector('.quote-source'), null);
  } finally {
    await page.close();
  }
});
