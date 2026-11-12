// The Wireshark plugin's page and the rewrite of its download's explorer address.
import assert from 'node:assert/strict';
import { resolveObjectURL } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { WIRESHARK, namesDocument, parseRoute } from '../../src/navigation.ts';
import {
  explorerAddress,
  fishInstall,
  generateCommand,
  pluginVersions,
  posixInstall,
  quotable,
  resolveInstallShell,
  withExplorer,
} from '../../src/plugin-file.ts';
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

test('the page shows its versions, the script for the chosen shell and the download, and next to no text', async () => {
  const page = await boot({ hash: '#search' });
  try {
    const { document, window } = page;
    const link = [...document.querySelectorAll('header nav a')].find(a => a.textContent === 'Wireshark');
    assert.equal(link.getAttribute('href'), '#wireshark');
    click(page, link);
    await page.settle();
    assert.equal(document.title, 'Wireshark plugin — Seanchaí');
    assert.equal(document.querySelector('main h1').textContent, 'Wireshark plugin');
    same(document.activeElement, document.querySelector('main h1'));
    assert.equal(document.querySelector('.plugin-title .versions').textContent, 'seanchai 0.2.0, corpus 2026.11.11');
    assert.ok(page.fetched.includes('plugin/seanchai_diameter.lua'));
    assert.deepEqual(
      [...document.querySelectorAll('main h2')].map(node => node.textContent),
      ['Linux', 'Other systems'],
    );
    absent(document.querySelector('main a'));
    const from = 'http://localhost/plugin/seanchai_diameter.lua';
    const command = document.querySelector('.plugin-command code');
    assert.equal(command.textContent, posixInstall('http://localhost/', from));
    assert.equal(document.querySelectorAll('.plugin-command').length, 1, 'Linux only');
    assert.equal(
      document.querySelector('main').textContent,
      [
        'Wireshark plugin',
        'seanchai 0.2.0, corpus 2026.11.11',
        'Linux',
        'bash / zsh / sh',
        'fish',
        'Copy',
        posixInstall('http://localhost/', from),
        'Other systems',
        'Download seanchai_diameter.lua',
        'SystemFolder',
        'Linux and macOS~/.local/lib/wireshark/plugins/',
        'Windows%APPDATA%\\Wireshark\\plugins\\',
        'Then restart Wireshark, or press Ctrl+Shift+L.',
      ].join(''),
    );

    const group = document.querySelector('.shell-choice');
    assert.equal(group.getAttribute('role'), 'radiogroup');
    assert.equal(group.getAttribute('aria-label'), 'Shell');
    const radios = [...group.querySelectorAll('input[type="radio"]')];
    assert.deepEqual(
      radios.map(radio => [radio.value, radio.checked, radio.parentElement.textContent]),
      [
        ['posix', true, 'bash / zsh / sh'],
        ['fish', false, 'fish'],
      ],
    );
    radios[1].checked = true;
    radios[1].dispatchEvent(new window.Event('change'));
    assert.equal(command.textContent, fishInstall('http://localhost/', from));
    assert.equal(window.localStorage.getItem('seanchai-install-shell'), 'fish');

    const copied = [];
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async text => void copied.push(text) },
    });
    const copyButton = document.querySelector('.plugin-command-bar button');
    assert.equal(copyButton.getAttribute('aria-label'), 'Copy the script');
    click(page, copyButton);
    await page.settle();
    assert.deepEqual(copied, [fishInstall('http://localhost/', from)]);
    assert.ok(copied[0].endsWith('"Installed $file"\n'), 'the last line runs when pasted');
    const copyStatus = document.querySelector('.copy-status');
    assert.equal(copyStatus.getAttribute('role'), 'status');
    assert.equal(copyStatus.textContent, 'Copied');
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => Promise.reject(new Error('denied')) },
    });
    click(page, copyButton);
    await page.settle();
    assert.equal(copyStatus.textContent, 'Selected: press Ctrl+C');
    assert.equal(window.getSelection().toString(), command.textContent);

    const saved = downloads(page);
    const status = document.querySelector('.plugin-status');
    assert.equal(status.getAttribute('role'), 'status');
    click(page, downloadButton(document));
    await page.settle();
    assert.equal(saved.length, 1);
    assert.equal(saved[0].name, 'seanchai_diameter.lua');
    assert.equal(await saved[0].text, plugin.replace(MARKED, marked('http://localhost/')));
    assert.equal(status.textContent, 'Saved');
    absent(document.querySelector('main a[download]'));
    assert.equal(page.fetched.filter(file => file.startsWith('plugin/')).length, 1, 'the first fetch is kept');
  } finally {
    await page.close();
  }
});

