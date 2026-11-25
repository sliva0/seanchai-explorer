// A SEANCHAI_UNLINKED=1 build: the site names nothing of the open-source project. The build defines the constant;
// here the global it reads is set before the site's modules are loaded, each test file being a process of its own.
import assert from 'node:assert/strict';
import test from 'node:test';
import { absent, boot } from './helpers.mjs';

globalThis.SEANCHAI_UNLINKED = true;
// Asked for no addresses, the build counts none its own, so that no chunk spells the public site its plugin links to.
globalThis.SEANCHAI_EXPLORER_ADDRESSES = [];

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

test("the Wireshark page sets this site's address in a plugin linking to the public site, and never names it", async () => {
  const page = await boot({ hash: '#wireshark' });
  try {
    const { document } = page;
    await page.settle();
    assert.equal(
      document.querySelector('.plugin-elsewhere').textContent,
      "The plugin was built to link to another site, so the commands and the download below set this site's address in it.",
    );
    assert.match(document.querySelector('.plugin-command code').textContent, /local EXPLORER = "http:\/\/localhost\/"/);
    assert.doesNotMatch(document.body.innerHTML, named);
  } finally {
    await page.close();
  }
});

test('an unlinked build given its own addresses offers the plugin as served at one, and names its first elsewhere', async () => {
  globalThis.SEANCHAI_EXPLORER_ADDRESSES = ['http://intranet.example/seanchai/', 'http://localhost/'];
  const line = 'local EXPLORER = "http://intranet.example/seanchai/" -- seanchai:explorer';
  const transform = (path, data) =>
    path.startsWith('plugin/') ? data.replace(/^local EXPLORER = ".*" -- seanchai:explorer$/m, line) : data;
  const page = await boot({ hash: '#wireshark', transform });
  try {
    const { document } = page;
    await page.settle();
    absent(document.querySelector('.plugin-elsewhere'));
    assert.equal(
      document.querySelector('.plugin-download a[download]').getAttribute('href'),
      'http://localhost/plugin/seanchai_diameter.lua',
    );
    assert.doesNotMatch(document.body.innerHTML, named);
  } finally {
    await page.close();
  }
  globalThis.SEANCHAI_EXPLORER_ADDRESSES = ['http://intranet.example/seanchai/'];
  const elsewhere = await boot({ hash: '#wireshark', transform });
  try {
    await elsewhere.settle();
    assert.match(
      elsewhere.document.querySelector('.plugin-elsewhere').textContent,
      /^The plugin was built to link to http:\/\/intranet\.example\/seanchai\/, not this site/,
    );
  } finally {
    await elsewhere.close();
    globalThis.SEANCHAI_EXPLORER_ADDRESSES = [];
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
