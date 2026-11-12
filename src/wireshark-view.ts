import { siteURL } from './data.ts';
import type { Site } from './data.ts';
import { element, externalLink } from './dom.ts';
import { attempt } from './notice.ts';
import {
  PLUGIN_COMMAND,
  PLUGIN_NAME,
  PLUGIN_PATH,
  explorerAddress,
  installCommand,
  pluginVersions,
  withExplorer,
} from './plugin-file.ts';

const ABOUT =
  "A Lua plugin for Wireshark that checks every Diameter message in a capture against the documents shown on this site. Under each finding it cites the clause, table and page its rule is written at, and links to the publisher's copy and to this site at that place.";

/** The plugin's own documentation: what it checks and how. */
const GUIDE = 'https://github.com/sliva0/seanchai/blob/main/docs/wireshark-plugin.md';

const FOLDERS = [
  ['Linux and macOS', '~/.local/lib/wireshark/plugins/'],
  ['Windows', '%APPDATA%\\Wireshark\\plugins\\'],
];

/** The head of the file, which holds its versions line: the page is shown without fetching all 1.5 MB. */
const HEAD_BYTES = 16384;

/** The plugin as the build serves it, or null where the build has none. `head` asks for its first bytes only. */
async function fetchPlugin(head = false): Promise<{ text: string; whole: boolean } | null> {
  const response = await fetch(
    siteURL(PLUGIN_PATH),
    head ? { headers: { Range: `bytes=0-${HEAD_BYTES - 1}` } } : undefined,
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`${response.status}: ${PLUGIN_PATH}`);
  // A byte-order mark is a byte of the file like the others, which the saved copy keeps.
  const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(await response.arrayBuffer());
  return { text, whole: response.status !== 206 };
}

/** One object URL at a time: the one before goes when the next is made, by when its download has long started. */
let saved: string | undefined;

