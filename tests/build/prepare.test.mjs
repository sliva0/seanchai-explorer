// Runs prepare over a copy of the fixture export; overwrites public/data, restores the grammar.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const root = fileURLToPath(new URL('../../', import.meta.url));
const site = path.join(root, 'public/syntax/dad.tmLanguage.json');

function prepare(exported) {
  const result = spawnSync('node', ['scripts/prepare.mjs'], { cwd: root, encoding: 'utf8', env: { ...process.env, SEANCHAI_EXPORT: exported } });
  assert.equal(result.status, 0, result.stderr);
}

test('prepare uses the export\'s grammar, and keeps the committed copy when it has none', async () => {
  const committed = await readFile(site);
  const exported = await mkdtemp(path.join(tmpdir(), 'seanchai-export-'));
  const grammar = path.join(exported, 'syntax/dad.tmLanguage.json');
  try {
    await cp(fileURLToPath(new URL('../fixtures/export/', import.meta.url)), exported, { recursive: true });
    await writeFile(grammar, '{"scopeName":"source.exported"}\n');
    prepare(exported);
    assert.equal(await readFile(site, 'utf8'), '{"scopeName":"source.exported"}\n');

    await writeFile(site, committed);
    await rm(path.dirname(grammar), { recursive: true });
    prepare(exported);
    assert.deepEqual(await readFile(site), committed);
  } finally {
    await writeFile(site, committed);
    await rm(exported, { recursive: true, force: true });
  }
});
