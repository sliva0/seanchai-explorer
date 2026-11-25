// The Wireshark plugin `seanchai wireshark-plugin` writes, as the page offering it reads and rewrites it.
import { wiresharkPage } from './text/wireshark.ts';

/** Where a build puts the plugin, beside the page, and the name it is saved as. */
export const PLUGIN_PATH = 'plugin/seanchai_diameter.lua';
export const PLUGIN_NAME = 'seanchai_diameter.lua';

/** The command making one with its links set to `address`, for a build without it. */
export function generateCommand(address: string): string {
  return `uvx --from 'seanchai[corpus]' seanchai wireshark-plugin -o ${PLUGIN_NAME} --explorer '${quotable(address)}'`;
}

/** The one line holding the plugin's default explorer address, which the generator marks for a tool to rewrite. */
const EXPLORER_LINE = /^local EXPLORER = "[^"\\]*" -- seanchai:explorer$/gm;
const VERSIONS_LINE = /^-- seanchai:versions (.+)$/m;

/** What a URL may hold that a shell's single quotes, a sed replacement or a Lua string would read as its own. */
const UNQUOTABLE = /['"\\|&]/g;

/** `url` with what a shell, sed or Lua would read percent-encoded, which leaves the URL it names as it was. */
export function quotable(url: string): string {
  return url.replace(UNQUOTABLE, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

/**
 * The address the plugin's links start with, as `<address>#<document>/<clause>?name=…`: the page as served, without
 * its fragment, which is the route, or its query, which no route reads. A sub-path and a page named in it stay, so
 * `https://host/sub/` and `https://host/sub/index.html` each open the site where it is. It is `quotable`, so the
 * download and the install commands write the same address.
 */
export function explorerAddress(href: string): string {
  const url = new URL(href);
  url.hash = '';
  url.search = '';
  return quotable(url.href);
}

/**
 * An explorer address as two are compared and a build writes one: an http(s) URL without its fragment, which is the
 * route, or its query, which no route reads, its scheme and host in lower case and a port its scheme's default
 * dropped, as `URL` writes them, and a path naming no page ended by a slash, `https://host/sub` as `https://host/sub/`;
 * `quotable`, as the page's own address is. Null for anything else, as an empty line's `''`.
 */
export function normalAddress(address: string): string | null {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  url.hash = '';
  url.search = '';
  if (!url.pathname.endsWith('/') && !/\.html?$/i.test(url.pathname)) url.pathname += '/';
  return quotable(url.href);
}

/**
 * Whether two explorer addresses are the same site, exactly, once each is normal: a scheme, host, port or path
 * differing in anything but a closing slash or a default port is another site, `http:` and `https:`, `www.host` and
 * `host`, `/sub/` and `/sub/index.html` alike. An address that is no http(s) URL is the same as none.
 */
export function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  const [one, other] = [a, b].map(address => (address ? normalAddress(address) : null));
  return one !== null && one === other;
}

/** The address on the plugin's one marked line, `''` where it is empty; null where it has no such line, or several. */
export function explorerOf(text: string): string | null {
  const lines = [...text.matchAll(EXPLORER_LINE)];
  return lines.length === 1 ? lines[0][0].slice('local EXPLORER = "'.length, -'" -- seanchai:explorer'.length) : null;
}

/** Why an explorer address a build is given cannot be one, for the build's message: `list` for a list of no shape. */
export type ExplorerProblem = 'characters' | 'several' | 'url' | 'scheme' | 'credentials' | 'query' | 'list';

/**
 * One address a build is given as its own (`SEANCHAI_EXPLORER_URLS`), normal, or what is wrong with it: a double
 * quote, a backslash or a control character, which the plugin's marked line cannot hold; a space or a second `://`,
 * as of URLs listed otherwise than as a JSON array; no URL, or one of another
 * scheme than http(s); a user or password, which the plugin would show in every link; a query or a fragment, which
 * the links' routes would follow.
 */
export function explorerEntry(raw: string): { address: string } | { problem: ExplorerProblem } {
  if (/["\\\p{Cc}]/u.test(raw)) return { problem: 'characters' };
  if (/\s/u.test(raw) || raw.indexOf('://') !== raw.lastIndexOf('://')) return { problem: 'several' };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { problem: 'url' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { problem: 'scheme' };
  if (url.username || url.password) return { problem: 'credentials' };
  if (url.search || url.hash || raw.includes('?') || raw.includes('#')) return { problem: 'query' };
  return { address: normalAddress(raw)! };
}

/**
 * The addresses a build counts as its own, as `SEANCHAI_EXPLORER_URLS` gives them: a JSON array of URLs, or one URL
 * alone, each normal and once, in the order given; the first is the one the plugin's links go to. Else the first
 * thing wrong, with the entry it is wrong in: a list that is no JSON array of strings, or empty, is `list`.
 */
export function explorerAddresses(raw: string): { addresses: string[] } | { problem: ExplorerProblem; entry?: string } {
  const text = raw.trim();
  let entries: unknown = [text];
  if (text.startsWith('[')) {
    try {
      entries = JSON.parse(text);
    } catch {
      return { problem: 'list' };
    }
  }
  if (!Array.isArray(entries) || !entries.length || !entries.every(entry => typeof entry === 'string'))
    return { problem: 'list' };
  const addresses: string[] = [];
  for (const entry of entries as string[]) {
    const checked = explorerEntry(entry.trim());
    if ('problem' in checked) return { problem: checked.problem, entry };
    if (!addresses.includes(checked.address)) addresses.push(checked.address);
  }
  return { addresses };
}

/** What is wrong with each kind of address or list `explorerAddresses` refuses, for the build's message. */
const explorerProblems: Record<ExplorerProblem, string> = {
  characters: "a double quote, a backslash or a control character, which the plugin's line cannot hold",
  several:
    'what reads as several URLs: list them as a JSON array, as ["https://host/explorer/", "http://10.0.0.2/explorer/"]',
  url: 'no URL',
  scheme: 'no http or https URL',
  credentials: 'a user or a password, which every link of the plugin would show',
  query: "a query or a fragment, where the plugin's links put the route",
  list: 'neither a JSON array of URLs, as ["https://host/explorer/", "http://10.0.0.2/explorer/"], nor one URL',
};

/** The build's message for a `SEANCHAI_EXPLORER_URLS` refused: the value, the entry and what is wrong with it. */
export function explorerProblem(raw: string, { problem, entry }: { problem: ExplorerProblem; entry?: string }) {
  const where = entry === undefined || entry === raw.trim() ? '' : ` in ${JSON.stringify(entry)}`;
  return `SEANCHAI_EXPLORER_URLS ${JSON.stringify(raw)} cannot be the site's addresses: ${explorerProblems[problem]}${where}`;
}

/** Whether `address` is one of a build's own, exactly, once each is normal. */
export const isOwnAddress = (address: string, own: readonly string[]) => own.some(item => sameAddress(item, address));

/** Where Wireshark looks for a reader's own Lua plugins on Linux, as a path the shell expands. */
const PERSONAL_PLUGINS = '~/.local/lib/wireshark/plugins';

/** The shells the install commands are written for: `posix` for dash, bash and zsh, the default. */
export type InstallShell = 'posix' | 'fish';

export function resolveInstallShell(stored: unknown): InstallShell {
  return stored === 'fish' ? 'fish' : 'posix';
}

/**
 * What the install commands of both shells set before their steps, `file` and `line`, as each is used more than once, and the
 * plugin's address, used once: the marked line holds the address and goes in single quotes, as the address does, where
 * `quotable` leaves no `'` to close them and no `\`, which fish's would read. Expanded into sed's replacement and
 * grep's pattern, the line is not scanned again, so an address's `$` or `!` stays as it is. Null where an address would
 * still hold a control character.
 */
function installValues(address: string, plugin: string): { file: string; line: string; url: string } | null {
  const [site, url] = [quotable(address), quotable(plugin)];
  if (/\p{Cc}/u.test(site + url)) return null;
  return { file: `${PERSONAL_PLUGINS}/${PLUGIN_NAME}`, line: `local EXPLORER = "${site}" -- seanchai:explorer`, url };
}

/**
 * The commands installing or updating the plugin from `plugin`, its links set to `address`, for dash, bash and zsh, as
 * it reads pasted or run with `sh -c`. It downloads beside the plugin, to a `.part` file Wireshark never loads, as it
 * loads only files ending `.lua`; writes it with the address on the marked line to a `.new` file beside it and checks,
 * a whole line and fixed string, that it is set, which a file without the marked line or with CRLF endings fails; and
 * only then moves that over the installed plugin, in one rename, and removes the download. Each step ends in `&&`,
 * which carries the chain to the next line, so a failed one stops the rest, prints nothing of its own and leaves the
 * plugin as it was; the last says it is installed. Its `sed` edits no file in place, which GNU's and BSD's, as macOS
 * has, spell differently. The replacement is the line itself, which `quotable` leaves no `&`, `\` or `|` sed would
 * read; `\$` in double quotes is the pattern's own `$`. The `~` of `file=~/…` expands, as the start of an assignment's
 * value. Ends with a newline, so the last line runs when pasted.
 */
export function posixInstall(address: string, plugin: string): string | null {
  const values = installValues(address, plugin);
  if (!values) return null;
  return `file=${values.file}
line='${values.line}'

mkdir -p ${PERSONAL_PLUGINS} &&
  curl -fsSL -o "$file.part" '${values.url}' &&
  sed "s|^local EXPLORER = .* -- seanchai:explorer\\$|$line|" "$file.part" > "$file.new" &&
  grep -qxF "$line" "$file.new" &&
  mv "$file.new" "$file" &&
  rm -f "$file.part" &&
  echo "Installed $file"
`;
}

/**
 * The one command installing the plugin as served, for a plugin whose links are this site's already: curl makes the
 * folder and downloads beside the plugin, to a `.part` file Wireshark never loads, as it loads only files ending
 * `.lua`, and with `-f` writes nothing where the server refuses it; only once the download has ended well does `mv`
 * put it over the installed plugin, in one rename, so a dropped connection leaves the plugin as it was. The same in
 * dash, bash, zsh and fish, which all expand a word's leading `~`, run what follows `&&` only after a success and carry
 * a line ending in `\` on to the next, as it is written to fit its box. Null where the address would hold a control
 * character.
 */
export function directInstall(plugin: string): string | null {
  const url = quotable(plugin);
  if (/\p{Cc}/u.test(url)) return null;
  const file = `${PERSONAL_PLUGINS}/${PLUGIN_NAME}`;
  return `curl -fsSL --create-dirs \\\n  -o ${file}.part \\\n  '${url}' && \\\nmv ${file}.part \\\n  ${file}\n`;
}

/**
 * `posixInstall`'s steps for fish, each after the first led by `and`, which runs it only where the one before
 * succeeded. Its variables are never split, so they go unquoted.
 */
export function fishInstall(address: string, plugin: string): string | null {
  const values = installValues(address, plugin);
  if (!values) return null;
  return `set file ${values.file}
set line '${values.line}'

mkdir -p ${PERSONAL_PLUGINS}
and curl -fsSL -o $file.part '${values.url}'
and sed "s|^local EXPLORER = .* -- seanchai:explorer\\$|$line|" $file.part > $file.new
and grep -qxF $line $file.new
and mv $file.new $file
and rm -f $file.part
and echo "Installed $file"
`;
}

/** The versions the plugin was generated from, `seanchai 0.2.0, corpus 2026.11.12`, or null where it does not say. */
export function pluginVersions(text: string): string | null {
  return text.match(VERSIONS_LINE)?.[1].trim() || null;
}

export type Rewrite = { text: string; written: true } | { text: string; written: false; reason: string };

/**
 * The plugin with `address` as its default explorer, every other byte as it was. A file without exactly one marked
 * line, or an address a Lua string could not hold as it is, comes back unchanged with the reason.
 */
export function withExplorer(text: string, address: string): Rewrite {
  if (/["\\\p{Cc}]/u.test(address)) return { text, written: false, reason: wiresharkPage.badAddress };
  const lines = [...text.matchAll(EXPLORER_LINE)];
  if (lines.length !== 1)
    return {
      text,
      written: false,
      reason: lines.length ? wiresharkPage.explorerLines(lines.length) : wiresharkPage.noExplorerLine,
    };
  const [line] = lines;
  const replaced = `local EXPLORER = "${address}" -- seanchai:explorer`;
  return { text: text.slice(0, line.index) + replaced + text.slice(line.index + line[0].length), written: true };
}
