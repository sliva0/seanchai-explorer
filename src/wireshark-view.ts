import { siteURL } from './data.ts';
import type { Site } from './data.ts';
import { element } from './dom.ts';
import { attempt } from './notice.ts';
import {
  PLUGIN_NAME,
  PLUGIN_PATH,
  explorerAddress,
  fishInstall,
  generateCommand,
  pluginVersions,
  posixInstall,
  resolveInstallShell,
  withExplorer,
} from './plugin-file.ts';
import type { InstallShell } from './plugin-file.ts';
import { readStored, writeStored } from './storage.ts';

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

/** A block of shell text, its lines as they are. */
function codeBlock(text: string): HTMLPreElement {
  const pre = element('pre');
  pre.append(element('code', text));
  return pre;
}

/** A path that wraps after a separator, where it still reads as one, and nowhere else. */
function path(text: string): HTMLElement {
  const node = element('code', undefined, 'path');
  for (const part of text.split(/(?<=[/\\])/)) node.append(element('span', part), element('wbr'));
  node.lastChild?.remove();
  return node;
}

/** A status line, said as it changes: a live region is announced only if it was there before its text. */
function liveStatus(className: string): HTMLElement {
  const status = element('span', undefined, className);
  status.setAttribute('role', 'status');
  return status;
}

/**
 * Puts `text` on the clipboard and says so on the button itself, where the reader is looking, and in `status`. A page
 * not served over HTTPS, as a copy on a LAN is, has no clipboard API: the script is selected and copied by the
 * document's own copy command, and where that is refused too it stays selected for the reader's copy key.
 */
async function copy(text: string, node: HTMLElement, status: HTMLElement, button: HTMLElement) {
  let copied = true;
  try {
    await window.navigator.clipboard.writeText(text);
  } catch {
    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    try {
      copied = document.execCommand('copy');
    } catch {
      copied = false;
    }
    if (copied) selection?.removeAllRanges();
  }
  status.textContent = copied ? 'Copied' : 'Selected: press Ctrl+C';
  button.textContent = copied ? 'Copied' : 'Press Ctrl+C';
  clearTimeout(Number(button.dataset.reset));
  button.dataset.reset = String(setTimeout(() => (button.textContent = 'Copy'), 2000));
}

const SHELLS = [
  ['posix', 'bash / zsh / sh', posixInstall],
  ['fish', 'fish', fishInstall],
] as const;

/**
 * The Linux way: a choice of shell, kept for the next visit, and its script with a Copy button, or none where the
 * address cannot be quoted for a shell.
 */
function linuxInstall(address: string): HTMLElement[] {
  const plugin = siteURL(PLUGIN_PATH).href;
  const scripts = new Map<InstallShell, string>();
  for (const [shell, , build] of SHELLS) {
    const script = build(address, plugin);
    if (script) scripts.set(shell, script);
  }
  if (scripts.size !== SHELLS.length) return [];
  let current = resolveInstallShell(readStored('installShell'));
  const text = element('code');
  const show = () => {
    text.textContent = scripts.get(current) ?? '';
  };
  show();

  const group = element('div', undefined, 'shell-choice');
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', 'Shell');
  for (const [shell, label] of SHELLS) {
    const option = element('label', label, 'visibility-toggle');
    const input = element('input');
    input.type = 'radio';
    input.name = 'install-shell';
    input.value = shell;
    // What the browser would restore on a reload is the stored choice's to say.
    input.autocomplete = 'off';
    input.checked = shell === current;
    input.onchange = () => {
      if (!input.checked) return;
      current = shell;
      writeStored('installShell', shell);
      status.textContent = '';
      show();
    };
    option.prepend(input);
    group.append(option);
  }
  const status = liveStatus('copy-status');
  const button = element('button', 'Copy', 'control');
  button.type = 'button';
  button.setAttribute('aria-label', 'Copy the script');
  button.onclick = () => void copy(text.textContent, text, status, button);
  const bar = element('div', undefined, 'plugin-command-bar');
  bar.append(group, status, button);
  const pre = element('pre', undefined, 'plugin-command');
  pre.append(text);
  return [element('h2', 'Linux'), bar, pre];
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

/** The Wireshark plugin's page: its versions, its install script and download set to link to this site. Drawn once. */
export function renderWireshark(container: HTMLElement, site: Site, isCurrent: () => boolean) {
  const address = explorerAddress(location.href);
  const heading = element('h1', 'Wireshark plugin');
  heading.tabIndex = -1;
  const versions = element('span', undefined, 'versions');
  const { corpus_version: corpus, seanchai_version: seanchai } = site.index;
  const showVersions = (said: string | null) => {
    versions.textContent =
      said ?? [seanchai && `seanchai ${seanchai}`, corpus && `corpus ${corpus}`].filter(Boolean).join(', ');
  };
  showVersions(null);
  const title = element('div', undefined, 'plugin-title');
  title.append(heading, versions);

  const button = element('button', `Download ${PLUGIN_NAME}`, 'control');
  button.type = 'button';
  const status = liveStatus('plugin-status');
  const offer = element('div', undefined, 'plugin-download');
  offer.append(button, status);
  const linux = linuxInstall(address);
  const ways = element('section', undefined, 'plugin-ways');
  ways.setAttribute('aria-label', 'Install');
  ways.append(...linux, element('h2', linux.length ? 'Other systems' : 'Install'), offer, folderTable());

  function showMissing() {
    ways.replaceChildren(
      element('p', 'Not in this build. Generate it with:'),
      codeBlock(generateCommand(address)),
      folderTable(),
    );
  }

  let held: string | undefined;
  let busy = false;
  async function download() {
    busy = true;
    button.setAttribute('aria-disabled', 'true');
    status.classList.remove('plugin-warning');
    status.textContent = 'Fetching…';
    try {
      held ??= (await fetchPlugin())?.text;
      if (!isCurrent()) return;
      if (held === undefined) {
        showMissing();
        return;
      }
      const rewrite = withExplorer(held, address);
      save(rewrite.text);
      if (rewrite.written) status.textContent = 'Saved';
      else {
        status.classList.add('plugin-warning');
        status.textContent = `Saved as built, since ${rewrite.reason}: its links keep the address it was generated with.`;
      }
    } catch (error) {
      status.textContent = 'Failed';
      throw error;
    } finally {
      busy = false;
      button.removeAttribute('aria-disabled');
    }
  }
  button.onclick = () => {
    if (!busy) attempt('Could not fetch the Wireshark plugin', download);
  };

  container.replaceChildren(title, ways, element('p', 'Then restart Wireshark, or press Ctrl+Shift+L.', 'plugin-then'));

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
