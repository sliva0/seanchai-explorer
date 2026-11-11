// How the scripts here run Seanchaí and where its source documents are. See README.md.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const project = fileURLToPath(new URL('../', import.meta.url));

const checkout = path.resolve(project, '../..');
/** A Seanchaí checkout to run: `SEANCHAI_ROOT`, or the one this repository is inside. */
export const root = process.env.SEANCHAI_ROOT ? path.resolve(process.env.SEANCHAI_ROOT)
  : existsSync(path.join(checkout, 'editors/vscode/syntaxes/dad.tmLanguage.json')) ? checkout : null;

/** The `seanchai corpus download` directory: `SEANCHAI_SPECIFICATIONS`, the checkout's, or `specifications/` here. */
export const specifications = path.resolve(process.env.SEANCHAI_SPECIFICATIONS ?? path.join(root ?? project, 'specifications'));

/**
 * Runs `seanchai` with `args`: the checkout's through `uv`, else the one on `PATH`, else the PyPI release through
 * `uvx`. `extract` asks for what downloading the sources takes, which a `seanchai` on `PATH` must have itself.
 */
export function seanchai(args, { extract = false } = {}) {
  const extras = extract ? 'corpus,extract' : 'corpus';
  const ways = root
    ? [['uv', ['run', '--project', root, ...extract ? ['--extra', 'extract'] : [], 'seanchai', ...args]]]
    : [['seanchai', args], ['uvx', ['--from', `seanchai[${extras}]`, 'seanchai', ...args]]];
  for (const [command, commandArgs] of ways) {
    const result = spawnSync(command, commandArgs, { cwd: root ?? project, stdio: 'inherit' });
    if (result.error?.code === 'ENOENT') continue;
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
    return;
  }
  throw new Error('Neither seanchai nor uv was found: install uv (https://docs.astral.sh/uv/), or set SEANCHAI_ROOT or SEANCHAI_EXPORT');
}
