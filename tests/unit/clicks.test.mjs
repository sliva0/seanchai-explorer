import assert from 'node:assert/strict';
import test from 'node:test';
import { clickAction, nameTitle } from '../../src/clicks.ts';

const plain = { ctrlKey: false, metaKey: false, shiftKey: false };
const alt = { ...plain, altKey: true };
const pane = (over = {}) => ({ paneOpen: true, sourceInPane: true, paneAvailable: () => true, uses: false, ...over });
const noPane = (over = {}) => ({ paneOpen: false, sourceInPane: false, paneAvailable: () => false, uses: false, ...over });
const target = { document: 'rfc6733', section: '6.4' };

test('a name goes to its page when no pane can show it, never to a new tab', () => {
  const name = { text: 'Origin-Host', avp: 'Origin-Host', target };
  assert.deepEqual(clickAction(name, plain, '1', noPane()), { type: 'navigate', target: { ...target, name: 'Origin-Host' } });
  assert.deepEqual(clickAction(name, plain, '1', pane()), { type: 'pane-target', target: { ...target, name: 'Origin-Host' } });
  assert.deepEqual(clickAction(name, plain, '1', pane({ paneAvailable: id => id !== 'rfc6733' })).type, 'navigate');
});

test('beside a placeholder, a name is followed in the pane and its own positions stay out of it', () => {
  const placeholder = pane({ paneOpen: false, sourceInPane: false });
  const name = { text: 'Origin-Host', avp: 'Origin-Host', target };
  assert.deepEqual(clickAction(name, plain, '1', placeholder), { type: 'pane-target', target: { ...target, name: 'Origin-Host' } });
  const row = { ...name, source: { section: '5.1', page: 9, row: true } };
  assert.deepEqual(clickAction(row, plain, '5.1', placeholder), { type: 'pane-target', target: { ...target, name: 'Origin-Host' } });
  assert.equal(clickAction({ text: '7.2', source: { section: '7.2', page: 73 } }, plain, '7.2', placeholder).type, 'browser');
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
  assert.deepEqual(clickAction(name, plain, '6.3', noPane({ uses: true })), { type: 'uses' });
});

test('modified clicks are the browser\'s, and only the uses control lists a name', () => {
  const name = { text: 'Y', avp: 'Y', target };
  for (const modifier of ['ctrlKey', 'metaKey', 'shiftKey']) assert.deepEqual(clickAction(name, { ...plain, [modifier]: true }, '1', pane()), { type: 'browser' });
  assert.deepEqual(clickAction(name, plain, '1', noPane({ uses: true })), { type: 'uses' });
  const base = { text: 'RFC6733', target };
  assert.equal(clickAction(base, plain, '1', noPane({ uses: true })).type, 'navigate');
  assert.deepEqual(clickAction(name, { ...plain, ctrlKey: true }, '1', noPane({ uses: true })), { type: 'browser' });
});

test('alt alone is a plain click, on any token and with the control either way', () => {
  const tokens = [
    { text: 'Y', avp: 'Y', target },
    { text: 'Y', avp: 'Y' },
    { text: 'RFC6733', target },
    { text: '7.2', source: { section: '7.2', page: 73 } },
    { text: 'Y', target, source: { section: '6.3', page: 17, name: 'Y', row: true }, valueRow: { name: 'Y' } },
  ];
  for (const token of tokens) {
    for (const context of [pane(), noPane(), pane({ uses: true }), noPane({ uses: true })]) {
      assert.deepEqual(clickAction(token, alt, '6.3', context), clickAction(token, plain, '6.3', context));
    }
  }
  assert.equal(clickAction(tokens[0], alt, '6.3', pane()).type, 'pane-target', 'no popup, and not left to the browser');
  assert.deepEqual(clickAction(tokens[0], { ...alt, ctrlKey: true }, '6.3', pane()), { type: 'browser' });
});

test('a value table\'s name goes to its row or the browser, listing only by the control', () => {
  const row = { name: 'Y' };
  const name = { text: 'Y', target, source: { section: '6.3', page: 17, name: 'Y', row: true }, valueRow: row };
  assert.deepEqual(clickAction(name, plain, '6.3', pane()), { type: 'source', position: name.source });
  assert.deepEqual(clickAction(name, plain, '6.3', noPane()), { type: 'browser' });
  assert.deepEqual(clickAction(name, plain, '6.3', noPane({ sourceInPane: true })), { type: 'browser' });
  assert.deepEqual(clickAction(name, plain, '6.3', pane({ uses: true })), { type: 'uses' });
  assert.deepEqual(clickAction(name, plain, '6.3', noPane({ uses: true })), { type: 'uses' });
  assert.deepEqual(clickAction(name, { ...plain, ctrlKey: true }, '6.3', pane()), { type: 'browser' });
});

test('a value row\'s clause goes to the source as any source link does, naming the row', () => {
  const clause = { text: '17.8.2', source: { section: '17.8.2', page: 92, name: 'Y', row: true, titled: true } };
  assert.deepEqual(clickAction(clause, plain, '17.8', pane()), { type: 'source', position: clause.source });
  assert.deepEqual(clickAction(clause, plain, '17.8', noPane()), { type: 'browser' });
});

test('a name\'s title says what a plain click does as things stand, and how to reach its uses or table', () => {
  const titled = (token, context) => nameTitle(token, clickAction(token, plain, '6.3', context));
  const followed = { text: 'Y', avp: 'Y', target };
  assert.equal(titled(followed, noPane()), 'Click: definition · Right-click: where it is used');
  assert.equal(titled(followed, pane()), 'Click: definition · Right-click: where it is used');
  const row = { ...followed, source: { section: '6.3', page: 17, name: 'Y', row: true } };
  assert.equal(titled(row, pane()), 'Click: source row · Right-click: where it is used');
  assert.equal(titled(row, noPane()), 'Click: definition · Right-click: where it is used');
  const undefinedName = { text: 'Y', avp: 'Y' };
  assert.equal(titled(undefinedName, pane()), 'Click: find in source · Right-click: where it is used');
  assert.equal(titled(undefinedName, noPane()), 'Right-click: where it is used');
  assert.equal(titled(followed, noPane({ uses: true })), 'Click or right-click: where it is used');
  const value = { text: 'V', target, source: { section: '6.3', page: 17, name: 'V', row: true }, valueRow: { name: 'V' } };
  assert.equal(titled(value, pane()), 'Click: source row · Right-click: its table');
  assert.equal(titled(value, noPane()), 'Click: its row · Right-click: its table');
  assert.equal(titled(value, pane({ uses: true })), 'Click or right-click: its table');
});
