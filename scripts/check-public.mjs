// Fails a public build carrying what only a self-hosted one may ship: node scripts/check-public.mjs [dir]
import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

const dist = path.resolve(process.argv[2] ?? 'dist');
const entries = await readdir(dist, { recursive: true, withFileTypes: true });
const problems = entries
  .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.pdf'))
  .map(entry => path.relative(dist, path.join(entry.parentPath, entry.name)));
for (const name of ['viewer.html', 'pdfjs']) if (existsSync(path.join(dist, name))) problems.push(name);
if (problems.length) {
  console.error(`A public build must not contain:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
