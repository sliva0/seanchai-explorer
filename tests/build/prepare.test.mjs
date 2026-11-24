// Runs prepare over a copy of the fixture export; overwrites public/data and public/syntax.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';
import { pinText, releaseArgs, seanchaiWays } from '../../scripts/seanchai.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const site = path.join(root, 'public/syntax/dad.tmLanguage.json');
const fallback = path.join(root, 'syntax/dad.tmLanguage.json');
const fixture = fileURLToPath(new URL('../fixtures/export/', import.meta.url));
const standIn = fileURLToPath(new URL('../fixtures/plugin/seanchai_diameter.lua', import.meta.url));
const plugin = path.join(root, 'public/plugin/seanchai_diameter.lua');

function run(env) {
  return spawnSync('node', ['scripts/prepare.mjs'], { cwd: root, encoding: 'utf8', env: { ...process.env, ...env } });
}

function prepare(exported) {
  const result = run({ SEANCHAI_EXPORT: exported, SEANCHAI_PLUGIN: standIn });
  assert.equal(result.status, 0, result.stderr);
}

test("prepare uses the export's grammar, the fallback when it has none, and leaves the fallback alone", async () => {
  const committed = await readFile(fallback);
  const exported = await mkdtemp(path.join(tmpdir(), 'seanchai-export-'));
  const grammar = path.join(exported, 'syntax/dad.tmLanguage.json');
  try {
    await cp(fileURLToPath(new URL('../fixtures/export/', import.meta.url)), exported, { recursive: true });
    await writeFile(grammar, '{"scopeName":"source.exported"}\n');
    prepare(exported);
    assert.equal(await readFile(site, 'utf8'), '{"scopeName":"source.exported"}\n');
    assert.deepEqual(await readFile(fallback), committed);

    await rm(path.dirname(grammar), { recursive: true });
    prepare(exported);
    assert.deepEqual(await readFile(site), committed);
    assert.deepEqual(await readFile(fallback), committed);
  } finally {
    await rm(exported, { recursive: true, force: true });
  }
});

test("prepare keeps the export's command index, and derives the element index from its blocks' described_by and the table index from their ; Table:", async () => {
  const exported = fileURLToPath(new URL('../fixtures/export/', import.meta.url));
  prepare(exported);
  const read = async (directory, file) => JSON.parse(await readFile(path.join(directory, file), 'utf8'));
  assert.deepEqual(await read(path.join(root, 'public/data'), 'commands.json'), await read(exported, 'commands.json'));
  const elements = await read(path.join(root, 'public/data'), 'elements.json');
  assert.equal(elements.schema_version, 3);
  assert.deepEqual(
    elements.tables.find(table => table.document === '29328-j20' && table.command === 'User-Data-Request').message,
    { document: '29329-j10', section: '6.1.1', name: 'User-Data-Request', line: 10, ordinal: 0 },
  );
  const tables = await read(path.join(root, 'public/data'), 'tables.json');
  assert.equal(tables.schema_version, 3);
  assert.deepEqual(tables.tables['29328-j20']['6.1.1.2'], { line: 38, section: '6.1.1' }, "each document's tables");
});

test('prepare refuses an export of another schema than the one the site reads, or one without commands.json', async () => {
  const exported = await mkdtemp(path.join(tmpdir(), 'seanchai-export-'));
  try {
    await cp(fixture, exported, { recursive: true });
    const index = JSON.parse(await readFile(path.join(exported, 'index.json'), 'utf8'));
    await writeFile(path.join(exported, 'index.json'), JSON.stringify({ ...index, schema_version: 2 }));
    const old = run({ SEANCHAI_EXPORT: exported, SEANCHAI_PLUGIN: standIn });
    assert.notEqual(old.status, 0);
    assert.match(old.stderr, /Export schema 2, and the site reads schema 3 only/);
    await writeFile(path.join(exported, 'index.json'), JSON.stringify(index));
    await rm(path.join(exported, 'commands.json'));
    const none = run({ SEANCHAI_EXPORT: exported, SEANCHAI_PLUGIN: standIn });
    assert.notEqual(none.status, 0);
    assert.match(none.stderr, /The export has no commands\.json/);
  } finally {
    await rm(exported, { recursive: true, force: true });
  }
});

