import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import { generateTypes } from '../../scripts/generate-types.mjs';
import { SCHEMA_VERSION } from '../../src/types.ts';
import { fixture, readFixture } from './helpers.mjs';

const schema = await readFixture('schema.json');

test('every fixture file satisfies the schema the export ships', async () => {
  const validate = new Ajv2020({ strict: false, allErrors: true }).compile(schema);
  const documents = (await readdir(new URL('documents/', fixture))).map(name => `documents/${name}`);
  for (const file of ['index.json', 'search.json', ...documents]) {
    assert.ok(validate(await readFixture(file)), `${file}: ${JSON.stringify(validate.errors?.slice(0, 3))}`);
  }
  assert.equal(validate({ schema_version: SCHEMA_VERSION + 1, id: 'x', lines: [] }), false);
});

test('src/types.ts is what the schema generates', async () => {
  assert.equal(await readFile(new URL('../../src/types.ts', import.meta.url), 'utf8'), await generateTypes(schema));
  assert.equal((await readFixture('index.json')).schema_version, SCHEMA_VERSION);
});
