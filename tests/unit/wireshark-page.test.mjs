// The Wireshark plugin's page and the rewrite of its download's explorer address.
import assert from 'node:assert/strict';
import { resolveObjectURL } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { WIRESHARK, namesDocument, parseRoute } from '../../src/navigation.ts';
import { explorerAddress, installCommand, pluginVersions, quotable, withExplorer } from '../../src/plugin-file.ts';
import { absent, boot, click, pluginFixture, present, press, same } from './helpers.mjs';

const MARKED = 'local EXPLORER = "https://sliva0.github.io/seanchai-explorer/" -- seanchai:explorer';
const marked = address => `local EXPLORER = "${address}" -- seanchai:explorer`;
const plugin = await readFile(pluginFixture, 'utf8');

test('the rewrite sets the address on the one marked line and leaves every other byte as it was', () => {
  const rewrite = withExplorer(plugin, 'http://192.168.3.3:4173/');
  assert.equal(rewrite.written, true);
  assert.equal(rewrite.text, plugin.replace(MARKED, marked('http://192.168.3.3:4173/')));
  const before = plugin.split('\n');
  const after = rewrite.text.split('\n');
  assert.equal(after.length, before.length);
  assert.deepEqual(
    after.flatMap((line, at) => (line === before[at] ? [] : [at])),
    [before.indexOf(MARKED)],
  );
  const bom = withExplorer(`﻿${plugin}\r\n`, 'https://host/');
  assert.equal(bom.text, `﻿${plugin.replace(MARKED, marked('https://host/'))}\r\n`);
  assert.equal(
    withExplorer(plugin.replace(MARKED, marked('')), 'https://host/').text,
    rewrite.text.replace('http://192.168.3.3:4173/', 'https://host/'),
  );
});

test('a file without exactly one marked line, or an address a Lua string cannot hold, is left as it is', () => {
  for (const [text, reason] of [
    [plugin.replace(MARKED, ''), 'it has no explorer line'],
    [plugin.replace(MARKED, `${MARKED}\n${MARKED}`), 'it has 2 explorer lines'],
    [plugin.replace(MARKED, `${MARKED} `), 'it has no explorer line'],
    [plugin.replace(MARKED, `  ${MARKED}`), 'it has no explorer line'],
    [plugin.replace(MARKED, marked('a"b')), 'it has no explorer line'],
  ]) {
    assert.deepEqual(withExplorer(text, 'https://host/'), { text, written: false, reason });
  }
  for (const address of ['https://host/"); os.exit() --', 'https://host/\\', 'https://host/\nlocal X = 1']) {
    const rewrite = withExplorer(plugin, address);
    assert.equal(rewrite.written, false, address);
    assert.equal(rewrite.text, plugin);
  }
});

test('the address is the page as served, without its route or query, wherever it is hosted', () => {
  for (const [href, address] of [
    ['https://host/', 'https://host/'],
    ['https://host', 'https://host/'],
    ['https://host/#wireshark', 'https://host/'],
    ['https://host/?utm=1#wireshark', 'https://host/'],
    ['https://host/sub/', 'https://host/sub/'],
    ['https://host/sub/#wireshark', 'https://host/sub/'],
    ['https://host/sub/?a=1&b=2#wireshark', 'https://host/sub/'],
    ['https://host/sub/index.html', 'https://host/sub/index.html'],
    ['https://host/sub/index.html?a=1#wireshark', 'https://host/sub/index.html'],
    ['http://192.168.3.3:4173/', 'http://192.168.3.3:4173/'],
    ['http://192.168.3.3:4173/#wireshark', 'http://192.168.3.3:4173/'],
  ]) {
    assert.equal(explorerAddress(href), address, href);
    // A link the plugin makes from it is a route of this site's own page.
    const link = new URL(`${address}#29061-6f0/17.6.2?name=AA-Answer`);
    assert.equal(link.pathname, new URL(href).pathname || '/');
    assert.deepEqual(parseRoute(link.hash), {
      document: '29061-6f0',
      section: '17.6.2',
      raw: false,
      query: '',
      name: 'AA-Answer',
    });
  }
});

test('the versions line is read, and its absence is null', () => {
  assert.equal(pluginVersions(plugin), 'seanchai 0.2.0, corpus 2026.11.11');
  assert.equal(pluginVersions('local x = 1\n'), null);
  assert.equal(pluginVersions('-- seanchai:versions   \n'), null);
});

