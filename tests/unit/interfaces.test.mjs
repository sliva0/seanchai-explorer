import assert from 'node:assert/strict';
import test from 'node:test';
import { curatedInterfaces, interfacesOf } from '../../src/interfaces.ts';
import { readFixture } from './helpers.mjs';

test('every document of the export has interface names, or an explicit blank', async () => {
  const { documents } = await readFixture('index.json');
  assert.ok(documents.length);
  for (const doc of documents) assert.equal(typeof curatedInterfaces(doc), 'string', `${doc.id} (${doc.reference}) is missing from src/interfaces.ts`);
});

test('an entry is by reference, an edition\'s own by id, and a blank is one', () => {
  assert.equal(interfacesOf({ id: '29229-j10', reference: 'TS29.229' }), 'Cx, Dx');
  assert.equal(interfacesOf({ id: '29212-j10', reference: 'TS29.212' }), 'Gx, Gxx, Sd, St, S15');
  assert.equal(interfacesOf({ id: '29212-bj0', reference: 'TS29.212' }), 'Gx, Gxx, Sd, S15');
  assert.equal(curatedInterfaces({ id: '29230-j30', reference: 'TS29.230' }), '');
  assert.equal(curatedInterfaces({ id: 'new', reference: 'TS99.999' }), undefined);
  assert.equal(interfacesOf({ id: 'new', reference: 'TS99.999' }), '');
});
