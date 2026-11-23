// How the scripts here run Seanchaí and where its source documents are. See README.md.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const project = fileURLToPath(new URL('../', import.meta.url));

const checkout = path.resolve(project, '../..');
/** A Seanchaí checkout to run: `SEANCHAI_ROOT`, or the one this repository is inside. */
export const root = process.env.SEANCHAI_ROOT
  ? path.resolve(process.env.SEANCHAI_ROOT)
  : existsSync(path.join(checkout, 'editors/vscode/syntaxes/dad.tmLanguage.json'))
    ? checkout
    : null;

/**
 * The release of `seanchai` and `seanchai-corpus` a build runs from PyPI, exactly, so that one commit always publishes
 * one corpus: `seanchai-release.json`, which the deploy workflow reads too. See README.md, "Building".
 */
export const release = JSON.parse(readFileSync(path.join(project, 'seanchai-release.json'), 'utf8'));

/** `uvx`'s arguments running the pinned release's `seanchai`, with `extras` such as `corpus,extract`. */
export const releaseArgs = (extras = 'corpus') => [
  '--from',
  `seanchai[${extras}]==${release.seanchai}`,
  '--with',
  `seanchai-corpus==${release['seanchai-corpus']}`,
  'seanchai',
];

/**
 * The ways to run `seanchai` with `args`, in order: the checkout's through `uv`, else the one on `PATH`, else the
 * pinned PyPI release through `uvx`, which `SEANCHAI_PINNED=1` makes the only one. `pinned` is the last's: its export
 * is the release's.
 */
export function seanchaiWays(args, { extract = false, env = process.env } = {}) {
  const pinned = {
    command: 'uvx',
    args: [...releaseArgs(extract ? 'corpus,extract' : 'corpus'), ...args],
    pinned: true,
  };
  if (env.SEANCHAI_PINNED === '1') return [pinned];
  if (root)
    return [
      {
        command: 'uv',
        args: ['run', '--project', root, ...(extract ? ['--extra', 'extract'] : []), 'seanchai', ...args],
      },
    ];
  return [{ command: 'seanchai', args }, pinned];
}

/** The `seanchai corpus download` directory: `SEANCHAI_SPECIFICATIONS`, the checkout's, or `specifications/` here. */
export const specifications = path.resolve(
  process.env.SEANCHAI_SPECIFICATIONS ?? path.join(root ?? project, 'specifications'),
);

/**
 * Runs `seanchai` with `args` the first of `seanchaiWays` there is. Returns `spawnSync`'s result, with `pinned` where it
 * ran the pinned release, or null where there is no way at all. `extract` asks for what downloading the sources takes,
 * which a `seanchai` on `PATH` must have itself; `stdio: 'pipe'` keeps the output.
 */
export function runSeanchai(args, { extract = false, stdio = 'inherit' } = {}) {
  for (const way of seanchaiWays(args, { extract })) {
    const cwd = way.pinned ? project : (root ?? project);
    const result = spawnSync(way.command, way.args, { cwd, stdio, encoding: 'utf8' });
    if (result.error?.code === 'ENOENT') continue;
    if (result.error) throw result.error;
    return { ...result, pinned: Boolean(way.pinned) };
  }
  return null;
}

export const NO_SEANCHAI =
  'Neither seanchai nor uv was found: install uv (https://docs.astral.sh/uv/), or set SEANCHAI_ROOT or SEANCHAI_EXPORT';

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
