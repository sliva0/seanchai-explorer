import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createSectionNavigator, headingOnPage, rowOnPage } from '../../src/pdf-navigation.ts';

// Reads real PDFs from a self-hosted export, as `npm run dev:self-hosted` or build:self-hosted prepares it.
const sources = new URL('../../public/data/sources/', import.meta.url);
const skip = !existsSync(new URL('29061-6f0.pdf', sources)) && 'no self-hosted export in public/data';

test('real PDF bookmarks and heading fallback skip tables and contents', { skip }, async () => {
  const bytes = await readFile(new URL('29061-6f0.pdf', sources));
  const task = getDocument({
    data: new Uint8Array(bytes),
    standardFontDataUrl: fileURLToPath(new URL('../../node_modules/pdfjs-dist/standard_fonts/', import.meta.url)),
  });
  try {
    const pdf = await task.promise;
    const navigator = createSectionNavigator(pdf);
    assert.ok((await navigator.outline).length);
    assert.equal((await navigator.locate('17.7.12', 87)).pageNumber, 91);
    assert.equal((await navigator.locate('17.7.17', 92)).pageNumber, 92);
    const table = await pdf.getPage(88);
    assert.equal(headingOnPage((await table.getTextContent()).items, '17.7.12', table.view[2]), null);
    assert.ok(rowOnPage((await table.getTextContent()).items, 'RAI') > 0);
    assert.equal((await navigator.locate('17.7', 87, () => true, 'RAI')).pageNumber, 88);
    assert.equal((await navigator.locate('17.7.12', 87, () => true, 'RAI')).pageNumber, 91);
    const contents = await pdf.getPage(6);
    assert.equal(headingOnPage((await contents.getTextContent()).items, '17.7.12', contents.view[2]), null);
    const fallback = createSectionNavigator({
      numPages: pdf.numPages,
      getOutline: async () => [],
      getPage: pdf.getPage.bind(pdf),
      getPageIndex: pdf.getPageIndex.bind(pdf),
      getDestination: pdf.getDestination.bind(pdf),
    });
    assert.equal(await fallback.locate('17.7.12', 87, () => false), null);
    assert.equal((await fallback.locate('17.7.12', 87)).pageNumber, 91);
    assert.equal((await fallback.locate('17.7.17', 92)).pageNumber, 92);
  } finally {
    await task.destroy();
  }
});

test('table-name links locate the row while section links locate the definition', { skip }, async () => {
  const task = getDocument({
    data: new Uint8Array(await readFile(new URL('29329-j10.pdf', sources))),
    standardFontDataUrl: fileURLToPath(new URL('../../node_modules/pdfjs-dist/standard_fonts/', import.meta.url)),
  });
  try {
    const navigator = createSectionNavigator(await task.promise);
    assert.equal((await navigator.locate('6.3', 18, () => true, 'Supported-Features', true)).pageNumber, 18);
    assert.equal((await navigator.locate('6.3.11', 18, () => true, 'Supported-Features')).pageNumber, 22);
  } finally {
    await task.destroy();
  }
});

async function withNavigator(file, check) {
  const task = getDocument({
    data: new Uint8Array(await readFile(new URL(file, sources))),
    standardFontDataUrl: fileURLToPath(new URL('../../node_modules/pdfjs-dist/standard_fonts/', import.meta.url)),
  });
  try {
    await check(createSectionNavigator(await task.promise));
  } finally {
    await task.destroy();
  }
}
const rowPage = async (navigator, section, hint, name) => {
  const found = await navigator.locate(section, hint, () => true, name, true);
  return found?.destArray[0] === null ? found.pageNumber : null;
};

test('wrapped rows resolve on their own table, not on another table holding the name', { skip }, async () => {
  await withNavigator('29061-j10.pdf', async navigator => {
    for (const name of [
      '3GPP-IMSI',
      '3GPP-Selection-Mode',
      '3GPP-GGSN-Address',
      '3GPP-SGSN-Address',
      '3GPP-User-Location-Info',
      '3GPP-GPRS-Negotiated-QoS-Profile',
      '3GPP-UE-Source-Port',
    ]) {
      assert.equal(await rowPage(navigator, '16a.5', 129, name), 131, name);
    }
  });
  await withNavigator('29229-j10.pdf', async navigator => {
    assert.equal(await rowPage(navigator, '6.3.0', 21, 'Load'), 24);
    assert.equal(await rowPage(navigator, '6.3.0', 21, 'RTR-Flags'), 24);
  });
  await withNavigator('29272-j60.pdf', async navigator => {
    assert.equal(await rowPage(navigator, '7.3.1', 87, 'Visited-PLMN-Id'), 89);
    assert.equal(await rowPage(navigator, '7.3.1', 87, 'Requested-EUTRAN-Authentication-Info'), 89);
  });
  await withNavigator('32299-j00.pdf', async navigator => {
    assert.equal(await rowPage(navigator, '7.2.0', 102, 'RAN-Secondary-RAT-Usage-Report'), 110);
    assert.equal(await rowPage(navigator, '7.2.0', 102, 'Carrier-Select-Routing-Information'), 105);
  });
});

