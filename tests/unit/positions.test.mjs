import assert from 'node:assert/strict';
import test from 'node:test';
import { createPositionStore } from '../../src/positions.ts';

const memory = () => {
  const items = new Map();
  return { getItem: key => items.get(key) ?? null, setItem: (key, value) => items.set(key, value) };
};

test('a position is kept per document for the tab', () => {
  const store = memory();
  const positions = createPositionStore(() => store);
  assert.equal(positions.get('a'), undefined);
  positions.set('a', { top: 4, offset: 7.5, document: 'a', hash: '#a' });
  positions.set('b', { top: 1, offset: -12 });
  assert.deepEqual(
    createPositionStore(() => store).get('a'),
    { top: 4, offset: 7.5 },
    'only the place, whatever it came with',
  );
  assert.deepEqual(createPositionStore(() => store).get('b'), { top: 1, offset: -12 });
  assert.equal(positions.get('constructor'), undefined);
  store.setItem('seanchai-positions', '{"a":{"top":"x","offset":1}}');
  assert.equal(createPositionStore(() => store).get('a'), undefined);
  store.setItem('seanchai-positions', 'not json');
  assert.equal(createPositionStore(() => store).get('a'), undefined);
  const refused = createPositionStore(() => {
    throw new Error('denied');
  });
  refused.set('a', { top: 1, offset: 2 });
  assert.deepEqual(refused.get('a'), { top: 1, offset: 2 });
});
