// The Wireshark plugin's page and the rewrite of its download's explorer address.
import assert from 'node:assert/strict';
import { resolveObjectURL } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { WIRESHARK, namesDocument, parseRoute } from '../../src/navigation.ts';
import {
  directInstall,
  explorerAddress,
  explorerAddresses,
  explorerEntry,
  explorerOf,
  explorerProblem,
  fishInstall,
  isOwnAddress,
  generateCommand,
  pluginVersions,
  posixInstall,
  normalAddress,
  quotable,
  resolveInstallShell,
  sameAddress,
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
    [plugin.replace(MARKED, ''), 'no explorer URL marker found in plugin file'],
    [plugin.replace(MARKED, `${MARKED}\n${MARKED}`), 'found 2 explorer URL markers instead of 1'],
    [plugin.replace(MARKED, `${MARKED} `), 'no explorer URL marker found in plugin file'],
    [plugin.replace(MARKED, `  ${MARKED}`), 'no explorer URL marker found in plugin file'],
    [plugin.replace(MARKED, marked('a"b')), 'no explorer URL marker found in plugin file'],
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
  assert.equal(pluginVersions(plugin), 'seanchai 0.2.0, corpus 2026.11.12');
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
    assert.equal(document.querySelector('.plugin-title .versions').textContent, 'seanchai 0.2.0, corpus 2026.11.12');
    assert.ok(page.fetched.includes('plugin/seanchai_diameter.lua'));
    assert.deepEqual(
      [...document.querySelectorAll('main h2')].map(node => node.textContent),
      ['Install from a terminal (Linux and macOS)', 'Manual install (any system)'],
    );
    assert.deepEqual(
      [...document.querySelectorAll('main a')].map(a => a.href),
      [],
      'no link to documentation elsewhere: the page says what it needs',
    );
    const from = 'http://localhost/plugin/seanchai_diameter.lua';
    const command = document.querySelector('.plugin-command code');
    assert.equal(command.textContent, posixInstall('http://localhost/', from));
    assert.equal(document.querySelectorAll('.plugin-command').length, 1, 'Linux only');
    assert.equal(
      document.querySelector('main').textContent,
      [
        'Wireshark plugin',
        'seanchai 0.2.0, corpus 2026.11.12',
        "Validates every Diameter message in a capture against the corpus: AVPs, flags, lengths, values, and command requirements. Each finding cites the relevant section, table, and page, with links to the publisher's copy and to this site.",
        'Each finding is one line under the message, on the octets it is about, in the form Severity: place: problem [source], as:',
        'Note: … > MIP-Home-Agent-Host > Destination-Realm: not epc.mnc<MNC>.mcc<MCC>.3gppnetwork.org [TS 29.272 7.3.43, interpreted]',
        'SeverityExpert infoMessages with oneReports',
        'Errorseanchai.violationseanchai.errors > 0Violated specification rules.',
        'Warningseanchai.warningseanchai.warnings > 0"Should not" rules broken, or undefined values.',
        'Noteseanchai.noteseanchai.notes > 0Incomplete corpus data, or an unknown AVP or command without the M bit.',
        'Noteseanchai.interpretedseanchai.interpretedViolated interpreted constraints; the source ends in "interpreted". Rules on the request an answer answers are checked only when the capture holds the request.',
        'Interpreted notes are counted in seanchai.notes, and the rules an answer leaves unchecked without its request in seanchai.request_missing. Requires Wireshark 4.2 or later, and also works with tshark: tshark -r capture.pcap -X lua_script:seanchai_diameter.lua -Y "seanchai.errors > 0".',
        "The plugin was built to link to https://sliva0.github.io/seanchai-explorer/, not this site, so the commands and the download below set this site's address in it.",
        'Install from a terminal (Linux and macOS)',
        'bash / zsh / sh',
        'fish',
        'Copy',
        posixInstall('http://localhost/', from),
        'Manual install (any system)',
        'Download seanchai_diameter.lua',
        'SystemFolder',
        'Linux and macOS~/.local/lib/wireshark/plugins/',
        'Windows%APPDATA%\\Wireshark\\plugins\\',
        'Restart Wireshark, or press Ctrl+Shift+L to reload Lua plugins.',
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
    assert.equal(copyButton.getAttribute('aria-label'), 'Copy commands');
    click(page, copyButton);
    await page.settle();
    assert.deepEqual(copied, [fishInstall('http://localhost/', from)]);
    assert.ok(copied[0].endsWith('"Installed $file"\n'), 'the last line runs when pasted');
    const copyStatus = document.querySelector('.copy-status');
    assert.equal(copyStatus.getAttribute('role'), 'status');
    assert.equal(copyStatus.textContent, 'Copied');
    assert.ok(copyStatus.classList.contains('sr-only'), 'announced, not shown');
    assert.equal(copyButton.textContent, 'Copied', 'said on the button, where the reader looks');
    const shown = element =>
      [...element.childNodes]
        .map(node => (node.nodeType !== 1 ? node.textContent : node.classList.contains('sr-only') ? '' : shown(node)))
        .join(' ');
    const bar = document.querySelector('.plugin-command-bar');
    assert.equal(shown(bar).match(/Copied/g)?.length, 1, 'shown once');
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => Promise.reject(new Error('denied')) },
    });
    click(page, copyButton);
    await page.settle();
    assert.equal(copyStatus.textContent, 'Selected — press Ctrl+C to copy');
    assert.ok(!copyStatus.classList.contains('sr-only'), 'shown');
    assert.equal(copyButton.textContent, 'Copy', 'said once, in the status line');
    assert.equal(shown(bar).match(/Ctrl\+C/g)?.length, 1);
    document.execCommand = () => true;
    click(page, copyButton);
    await page.settle();
    assert.equal(
      copyStatus.textContent,
      'Copied',
      "with no clipboard API, as over plain HTTP, the document's own copy does it",
    );
    delete document.execCommand;
    click(page, copyButton);
    await page.settle();
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
      'Saved with original links (could not update site URL: no explorer URL marker found in plugin file).',
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
    assert.equal(
      offer.querySelector('p').textContent,
      'The Wireshark plugin is not included in this build. Generate it with:',
    );
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
    assert.equal(document.querySelector('.plugin-status').textContent, 'Download failed');
    const notice = document.querySelector('#notices .notice');
    assert.match(
      notice.textContent,
      /^Could not download the Wireshark plugin\. Error: 503: plugin\/seanchai_diameter\.lua/,
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
  sed "s|^local EXPLORER = .* -- seanchai:explorer\\$|$line|" "$file.part" > "$file.new" &&
  grep -qxF "$line" "$file.new" &&
  mv "$file.new" "$file" &&
  rm -f "$file.part" &&
  echo "Installed $file"
`;

const fish = (line, from) => `set file ~/.local/lib/wireshark/plugins/seanchai_diameter.lua
set line '${line}'

mkdir -p ~/.local/lib/wireshark/plugins
and curl -fsSL -o $file.part '${from}'
and sed "s|^local EXPLORER = .* -- seanchai:explorer\\$|$line|" $file.part > $file.new
and grep -qxF $line $file.new
and mv $file.new $file
and rm -f $file.part
and echo "Installed $file"
`;

test('each install script downloads beside the plugin, checks the address is set, and only then replaces it', () => {
  assert.equal(
    posixInstall('https://host/', 'https://host/plugin/seanchai_diameter.lua'),
    `file=~/.local/lib/wireshark/plugins/seanchai_diameter.lua
line='local EXPLORER = "https://host/" -- seanchai:explorer'

mkdir -p ~/.local/lib/wireshark/plugins &&
  curl -fsSL -o "$file.part" 'https://host/plugin/seanchai_diameter.lua' &&
  sed "s|^local EXPLORER = .* -- seanchai:explorer\\$|$line|" "$file.part" > "$file.new" &&
  grep -qxF "$line" "$file.new" &&
  mv "$file.new" "$file" &&
  rm -f "$file.part" &&
  echo "Installed $file"
`,
  );
  assert.equal(
    fishInstall('https://host/', 'https://host/plugin/seanchai_diameter.lua'),
    `set file ~/.local/lib/wireshark/plugins/seanchai_diameter.lua
set line 'local EXPLORER = "https://host/" -- seanchai:explorer'

mkdir -p ~/.local/lib/wireshark/plugins
and curl -fsSL -o $file.part 'https://host/plugin/seanchai_diameter.lua'
and sed "s|^local EXPLORER = .* -- seanchai:explorer\\$|$line|" $file.part > $file.new
and grep -qxF $line $file.new
and mv $file.new $file
and rm -f $file.part
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

test('two addresses are one site only exactly, a closing slash and a default port apart', () => {
  for (const [a, b] of [
    ['https://host/sub/', 'https://host/sub'],
    ['https://host/sub/', 'https://HOST:443/sub/'],
    ['http://host:80/', 'http://host'],
    ['https://host/sub/', 'https://host/sub/#wireshark'],
    ['https://host/sub/', 'https://host/sub/?q=1'],
    ['http://192.168.3.3:4173/', 'http://192.168.3.3:4173'],
    ["https://host/o'b/", 'https://host/o%27b/'],
  ])
    assert.ok(sameAddress(a, b), `${a} is ${b}`);
  for (const [a, b] of [
    ['https://host/', 'http://host/'],
    ['https://www.host/', 'https://host/'],
    ['https://host/', 'https://host:8443/'],
    ['http://host:8080/', 'http://host/'],
    ['https://host/sub/', 'https://host/'],
    ['https://host/sub/', 'https://host/sub/index.html'],
    ['https://host/sub/', 'https://host/other/'],
    ['https://host/', 'https://other/'],
    ['', ''],
    ['', 'https://host/'],
    ['ftp://host/', 'ftp://host/'],
    [null, 'https://host/'],
    [undefined, undefined],
  ])
    assert.ok(!sameAddress(a, b), `${a} is not ${b}`);
  assert.equal(normalAddress('https://Host:443/a/b'), 'https://host/a/b/');
  assert.equal(normalAddress('https://host/index.html'), 'https://host/index.html');
  assert.equal(normalAddress('not a url'), null);
});

test("the plugin's marked line gives the address it links to, empty or none", () => {
  assert.equal(explorerOf(plugin), 'https://sliva0.github.io/seanchai-explorer/');
  assert.equal(explorerOf(plugin.replace(MARKED, marked(''))), '');
  assert.equal(explorerOf(plugin.replace(MARKED, '')), null);
  assert.equal(explorerOf(plugin.replace(MARKED, `${MARKED}\n${MARKED}`)), null);
  assert.equal(explorerOf(plugin.replace(MARKED, `${MARKED} `)), null);
});

test("each of a build's addresses is an http(s) URL the plugin's line can hold, written with a closing slash", () => {
  assert.deepEqual(explorerEntry('https://example.org/explorer'), { address: 'https://example.org/explorer/' });
  assert.deepEqual(explorerEntry('http://Example.org:80'), { address: 'http://example.org/' });
  assert.deepEqual(explorerEntry('https://example.org:8443/x/'), { address: 'https://example.org:8443/x/' });
  assert.deepEqual(explorerEntry("https://example.org/o'b/"), { address: 'https://example.org/o%27b/' });
  for (const [raw, problem] of [
    ['https://example.org/"/', 'characters'],
    ['https://example.org/\\', 'characters'],
    ['https://example.org/\n', 'characters'],
    ['example.org/explorer/', 'url'],
    ['', 'url'],
    ['ftp://example.org/', 'scheme'],
    ['javascript:alert(1)', 'scheme'],
    ['https://user:secret@example.org/', 'credentials'],
    ['https://example.org/?x=1', 'query'],
    ['https://example.org/#wireshark', 'query'],
    ['https://example.org/?', 'query'],
  ])
    assert.deepEqual(explorerEntry(raw), { problem }, raw);
});

test('the one command installing a plugin that links here already writes the file as served', () => {
  assert.equal(
    directInstall('https://host/plugin/seanchai_diameter.lua'),
    "curl -fsSL --create-dirs \\\n  -o ~/.local/lib/wireshark/plugins/seanchai_diameter.lua \\\n  'https://host/plugin/seanchai_diameter.lua'\n",
  );
  assert.ok(directInstall("https://host/o'b/plugin/seanchai_diameter.lua").includes("'https://host/o%27b/plugin/"));
  assert.equal(directInstall('https://host/\u0007'), null);
});

test("a build's addresses are a JSON array of URLs or one URL, each normal and once, the first the plugin's", () => {
  assert.deepEqual(explorerAddresses('["http://abcdef:9001/seanchai", "http://172.28.2.3:9001/seanchai"]'), {
    addresses: ['http://abcdef:9001/seanchai/', 'http://172.28.2.3:9001/seanchai/'],
  });
  assert.deepEqual(explorerAddresses(' https://example.org/explorer '), {
    addresses: ['https://example.org/explorer/'],
  });
  assert.deepEqual(
    explorerAddresses('["https://a.example/x", "https://A.example:443/x/", "https://b.example/"]'),
    { addresses: ['https://a.example/x/', 'https://b.example/'] },
    'an address given twice, once',
  );
  for (const [raw, refused] of [
    ['[]', { problem: 'list' }],
    ['["https://a.example/", 3]', { problem: 'list' }],
    ['{"url": "https://a.example/"}', { problem: 'characters', entry: '{"url": "https://a.example/"}' }],
    ['[https://a.example/]', { problem: 'list' }],
    ['https://a.example/, https://b.example/', { problem: 'several', entry: 'https://a.example/, https://b.example/' }],
    ['https://a.example/,https://b.example/', { problem: 'several', entry: 'https://a.example/,https://b.example/' }],
    ['["https://a.example/", "ftp://b.example/"]', { problem: 'scheme', entry: 'ftp://b.example/' }],
    ['["https://a.example/?x"]', { problem: 'query', entry: 'https://a.example/?x' }],
  ])
    assert.deepEqual(explorerAddresses(raw), refused, raw);
  assert.equal(
    explorerProblem('["https://a.example/", "ftp://b.example/"]', { problem: 'scheme', entry: 'ftp://b.example/' }),
    'SEANCHAI_EXPLORER_URLS "[\\"https://a.example/\\", \\"ftp://b.example/\\"]" cannot be the site\'s addresses: no http or https URL in "ftp://b.example/"',
  );
  const own = ['http://abcdef:9001/seanchai/', 'http://172.28.2.3:9001/seanchai/'];
  assert.ok(isOwnAddress('http://abcdef:9001/seanchai', own), 'the first');
  assert.ok(isOwnAddress('http://172.28.2.3:9001/seanchai/', own), 'a later one');
  assert.ok(!isOwnAddress('https://172.28.2.3:9001/seanchai/', own), 'none');
  assert.ok(!isOwnAddress('http://abcdef:9001/', own), 'none');
  assert.ok(!isOwnAddress('http://abcdef:9001/seanchai/', []), 'a build with none');
});

/**
 * Boots the page with the build's own addresses and the served file's line naming one; they are the build's until
 * the page closes.
 */
async function bootAt(constant, line, options = {}) {
  const before = globalThis.SEANCHAI_EXPLORER_ADDRESSES;
  globalThis.SEANCHAI_EXPLORER_ADDRESSES = typeof constant === 'string' ? (constant ? [constant] : []) : constant;
  const page = await boot({
    hash: '#wireshark',
    transform: (path, data) => (path.startsWith('plugin/') ? data.replace(MARKED, line) : data),
    ...options,
  });
  const close = page.close;
  page.close = async () => {
    globalThis.SEANCHAI_EXPLORER_ADDRESSES = before;
    await close.call(page);
  };
  return page;
}

test('a plugin built for the site showing the page is offered as served: one command and a plain download', async () => {
  const page = await bootAt('http://localhost', marked('http://localhost/'));
  try {
    const { document } = page;
    await page.settle();
    absent(document.querySelector('.plugin-elsewhere'), 'no step to explain');
    absent(document.querySelector('.shell-choice input'), 'one command for every shell');
    const from = 'http://localhost/plugin/seanchai_diameter.lua';
    assert.equal(document.querySelector('.plugin-command code').textContent, directInstall(from));
    assert.equal(document.querySelector('.plugin-command-bar button').getAttribute('aria-label'), 'Copy command');
    const link = document.querySelector('.plugin-download a[download]');
    assert.equal(link.getAttribute('download'), 'seanchai_diameter.lua');
    assert.equal(link.href, from);
    assert.equal(link.textContent, 'Download seanchai_diameter.lua');
    absent(downloadButton(document) ?? null, 'no rewriting download');
    assert.deepEqual(
      [...document.querySelectorAll('main h2')].map(node => node.textContent),
      ['Install from a terminal (Linux and macOS)', 'Manual install (any system)'],
    );
    present(document.querySelector('.plugin-folders'));
  } finally {
    await page.close();
  }
});

test('viewed at a later one of its addresses, a build offers the plugin as served, still linking to its first', async () => {
  const own = ['http://abcdef:9001/seanchai/', 'http://localhost/'];
  const page = await bootAt(own, marked('http://abcdef:9001/seanchai/'));
  try {
    const { document } = page;
    await page.settle();
    absent(document.querySelector('.plugin-elsewhere'));
    assert.equal(
      document.querySelector('.plugin-command code').textContent,
      directInstall('http://localhost/plugin/seanchai_diameter.lua'),
    );
    present(document.querySelector('.plugin-download a[download]'));
  } finally {
    await page.close();
  }
  const other = await bootAt(
    ['http://abcdef:9001/seanchai/', 'http://172.28.2.3:9001/seanchai/'],
    marked('http://abcdef:9001/seanchai/'),
  );
  try {
    const { document } = other;
    await other.settle();
    present(downloadButton(document), 'at none of them, the address set as before');
    assert.equal(
      document.querySelector('.plugin-elsewhere').textContent,
      "The plugin was built to link to http://abcdef:9001/seanchai/, not this site, so the commands and the download below set this site's address in it.",
    );
  } finally {
    await other.close();
  }
});

test('where the build and the served file disagree on the site, or either is another, the page sets this one', async () => {
  for (const [constant, line, said] of [
    ['http://localhost/', marked('https://example.org/'), 'https://example.org/'],
    ['https://example.org/', marked('http://localhost/'), null],
    ['http://localhost/', marked(''), ''],
    ['http://localhost/', '', null],
    ['', marked('http://localhost/'), null],
    ['https://localhost/', marked('https://localhost/'), 'https://localhost/'],
    [['https://example.org/', 'http://localhost/'], marked('http://localhost/'), null],
  ]) {
    const page = await bootAt(constant, line);
    try {
      const { document } = page;
      await page.settle();
      const what = `${constant} and ${JSON.stringify(line)}`;
      present(downloadButton(document), what);
      absent(document.querySelector('.plugin-download a[download]'), what);
      assert.equal(
        document.querySelector('.plugin-command code').textContent,
        posixInstall('http://localhost/', 'http://localhost/plugin/seanchai_diameter.lua'),
        what,
      );
      const note = document.querySelector('.plugin-elsewhere')?.textContent ?? null;
      assert.equal(
        note,
        said === null
          ? null
          : said
            ? `The plugin was built to link to ${said}, not this site, so the commands and the download below set this site's address in it.`
            : "The plugin was built to link to no site, so the commands and the download below set this site's address in it.",
        what,
      );
    } finally {
      await page.close();
    }
  }
});

test('until the file says what site it links to, a build saying it is this one offers nothing it might take back', async () => {
  let release;
  const held = new Promise(resolve => (release = resolve));
  const page = await bootAt('http://localhost/', marked('http://localhost/'), {
    serve: async path => (path.startsWith('plugin/') ? (await held, undefined) : undefined),
  });
  try {
    const { document } = page;
    absent(document.querySelector('.plugin-command'), 'no command yet');
    absent(downloadButton(document) ?? null);
    absent(document.querySelector('.plugin-download a'));
    present(document.querySelector('.plugin-then'), 'the rest of the page is there');
    release();
    await page.settle();
    present(document.querySelector('.plugin-download a[download]'));
  } finally {
    await page.close();
  }
});

test('where the file cannot be read, a build saying it is this site falls back to setting the address', async () => {
  const page = await bootAt('http://localhost/', marked('http://localhost/'), {
    serve: async path => (path.startsWith('plugin/') ? { ok: false, status: 500 } : undefined),
  });
  try {
    const { document } = page;
    await page.settle();
    present(downloadButton(document));
    absent(document.querySelector('.plugin-download a[download]'));
    absent(document.querySelector('.plugin-elsewhere'), 'nothing it cannot tell');
  } finally {
    await page.close();
  }
});
