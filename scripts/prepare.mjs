// Fills public/ for a build: node scripts/prepare.mjs [--self-hosted] [--any-schema]. See README.md.
import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { commandIndex } from '../src/commands.ts';
import { PLUGIN_PATH } from '../src/plugin-file.ts';
import { SCHEMA_VERSION } from '../src/types.ts';
import { hasCommand, project, runSeanchai, seanchai, specifications } from './seanchai.mjs';

const selfHosted = process.argv.includes('--self-hosted');
const mode = selfHosted ? 'self-hosted' : 'public';
const data = path.join(project, 'public/data');
const pdfjsOut = path.join(project, 'public/pdfjs');
const plugin = path.join(project, 'public', PLUGIN_PATH);
const prebuilt = Boolean(process.env.SEANCHAI_EXPORT);

function runExport(output) {
  const args = ['export', '-o', output];
  if (existsSync(specifications)) args.push('--specifications', specifications);
  else if (selfHosted)
    throw new Error(
      `A self-hosted build needs the source PDFs, and ${specifications} does not exist: run npm run sources`,
    );
  if (selfHosted) args.push('--include-pdfs');
  if (existsSync(path.join(specifications, 'wireshark')))
    args.push('--wireshark', path.join(specifications, 'wireshark'));
  seanchai(args);
}

const temporary = path.join(project, '.data-tmp');
await rm(temporary, { recursive: true, force: true });
if (prebuilt) await cp(path.resolve(process.env.SEANCHAI_EXPORT), temporary, { recursive: true });
else runExport(temporary);

const index = JSON.parse(await readFile(path.join(temporary, 'index.json'), 'utf8'));
const anySchema = process.argv.includes('--any-schema');
const problem =
  !anySchema && index.schema_version !== SCHEMA_VERSION
    ? `Export schema ${index.schema_version}, expected ${SCHEMA_VERSION}`
    : index.mode !== mode
      ? `A ${mode} build cannot use a ${index.mode} export`
      : null;
if (problem) {
  await rm(temporary, { recursive: true, force: true });
  throw new Error(problem);
}

// What a command's popup says of the corpus, small enough to fetch with a document where search.json is not.
const read = async file => JSON.parse(await readFile(path.join(temporary, file), 'utf8'));
const documents = await Promise.all(index.documents.map(doc => read(doc.path)));
await writeFile(path.join(temporary, 'commands.json'), JSON.stringify(commandIndex(documents, index.schema_version)));

await mkdir(path.join(project, 'public'), { recursive: true });
await rm(data, { recursive: true, force: true });
await rename(temporary, data);

// The export's grammar is the one to use; the committed fallback is for an export without one.
const grammar = path.join(data, 'syntax/dad.tmLanguage.json');
await mkdir(path.join(project, 'public/syntax'), { recursive: true });
await cp(
  existsSync(grammar) ? grammar : path.join(project, 'syntax/dad.tmLanguage.json'),
  path.join(project, 'public/syntax/dad.tmLanguage.json'),
);

await rm(pdfjsOut, { recursive: true, force: true });
if (selfHosted) {
  const pdfjs = path.join(project, 'node_modules/pdfjs-dist');
  for (const directory of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
    await cp(path.join(pdfjs, directory), path.join(pdfjsOut, directory), { recursive: true });
  }
  await cp(path.join(pdfjs, 'LICENSE'), path.join(pdfjsOut, 'LICENSE'));
}

/**
 * The Wireshark plugin, from the `seanchai` the export came from, or `SEANCHAI_PLUGIN`. A build from a prebuilt export
 * goes on without it where no `seanchai` can make one, and the page says the download is not part of the build.
 */
async function makePlugin() {
  await rm(path.dirname(plugin), { recursive: true, force: true });
  await mkdir(path.dirname(plugin), { recursive: true });
  if (process.env.SEANCHAI_PLUGIN) {
    await cp(path.resolve(process.env.SEANCHAI_PLUGIN), plugin);
    return;
  }
  const made = runSeanchai(['wireshark-plugin', '-o', plugin]);
  if (made?.status === 0) return;
  await rm(plugin, { force: true });
  const has = made && hasCommand('wireshark-plugin');
  const problem = !made
    ? 'no seanchai was found to make the Wireshark plugin'
    : has === false
      ? 'this seanchai has no wireshark-plugin command: it is older than the plugin, as the PyPI release 0.1.0 is. Set SEANCHAI_ROOT to a checkout that has it, or SEANCHAI_PLUGIN to a plugin made already'
      : `seanchai wireshark-plugin failed with status ${made.status}`;
  if (!prebuilt) throw new Error(`Cannot make the Wireshark plugin: ${problem}`);
  console.warn(`Building without the Wireshark plugin: ${problem}`);
}
await makePlugin();
