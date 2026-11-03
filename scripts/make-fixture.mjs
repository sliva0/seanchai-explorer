// Regenerates tests/fixtures/export and the fallback grammar from a real export: node scripts/make-fixture.mjs [export-dir]
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const documents = ['29061-6f0', '29153-i00', 'rfc7944'];
const from = path.resolve(process.argv[2] ?? 'public/data');
const to = fileURLToPath(new URL('../tests/fixtures/export/', import.meta.url));
const read = async file => JSON.parse(await readFile(path.join(from, file), 'utf8'));
const write = (file, data) => writeFile(path.join(to, file), `${JSON.stringify(data)}\n`);
const wanted = new Set(documents);

const index = await read('index.json');
const search = await read('search.json');
if (index.mode !== 'public') throw new Error('The fixture is made from a public export');
await rm(to, { recursive: true, force: true });
await mkdir(path.join(to, 'documents'), { recursive: true });
await mkdir(path.join(to, 'sources'), { recursive: true });
await write('index.json', { ...index, documents: index.documents.filter(doc => wanted.has(doc.id)) });
await write('search.json', {
  ...search,
  entries: search.entries.filter(entry => wanted.has(entry.document)),
  mentions: search.mentions.filter(mention => wanted.has(mention.document)),
});
await cp(path.join(from, 'schema.json'), path.join(to, 'schema.json'));
await cp(path.join(from, 'syntax'), path.join(to, 'syntax'), { recursive: true });
await cp(path.join(from, 'syntax/dad.tmLanguage.json'), fileURLToPath(new URL('../syntax/dad.tmLanguage.json', import.meta.url)));
for (const doc of index.documents.filter(doc => wanted.has(doc.id))) {
  await cp(path.join(from, doc.path), path.join(to, doc.path));
  await cp(path.join(from, doc.raw), path.join(to, doc.raw));
  if (doc.source.text) await cp(path.join(from, doc.source.text), path.join(to, doc.source.text));
}
