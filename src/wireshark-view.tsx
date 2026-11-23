import { Fragment } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { siteURL } from './data.ts';
import type { Site } from './data.ts';
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
  const anchor = document.createElement('a');
  anchor.href = saved;
  anchor.download = PLUGIN_NAME;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

/** A path that wraps after a separator, where it still reads as one, and nowhere else. */
function Path({ text }: { text: string }) {
  const parts = text.split(/(?<=[/\\])/);
  return (
    <code class="path">
      {parts.map((part, index) => (
        <Fragment key={index}>
          <span>{part}</span>
          {index < parts.length - 1 && <wbr />}
        </Fragment>
      ))}
    </code>
  );
}

/**
 * Puts `text` on the clipboard, and where there is no clipboard API, as on a page not served over HTTPS, selects
 * `node` and copies it with the document's own copy command; where that is refused too it stays selected for the
 * reader's copy key. Says whether it was copied.
 */
async function copy(text: string, node: HTMLElement): Promise<boolean> {
  try {
    await window.navigator.clipboard.writeText(text);
    return true;
  } catch {
    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    let copied: boolean;
    try {
      copied = document.execCommand('copy');
    } catch {
      copied = false;
    }
    if (copied) selection?.removeAllRanges();
    return copied;
  }
}

const SHELLS = [
  ['posix', 'bash / zsh / sh', posixInstall],
  ['fish', 'fish', fishInstall],
] as const;

/**
 * The terminal way: a choice of shell, kept for the next visit, and its commands with a Copy button, which says what
 * it did on itself, where the reader is looking, and in a status line. Nothing where the address cannot be quoted
 * for a shell.
 */
function TerminalInstall({ scripts }: { scripts: Map<InstallShell, string> }) {
  const [current, setCurrent] = useState(() => resolveInstallShell(readStored('installShell')));
  const [copied, setCopied] = useState<boolean | undefined>(undefined);
  const text = useRef<HTMLElement>(null);
  const reset = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(reset.current), []);
  const script = scripts.get(current) ?? '';
  const onCopy = async () => {
    const done = await copy(script, text.current!);
    setCopied(done);
    clearTimeout(reset.current);
    reset.current = setTimeout(() => setCopied(undefined), 2000);
  };
  return (
    <>
      <h2>Install from a terminal (Linux)</h2>
      <div class="plugin-command-bar">
        <div class="shell-choice" role="radiogroup" aria-label="Shell">
          {SHELLS.map(([shell, label]) => (
            <label key={shell} class="visibility-toggle">
              <input
                type="radio"
                name="install-shell"
                value={shell}
                // What the browser would restore on a reload is the stored choice's to say.
                autocomplete="off"
                checked={shell === current}
                onChange={event => {
                  if (!event.currentTarget.checked) return;
                  writeStored('installShell', shell);
                  setCurrent(shell);
                  setCopied(undefined);
                }}
              />
              {label}
            </label>
          ))}
        </div>
        {/* A live region is announced only if it was there before its text. */}
        <span class="copy-status" role="status">
          {copied === undefined ? '' : copied ? 'Copied' : 'Selected: press Ctrl+C'}
        </span>
        <button type="button" class="control" aria-label="Copy the commands" onClick={() => void onCopy()}>
          {copied === undefined ? 'Copy' : copied ? 'Copied' : 'Press Ctrl+C'}
        </button>
      </div>
      <pre class="plugin-command">
        <code ref={text}>{script}</code>
      </pre>
    </>
  );
}

function FolderTable() {
  return (
    <table class="plugin-folders">
      <thead>
        <tr>
          <th>System</th>
          <th>Folder</th>
        </tr>
      </thead>
      <tbody>
        {FOLDERS.map(([system, folder]) => (
          <tr key={system}>
            <th>{system}</th>
            <td>
              <Path text={folder} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** What the download says: nothing yet, under way, done, or saved as built with why. */
type Status = { text: string; warning?: boolean };

/** The Wireshark plugin's page: its versions, its install commands and download set to link to this site. */
export function WiresharkView({ site }: { site: Site }) {
  // Read once: the page's address does not change under it.
  const [address] = useState(() => explorerAddress(location.href));
  const [scripts] = useState(() => installScripts(address));
  const { corpus_version: corpus, seanchai_version: seanchai } = site.index;
  const [said, setSaid] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [status, setStatus] = useState<Status>({ text: '' });
  const [busy, setBusy] = useState(false);
  const held = useRef<string | undefined>(undefined);
  const live = useRef(true);

  // Whether the build has the plugin, and what it was generated from, are in its first lines.
  useEffect(() => {
    live.current = true;
    void fetchPlugin(true).then(
      found => {
        if (!live.current) return;
        if (!found) setMissing(true);
        else {
          if (found.whole) held.current = found.text;
          setSaid(pluginVersions(found.text));
        }
      },
      // The download says so with a Retry; until then the page offers it as if it were there.
      (error: unknown) => console.warn(error),
    );
    return () => {
      live.current = false;
    };
  }, []);

  async function download() {
    setBusy(true);
    setStatus({ text: 'Fetching…' });
    try {
      held.current ??= (await fetchPlugin())?.text;
      if (!live.current) return;
      if (held.current === undefined) {
        setMissing(true);
        return;
      }
      const rewrite = withExplorer(held.current, address);
      save(rewrite.text);
      setStatus(
        rewrite.written
          ? { text: 'Saved' }
          : {
              text: `Saved as built, since ${rewrite.reason}: its links keep the address it was generated with.`,
              warning: true,
            },
      );
    } catch (error) {
      if (live.current) setStatus({ text: 'Failed' });
      throw error;
    } finally {
      if (live.current) setBusy(false);
    }
  }

  return (
    <>
      <div class="plugin-title">
        <h1 tabIndex={-1}>Wireshark plugin</h1>
        <span class="versions">
          {said ?? [seanchai && `seanchai ${seanchai}`, corpus && `corpus ${corpus}`].filter(Boolean).join(', ')}
        </span>
      </div>
      <section class="plugin-ways" aria-label="Install">
        {missing ? (
          <>
            <p>Not in this build. Generate it with:</p>
            <pre>
              <code>{generateCommand(address)}</code>
            </pre>
            <FolderTable />
          </>
        ) : (
          <>
            {scripts && <TerminalInstall scripts={scripts} />}
            <h2>{scripts ? 'Install by hand (any system)' : 'Install by hand'}</h2>
            <div class="plugin-download">
              <button
                type="button"
                class="control"
                aria-disabled={busy ? 'true' : undefined}
                onClick={() => {
                  if (!busy) attempt('Could not fetch the Wireshark plugin', download);
                }}
              >
                {`Download ${PLUGIN_NAME}`}
              </button>
              <span class={status.warning ? 'plugin-status plugin-warning' : 'plugin-status'} role="status">
                {status.text}
              </span>
            </div>
            <FolderTable />
          </>
        )}
      </section>
      <p class="plugin-then">Then restart Wireshark, or press Ctrl+Shift+L.</p>
    </>
  );
}

/** Each shell's commands installing the plugin with its links set to `address`, or null where one cannot be written. */
function installScripts(address: string): Map<InstallShell, string> | null {
  const plugin = siteURL(PLUGIN_PATH).href;
  const scripts = new Map<InstallShell, string>();
  for (const [shell, , build] of SHELLS) {
    const script = build(address, plugin);
    if (script) scripts.set(shell, script);
  }
  return scripts.size === SHELLS.length ? scripts : null;
}
