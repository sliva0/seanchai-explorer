import { spawnSync } from 'node:child_process';
import { cp, mkdir, readFile, rename, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const project = fileURLToPath(new URL('../', import.meta.url));
const root = path.resolve(process.env.SEANCHAI_ROOT ?? path.join(project, '../..'));
const specifications = path.resolve(process.env.SEANCHAI_SPECIFICATIONS ?? path.join(root, 'specifications'));
const temporary = path.join(project, '.data-tmp');
await rm(temporary, { recursive: true, force: true });
const args = ['run', '--no-sync', '--project', root, 'seanchai', 'export', '-o', temporary,
 ];
args.push('--specifications', specifications);
if (!process.argv.includes('--public')) args.push('--include-pdfs');
args.push('--dictionary', path.join(specifications, 'wireshark'));
const result = spawnSync('uv', args, { cwd: root, stdio: 'inherit',
  env: { ...process.env, UV_CACHE_DIR: process.env.UV_CACHE_DIR ?? path.join(project, '.uv-cache') } });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
const index = JSON.parse(await readFile(path.join(temporary, 'index.json'), 'utf8'));
if (index.schema_version !== 2) throw new Error('Unsupported export schema');
await mkdir(path.join(project, 'public'), { recursive: true });
await rm(path.join(project, 'public/data'), { recursive: true, force: true });
await rename(temporary, path.join(project, 'public/data'));
await mkdir(path.join(project, 'public/syntax'), { recursive: true });
await cp(path.join(root, 'editors/vscode/syntaxes/dad.tmLanguage.json'), path.join(project, 'public/syntax/dad.tmLanguage.json'));
const pdfjs = path.join(project, 'node_modules/pdfjs-dist');
for (const directory of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
  await cp(path.join(pdfjs, directory), path.join(project, 'public/pdfjs', directory), { recursive: true });
}
await cp(path.join(pdfjs, 'LICENSE'), path.join(project, 'public/pdfjs/LICENSE'));