/**
 * A `uv` standing in for the checkout's `seanchai`, as old as one without the plugin's command: its export copies the
 * fixture, its help runs, and `wireshark-plugin` is no command of it.
 */
async function oldSeanchai(directory) {
  const bin = path.join(directory, 'bin');
  await mkdir(bin);
  const uv = path.join(bin, 'uv');
  await writeFile(
    uv,
    `#!/bin/sh
case "$5" in
  export) cp -r '${fixture}.' "$7" ;;
  wireshark-plugin) echo "error: No such command 'wireshark-plugin'." >&2; exit 2 ;;
esac
`,
  );
  await chmod(uv, 0o755);
  // Its export, not one the environment names or the pinned release's, and no plugin made already.
  return {
    SEANCHAI_ROOT: directory,
    PATH: `${bin}${path.delimiter}${process.env.PATH}`,
    SEANCHAI_EXPORT: '',
    SEANCHAI_PLUGIN: '',
    SEANCHAI_PINNED: '',
  };
}

test('prepare ships SEANCHAI_PLUGIN as it is', async () => {
  prepare(fixture);
  assert.deepEqual(await readFile(plugin), await readFile(standIn));
});

test('a seanchai too old for the plugin fails a build it exported for, and not one from SEANCHAI_EXPORT', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'seanchai-old-'));
  try {
    const env = await oldSeanchai(directory);
    const failed = run(env);
    assert.notEqual(failed.status, 0);
    assert.match(failed.stderr, /Cannot make the Wireshark plugin: this seanchai has no wireshark-plugin command/);
    assert.ok(!existsSync(plugin));

    const exported = run({ ...env, SEANCHAI_EXPORT: fixture });
    assert.equal(exported.status, 0, exported.stderr);
    assert.match(
      exported.stderr,
      /Building without the Wireshark plugin: this seanchai has no wireshark-plugin command/,
    );
    assert.ok(!existsSync(plugin));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

/**
 * A `uvx` standing in for the pinned release: it says what it was asked on stderr, and exports `exported`, the fixture
 * unless given another.
 */
async function pinnedStandIn(directory, exported = fixture) {
  const bin = path.join(directory, 'bin');
  await mkdir(bin, { recursive: true });
  const uvx = path.join(bin, 'uvx');
  await writeFile(
    uvx,
    `#!/bin/sh
echo "uvx $*" >&2
case "$6" in
  export) cp -r '${path.join(exported, '.')}' "$8" ;;
  wireshark-plugin) cp '${standIn}' "$8" ;;
esac
`,
  );
  await chmod(uvx, 0o755);
  return {
    SEANCHAI_PINNED: '1',
    PATH: `${bin}${path.delimiter}${process.env.PATH}`,
    SEANCHAI_EXPORT: '',
    SEANCHAI_PLUGIN: '',
  };
}

const escaped = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('a plain build runs the pin, even inside a checkout; SEANCHAI_ROOT or SEANCHAI_ON_PATH runs another, and SEANCHAI_PINNED the pin over both', () => {
  const ways = env => seanchaiWays(['export'], { env }).map(way => [way.command, way.pinned === true, way.args.at(-1)]);
  const pin = [['uvx', true, 'export']];
  assert.deepEqual(ways({}), pin, 'neither the checkout this repository is in nor a seanchai on PATH');
  const checkout = seanchaiWays(['export'], { env: { SEANCHAI_ROOT: '/work/seanchai' } });
  assert.deepEqual(
    checkout.map(way => [way.command, way.args.slice(0, 3), way.cwd]),
    [['uv', ['run', '--project', '/work/seanchai'], '/work/seanchai']],
  );
  assert.deepEqual(ways({ SEANCHAI_ON_PATH: '1' }), [['seanchai', false, 'export']]);
  assert.deepEqual(ways({ SEANCHAI_ROOT: '/work/seanchai', SEANCHAI_ON_PATH: '1', SEANCHAI_PINNED: '1' }), pin);
});

test('a pin of versions runs them from PyPI, and a pin of a commit runs its two packages from the repository', () => {
  const versions = { seanchai: '0.3.0', 'seanchai-corpus': '2027.01.01' };
  assert.deepEqual(releaseArgs('corpus,extract', versions), [
    '--from',
    'seanchai[corpus,extract]==0.3.0',
    '--with',
    'seanchai-corpus==2027.01.01',
    'seanchai',
  ]);
  const commit = { ...versions, repository: 'https://example.org/seanchai', commit: 'abc123' };
  assert.deepEqual(releaseArgs('corpus', commit), [
    '--from',
    'seanchai[corpus] @ git+https://example.org/seanchai@abc123',
    '--with',
    'seanchai-corpus @ git+https://example.org/seanchai@abc123#subdirectory=packages/seanchai-corpus',
    'seanchai',
  ]);
});

test('SEANCHAI_PINNED runs the release seanchai-release.json pins, and a build fails where it exports other versions', async () => {
  const pin = JSON.parse(await readFile(path.join(root, 'seanchai-release.json'), 'utf8'));
  const index = JSON.parse(await readFile(path.join(fixture, 'index.json'), 'utf8'));
  const directory = await mkdtemp(path.join(tmpdir(), 'seanchai-pinned-'));
  try {
    /** The fixture as an export naming `versions`. */
    const exporting = async (name, versions) => {
      const copy = path.join(directory, name);
      await cp(fixture, copy, { recursive: true });
      await writeFile(path.join(copy, 'index.json'), JSON.stringify({ ...index, ...versions }));
      return copy;
    };
    const pinned = await exporting('pinned', {
      seanchai_version: pin.seanchai,
      corpus_version: pin['seanchai-corpus'],
    });
    const result = run(await pinnedStandIn(path.join(directory, 'one'), pinned));
    assert.match(result.stderr, new RegExp(escaped(`uvx ${releaseArgs('corpus', pin).join(' ')} export`)));
    assert.equal(result.status, 0, result.stderr);

    const other = await exporting('other', { seanchai_version: pin.seanchai, corpus_version: '1999.01.01' });
    const failed = run(await pinnedStandIn(path.join(directory, 'two'), other));
    assert.notEqual(failed.status, 0);
    assert.match(
      failed.stderr,
      new RegExp(
        escaped(
          `The release pinned in seanchai-release.json, ${pinText(pin)}, exported seanchai ${pin.seanchai}, corpus 1999.01.01`,
        ),
      ),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('a build refuses SEANCHAI_PLUGIN made by another seanchai or corpus than the export, or naming none', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'seanchai-plugin-'));
  try {
    const text = await readFile(standIn, 'utf8');
    const other = path.join(directory, 'other.lua');
    await writeFile(other, text.replace(/corpus \S+$/m, 'corpus 1999.01.01'));
    const failed = run({ SEANCHAI_EXPORT: fixture, SEANCHAI_PLUGIN: other });
    assert.notEqual(failed.status, 0);
    assert.match(
      failed.stderr,
      /was made by seanchai \S+, corpus 1999\.01\.01, and the export by seanchai \S+, corpus /,
    );
    const unsaid = path.join(directory, 'unsaid.lua');
    await writeFile(unsaid, text.replace(/^-- seanchai:versions .*\n/m, ''));
    const none = run({ SEANCHAI_EXPORT: fixture, SEANCHAI_PLUGIN: unsaid });
    assert.notEqual(none.status, 0);
    assert.match(none.stderr, /names no versions/);
    prepare(fixture);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