test('the route names a page of the site, not a document', () => {
  assert.equal(parseRoute(`#${WIRESHARK}`).document, 'wireshark');
  assert.equal(namesDocument(WIRESHARK), false);
  assert.equal(namesDocument('search'), false);
  assert.equal(namesDocument(''), false);
  assert.equal(namesDocument('29061-6f0'), true);
});

/** Catches the page's download, which a browser would save: the object URL's text, each time. */
function downloads(page) {
  const saved = [];
  page.document.addEventListener(
    'click',
    event => {
      const anchor = event.target;
      if (anchor.localName !== 'a' || !anchor.hasAttribute('download')) return;
      event.preventDefault();
      saved.push({ name: anchor.download, text: resolveObjectURL(anchor.href)?.text() });
    },
    true,
  );
  return saved;
}

const downloadButton = document =>
  [...document.querySelectorAll('main button')].find(button => button.textContent.startsWith('Download'));

test('the page says what the plugin is and its versions, and its download links to this site', async () => {
  const page = await boot({ hash: '#search' });
  try {
    const { document } = page;
    const link = [...document.querySelectorAll('header nav a')].find(a => a.textContent === 'Wireshark');
    assert.equal(link.getAttribute('href'), '#wireshark');
    click(page, link);
    await page.settle();
    assert.equal(document.title, 'Wireshark plugin — Seanchaí');
    assert.equal(document.querySelector('main h1').textContent, 'Wireshark plugin');
    same(document.activeElement, document.querySelector('main h1'));
    const text = document.querySelector('main').textContent;
    assert.match(text, /checks every Diameter message in a capture against the documents shown on this site/);
    assert.match(text, /cites the clause, table and page/);
    assert.match(text, /~\/\.local\/lib\/wireshark\/plugins\//);
    assert.match(text, /%APPDATA%\\Wireshark\\plugins\\/);
    assert.match(text, /seanchai\.errors > 0/);
    assert.match(text, /Protocols → Seanchaí/);
    assert.match(text, /Wireshark 4\.2 or later/);
    assert.match(text, /A self-hosted copy of this site/);
    assert.doesNotMatch(text, /SCTP|TCP|\bports?\b/i);
    assert.equal(document.querySelector('.versions').textContent, 'Generated from seanchai 0.2.0, corpus 2026.11.11.');
    assert.equal(document.querySelector('.plugin-address code').textContent, 'http://localhost/');
    assert.ok(page.fetched.includes('plugin/seanchai_diameter.lua'));
    const command = document.querySelector('.plugin-command code');
    assert.equal(command.textContent, install('http://localhost/', 'http://localhost/plugin/seanchai_diameter.lua'));
    assert.equal(document.querySelectorAll('.plugin-command').length, 1, 'Linux only');
    assert.deepEqual(
      [...document.querySelectorAll('main h2')].map(node => node.textContent),
      ['Linux', 'Other systems', 'Use'],
    );
    assert.match(text, /"Explorer address" \(seanchai\.explorer_url\)/);
    const guide = [...document.querySelectorAll('main a')].find(a => a.textContent === 'what it checks');
    assert.equal(guide.href, 'https://github.com/sliva0/seanchai/blob/main/docs/wireshark-plugin.md');
    assert.equal(guide.target, '_blank');
    assert.match(
      text,
      /downloads the plugin into Wireshark's personal plugins folder and points its links at this site, replacing an installed plugin only once the download is complete and its links are set\. Run it again to update\./,
    );
    const copied = [];
    Object.defineProperty(page.window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async text => void copied.push(text) },
    });
    const copyButton = document.querySelector('.plugin-command button');
    assert.equal(copyButton.getAttribute('aria-label'), 'Copy the command');
    click(page, copyButton);
    await page.settle();
    assert.deepEqual(copied, [command.textContent]);
    const copyStatus = document.querySelector('.copy-status');
    assert.equal(copyStatus.getAttribute('role'), 'status');
    assert.equal(copyStatus.textContent, 'Copied.');
    Object.defineProperty(page.window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => Promise.reject(new Error('denied')) },
    });
    click(page, copyButton);
    await page.settle();
    assert.match(copyStatus.textContent, /^Selected: press Ctrl\+C/);
    assert.equal(page.window.getSelection().toString(), command.textContent);

    const saved = downloads(page);
    const status = document.querySelector('.plugin-status');
    assert.equal(status.getAttribute('role'), 'status');
    click(page, downloadButton(document));
    await page.settle();
    assert.equal(saved.length, 1);
    assert.equal(saved[0].name, 'seanchai_diameter.lua');
    assert.equal(await saved[0].text, plugin.replace(MARKED, marked('http://localhost/')));
    assert.equal(status.textContent, 'Saved seanchai_diameter.lua, its links set to this site.');
    absent(document.querySelector('main a[download]'));
    assert.equal(page.fetched.filter(file => file.startsWith('plugin/')).length, 1, 'the first fetch is kept');
  } finally {
    await page.close();
  }
});