test('the chosen shell is kept for the next visit, and the POSIX one is the default', async () => {
  assert.equal(resolveInstallShell('fish'), 'fish');
  assert.equal(resolveInstallShell('posix'), 'posix');
  assert.equal(resolveInstallShell(null), 'posix');
  assert.equal(resolveInstallShell('zsh'), 'posix');
  const page = await boot({
    hash: '#wireshark',
    prepare: ({ window }) => window.localStorage.setItem('seanchai-install-shell', 'fish'),
  });
  try {
    const { document } = page;
    assert.equal(document.querySelector('.shell-choice input:checked').value, 'fish');
    assert.equal(
      document.querySelector('.plugin-command code').textContent,
      fishInstall('http://localhost/', 'http://localhost/plugin/seanchai_diameter.lua'),
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
      `seanchai ${index.seanchai_version}, corpus ${index.corpus_version}`,
    );
    const saved = downloads(page);
    click(page, downloadButton(document));
    await page.settle();
    assert.equal(await saved[0].text, bare);
    const status = document.querySelector('.plugin-status');
    assert.equal(
      status.textContent,
      'Saved as built, since it has no explorer line: its links keep the address it was generated with.',
    );
    assert.ok(status.classList.contains('plugin-warning'));
  } finally {
    await page.close();
  }
});

