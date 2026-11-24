// A SEANCHAI_UNLINKED=1 build: the site names nothing of the open-source project. The build defines the constant;
// here the global it reads is set before the site's modules are loaded, each test file being a process of its own.
import assert from 'node:assert/strict';
import test from 'node:test';
import { absent, boot } from './helpers.mjs';

globalThis.SEANCHAI_UNLINKED = true;

const named = /GitHub|PyPI|github\.com|pypi\.org|github\.io|Self-host/;

test('the index has no introduction and no link to the project, and keeps its line of versions and its hint', async () => {
  const page = await boot();
  try {
    const { document } = page;
    const intro = document.querySelector('.index-intro');
    assert.deepEqual(
      [...intro.querySelectorAll('p')].map(p => p.textContent.replace(/\d+(\.\d+)+/g, 'N')),
      [
        'Corpus N · seanchai N · public build',
        'Click a name to view it in the source pane, right-click for uses, or press ? for help.',
      ],
    );
    absent(intro.querySelector('a'));
    assert.doesNotMatch(document.body.innerHTML, named);
  } finally {
    await page.close();
  }
});

test("the Wireshark page says a build without the plugin has none, and names no command installing the project's", async () => {
  const page = await boot({ hash: '#wireshark', plugin: false });
  try {
    const { document } = page;
    assert.match(
      document.querySelector('.plugin-ways').textContent,
      /^The Wireshark plugin is not included in this build\./,
    );
    absent(document.querySelector('.plugin-ways pre'));
    assert.doesNotMatch(document.body.innerHTML, /uvx|seanchai\[corpus\]/);
    assert.doesNotMatch(document.body.innerHTML, named);
  } finally {
    await page.close();
  }
});

test('the pane says this build cannot show a PDF, and points at no other build', async () => {
  const page = await boot({ hash: '#29153-j00' });
  try {
    const { document } = page;
    assert.equal(
      document.querySelector('.inspector-note').textContent,
      'The PDF for TS 29.153 V19.0.0 is not embedded in this build due to publisher licensing restrictions.',
    );
    assert.doesNotMatch(document.body.innerHTML, named);
  } finally {
    await page.close();
  }
});