test('in a self-hosted build the page says its links open this copy, PDF beside the text', async () => {
  const page = await boot({ hash: '#wireshark', mode: 'self-hosted' });
  try {
    assert.match(
      page.document.querySelector('main').textContent,
      /This copy is self-hosted: the links open it, with the source PDF beside the text/,
    );
  } finally {
    await page.close();
  }
});

test("a plugin without its versions line shows the index's, and one without its marked line is saved as built", async () => {
  const bare = plugin.replace(/^-- seanchai:versions.*\n/m, '').replace(MARKED, '');
  const page = await boot({
    hash: '#wireshark',
    transform: (path, data) => (path.startsWith('plugin/') ? bare : data),
  });
  try {
    const { document } = page;
    const index = JSON.parse(await readFile(new URL('../fixtures/export/index.json', import.meta.url), 'utf8'));
    assert.equal(
      document.querySelector('.versions').textContent,
      `Generated from seanchai ${index.seanchai_version}, corpus ${index.corpus_version}.`,
    );
    const saved = downloads(page);
    click(page, downloadButton(document));
    await page.settle();
    assert.equal(await saved[0].text, bare);
    const status = document.querySelector('.plugin-status');
    assert.match(
      status.textContent,
      /^Saved seanchai_diameter\.lua as it was built, since it has no explorer line: its links go to the address it was generated with, not to this site\.$/,
    );
    assert.ok(status.classList.contains('plugin-warning'));
  } finally {
    await page.close();
  }
});

test('a build without the plugin says the download is not part of it and how to make one', async () => {
  const page = await boot({ hash: '#wireshark', plugin: false });
  try {
    const { document } = page;
    absent(downloadButton(document) ?? null);
    const offer = document.querySelector('.plugin-ways');
    absent(document.querySelector('.plugin-download'));
    assert.match(offer.textContent, /^InstallThe download is not part of this build\. Generate the plugin with:/);
    assert.equal(
      offer.querySelector('pre code').textContent,
      "uvx --from 'seanchai[corpus]' seanchai wireshark-plugin -o seanchai_diameter.lua",
    );
    assert.match(offer.textContent, /add --explorer 'http:\/\/localhost\/' for its links to open this site/);
    present(document.querySelector('.plugin-folders'));
    absent(document.querySelector('.plugin-command'));
  } finally {
    await page.close();
  }
});

test('a failed fetch is a notice with Retry, which downloads once it can', async () => {
  let failing = true;
  const page = await boot({
    hash: '#wireshark',
    prepare: ({ window }) => {
      const served = window.fetch;
      window.fetch = (input, init) =>
        failing && String(input).includes('plugin/')
          ? Promise.resolve({ ok: false, status: 503 })
          : served(input, init);
    },
  });
  try {
    const { document } = page;
    const saved = downloads(page);
    click(page, downloadButton(document));
    await page.settle();
    assert.equal(saved.length, 0);
    assert.equal(document.querySelector('.plugin-status').textContent, 'The download failed.');
    const notice = document.querySelector('#notices .notice');
    assert.match(
      notice.textContent,
      /^Could not fetch the Wireshark plugin\. Error: 503: plugin\/seanchai_diameter\.lua/,
    );
    failing = false;
    click(
      page,
      [...notice.querySelectorAll('button')].find(button => button.textContent === 'Retry'),
    );
    await page.settle();
    assert.equal(saved.length, 1);
    assert.equal(await saved[0].text, plugin.replace(MARKED, marked('http://localhost/')));
    absent(document.querySelector('#notices .notice'));
  } finally {
    await page.close();
  }
});

