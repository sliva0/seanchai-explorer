// Regenerates src/types.ts from the export's schema.json: node scripts/generate-types.mjs [schema.json]
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { compile } from 'json-schema-to-typescript';

const banner = '// Generated from the export\'s schema.json by scripts/generate-types.mjs. Do not edit.\n';

// Pydantic titles every property, which the compiler would turn into one alias per field.
function withoutPropertyTitles(node) {
  if (Array.isArray(node)) return node.map(withoutPropertyTitles);
  if (!node || typeof node !== 'object') return node;
  const copy = Object.fromEntries(Object.entries(node).map(([key, value]) => [key, withoutPropertyTitles(value)]));
  if (copy.properties) for (const value of Object.values(copy.properties)) delete value.title;
  return copy;
}

export async function generateTypes(schema) {
  const version = schema.$defs.Index.properties.schema_version.const ?? schema.$defs.Index.properties.schema_version.minimum;
  const body = await compile(withoutPropertyTitles(schema), 'SeanchaiExport', {
    bannerComment: '', additionalProperties: false, style: { singleQuote: true },
  });
  return `${banner}export const SCHEMA_VERSION = ${version};\n\n${body}`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = path.resolve(process.argv[2] ?? 'tests/fixtures/export/schema.json');
  const schema = JSON.parse(await readFile(file, 'utf8'));
  await writeFile(new URL('../src/types.ts', import.meta.url), await generateTypes(schema));
}
