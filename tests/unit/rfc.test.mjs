import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { rfcPages } from '../../src/rfc-text.ts';
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
