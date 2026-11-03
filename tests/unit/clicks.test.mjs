import assert from 'node:assert/strict';
import test from 'node:test';
import { clickAction } from '../../src/clicks.ts';

const plain = { ctrlKey: false, metaKey: false, shiftKey: false, altKey: false };
const pane = (over = {}) => ({ paneOpen: true, sourceInPane: true, paneAvailable: () => true, occurrences: false, ...over });
const noPane = (over = {}) => ({ paneOpen: false, sourceInPane: false, paneAvailable: () => false, occurrences: false, ...over });
const target = { document: 'rfc6733', section: '6.4' };

test('a name goes to its page when no pane can show it, never to a new tab', () => {
  const name = { text: 'Origin-Host', avp: 'Origin-Host', target };
  assert.deepEqual(clickAction(name, plain, '1', noPane()), { type: 'navigate', target: { ...target, name: 'Origin-Host' } });
  assert.deepEqual(clickAction(name, plain, '1', pane()), { type: 'pane-target', target: { ...target, name: 'Origin-Host' } });
  assert.deepEqual(clickAction(name, plain, '1', pane({ paneAvailable: id => id !== 'rfc6733' })).type, 'navigate');
});

test('a re-used row keeps the name its origin cell links to', () => {
  const name = { text: 'X', avp: 'X', target: { ...target, name: 'Y' } };
  assert.equal(clickAction(name, plain, '1', noPane()).target.name, 'Y');
});

test('a ; Bases: link follows the same rule as a name', () => {
  const base = { text: 'RFC6733', target: { document: 'rfc6733' } };
  assert.deepEqual(clickAction(base, plain, '1', noPane()), { type: 'navigate', target: base.target });
  assert.deepEqual(clickAction(base, plain, '1', pane()), { type: 'pane-target', target: base.target });
});

test('; Section: and ; Page: links use the pane where it can show them and the browser otherwise', () => {
  const section = { text: '7.2', source: { section: '7.2', page: 73 } };
  assert.deepEqual(clickAction(section, plain, '7.2', pane()), { type: 'source', position: section.source });
  assert.deepEqual(clickAction(section, plain, '7.2', noPane()), { type: 'browser' });
  assert.deepEqual(clickAction(section, plain, '7.2', noPane({ sourceInPane: true })), { type: 'source', position: section.source });
});

test('a table row name opens its row in an open pane, and its definition otherwise', () => {
  const row = { text: 'Y', avp: 'Y', target, source: { section: '6.3', page: 17, name: 'Y', row: true } };
  assert.deepEqual(clickAction(row, plain, '6.3', pane()), { type: 'source', position: row.source });
  assert.equal(clickAction(row, plain, '6.3', noPane()).type, 'navigate');
  const hole = { text: 'Y', avp: 'Y', source: row.source };
  assert.deepEqual(clickAction(hole, plain, '6.3', noPane()), { type: 'browser' });
});

test('a name with no target finds itself in the pane, and is the browser\'s without one', () => {
  const name = { text: 'Y', avp: 'Y' };
  assert.deepEqual(clickAction(name, plain, '6.3', pane()), { type: 'source', position: { section: '6.3', name: 'Y', exact: true, occurrence: true } });
  assert.deepEqual(clickAction(name, plain, '6.3', noPane()), { type: 'browser' });
  assert.deepEqual(clickAction(name, plain, undefined, pane()), { type: 'browser' });
  assert.deepEqual(clickAction(name, plain, '6.3', noPane({ occurrences: true })), { type: 'occurrences' });
  assert.deepEqual(clickAction(name, { ...plain, altKey: true }, '6.3', noPane()), { type: 'occurrences' });
});

test('modified clicks are the browser\'s, and alt or the occurrences control lists a name', () => {
  const name = { text: 'Y', avp: 'Y', target };
  for (const modifier of ['ctrlKey', 'metaKey', 'shiftKey']) assert.deepEqual(clickAction(name, { ...plain, [modifier]: true }, '1', pane()), { type: 'browser' });
  assert.deepEqual(clickAction(name, { ...plain, altKey: true }, '1', pane()), { type: 'occurrences' });
  assert.deepEqual(clickAction(name, plain, '1', noPane({ occurrences: true })), { type: 'occurrences' });
  const base = { text: 'RFC6733', target };
  assert.deepEqual(clickAction(base, { ...plain, altKey: true }, '1', pane()), { type: 'browser' });
  assert.equal(clickAction(base, plain, '1', noPane({ occurrences: true })).type, 'navigate');
  assert.deepEqual(clickAction(name, { ...plain, ctrlKey: true }, '1', noPane({ occurrences: true })), { type: 'browser' });
});

test('a value table\'s name goes to its row or the browser, listing only by alt or the control', () => {
  const row = { name: 'Y' };
  const name = { text: 'Y', target, source: { section: '6.3', page: 17, name: 'Y', row: true }, valueRow: row };
  assert.deepEqual(clickAction(name, plain, '6.3', pane()), { type: 'source', position: name.source });
  assert.deepEqual(clickAction(name, plain, '6.3', noPane()), { type: 'browser' });
  assert.deepEqual(clickAction(name, plain, '6.3', noPane({ sourceInPane: true })), { type: 'browser' });
  assert.deepEqual(clickAction(name, plain, '6.3', pane({ occurrences: true })), { type: 'occurrences' });
  assert.deepEqual(clickAction(name, plain, '6.3', noPane({ occurrences: true })), { type: 'occurrences' });
  assert.deepEqual(clickAction(name, { ...plain, altKey: true }, '6.3', noPane()), { type: 'occurrences' });
  assert.deepEqual(clickAction(name, { ...plain, altKey: true }, '6.3', pane()), { type: 'occurrences' });
  assert.deepEqual(clickAction(name, { ...plain, ctrlKey: true }, '6.3', pane()), { type: 'browser' });
});

test('a value row\'s clause goes to the source as any source link does, naming the row', () => {
  const clause = { text: '17.8.2', source: { section: '17.8.2', page: 92, name: 'Y', row: true, titled: true } };
  assert.deepEqual(clickAction(clause, plain, '17.8', pane()), { type: 'source', position: clause.source });
  assert.deepEqual(clickAction(clause, plain, '17.8', noPane()), { type: 'browser' });
});
