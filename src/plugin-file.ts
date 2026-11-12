// The Wireshark plugin `seanchai wireshark-plugin` writes, as the page offering it reads and rewrites it.

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
 * download and the install scripts write the same address.
 */
export function explorerAddress(href: string): string {
  const url = new URL(href);
  url.hash = '';
  url.search = '';
  return quotable(url.href);
}

/** Where Wireshark looks for a reader's own Lua plugins on Linux, as a path the shell expands. */
const PERSONAL_PLUGINS = '~/.local/lib/wireshark/plugins';

/** The shells an install script is written for: `posix` for dash, bash and zsh, the default. */
export type InstallShell = 'posix' | 'fish';

export function resolveInstallShell(stored: unknown): InstallShell {
  return stored === 'fish' ? 'fish' : 'posix';
}

/**
 * What both install scripts set before their steps, `file` and `line`, as each is used more than once, and the
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
 * The script installing or updating the plugin from `plugin`, its links set to `address`, for dash, bash and zsh, as
 * it reads pasted or run with `sh -c`. It downloads beside the plugin, to a `.part` file Wireshark never loads, as it
 * loads only files ending `.lua`; sets the address on the marked line there and checks, a whole line and fixed string,
 * that it is set, which a file without the marked line or with CRLF endings fails; and only then moves it over the
 * installed plugin, in one rename. Each step ends in `&&`, which carries the chain to the next line, so a failed one
 * stops the rest, prints nothing of its own and leaves the plugin as it was; the last says it is installed. Its
 * `sed -i` is GNU's, as Linux has. The replacement is the line itself, which `quotable` leaves no `&`, `\` or `|` sed
 * would read; `\$` in double quotes is the pattern's own `$`. The `~` of `file=~/…` expands, as the start of an
 * assignment's value. Ends with a newline, so the last line runs when pasted.
 */
export function posixInstall(address: string, plugin: string): string | null {
  const values = installValues(address, plugin);
  if (!values) return null;
  return `file=${values.file}
line='${values.line}'

mkdir -p ${PERSONAL_PLUGINS} &&
  curl -fsSL -o "$file.part" '${values.url}' &&
  sed -i "s|^local EXPLORER = .* -- seanchai:explorer\\$|$line|" "$file.part" &&
  grep -qxF "$line" "$file.part" &&
  mv "$file.part" "$file" &&
  echo "Installed $file"
`;
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
and sed -i "s|^local EXPLORER = .* -- seanchai:explorer\\$|$line|" $file.part
and grep -qxF $line $file.part
and mv $file.part $file
and echo "Installed $file"
`;
}

/** The versions the plugin was generated from, `seanchai 0.2.0, corpus 2026.11.11`, or null where it does not say. */
export function pluginVersions(text: string): string | null {
  return text.match(VERSIONS_LINE)?.[1].trim() || null;
}

export type Rewrite = { text: string; written: true } | { text: string; written: false; reason: string };

/**
 * The plugin with `address` as its default explorer, every other byte as it was. A file without exactly one marked
 * line, or an address a Lua string could not hold as it is, comes back unchanged with the reason.
 */
export function withExplorer(text: string, address: string): Rewrite {
  if (/["\\\p{Cc}]/u.test(address))
    return { text, written: false, reason: 'the address holds a quote, a backslash or a control character' };
  const lines = [...text.matchAll(EXPLORER_LINE)];
  if (lines.length !== 1)
    return {
      text,
      written: false,
      reason: lines.length ? `it has ${lines.length} explorer lines` : 'it has no explorer line',
    };
  const [line] = lines;
  const replaced = `local EXPLORER = "${address}" -- seanchai:explorer`;
  return { text: text.slice(0, line.index) + replaced + text.slice(line.index + line[0].length), written: true };
}
