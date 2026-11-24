// scripts/strings.mjs: the list of the interface's words a rewrite works from.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('the list of words has every text module, the controls and the HTML pages, each entry with its build marks', () => {
  const run = spawnSync('node', ['scripts/strings.mjs'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const listed = run.stdout;
  for (const file of ['site', 'search', 'document', 'popup', 'rules', 'pane', 'wireshark', 'help', 'terms', 'controls'])
    assert.ok(listed.includes(`src/text/${file}.ts`), file);
  assert.match(
    listed,
    /\| `indexIntro` \| Diameter command and AVP definitions .* \| only without SEANCHAI_UNLINKED=1 \|/,
  );
  assert.match(listed, /\| `pageMessages\.loading` \| \(label\) → Loading \{label\}… \|/);
  assert.match(listed, /\| `viewer\.hideChapters` \| Hide chapters \| .* \| self-hosted build only \|/);
  assert.match(listed, /\| `viewer\.html text` \| Chapters \|/);
  assert.doesNotMatch(listed, /https:\/\/github\.com/, 'addresses are no words');
  const count = Number(run.stderr.match(/(\d+) entries/)[1]);
  assert.ok(count > 400, String(count));
  assert.equal(listed.match(/^\| `/gm).length, count, 'the count is the rows');
});
