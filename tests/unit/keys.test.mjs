import assert from 'node:assert/strict';
import test from 'node:test';
import { CHORD_TIMEOUT, createChords, keyWalk, takesTyping } from '../../src/keys.ts';

const plain = key => ({ key, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false });

test('a chord is a bracket and a letter', () => {
  for (const [first, second, walk] of [['[', 'd', 'backDocument'], [']', 'd', 'forwardDocument'], ['[', 'j', 'back'], [']', 'j', 'forward']]) {
    const chords = createChords();
    assert.equal(chords(first, 0), undefined, 'the bracket alone asks for nothing');
    assert.equal(chords(second, 10), walk);
    assert.equal(chords(second, 20), undefined, 'and is used up');
  }
});

test('a chord lapses after a second, and another key ends it', () => {
  const chords = createChords();
  chords('[', 0);
  assert.equal(chords('d', CHORD_TIMEOUT + 1), undefined);
  chords('[', 2000);
  assert.equal(chords('d', 2000 + CHORD_TIMEOUT), 'backDocument');
  chords('[', 5000);
  assert.equal(chords('x', 5001), undefined);
  assert.equal(chords('d', 5002), undefined);
  assert.equal(chords('g', 5003), undefined);
});

test('a new bracket starts the chord over', () => {
  const chords = createChords();
  chords('[', 0);
  assert.equal(chords(']', 1), undefined);
  assert.equal(chords('d', 2), 'forwardDocument');
  chords('[', 3);
  chords('[', 4);
  assert.equal(chords('j', 5), 'back');
});

test('ctrl and alt with o and i walk the list; nothing else does, nor both at once', () => {
  const walk = (init, chords = createChords()) => keyWalk({ ...plain('x'), ...init }, chords, 0);
  assert.equal(walk({ key: 'o', ctrlKey: true }), 'back');
  assert.equal(walk({ key: 'O', ctrlKey: true }), 'back', 'with caps lock');
  assert.equal(walk({ key: 'i', ctrlKey: true }), 'forward');
  assert.equal(walk({ key: 'o', altKey: true }), 'back');
  assert.equal(walk({ key: 'i', altKey: true }), 'forward');
  assert.equal(walk({ key: 'ø', code: 'KeyO', altKey: true }), 'back', 'a Mac\'s option types a letter');
  assert.equal(walk({ key: 'ˆ', code: 'KeyI', altKey: true }), 'forward');
  assert.equal(walk({ key: 'ø', code: 'KeyO', ctrlKey: true }), undefined);
  assert.equal(walk({ key: 'o' }), undefined);
  assert.equal(walk({ key: 'I', ctrlKey: true, shiftKey: true }), undefined, 'the browser\'s developer tools');
  assert.equal(walk({ key: 'o', ctrlKey: true, altKey: true }), undefined);
  assert.equal(walk({ key: 'o', metaKey: true }), undefined);
});

test('a chord is only for keys with no modifier, and a modifier in between does not end it', () => {
  const chords = createChords();
  assert.equal(keyWalk({ ...plain('['), ctrlKey: true }, chords, 0), undefined);
  assert.equal(keyWalk(plain('d'), chords, 1), undefined);
  keyWalk(plain('['), chords, 2);
  assert.equal(keyWalk({ ...plain('Shift'), shiftKey: true }, chords, 3), undefined);
  assert.equal(keyWalk({ ...plain('d'), metaKey: true }, chords, 4), undefined);
  assert.equal(keyWalk(plain('d'), chords, 5), 'backDocument');
});

test('what takes typing is an input other than a checkbox, a textarea, a select or an editable', () => {
  const asked = [];
  const node = { matches: selector => { asked.push(selector); return true; } };
  assert.equal(takesTyping(node), true);
  assert.equal(takesTyping(null), false);
  assert.match(asked[0], /input:not\(\[type="checkbox"\]\)/);
  for (const part of ['textarea', 'select', '[contenteditable]']) assert.ok(asked[0].includes(part));
});
