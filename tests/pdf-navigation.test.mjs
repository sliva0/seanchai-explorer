import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createSectionNavigator, headingOnPage, rowOnPage } from '../src/pdf-navigation.ts';

test('real PDF bookmarks and heading fallback skip tables and contents', async () => {
  const bytes = await readFile(new URL('../public/data/sources/29061-6f0.pdf', import.meta.url));
  const task = getDocument({
    data: new Uint8Array(bytes),
    standardFontDataUrl: fileURLToPath(new URL('../node_modules/pdfjs-dist/standard_fonts/', import.meta.url)),
  });
  try {
    const pdf = await task.promise;
    const navigator = createSectionNavigator(pdf);
    assert.ok((await navigator.outline).length);
    assert.equal((await navigator.locate('17.7.12', 87)).pageNumber, 91);
    assert.equal((await navigator.locate('17.7.17', 92)).pageNumber, 92);
    const table = await pdf.getPage(88);
    assert.equal(headingOnPage((await table.getTextContent()).items, '17.7.12', table.view[2]), null);
    assert.ok(rowOnPage((await table.getTextContent()).items, 'RAI', table.view[2]) > 0);
    assert.equal((await navigator.locate('17.7', 87, () => true, 'RAI')).pageNumber, 88);
    assert.equal((await navigator.locate('17.7.12', 87, () => true, 'RAI')).pageNumber, 91);
    const contents = await pdf.getPage(6);
    assert.equal(headingOnPage((await contents.getTextContent()).items, '17.7.12', contents.view[2]), null);
    const fallback = createSectionNavigator({
      numPages: pdf.numPages, getOutline: async () => [],
      getPage: pdf.getPage.bind(pdf), getPageIndex: pdf.getPageIndex.bind(pdf), getDestination: pdf.getDestination.bind(pdf),
    });
    assert.equal(await fallback.locate('17.7.12', 87, () => false), null);
    assert.equal((await fallback.locate('17.7.12', 87)).pageNumber, 91);
    assert.equal((await fallback.locate('17.7.17', 92)).pageNumber, 92);
  } finally { await task.destroy(); }
});

test('table-name links locate the row while section links locate the definition', async () => {
  const task = getDocument({
    data: new Uint8Array(await readFile(new URL('../public/data/sources/29329-i00.pdf', import.meta.url))),
    standardFontDataUrl: fileURLToPath(new URL('../node_modules/pdfjs-dist/standard_fonts/', import.meta.url)),
  });
  try {
    const navigator = createSectionNavigator(await task.promise);
    assert.equal((await navigator.locate('6.3', 17, () => true, 'Supported-Features', true)).pageNumber, 17);
    assert.equal((await navigator.locate('6.3.11', 17, () => true, 'Supported-Features')).pageNumber, 20);
  } finally { await task.destroy(); }
});
