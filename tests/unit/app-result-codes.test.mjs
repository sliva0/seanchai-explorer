// A Command Result Codes block: TS 29.328 table 6.1.4.1.1, the codes TS 29.329's Push-Notification-Answer may carry,
// each a name with the number and vendor the export found, its popup going to the row of the document defining it.
import assert from 'node:assert/strict';
import test from 'node:test';
import { listingsFor, resultCodeTables } from '../../src/result-codes.ts';
import { boot, readFixture, rightClick, settle } from './helpers.mjs';

const codeAt = (document, line) => document.querySelector(`.dad-line[data-line="${line}"] .value-name`);

test("a listed code is a value row of Result-Code or Experimental-Result-Code, linking to its row's clause", async () => {
  const file = { ...(await readFixture('documents/29328-j20.json')), id: '29328-j20' };
  const [table] = resultCodeTables(file);
  assert.equal(table.listing.command, 'Push-Notification-Answer');
  assert.deepEqual(
    table.rows.map(row => [row.name, row.value, row.table.avp.name]),
    [
      ['DIAMETER_SUCCESS', 2001, 'Result-Code'],
      ['DIAMETER_ERROR_USER_DATA_NOT_RECOGNIZED', 5100, 'Experimental-Result-Code'],
      ['DIAMETER_ERROR_USER_UNKNOWN', 5001, 'Experimental-Result-Code'],
      ['DIAMETER_ERROR_TOO_MUCH_DATA', 5008, 'Experimental-Result-Code'],
      ['DIAMETER_ERROR_NO_SUBSCRIPTION_TO_DATA', 5107, 'Experimental-Result-Code'],
      ['DIAMETER_UNABLE_TO_COMPLY', 5012, 'Result-Code'],
    ],
  );
  const token = file.lines[149].tokens[0];
  assert.equal(token.text, 'DIAMETER_ERROR_USER_DATA_NOT_RECOGNIZED');
  assert.deepEqual(token.target, { document: '29328-j20', section: '6.1.4.1', name: token.text });
  assert.deepEqual(token.source, { section: '6.1.4.1', page: 30, name: token.text, row: true, value: 5100 });
  assert.deepEqual(
    listingsFor(file, { document: '29329-j10', section: '6.1.8' }, 'Push-Notification-Answer').map(block => block.line),
    [142],
    "the block listing the codes of the answer printed there, which the answer's popup names",
  );
  assert.deepEqual(listingsFor(file, { document: '29329-j10', section: '6.1.2' }, 'User-Data-Answer'), []);
});

test("a listed code's popup says its number, AVP and answer, and goes to its row in the document defining it", async () => {
  const page = await boot({ hash: '#29328-j20/6.1.4.1' });
  try {
    const { document } = page;
    const name = codeAt(document, 149);
    assert.equal(name.getAttribute('href').split('?')[0], '#29328-j20/6.1.4.1');
    rightClick(page, name);
    await settle();
    await settle();
    const popup = document.querySelector('.avp-popup');
    assert.match(popup.textContent, /Result code 5100 of Experimental-Result-Code · listed for PNA/);
    const defined = popup.querySelector('.place-origin');
    assert.equal(defined.querySelector('.place-where').textContent, 'TS 29.329 · 6.2.2.1', 'its own clause');
    assert.match(defined.querySelector('.view-action').getAttribute('href'), /^#29329-j10\/6\.2\.2\.1\?.*&line=\d+$/);
    popup.querySelector('.popup-title button').click();
    rightClick(page, codeAt(document, 148));
    await settle();
    await settle();
    // DIAMETER_SUCCESS is RFC 6733's, which the fixture lacks: no place, and nothing waits.
    const success = document.querySelector('.avp-popup');
    assert.match(success.textContent, /Result code 2001 of Result-Code/);
    assert.equal(success.querySelector('.place-origin'), null);
    assert.doesNotMatch(success.textContent, /Looking for/);
  } finally {
    await page.close();
  }
});
