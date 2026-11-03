// Fills public/ for a build: node scripts/prepare.mjs [--self-hosted] [--any-schema]. See README.md.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, rename, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { SCHEMA_VERSION } from '../src/types.ts';

const project = fileURLToPath(new URL('../', import.meta.url));
const selfHosted = process.argv.includes('--self-hosted');
const mode = selfHosted ? 'self-hosted' : 'public';
const data = path.join(project, 'public/data');
const pdfjsOut = path.join(project, 'public/pdfjs');

const checkout = path.resolve(project, '../..');
const root = process.env.SEANCHAI_ROOT ? path.resolve(process.env.SEANCHAI_ROOT)
  : existsSync(path.join(checkout, 'editors/vscode/syntaxes/dad.tmLanguage.json')) ? checkout : null;

function runExport(output) {
  const specifications = path.resolve(process.env.SEANCHAI_SPECIFICATIONS ?? path.join(root ?? project, 'specifications'));
  const args = ['export', '-o', output];
  if (existsSync(specifications)) args.push('--specifications', specifications);
  else if (selfHosted) throw new Error(`A self-hosted build needs the source PDFs, and ${specifications} does not exist`);
  if (selfHosted) args.push('--include-pdfs');
  if (existsSync(path.join(specifications, 'wireshark'))) args.push('--dictionary', path.join(specifications, 'wireshark'));
  const [command, commandArgs] = root ? ['uv', ['run', '--project', root, 'seanchai', ...args]] : ['seanchai', args];
  const result = spawnSync(command, commandArgs, { cwd: root ?? project, stdio: 'inherit' });
  if (result.error?.code === 'ENOENT') throw new Error(`${command} not found: install seanchai, or set SEANCHAI_ROOT or SEANCHAI_EXPORT`);
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const temporary = path.join(project, '.data-tmp');
await rm(temporary, { recursive: true, force: true });
if (process.env.SEANCHAI_EXPORT) await cp(path.resolve(process.env.SEANCHAI_EXPORT), temporary, { recursive: true });
else runExport(temporary);

const index = JSON.parse(await readFile(path.join(temporary, 'index.json'), 'utf8'));
const anySchema = process.argv.includes('--any-schema');
const problem = !anySchema && index.schema_version !== SCHEMA_VERSION ? `Export schema ${index.schema_version}, expected ${SCHEMA_VERSION}`
  : index.mode !== mode ? `A ${mode} build cannot use a ${index.mode} export` : null;
if (problem) {
  await rm(temporary, { recursive: true, force: true });
  throw new Error(problem);
}

await mkdir(path.join(project, 'public'), { recursive: true });
await rm(data, { recursive: true, force: true });
await rename(temporary, data);

// The export's grammar is the one to use; the committed fallback is for an export without one.
const grammar = path.join(data, 'syntax/dad.tmLanguage.json');
await mkdir(path.join(project, 'public/syntax'), { recursive: true });
await cp(existsSync(grammar) ? grammar : path.join(project, 'syntax/dad.tmLanguage.json'), path.join(project, 'public/syntax/dad.tmLanguage.json'));

await rm(pdfjsOut, { recursive: true, force: true });
if (selfHosted) {
  const pdfjs = path.join(project, 'node_modules/pdfjs-dist');
  for (const directory of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
    await cp(path.join(pdfjs, directory), path.join(pdfjsOut, directory), { recursive: true });
  }
  await cp(path.join(pdfjs, 'LICENSE'), path.join(pdfjsOut, 'LICENSE'));
}