function save(text: string) {
  if (saved) URL.revokeObjectURL(saved);
  saved = URL.createObjectURL(new Blob([text], { type: 'text/x-lua' }));
  const anchor = element('a');
  anchor.href = saved;
  anchor.download = PLUGIN_NAME;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

const code = (text: string) => element('code', text);

/** A path or address that wraps after a separator, where it still reads as one, and nowhere else. */
function path(text: string): HTMLElement {
  const node = element('code', undefined, 'path');
  for (const part of text.split(/(?<=[/\\])/)) node.append(element('span', part), element('wbr'));
  node.lastChild?.remove();
  return node;
}

function paragraph(...parts: (string | HTMLElement)[]): HTMLParagraphElement {
  const node = element('p');
  node.append(...parts);
  return node;
}

/**
 * Puts `text` on the clipboard and says so in `status`. Where the browser refuses, the command is selected instead,
 * for the reader's own copy key.
 */
async function copy(text: string, node: HTMLElement, status: HTMLElement) {
  try {
    await window.navigator.clipboard.writeText(text);
    status.textContent = 'Copied.';
  } catch {
    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    status.textContent = 'Selected: press Ctrl+C, or Cmd+C on a Mac, to copy it.';
  }
}

/** The Linux way: the one line, with a Copy button, or none where the address cannot be quoted for a shell. */
function linuxInstall(address: string): HTMLElement[] {
  const command = installCommand(address, siteURL(PLUGIN_PATH).href);
  if (!command) return [];
  const status = element('p', undefined, 'copy-status');
  status.setAttribute('role', 'status');
  const text = element('code', command);
  const pre = element('pre');
  pre.append(text);
  const button = element('button', 'Copy', 'control');
  button.type = 'button';
  button.setAttribute('aria-label', 'Copy the command');
  button.onclick = () => void copy(command, text, status);
  const block = element('div', undefined, 'plugin-command');
  block.append(pre, button);
  return [
    element('h2', 'Linux'),
    paragraph(
      "In a terminal, this line downloads the plugin into Wireshark's personal plugins folder and points its links at this site, replacing an installed plugin only once the download is complete and its links are set. Run it again to update.",
    ),
    block,
    status,
  ];
}

/** Where the file goes, by hand. */
function folders(): HTMLElement[] {
  return [
    folderTable(),
    paragraph('Wireshark names the folder under Help → About Wireshark → Folders, as "Personal Lua Plugins".'),
  ];
}

function folderTable(): HTMLTableElement {
  const table = element('table', undefined, 'plugin-folders');
  const head = element('thead');
  const names = element('tr');
  for (const name of ['System', 'Folder']) names.append(element('th', name));
  head.append(names);
  const body = element('tbody');
  for (const [system, folder] of FOLDERS) {
    const row = element('tr');
    const cell = element('td');
    cell.append(path(folder));
    row.append(element('th', system), cell);
    body.append(row);
  }
  table.append(head, body);
  return table;
}

function selfHostedNote(site: Site): HTMLParagraphElement {
  return site.mode === 'self-hosted'
    ? paragraph('This copy is self-hosted: the links open it, with the source PDF beside the text.')
    : paragraph(
        'A self-hosted copy of this site, built with ',
        code('npm run build:self-hosted'),
        ', also shows the source PDF beside the text: set the Explorer address to it and the links open there.',
      );
}

/** The Wireshark plugin's page: what it is, its download set to link to this site, and where it goes. Drawn once. */
export function renderWireshark(container: HTMLElement, site: Site, isCurrent: () => boolean) {
  const address = explorerAddress(location.href);
  const heading = element('h1', 'Wireshark plugin');
  heading.tabIndex = -1;
  const versions = element('p', undefined, 'versions');
  const { corpus_version: corpus, seanchai_version: seanchai } = site.index;
  const showVersions = (said: string | null) => {
    const built = said ?? [seanchai && `seanchai ${seanchai}`, corpus && `corpus ${corpus}`].filter(Boolean).join(', ');
    versions.textContent = built ? `Generated from ${built}.` : '';
  };
  showVersions(null);

  const button = element('button', `Download ${PLUGIN_NAME}`, 'control');
  button.type = 'button';
  // Said as it changes: a live region is announced only if it was there before its text.
  const status = element('p', undefined, 'plugin-status');
  status.setAttribute('role', 'status');
  const target = paragraph('Its links will open this site at ', path(address), '.');
  target.className = 'plugin-address';
  const offer = element('div', undefined, 'plugin-download');
  offer.append(button, status, target);
  const linux = linuxInstall(address);
  const ways = element('section', undefined, 'plugin-ways');
  ways.setAttribute('aria-label', 'Install');
  ways.append(
    ...linux,
    element('h2', linux.length ? 'Other systems' : 'Install'),
    paragraph("Download the file, its links set to this site, and put it in Wireshark's personal Lua plugins folder:"),
    offer,
    ...folders(),
  );

  function showMissing() {
    const command = element('pre');
    command.append(code(PLUGIN_COMMAND));
    ways.replaceChildren(
      element('h2', 'Install'),
      paragraph('The download is not part of this build. Generate the plugin with:'),
      command,
      paragraph(
        'and add ',
        code(`--explorer '${address}'`),
        " for its links to open this site. Put it in Wireshark's personal Lua plugins folder:",
      ),
      ...folders(),
    );
  }

  let held: string | undefined;
  let busy = false;
  async function download() {
    busy = true;
    button.setAttribute('aria-disabled', 'true');
    status.classList.remove('plugin-warning');
    status.textContent = 'Fetching the plugin…';
    try {
      held ??= (await fetchPlugin())?.text;
      if (!isCurrent()) return;
      if (held === undefined) {
        showMissing();
        return;
      }
      const rewrite = withExplorer(held, address);
      save(rewrite.text);
      if (rewrite.written) status.textContent = `Saved ${PLUGIN_NAME}, its links set to this site.`;
      else {
        status.classList.add('plugin-warning');
        status.textContent = `Saved ${PLUGIN_NAME} as it was built, since ${rewrite.reason}: its links go to the address it was generated with, not to this site.`;
      }
    } catch (error) {
      status.textContent = 'The download failed.';
      throw error;
    } finally {
      busy = false;
      button.removeAttribute('aria-disabled');
    }
  }
  button.onclick = () => {
    if (!busy) attempt('Could not fetch the Wireshark plugin', download);
  };

  const about = paragraph(ABOUT, ' See ', externalLink('what it checks', GUIDE), '.');
  container.replaceChildren(
    heading,
    about,
    versions,
    ways,
    element('h2', 'Use'),
    paragraph(
      'After installing or updating, restart Wireshark, or reload its Lua plugins with Ctrl+Shift+L. It needs Wireshark 4.2 or later.',
    ),
    paragraph('The display filter ', code('seanchai.errors > 0'), ' shows the messages with findings.'),
    paragraph(
      'The preferences are under Protocols → Seanchaí, among them "Explorer address" (',
      code('seanchai.explorer_url'),
      '), which can be pointed at another copy of this site.',
    ),
    selfHostedNote(site),
  );

  // Whether the build has the plugin, and what it was generated from, are in its first lines.
  void fetchPlugin(true).then(
    found => {
      if (!isCurrent()) return;
      if (!found) showMissing();
      else {
        if (found.whole) held = found.text;
        showVersions(pluginVersions(found.text));
      }
    },
    // The download says so with a Retry; until then the page offers it as if it were there.
    (error: unknown) => console.warn(error),
  );
}
