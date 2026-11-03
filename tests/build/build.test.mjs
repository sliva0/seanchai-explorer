// Builds both modes from a real export; needs a Seanchaí checkout, or SEANCHAI_EXPORT for the public one.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import { rfcPages } from '../../src/rfc-text.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const dist = path.join(root, 'dist');
const specifications = process.env.SEANCHAI_SPECIFICATIONS ?? path.join(process.env.SEANCHAI_ROOT ?? path.join(root, '../..'), 'specifications');

function npm(script, env = {}) {
  const result = spawnSync('npm', ['run', '-s', script], { cwd: root, encoding: 'utf8', env: { ...process.env, ...env } });
  assert.equal(result.status, 0, `${script}\n${result.stdout}\n${result.stderr}`);
}
const json = async file => JSON.parse(await readFile(path.join(dist, 'data', file), 'utf8'));
async function pdfs() {
  const entries = await readdir(dist, { recursive: true, withFileTypes: true });
  return entries.filter(entry => entry.isFile() && entry.name.endsWith('.pdf')).map(entry => entry.name);
}

async function checkExport() {
  const index = await json('index.json');
  const validate = new Ajv2020({ strict: false }).compile(await json('schema.json'));
  for (const file of ['index.json', 'search.json', ...index.documents.flatMap(doc => [doc.path, doc.raw])]) {
    assert.ok(validate(await json(file)), `${file}: ${JSON.stringify(validate.errors?.slice(0, 3))}`);
  }
  return index;
}

async function checkRfcAnchors(index) {
  const rfcs = index.documents.filter(doc => doc.source.kind === 'rfc-text' && doc.source.text);
  for (const summary of rfcs) {
    const text = await readFile(path.join(dist, 'data', summary.source.text), 'utf8');
    const anchors = new Set(rfcPages(text).flatMap(page => page.lines.map(line => line.section)));
    const doc = await json(summary.path);
    for (const { section } of doc.sections) assert.ok(anchors.has(section), `${summary.id} ${section}`);
  }
  return rfcs.length;
}

test('public build ships no PDF, viewer or PDF.js, and fails if it does', async () => {
  npm('build');
  const index = await checkExport();
  assert.equal(index.mode, 'public');
  assert.deepEqual(await pdfs(), []);
  assert.ok(!existsSync(path.join(dist, 'viewer.html')));
  assert.ok(!existsSync(path.join(dist, 'pdfjs')));
  for (const file of await readdir(path.join(dist, 'assets'))) assert.ok(!/viewer|pdf/i.test(file), file);
  await checkRfcAnchors(index);
  const grammar = await readFile(path.join(dist, 'data/syntax/dad.tmLanguage.json'));
  assert.deepEqual(await readFile(path.join(dist, 'syntax/dad.tmLanguage.json')), grammar);
  assert.ok((await readFile(path.join(root, 'syntax/dad.tmLanguage.json'))).equals(grammar), 'syntax/dad.tmLanguage.json is behind the export: run npm run fixture');
  const check = spawnSync('node', ['scripts/check-public.mjs', fileURLToPath(new URL('fixtures/with-pdf/', import.meta.url))], { cwd: root, encoding: 'utf8' });
  assert.equal(check.status, 1);
  assert.match(check.stderr, /sources\/a\.pdf/);
});

const skip = !existsSync(specifications) && 'no specifications directory';

test('self-hosted build ships the PDFs, viewer and PDF.js', { skip }, async () => {
  npm('build:self-hosted');
  const index = await checkExport();
  assert.equal(index.mode, 'self-hosted');
  const documents = index.documents.filter(doc => doc.source.local);
  assert.ok(documents.length > 40);
  for (const doc of documents) {
    const bytes = await readFile(path.join(dist, 'data', doc.source.local));
    assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
  }
  assert.ok((await readFile(path.join(dist, 'viewer.html'), 'utf8')).includes('viewerContainer'));
  assert.ok((await readFile(path.join(dist, 'pdfjs/wasm/openjpeg.wasm'))).length > 0);
  assert.ok(await checkRfcAnchors(index) > 0);
});

test('a self-hosted export is refused for a public build', { skip }, async () => {
  const result = spawnSync('node', ['scripts/prepare.mjs'], {
    cwd: root, encoding: 'utf8', env: { ...process.env, SEANCHAI_EXPORT: path.join(dist, 'data') },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /public build cannot use a self-hosted export/);
});
