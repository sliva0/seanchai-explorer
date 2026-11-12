// The Wireshark plugin `seanchai wireshark-plugin` writes, as the page offering it reads and rewrites it.

/** Where a build puts the plugin, beside the page, and the name it is saved as. */
export const PLUGIN_PATH = 'plugin/seanchai_diameter.lua';
export const PLUGIN_NAME = 'seanchai_diameter.lua';

/** The command making one, for a build without it. */
export const PLUGIN_COMMAND = "uvx --from 'seanchai[corpus]' seanchai wireshark-plugin -o seanchai_diameter.lua";

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
 * download and the install command write the same address.
 */
export function explorerAddress(href: string): string {
  const url = new URL(href);
  url.hash = '';
  url.search = '';
  return quotable(url.href);
}

/** Where Wireshark looks for a reader's own Lua plugins on Linux, as a path every shell expands. */
const PERSONAL_PLUGINS = '~/.local/lib/wireshark/plugins';

/**
 * One line installing or updating the plugin from `plugin`, its links set to `address`, that dash, bash, zsh and fish
 * all run as it is: nothing but `&&`, single-quoted literals and `~/` paths. It downloads beside the plugin, to a
 * `.part` file Wireshark never loads, as it loads only files ending `.lua`; sets the address there and checks, a whole
 * line and fixed string, that it is set, which a file without the marked line or with CRLF endings fails; and only
 * then moves it over the installed plugin, in one rename. A failed step prints nothing and leaves the plugin as it was;
 * the last says it is installed. Its `sed -i` is GNU's, as Linux has.
 *
 * The address is the same string in the sed replacement and in the grep: `quotable` leaves it no `'`, which would close
 * either's shell quotes, and no `&`, `\` or `|`, which sed would read in its replacement and grep's `-F` reads as they
 * are. Null where an address would still hold what the quotes cannot.
 */
export function installCommand(address: string, plugin: string): string | null {
  const [base, from] = [quotable(address), quotable(plugin)];
  if (/\p{Cc}/u.test(base + from)) return null;
  const file = `${PERSONAL_PLUGINS}/${PLUGIN_NAME}`;
  const part = `${file}.part`;
  const line = `local EXPLORER = "${base}" -- seanchai:explorer`;
  return [
    `mkdir -p ${PERSONAL_PLUGINS}`,
    `curl -fsSL -o ${part} '${from}'`,
    `sed -i 's|^local EXPLORER = .* -- seanchai:explorer$|${line}|' ${part}`,
    `grep -qxF '${line}' ${part}`,
    `mv ${part} ${file}`,
    `echo 'Installed ${PLUGIN_NAME}'`,
  ].join(' && ');
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
