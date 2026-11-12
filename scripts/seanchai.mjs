// How the scripts here run Seanchaí and where its source documents are. See README.md.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
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

/** The `seanchai corpus download` directory: `SEANCHAI_SPECIFICATIONS`, the checkout's, or `specifications/` here. */
export const specifications = path.resolve(
  process.env.SEANCHAI_SPECIFICATIONS ?? path.join(root ?? project, 'specifications'),
);

/**
 * Runs `seanchai` with `args` the first way there is: the checkout's through `uv`, else the one on `PATH`, else the
 * PyPI release through `uvx`. Returns `spawnSync`'s result, or null where there is no way at all. `extract` asks for
 * what downloading the sources takes, which a `seanchai` on `PATH` must have itself; `stdio: 'pipe'` keeps the output.
 */
export function runSeanchai(args, { extract = false, stdio = 'inherit' } = {}) {
  const extras = extract ? 'corpus,extract' : 'corpus';
  const ways = root
    ? [['uv', ['run', '--project', root, ...(extract ? ['--extra', 'extract'] : []), 'seanchai', ...args]]]
    : [
        ['seanchai', args],
        ['uvx', ['--from', `seanchai[${extras}]`, 'seanchai', ...args]],
      ];
  for (const [command, commandArgs] of ways) {
    const result = spawnSync(command, commandArgs, { cwd: root ?? project, stdio, encoding: 'utf8' });
    if (result.error?.code === 'ENOENT') continue;
    if (result.error) throw result.error;
    return result;
  }
  return null;
}

export const NO_SEANCHAI =
  'Neither seanchai nor uv was found: install uv (https://docs.astral.sh/uv/), or set SEANCHAI_ROOT or SEANCHAI_EXPORT';

/** Runs `seanchai` as `runSeanchai` does, and exits with its status if it fails. */
export function seanchai(args, options) {
  const result = runSeanchai(args, options);
  if (!result) throw new Error(NO_SEANCHAI);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

/** Whether the `seanchai` there is has `command`, by running its help: null where no `seanchai` runs at all. */
export function hasCommand(command) {
  const quiet = { stdio: 'pipe' };
  if (runSeanchai([command, '--help'], quiet)?.status === 0) return true;
  return runSeanchai(['--help'], quiet)?.status === 0 ? false : null;
}