test('rows of odd layouts, and spellings the source prints in place of the corrected name', { skip }, async () => {
  await withNavigator('29212-j10.pdf', async navigator => {
    assert.equal(await rowPage(navigator, '5c.4.1', 235, 'ADC-Rule-Name'), 237);
    assert.equal(await rowPage(navigator, '5.3.0', 121, 'Conditional-APN-Aggregate-Max-Bitrate'), 123);
  });
  await withNavigator('29272-j60.pdf', async navigator => {
    const found = await navigator.locate(
      '7.3.1',
      87,
      () => true,
      'Additional-Context-Identifier',
      true,
      'Additional-Context-ID',
    );
    assert.deepEqual([found.pageNumber, found.found, found.query], [92, 'printed', 'Additional-Context-ID']);
    const loose = await navigator.locate('7.3.1', 87, () => true, 'Additional-Context-Identifier', true);
    assert.deepEqual([loose.pageNumber, loose.found, loose.query], [92, 'loose', 'Additional-Context-ID']);
  });
});

test(
  'a row the section does not hold: the nearest table, the clause or format naming it, then the heading',
  { skip },
  async () => {
    await withNavigator('29229-j10.pdf', async navigator => {
      const clause = await navigator.locate('6.3.0', 21, () => true, 'Wildcarded-IMPU', true);
      assert.deepEqual([clause.pageNumber, clause.found], [32, 'clause']);
    });
    await withNavigator('29128-j20.pdf', async navigator => {
      const format = await navigator.locate('6.4.1', 39, () => true, 'IMEI', true);
      assert.deepEqual([format.pageNumber, format.found], [50, 'format']);
    });
    await withNavigator('29061-j10.pdf', async navigator => {
      const listed = await navigator.locate('16a.5', 129, () => true, '3GPP-Session-Stop-Indicator', true);
      assert.equal(listed.pageNumber, 98);
      assert.equal(listed.destArray[0], null);
      const none = await navigator.locate('16a.5', 129, () => true, 'Not-In-This-Document', true);
      assert.equal(none.pageNumber, 129);
      assert.notEqual(none.destArray[0], null, 'the bookmark, not a row');
    });
    await withNavigator('ts183020-010101.pdf', async navigator => {
      const named = await navigator.locate(
        '5.5',
        13,
        () => true,
        'Initial-Gate-Setting-Description',
        true,
        'Initiate-Gate-Setting',
      );
      assert.deepEqual([named.pageNumber, named.found, named.query], [13, 'mention', 'Initiate-Gate-Setting']);
      assert.ok(Math.abs(named.destArray[3] - 283) < 1);
      const over = await navigator.locate('5.5', 13, () => true, 'QoS-Profile-Description', true, 'QoS-Profile');
      assert.deepEqual([over.pageNumber, over.found, over.query], [14, 'mention', 'QoS-Profile']);
    });
  },
);

test(
  "value rows: the table in the section, by number where names repeat, and a result code's own clause",
  { skip },
  async () => {
    const at = async (navigator, section, hint, name, clue) => {
      const found = await navigator.locate(section, hint, () => true, name, true, undefined, clue);
      return [found.pageNumber, found.found];
    };
    await withNavigator('29272-j60.pdf', async navigator => {
      assert.deepEqual(await at(navigator, '7.3.31', 126, 'UTRAN Not Allowed', { value: 0 }), [127, 'row']);
      assert.deepEqual(await at(navigator, '7.3.8', 103, 'Separation Indication', { value: 0 }), [103, 'row']);
      assert.deepEqual(await at(navigator, '7.4.3.1', 180, 'DIAMETER_ERROR_USER_UNKNOWN', { titled: true }), [
        180,
        'clause',
      ]);
    });
    await withNavigator('32299-j00.pdf', async navigator => {
      assert.deepEqual(await at(navigator, '7.1.11', 99, 'DIAMETER_RATING_FAILED', { titled: true, value: 5031 }), [
        99,
        'row',
      ]);
    });
    await withNavigator('29468-j00.pdf', async navigator => {
      const repeated = await navigator.locate('6.4.33', 27, () => true, 'System error', true, undefined, { value: 6 });
      assert.equal(repeated.pageNumber, 27);
      assert.ok(Math.abs(repeated.destArray[3] - (352.5 + 9 + 10)) < 1);
    });
    await withNavigator('29214-j30.pdf', async navigator => {
      assert.deepEqual(await at(navigator, '5.4.1', 66, 'User-Equipment-Info-Extension', { value: 15 }), [71, 'row']);
    });
    await withNavigator('29212-j10.pdf', async navigator => {
      assert.deepEqual(await at(navigator, '5.5.3', 196, 'DIAMETER_PCC_RULE_EVENT', { titled: true }), [197, 'row']);
    });
  },
);
