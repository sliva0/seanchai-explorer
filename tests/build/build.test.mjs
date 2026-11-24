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
import { SCHEMA_VERSION } from '../../src/types.ts';
import { hasCommand } from '../../scripts/seanchai.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const dist = path.join(root, 'dist');
// The documents a build reads, as scripts/seanchai.mjs finds them.
const { specifications } = await import('../../scripts/seanchai.mjs');

function npm(script, env = {}) {
  const result = spawnSync('npm', ['run', '-s', script], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
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
  assert.equal(index.schema_version, SCHEMA_VERSION);
  assert.ok(
    (await readFile(path.join(root, 'syntax/dad.tmLanguage.json'))).equals(grammar),
    'syntax/dad.tmLanguage.json is behind the export: run npm run fixture',
  );
  const check = spawnSync(
    'node',
    ['scripts/check-public.mjs', fileURLToPath(new URL('fixtures/with-pdf/', import.meta.url))],
    { cwd: root, encoding: 'utf8' },
  );
  assert.equal(check.status, 1);
  assert.match(check.stderr, /sources\/a\.pdf/);
  const named = unlinkedCheck();
  assert.equal(named.status, 1, 'a build of the project names it, as the check finds');
  assert.match(named.stderr, /assets\/main-[\w-]+\.js: .*GitHub/);
});

/** The check a SEANCHAI_UNLINKED=1 build ends with, run on the last build whatever it was. */
const unlinkedCheck = () =>
  spawnSync('node', ['scripts/check-unlinked.mjs', '--always', dist], { cwd: root, encoding: 'utf8' });

/** The corpus's own files naming the project, which the check leaves: a document's text may cite it. */
async function corpusMentions() {
  const entries = await readdir(path.join(dist, 'data'), { recursive: true, withFileTypes: true });
  const found = [];
  for (const entry of entries.filter(entry => entry.isFile() && /\.(json|txt)$/.test(entry.name))) {
    const file = path.join(entry.parentPath, entry.name);
    if (/github\.com|github\.io|pypi\.org|GitHub|PyPI/.test(await readFile(file, 'utf8')))
      found.push(path.relative(dist, file));
  }
  return found;
}

/**
 * What a SEANCHAI_UNLINKED=1 build must hold: nothing of the project in the site's own files, its plugin linking
 * nowhere, and no word of another build of it, as a self-hosted one, in any text it ships or page it serves.
 */
async function checkUnlinked() {
  const check = unlinkedCheck();
  assert.equal(check.status, 0, check.stderr);
  const page = await readFile(path.join(dist, 'index.html'), 'utf8');
  assert.doesNotMatch(page, /GitHub|PyPI/);
  for (const html of (await readdir(dist)).filter(file => file.endsWith('.html')))
    assert.doesNotMatch(await readFile(path.join(dist, html), 'utf8'), /self-hosted/i, html);
  // What only a build of the project shows is left out of the bundle, not only off the page: its introduction, the
  // plugin's command, and every text naming a self-hosted build, the pane's pointer to one and the help's.
  for (const file of await readdir(path.join(dist, 'assets')))
    if (file.endsWith('.js'))
      assert.doesNotMatch(
        await readFile(path.join(dist, 'assets', file), 'utf8'),
        /Unofficial, and not affiliated|self-hosted build|Generate it with|seanchai\[corpus\]/i,
        file,
      );
  if (existsSync(path.join(dist, 'plugin')))
    assert.match(
      await readFile(path.join(dist, 'plugin/seanchai_diameter.lua'), 'utf8'),
      /^local EXPLORER = "" -- seanchai:explorer$/m,
    );
  const mentions = await corpusMentions();
  if (mentions.length) console.log(`The corpus's own data naming the project, left as it is: ${mentions.join(', ')}`);
}

// Asked of the seanchai the build runs, by running it: a release older than the plugin has no such command.
const pluginSkip =
  !process.env.SEANCHAI_PLUGIN &&
  hasCommand('wireshark-plugin') !== true &&
  'the seanchai the build runs has no wireshark-plugin command';

/** The plugin the last build shipped has the one line the Wireshark page rewrites, and says what made it. */
async function checkPlugin() {
  const text = await readFile(path.join(dist, 'plugin/seanchai_diameter.lua'), 'utf8');
  assert.equal(text.match(/^local EXPLORER = "[^"\\]*" -- seanchai:explorer$/gm)?.length, 1);
  assert.match(text, /^-- seanchai:versions seanchai \S+, corpus \S+$/m);
}

test('the public build ships the Wireshark plugin', { skip: pluginSkip }, async () => {
  if (!existsSync(path.join(dist, 'plugin'))) npm('build');
  await checkPlugin();
});

test('a SEANCHAI_UNLINKED=1 public build names nothing of the project, and its build says so', async () => {
  npm('build', { SEANCHAI_UNLINKED: '1' });
  assert.equal((await checkExport()).mode, 'public');
  await checkUnlinked();
});

const skip = !existsSync(specifications) && 'no specifications directory';

test(
  'self-hosted build ships the PDFs, viewer and PDF.js, and with SEANCHAI_UNLINKED=1 names nothing of the project',
  { skip },
  async () => {
    npm('build:self-hosted', { SEANCHAI_UNLINKED: '1' });
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
    assert.ok((await checkRfcAnchors(index)) > 0);
    if (!pluginSkip) await checkPlugin();
    await checkUnlinked();
  },
);

test('a self-hosted export is refused for a public build', { skip }, async () => {
  const result = spawnSync('node', ['scripts/prepare.mjs'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, SEANCHAI_EXPORT: path.join(dist, 'data') },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /public build cannot use a self-hosted export/);
});
