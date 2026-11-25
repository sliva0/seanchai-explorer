// Fails a SEANCHAI_UNLINKED=1 build naming the open-source project: node scripts/check-unlinked.mjs [dir]. Does nothing
// for another build unless --always. The corpus's own data, under data/, is the documents' and is not looked in.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
if (process.env.SEANCHAI_UNLINKED !== '1' && !args.includes('--always')) process.exit(0);
const dist = path.resolve(args.find(arg => !arg.startsWith('--')) ?? 'dist');
// The project's addresses and its two names, as the site's own words and links would carry them.
const named = /github\.com|github\.io|pypi\.org|GitHub|PyPI/g;
const text = /\.(html|js|mjs|css|json|lua|txt|svg|map)$/;

// The Wireshark plugin's one marked line holds the address its links go to, seanchai's default, the public site, where
// the build was given none of its own: the one place the build may name it, as the page never shows it. Any other
// line of the plugin, or a second marked one, is looked in as every file is.
const plugin = path.join('plugin', 'seanchai_diameter.lua');
const marked = /^local EXPLORER = "[^"\\]*" -- seanchai:explorer$/gm;
const withoutMarked = content => (content.match(marked)?.length === 1 ? content.replace(marked, '') : content);

const problems = [];
for (const entry of await readdir(dist, { recursive: true, withFileTypes: true })) {
  const file = path.relative(dist, path.join(entry.parentPath, entry.name));
  if (!entry.isFile() || !text.test(entry.name) || file.split(path.sep)[0] === 'data') continue;
  const content = await readFile(path.join(dist, file), 'utf8');
  const found = new Set((file === plugin ? withoutMarked(content) : content).match(named));
  if (found.size) problems.push(`${file}: ${[...found].join(', ')}`);
}
if (problems.length) {
  console.error(`A SEANCHAI_UNLINKED=1 build names the project:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