test('the jump list goes back to the page from a document, under its own label', async () => {
  const page = await boot({ hash: '#wireshark' });
  try {
    await page.go('#29153-j00');
    assert.match(page.document.querySelector('.jump-controls button').title, /^Back to Wireshark plugin /);
    press(page, { key: 'o', ctrlKey: true });
    await page.settle();
    assert.equal(page.window.location.hash, '#wireshark');
    assert.equal(page.document.querySelector('main h1').textContent, 'Wireshark plugin');
  } finally {
    await page.close();
  }
});

const install = (base, plugin) =>
  `mkdir -p ~/.local/lib/wireshark/plugins && curl -fsSL -o ~/.local/lib/wireshark/plugins/seanchai_diameter.lua.part '${plugin}' && sed -i 's|^local EXPLORER = .* -- seanchai:explorer$|local EXPLORER = "${base}" -- seanchai:explorer|' ~/.local/lib/wireshark/plugins/seanchai_diameter.lua.part && grep -qxF 'local EXPLORER = "${base}" -- seanchai:explorer' ~/.local/lib/wireshark/plugins/seanchai_diameter.lua.part && mv ~/.local/lib/wireshark/plugins/seanchai_diameter.lua.part ~/.local/lib/wireshark/plugins/seanchai_diameter.lua && echo 'Installed seanchai_diameter.lua'`;

test('the install command downloads beside the plugin, checks the address is set, and only then replaces it', () => {
  assert.equal(
    installCommand('https://host/', 'https://host/plugin/seanchai_diameter.lua'),
    "mkdir -p ~/.local/lib/wireshark/plugins && curl -fsSL -o ~/.local/lib/wireshark/plugins/seanchai_diameter.lua.part 'https://host/plugin/seanchai_diameter.lua' && sed -i 's|^local EXPLORER = .* -- seanchai:explorer$|local EXPLORER = \"https://host/\" -- seanchai:explorer|' ~/.local/lib/wireshark/plugins/seanchai_diameter.lua.part && grep -qxF 'local EXPLORER = \"https://host/\" -- seanchai:explorer' ~/.local/lib/wireshark/plugins/seanchai_diameter.lua.part && mv ~/.local/lib/wireshark/plugins/seanchai_diameter.lua.part ~/.local/lib/wireshark/plugins/seanchai_diameter.lua && echo 'Installed seanchai_diameter.lua'",
  );
});

test('the install command is one line of single-quoted literals and && alone', () => {
  for (const base of ['https://host/', 'https://host/sub/', 'http://192.168.3.3:4173/']) {
    const plugin = `${base}plugin/seanchai_diameter.lua`;
    const linux = installCommand(base, plugin);
    assert.equal(linux, install(base, plugin));
    assert.doesNotMatch(linux, /\$\(|`|\n|\bexport\b|=\S*;|[{}]|<</);
  }
});

test('what a shell, sed or Lua would read as its own is percent-encoded in both addresses', () => {
  assert.equal(quotable(`a'b"c\\d|e&f`), 'a%27b%22c%5Cd%7Ce%26f');
  // The page's query goes, so its `&` never reaches the command; one in a path is encoded.
  const base = explorerAddress("https://host/o'brien/a&b|c/?x=1&y='2'#wireshark");
  assert.equal(base, 'https://host/o%27brien/a%26b%7Cc/');
  const plugin = "https://host/o'brien/a&b|c/plugin/seanchai_diameter.lua";
  const command = installCommand(base, plugin);
  assert.equal(command, install(base, 'https://host/o%27brien/a%26b%7Cc/plugin/seanchai_diameter.lua'));
  assert.equal(installCommand("https://host/'", "https://host/'"), install('https://host/%27', 'https://host/%27'));
  assert.equal(installCommand('https://host/\n', 'https://host/plugin'), null);
  // Each literal is closed where it was opened: the quotes pair up with nothing inside them but the command's own.
  assert.equal(command.split("'").length % 2, 1);
  // sed writes its replacement as it is, with no `&` or `\` in it, so the grep checks for the very line it wrote.
  const [, written] = command.match(/\|(local EXPLORER = [^|]*)\|' /);
  const [, checked] = command.match(/ grep -qxF '([^']*)' /);
  assert.equal(written, checked);
  assert.doesNotMatch(written, /[&\\|']/);
});
