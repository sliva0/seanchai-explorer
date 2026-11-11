import assert from 'node:assert/strict';
import test from 'node:test';
import { createJumpList } from '../../src/jump-list.ts';

const memory = () => {
  const items = new Map();
  return { getItem: key => items.get(key) ?? null, setItem: (key, value) => items.set(key, value) };
};
const at = (document, top = 0, offset = 0, line) => ({
  document,
  top,
  offset,
  ...(line === undefined ? {} : { line }),
  hash: `#${document}?top=${top}`,
});
const list = (store = memory(), available) => createJumpList(() => store, available);
const names = jumps => jumps.entries.map(entry => `${entry.document}${entry.top}`);

test('back goes along the list and keeps the place left, forward returns to it', () => {
  const jumps = list();
  jumps.push(at('a', 1));
  jumps.push(at('a', 2));
  assert.deepEqual(jumps.walk('back', at('b', 3)), at('a', 2));
  assert.deepEqual(names(jumps), ['a1', 'a2', 'b3']);
  assert.deepEqual(jumps.walk('back', at('a', 2)), at('a', 1));
  assert.equal(jumps.walk('back', at('a', 1)), undefined, 'the first has nothing before it');
  assert.deepEqual(jumps.walk('forward', at('a', 1)), at('a', 2));
  assert.deepEqual(jumps.walk('forward', at('a', 2)), at('b', 3));
  assert.equal(jumps.walk('forward', at('b', 3)), undefined, 'the last has nothing after it');
  assert.equal(list().walk('back', at('a')), undefined, 'an empty list goes nowhere');
});

test('an entry takes the place it was left at, so that scrolling after a walk is not lost', () => {
  const jumps = list();
  jumps.push(at('a', 1));
  jumps.walk('back', at('a', 2));
  jumps.walk('forward', at('a', 7, 5));
  assert.deepEqual(jumps.walk('back', at('a', 2)), at('a', 7, 5));
});

test('a jump from the middle drops what lay ahead, and the place being left takes its slot', () => {
  const jumps = list();
  for (const top of [1, 2, 3]) jumps.push(at('a', top));
  jumps.walk('back', at('a', 4));
  jumps.walk('back', at('a', 3));
  jumps.push(at('a', 22));
  assert.deepEqual(names(jumps), ['a1', 'a22']);
  assert.equal(jumps.walk('forward', at('b', 1)), undefined);
  assert.deepEqual(jumps.walk('back', at('b', 1)), at('a', 22));
});

test('an identical place collapses with the one before it, and a walk does not land where it is', () => {
  const jumps = list();
  jumps.push(at('a', 1));
  jumps.push(at('a', 1));
  jumps.push(at('a', 1, 1));
  jumps.push(at('a', 1, 1, 9));
  jumps.push(at('a', 1, 1, 9));
  assert.deepEqual(names(jumps), ['a1', 'a1', 'a1']);
  assert.deepEqual(
    jumps.entries.map(entry => [entry.offset, entry.line]),
    [
      [0, undefined],
      [1, undefined],
      [1, 9],
    ],
  );
  assert.deepEqual(jumps.walk('back', at('a', 1, 1, 9)), at('a', 1, 1), 'from the last, the one before it');
  const tip = list();
  tip.push(at('a', 1));
  tip.push(at('a', 2));
  assert.deepEqual(tip.walk('back', at('a', 2)), at('a', 1), 'not the place it is already at');
  assert.deepEqual(names(tip), ['a1', 'a2']);
});

test('the list holds a hundred, the oldest going first, and keeps its way through a walk at the cap', () => {
  const jumps = list();
  for (let top = 0; top < 130; top++) jumps.push(at('a', top));
  assert.equal(jumps.entries.length, 100);
  assert.equal(jumps.entries[0].top, 30);
  assert.equal(jumps.entries.at(-1).top, 129);
  assert.deepEqual(jumps.walk('back', at('b')), at('a', 129));
  assert.equal(jumps.entries.length, 100);
  assert.equal(jumps.entries.at(-1).document, 'b');
  assert.deepEqual(jumps.walk('forward', at('a', 129)), at('b'));
});

test('the list and the way along it survive a reload; a broken store is an empty one', () => {
  const store = memory();
  const before = list(store);
  for (const top of [1, 2, 3]) before.push(at('a', top));
  before.walk('back', at('a', 4));
  const after = list(store);
  assert.deepEqual(names(after), ['a1', 'a2', 'a3', 'a4']);
  assert.equal(after.index, 2);
  assert.deepEqual(after.walk('forward', at('a', 3)), at('a', 4));
  for (const stored of ['not json', '{"entries":"no"}', '{"entries":[{"document":1}],"index":0}']) {
    const broken = memory();
    broken.setItem('seanchai-jumps', stored);
    assert.deepEqual(list(broken).entries, []);
  }
  const refused = createJumpList(() => {
    throw new Error('denied');
  });
  refused.push(at('a', 1));
  assert.deepEqual(refused.walk('back', at('a', 2)), at('a', 1), 'without storage it still works for the page');
  const outOfRange = memory();
  outOfRange.setItem('seanchai-jumps', JSON.stringify({ entries: [at('a', 1)], index: 9 }));
  assert.equal(list(outOfRange).index, 1);
});

test('a document that is gone is stepped over each way, and a list of only those goes nowhere', () => {
  const jumps = list(memory(), document => document !== 'gone');
  jumps.push(at('a', 1));
  jumps.push(at('gone', 1));
  jumps.push(at('gone', 2));
  assert.deepEqual(jumps.peek('back', at('b', 1)), at('a', 1));
  assert.deepEqual(jumps.walk('back', at('b', 1)), at('a', 1));
  assert.deepEqual(jumps.walk('forward', at('a', 1)), at('b', 1));
  const none = list(memory(), () => false);
  none.push(at('gone', 1));
  assert.equal(none.walk('back', at('a', 1)), undefined);
});

test("a document's walk skips the current document, lands at the end of a run each way, and is a round trip", () => {
  const jumps = list();
  for (const place of [at('a', 1), at('a', 2), at('b', 1), at('b', 2), at('c', 1)]) jumps.push(place);
  assert.deepEqual(jumps.walk('backDocument', at('c', 2)), at('b', 2), 'past the rest of c');
  assert.deepEqual(jumps.walk('backDocument', at('b', 2)), at('a', 2));
  assert.equal(jumps.walk('backDocument', at('a', 2)), undefined);
  assert.deepEqual(jumps.walk('forwardDocument', at('a', 2)), at('b', 2));
  assert.deepEqual(jumps.walk('forwardDocument', at('b', 2)), at('c', 2));
  assert.equal(jumps.walk('forwardDocument', at('c', 2)), undefined);
  assert.deepEqual(
    jumps.walk('back', at('c', 2)),
    at('c', 1),
    'the same list: a plain walk still stops in the document',
  );
});

test('peek says where a walk would land and leaves the list as it is', () => {
  const store = memory();
  const jumps = list(store);
  jumps.push(at('a', 1));
  const saved = store.getItem('seanchai-jumps');
  assert.deepEqual(jumps.peek('back', at('b', 1)), at('a', 1));
  assert.equal(jumps.peek('forward', at('b', 1)), undefined);
  assert.deepEqual(names(jumps), ['a1']);
  assert.equal(store.getItem('seanchai-jumps'), saved);
});