test('a build without the plugin gives the command making one, with its links set to this site', async () => {
  const page = await boot({ hash: '#wireshark', plugin: false });
  try {
    const { document } = page;
    absent(downloadButton(document) ?? null);
    const offer = document.querySelector('.plugin-ways');
    absent(document.querySelector('.plugin-download'));
    assert.equal(offer.querySelector('p').textContent, 'Not in this build. Generate it with:');
    assert.equal(
      offer.querySelector('pre code').textContent,
      "uvx --from 'seanchai[corpus]' seanchai wireshark-plugin -o seanchai_diameter.lua --explorer 'http://localhost/'",
    );
    assert.equal(
      generateCommand("https://host/o'b/"),
      offer.querySelector('pre code').textContent.replace('http://localhost/', 'https://host/o%27b/'),
    );
    present(document.querySelector('.plugin-folders'));
    absent(document.querySelector('.plugin-command'));
    absent(document.querySelector('main h2'));
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
    assert.equal(document.querySelector('.plugin-status').textContent, 'Failed');
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

const posix = (line, from) => `file=~/.local/lib/wireshark/plugins/seanchai_diameter.lua
line='${line}'

mkdir -p ~/.local/lib/wireshark/plugins &&
  curl -fsSL -o "$file.part" '${from}' &&
  sed -i "s|^local EXPLORER = .* -- seanchai:explorer\\$|$line|" "$file.part" &&
  grep -qxF "$line" "$file.part" &&
  mv "$file.part" "$file" &&
  echo "Installed $file"
`;

const fish = (line, from) => `set file ~/.local/lib/wireshark/plugins/seanchai_diameter.lua
set line '${line}'

mkdir -p ~/.local/lib/wireshark/plugins
and curl -fsSL -o $file.part '${from}'
and sed -i "s|^local EXPLORER = .* -- seanchai:explorer\\$|$line|" $file.part
and grep -qxF $line $file.part
and mv $file.part $file
and echo "Installed $file"
`;

test('each install script downloads beside the plugin, checks the address is set, and only then replaces it', () => {
  assert.equal(
    posixInstall('https://host/', 'https://host/plugin/seanchai_diameter.lua'),
    `file=~/.local/lib/wireshark/plugins/seanchai_diameter.lua
line='local EXPLORER = "https://host/" -- seanchai:explorer'

mkdir -p ~/.local/lib/wireshark/plugins &&
  curl -fsSL -o "$file.part" 'https://host/plugin/seanchai_diameter.lua' &&
  sed -i "s|^local EXPLORER = .* -- seanchai:explorer\\$|$line|" "$file.part" &&
  grep -qxF "$line" "$file.part" &&
  mv "$file.part" "$file" &&
  echo "Installed $file"
`,
  );
  assert.equal(
    fishInstall('https://host/', 'https://host/plugin/seanchai_diameter.lua'),
    `set file ~/.local/lib/wireshark/plugins/seanchai_diameter.lua
set line 'local EXPLORER = "https://host/" -- seanchai:explorer'

mkdir -p ~/.local/lib/wireshark/plugins
and curl -fsSL -o $file.part 'https://host/plugin/seanchai_diameter.lua'
and sed -i "s|^local EXPLORER = .* -- seanchai:explorer\\$|$line|" $file.part
and grep -qxF $line $file.part
and mv $file.part $file
and echo "Installed $file"
`,
  );
  for (const base of ['https://host/sub/', 'http://192.168.3.3:4173/']) {
    const from = `${base}plugin/seanchai_diameter.lua`;
    assert.equal(posixInstall(base, from), posix(marked(base), from));
    assert.equal(fishInstall(base, from), fish(marked(base), from));
  }
});

/** The single-quoted line a script sets, which sed writes and grep looks for. */
const lineOf = script => script.match(/^(?:set )?line[= ]'([^']*)'$/m)[1];

test('what a shell, sed or Lua would read as its own is percent-encoded in both addresses', () => {
  assert.equal(quotable(`a'b"c\\d|e&f`), 'a%27b%22c%5Cd%7Ce%26f');
  // The page's query goes, so its `&` never reaches the script; one in a path is encoded.
  const base = explorerAddress("https://host/o'brien/a&b|c/?x=1&y='2'#wireshark");
  assert.equal(base, 'https://host/o%27brien/a%26b%7Cc/');
  const from = "https://host/o'brien/a&b|c/plugin/seanchai_diameter.lua";
  const encoded = 'https://host/o%27brien/a%26b%7Cc/plugin/seanchai_diameter.lua';
  assert.equal(posixInstall(base, from), posix(marked(base), encoded));
  assert.equal(fishInstall(base, from), fish(marked(base), encoded));
  for (const build of [posixInstall, fishInstall]) {
    assert.equal(build("https://host/'", "https://host/'"), build('https://host/%27', 'https://host/%27'));
    assert.equal(build('https://h/a\\b"c', 'https://h/'), build('https://h/a%5Cb%22c', 'https://h/'));
    assert.equal(build('https://host/\n', 'https://host/plugin'), null);
    assert.equal(build('https://host/', 'https://host/\t'), null);
    // A `$`, `!` or `*` is left as it is: in single quotes, and expanded into sed and grep, no shell reads it.
    const odd = build('https://host/a$b!c*/', 'https://host/a$b!c*/p');
    assert.equal(lineOf(odd), marked('https://host/a$b!c*/'));
    assert.match(odd, /'https:\/\/host\/a\$b!c\*\/p'/);
  }
  // Both scripts set the same line, which sed writes as it is, with no `&`, `\` or `|` in it, and the download writes.
  const [posixLine, fishLine] = [posixInstall(base, from), fishInstall(base, from)].map(lineOf);
  assert.equal(posixLine, fishLine);
  assert.doesNotMatch(posixLine, /[&\\|']/);
  const download = withExplorer(plugin, base);
  assert.ok(download.written);
  assert.ok(download.text.split('\n').includes(posixLine));
  for (const script of [posixInstall(base, from), fishInstall(base, from)]) {
    // Each literal is closed where it was opened: the quotes pair up with nothing inside them but the script's own.
    assert.equal(script.split("'").length % 2, 1);
    assert.ok(script.endsWith('\n'));
  }
});
