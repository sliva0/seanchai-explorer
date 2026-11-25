// Fills public/ for a build: node scripts/prepare.mjs [--self-hosted] [--any-schema]. See README.md.
import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { elementIndex } from '../src/elements.ts';
import { tableIndex } from '../src/tables.ts';
import { PLUGIN_PATH, explorerAddresses, explorerOf, explorerProblem, withExplorer } from '../src/plugin-file.ts';
import { SCHEMA_VERSION } from '../src/types.ts';
import {
  hasCommand,
  pinText,
  pluginVersions,
  project,
  release,
  runSeanchai,
  seanchai,
  specifications,
} from './seanchai.mjs';

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
  return seanchai(args);
}

/**
 * The address the plugin's links go to, its `seanchai.explorer_url` preference's default: the first of
 * `SEANCHAI_EXPLORER_URLS`, normal (a closing slash, a scheme's default port dropped), else undefined, seanchai's own
 * default, the public site, in every build, or the line of the plugin `SEANCHAI_PLUGIN` gives as it is. A value that is
 * no list of addresses the plugin can hold fails the build, saying why.
 */
function explorerSetting() {
  const raw = process.env.SEANCHAI_EXPLORER_URLS;
  if (!raw?.trim()) return undefined;
  const checked = explorerAddresses(raw);
  if ('problem' in checked) throw new Error(explorerProblem(raw, checked));
  return checked.addresses[0];
}
// Read before anything is exported, so that a bad address fails the build at once.
const explorer = explorerSetting();

const temporary = path.join(project, '.data-tmp');
await rm(temporary, { recursive: true, force: true });
/**
 * What is wrong with `SEANCHAI_PLUGIN` beside this export, if anything: a plugin made from another corpus than the
 * export's would check traffic against other rules than the site shows. An export naming no versions is not checked.
 */
async function suppliedPluginProblem() {
  if (!process.env.SEANCHAI_PLUGIN || !exported.seanchai || !exported.corpus) return null;
  const given = path.resolve(process.env.SEANCHAI_PLUGIN);
  const versions = pluginVersions(await readFile(given, 'utf8'));
  if (!versions) return `SEANCHAI_PLUGIN ${given} names no versions: it has no -- seanchai:versions line`;
  return versions.seanchai === exported.seanchai && versions.corpus === exported.corpus
    ? null
    : `SEANCHAI_PLUGIN ${given} was made by ${said(versions)}, and the export by ${said(exported)}: make both with one seanchai`;
}

let pinned = false;
if (prebuilt) await cp(path.resolve(process.env.SEANCHAI_EXPORT), temporary, { recursive: true });
else pinned = runExport(temporary);

const index = JSON.parse(await readFile(path.join(temporary, 'index.json'), 'utf8'));
const anySchema = process.argv.includes('--any-schema');
const said = versions => `seanchai ${versions.seanchai}, corpus ${versions.corpus}`;
const exported = { seanchai: index.seanchai_version, corpus: index.corpus_version };
const pin = { seanchai: release.seanchai, corpus: release['seanchai-corpus'] };
const problem =
  !anySchema && index.schema_version !== SCHEMA_VERSION
    ? `Export schema ${index.schema_version}, and the site reads schema ${SCHEMA_VERSION} only: build from a seanchai writing it, as seanchai-release.json pins`
    : !existsSync(path.join(temporary, 'commands.json'))
      ? 'The export has no commands.json: build from a seanchai writing it, as seanchai-release.json pins'
      : index.mode !== mode
        ? `A ${mode} build cannot use a ${index.mode} export`
        : pinned && (exported.seanchai !== pin.seanchai || exported.corpus !== pin.corpus)
          ? `The release pinned in seanchai-release.json, ${pinText()}, exported ${said(exported)}`
          : await suppliedPluginProblem();
if (problem) {
  await rm(temporary, { recursive: true, force: true });
  throw new Error(problem);
}

// What a member's information elements are, which a document's tables may say of another's commands, from each
// Message block's described_by.
const read = async file => JSON.parse(await readFile(path.join(temporary, file), 'utf8'));
const documents = await Promise.all(index.documents.map(async doc => ({ ...(await read(doc.path)), id: doc.id })));
await writeFile(path.join(temporary, 'elements.json'), JSON.stringify(elementIndex(documents, index.schema_version)));
// Where each document's tables are, for a table a popup names to link to its block in a document not loaded.
await writeFile(path.join(temporary, 'tables.json'), JSON.stringify(tableIndex(documents, index.schema_version)));

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
  const made = runSeanchai([
    'wireshark-plugin',
    '-o',
    plugin,
    ...(explorer === undefined ? [] : ['--explorer', explorer]),
  ]);
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

// The plugin's links go to the address asked for, which seanchai wrote, and a plugin SEANCHAI_PLUGIN gives is set to.
// Asked for none, every build ships seanchai's default, the public site, a SEANCHAI_UNLINKED=1 one too: its page never
// shows it, and sets the site's own address where it is hosted elsewhere. The line is checked as the page reads it.
if (explorer !== undefined && existsSync(plugin)) {
  const text = await readFile(plugin, 'utf8');
  if (explorerOf(text) !== explorer) {
    const rewrite = withExplorer(text, explorer);
    if (!rewrite.written) throw new Error(`Cannot set the Wireshark plugin's explorer address: ${rewrite.reason}`);
    await writeFile(plugin, rewrite.text);
  }
  const written = explorerOf(await readFile(plugin, 'utf8'));
  if (written !== explorer)
    throw new Error(`The Wireshark plugin links to ${JSON.stringify(written)}, not ${JSON.stringify(explorer)}`);
}
