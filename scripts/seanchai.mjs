// How the scripts here run Seanchaí and where its source documents are. See README.md.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const project = fileURLToPath(new URL('../', import.meta.url));

const parent = path.resolve(project, '../..');
/** The Seanchaí checkout this repository is inside at `.local/seanchai-explorer`, if it is: its `specifications/` is the default. */
export const checkout = existsSync(path.join(parent, 'editors/vscode/syntaxes/dad.tmLanguage.json')) ? parent : null;

/** A Seanchaí checkout to run instead of the pin: `SEANCHAI_ROOT`, only where it is set. */
export const rootOf = (env = process.env) => (env.SEANCHAI_ROOT ? path.resolve(env.SEANCHAI_ROOT) : null);
export const root = rootOf();

/**
 * The `seanchai` and `seanchai-corpus` a build runs, exactly, so that one commit always publishes one corpus:
 * `seanchai-release.json`, which the deploy workflow reads too. See README.md, "Building". Its versions are what the
 * export must name; with a `commit`, both packages come from that commit of `repository` rather than from PyPI.
 */
export const release = JSON.parse(readFileSync(path.join(project, 'seanchai-release.json'), 'utf8'));

/** The pin as a build's error or summary says it: its versions, and its commit where it names one. */
export const pinText = (pin = release) =>
  `seanchai ${pin.seanchai}, corpus ${pin['seanchai-corpus']}${pin.commit ? ` at ${pin.repository}@${pin.commit}` : ''}`;

/** The requirement `uvx` installs `name` by: the pinned version from PyPI, or the pinned commit's package. */
function requirement(pin, name, extras, subdirectory) {
  if (!pin.commit) return `${name}${extras}==${pin[name]}`;
  return `${name}${extras} @ git+${pin.repository}@${pin.commit}${subdirectory ? `#subdirectory=${subdirectory}` : ''}`;
}

/** `uvx`'s arguments running the pinned `seanchai`, with `extras` such as `corpus,extract`. */
export const releaseArgs = (extras = 'corpus', pin = release) => [
  '--from',
  requirement(pin, 'seanchai', `[${extras}]`),
  '--with',
  requirement(pin, 'seanchai-corpus', '', 'packages/seanchai-corpus'),
  'seanchai',
];

/**
 * The ways to run `seanchai` with `args`, in order. By default only the pinned release, through `uvx`, so that a build
 * from a plain checkout of this repository is the one `seanchai-release.json` names. `SEANCHAI_ROOT` runs that
 * checkout's working tree through `uv` instead, and `SEANCHAI_ON_PATH=1` the `seanchai` on `PATH`; `SEANCHAI_PINNED=1`
 * runs the pin whatever else is set. `pinned` is the pin's way: its export is the release's.
 */
export function seanchaiWays(args, { extract = false, env = process.env } = {}) {
  const pinned = {
    command: 'uvx',
    args: [...releaseArgs(extract ? 'corpus,extract' : 'corpus'), ...args],
    pinned: true,
  };
  if (env.SEANCHAI_PINNED === '1') return [pinned];
  const checkoutRoot = rootOf(env);
  if (checkoutRoot)
    return [
      {
        command: 'uv',
        args: ['run', '--project', checkoutRoot, ...(extract ? ['--extra', 'extract'] : []), 'seanchai', ...args],
        cwd: checkoutRoot,
      },
    ];
  if (env.SEANCHAI_ON_PATH === '1') return [{ command: 'seanchai', args }];
  return [pinned];
}

/**
 * Where `npm run sources` downloads the source documents: `SEANCHAI_SPECIFICATIONS`, else `specifications/` here. Never
 * a Seanchaí checkout's own by default: a download without conversion there would drop the documents it converted.
 */
export const downloads = path.resolve(process.env.SEANCHAI_SPECIFICATIONS ?? path.join(project, 'specifications'));

/**
 * The source documents a build reads, only reads: `SEANCHAI_SPECIFICATIONS`, else `specifications/` here if
 * `npm run sources` filled it, else the one of the checkout `SEANCHAI_ROOT` names or this repository is inside.
 */
export const specifications = process.env.SEANCHAI_SPECIFICATIONS
  ? downloads
  : ([downloads, ...[root, checkout].filter(Boolean).map(dir => path.join(dir, 'specifications'))].find(dir =>
      existsSync(dir),
    ) ?? downloads);

/**
 * Runs `seanchai` with `args` the first of `seanchaiWays` there is. Returns `spawnSync`'s result, with `pinned` where it
 * ran the pinned release, or null where there is no way at all. `extract` asks for what downloading the sources takes,
 * which a `seanchai` on `PATH` must have itself; `stdio: 'pipe'` keeps the output.
 */
export function runSeanchai(args, { extract = false, stdio = 'inherit' } = {}) {
  for (const way of seanchaiWays(args, { extract })) {
    const cwd = way.cwd ?? project;
    const result = spawnSync(way.command, way.args, { cwd, stdio, encoding: 'utf8' });
    if (result.error?.code === 'ENOENT') continue;
    if (result.error) throw result.error;
    return { ...result, pinned: Boolean(way.pinned) };
  }
  return null;
}

export const NO_SEANCHAI =
  'No way to run seanchai was found: install uv (https://docs.astral.sh/uv/) to run the pinned release, or set SEANCHAI_ROOT, SEANCHAI_ON_PATH=1 or SEANCHAI_EXPORT';

/** Runs `seanchai` as `runSeanchai` does, exits with its status if it fails, and says whether it ran the pinned release. */
export function seanchai(args, options) {
  const result = runSeanchai(args, options);
  if (!result) throw new Error(NO_SEANCHAI);
  if (result.status !== 0) process.exit(result.status ?? 1);
  return result.pinned;
}

/** The `seanchai` and corpus versions a plugin's `-- seanchai:versions` line names, or null where it names none. */
export function pluginVersions(text) {
  const match = text.match(/^-- seanchai:versions seanchai (\S+), corpus (\S+)\s*$/m);
  return match ? { seanchai: match[1], corpus: match[2] } : null;
}

/** Whether the `seanchai` there is has `command`, by running its help: null where no `seanchai` runs at all. */
export function hasCommand(command) {
  const quiet = { stdio: 'pipe' };
  if (runSeanchai([command, '--help'], quiet)?.status === 0) return true;
  return runSeanchai(['--help'], quiet)?.status === 0 ? false : null;
}
