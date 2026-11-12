// Runs prepare over a copy of the fixture export; overwrites public/data and public/syntax.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

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

test("prepare derives the command index from the export's documents, beside them", async () => {
  const exported = fileURLToPath(new URL('../fixtures/export/', import.meta.url));
  prepare(exported);
  const index = JSON.parse(await readFile(path.join(root, 'public/data/commands.json'), 'utf8'));
  const search = JSON.parse(await readFile(path.join(exported, 'search.json'), 'utf8'));
  assert.equal(index.schema_version, search.schema_version);
  assert.equal(index.commands.length, search.entries.filter(entry => entry.kind === 'command').length);
  assert.deepEqual(
    index.commands.find(command => command.document === '29061-6f0' && command.name === 'AA-Answer'),
    {
      document: '29061-6f0',
      name: 'AA-Answer',
      abbreviation: 'AAA',
      section: '17.6.2',
      page: 83,
      line: 43,
      code: 265,
      flags: ['PXY'],
      header: null,
      application: 16777223,
      scope: { name: 'Gmb', section: '17' },
    },
  );
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
  return { SEANCHAI_ROOT: directory, PATH: `${bin}${path.delimiter}${process.env.PATH}`, SEANCHAI_PLUGIN: '' };
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
