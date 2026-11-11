import assert from 'node:assert/strict';
import test from 'node:test';
import { clickAction, nameTitle } from '../../src/clicks.ts';

const plain = { altKey: false, ctrlKey: false, metaKey: false, shiftKey: false };
const alt = { ...plain, altKey: true };
const reads = (over = {}) => ({ paneShows: () => true, paneOn: true, uses: false, ...over });
const noPane = (over = {}) => ({ paneShows: () => false, paneOn: true, uses: false, ...over });

const target = { document: 'rfc6733', section: '6.4', name: 'Y' };
const name = { text: 'Y', avp: 'Y', target };
const elsewhere = { document: 'rfc6733', target };
const definition = { section: '16a.5', page: 129, name: 'Y', row: true };
const row = { document: 'd', position: definition, target: { document: 'd', section: '16a.5', name: 'Y' }, line: 740 };
const rowName = { text: 'Y', avp: 'Y', target: { document: 'd', section: '16.4.7' }, source: definition };

test('a plain click moves the pane alone, and an alt-click both', () => {
  assert.deepEqual(clickAction(name, elsewhere, plain, reads()), { type: 'pane', place: elsewhere });
  assert.deepEqual(clickAction(name, elsewhere, alt, reads()), { type: 'both', place: elsewhere });
  assert.deepEqual(clickAction(rowName, row, plain, reads()), { type: 'pane', place: row });
  assert.deepEqual(clickAction(rowName, row, alt, reads()), { type: 'both', place: row });
});

test('a switched-off pane is still one a plain click can move', () => {
  assert.equal(clickAction(rowName, row, plain, reads({ paneOn: false })).type, 'pane');
});

test("where the pane cannot read the place, the view's jump is all that can happen, either way", () => {
  for (const event of [plain, alt]) {
    assert.deepEqual(clickAction(name, elsewhere, event, noPane()), { type: 'both', place: elsewhere });
    assert.deepEqual(clickAction(rowName, row, event, noPane()), { type: 'both', place: row });
  }
  const readsOnlyThis = reads({ paneShows: document => document === 'd' });
  assert.equal(
    clickAction(name, elsewhere, plain, readsOnlyThis).type,
    'both',
    'as for another document the pane has no reader for',
  );
  assert.equal(clickAction(rowName, row, plain, readsOnlyThis).type, 'pane');
});

test('a ; Bases: link goes by the same rule', () => {
  const base = { text: 'RFC6733', target: { document: 'rfc6733' } };
  const place = { document: 'rfc6733', target: base.target };
  assert.equal(clickAction(base, place, plain, reads()).type, 'pane');
  assert.equal(clickAction(base, place, alt, reads()).type, 'both');
  assert.equal(clickAction(base, place, plain, noPane()).type, 'both');
  assert.equal(clickAction(base, place, plain, noPane({ uses: true })).type, 'both', 'the control is for names');
});

test("; Section: and ; Page: links move the pane, both with alt, and with no pane are the publisher's in a new tab", () => {
  const section = { text: '7.2', source: { section: '7.2', page: 73 } };
  const place = { document: 'd', position: section.source, target: { document: 'd', section: '7.2' } };
  assert.equal(clickAction(section, place, plain, reads()).type, 'pane');
  assert.equal(clickAction(section, place, alt, reads()).type, 'both');
  assert.deepEqual(clickAction(section, place, plain, noPane()), { type: 'browser' });
  assert.deepEqual(clickAction(section, place, alt, noPane()), { type: 'new-tab' }, 'a browser would download it');
  const unsectioned = { document: 'd', position: section.source };
  assert.equal(
    clickAction(section, unsectioned, alt, reads()).type,
    'pane',
    'a clause the file has no line for is only in the source',
  );
});

test("a row that links nowhere is the publisher's with no pane", () => {
  const hole = { text: 'Y', avp: 'Y', source: definition };
  const place = {
    document: 'd',
    position: definition,
    target: { document: 'd', section: '16a.5', name: 'Y' },
    line: 3,
  };
  assert.equal(clickAction(hole, place, plain, reads()).type, 'pane');
  assert.deepEqual(clickAction(hole, place, plain, noPane()), { type: 'browser' });
  assert.deepEqual(clickAction(hole, place, alt, noPane()), { type: 'new-tab' });
});

test('a name no file line defines finds itself in the pane, and is nothing without one', () => {
  const lost = { text: 'Y', avp: 'Y' };
  const place = { document: 'd', position: { section: '6.3', page: null, name: 'Y', exact: true, occurrence: true } };
  assert.deepEqual(clickAction(lost, place, plain, reads()), { type: 'pane', place });
  assert.deepEqual(clickAction(lost, place, alt, reads()), { type: 'pane', place }, 'there is no other place to be');
  assert.deepEqual(clickAction(lost, place, plain, noPane()), { type: 'browser' });
  assert.deepEqual(clickAction(lost, undefined, plain, reads()), { type: 'browser' });
  assert.deepEqual(clickAction(lost, place, plain, noPane({ uses: true })), { type: 'uses' });
});

test("ctrl, shift and meta are the browser's, with or without alt, and only the control lists a name", () => {
  for (const modifier of ['ctrlKey', 'metaKey', 'shiftKey']) {
    assert.deepEqual(clickAction(name, elsewhere, { ...plain, [modifier]: true }, reads()), { type: 'browser' });
    assert.deepEqual(clickAction(name, elsewhere, { ...alt, [modifier]: true }, reads({ uses: true })), {
      type: 'browser',
    });
  }
  assert.deepEqual(clickAction(name, elsewhere, plain, noPane({ uses: true })), { type: 'uses' });
  assert.equal(clickAction(name, elsewhere, alt, reads({ uses: true })).type, 'both', 'alt is not listing');
});

test("a value table's name moves the pane to its row, both with alt, and lists by the control", () => {
  const position = { section: '6.3', page: 17, name: 'V', row: true };
  const value = { text: 'V', target: { document: 'd', section: '6.3' }, source: position, valueRow: { name: 'V' } };
  const place = { document: 'd', position, target: { ...value.target, name: 'V' } };
  assert.equal(clickAction(value, place, plain, reads()).type, 'pane');
  assert.equal(clickAction(value, place, alt, reads()).type, 'both');
  assert.equal(clickAction(value, place, plain, noPane()).type, 'both');
  assert.deepEqual(clickAction(value, place, plain, reads({ uses: true })), { type: 'uses' });
  assert.deepEqual(clickAction(value, place, { ...plain, ctrlKey: true }, reads()), { type: 'browser' });
});

test("a Section cell and an origin cell go as their Details place says, and the browser keeps a Section cell's link", () => {
  const details = { section: '16.4.7', page: 86, name: 'Y', row: true, titled: true };
  const place = { document: 'd', position: details, target: { document: 'd', section: '16.4.7' } };
  const cell = { text: '16.4.7', source: { section: '16.4.7', page: 129 }, details };
  assert.deepEqual(clickAction(cell, place, plain, reads()), { type: 'pane', place });
  assert.deepEqual(clickAction(cell, place, plain, noPane()), { type: 'browser' });
  assert.deepEqual(clickAction(cell, place, { ...plain, shiftKey: true }, reads()), { type: 'browser' });
  const origin = { text: 'TS29.061', target: place.target, details };
  assert.equal(clickAction(origin, place, plain, reads()).type, 'pane');
  assert.equal(clickAction(origin, place, plain, noPane()).type, 'both');
});

test("a name's title says what each gesture moves as things stand", () => {
  const titled = (token, place, context) => nameTitle(token, place, context);
  assert.equal(
    titled(name, elsewhere, reads()),
    'Click: definition in pane · Alt-click: definition in both · Right-click: uses',
  );
  assert.equal(
    titled(rowName, row, reads()),
    'Click: definition in pane · Alt-click: definition in both · Right-click: uses',
  );
  assert.equal(titled(name, elsewhere, noPane()), 'Click: go to definition · Right-click: uses');
  assert.equal(
    titled(name, elsewhere, reads({ paneOn: false })),
    'Click: definition in pane · Alt-click: go to definition · Right-click: uses',
  );
  assert.equal(
    titled(name, elsewhere, reads({ uses: true })),
    'Click or right-click: uses · Alt-click: definition in both',
  );
  assert.equal(
    titled(name, elsewhere, noPane({ uses: true })),
    'Click or right-click: uses · Alt-click: go to definition',
  );
  const lost = { text: 'Y', avp: 'Y' };
  const found = { document: 'd', position: { section: '6.3', page: null, name: 'Y', exact: true, occurrence: true } };
  assert.equal(titled(lost, found, reads()), 'Click: find in pane · Right-click: uses');
  assert.equal(titled(lost, found, noPane()), 'Right-click: uses');
  assert.equal(titled(lost, undefined, noPane({ uses: true })), 'Click or right-click: uses');
  const hole = { text: 'Y', avp: 'Y', source: definition };
  assert.equal(
    titled(hole, { document: 'd', position: definition }, noPane()),
    'Click: source in new tab · Right-click: uses',
  );
  const position = { section: '6.3', page: 17, name: 'V', row: true };
  const value = { text: 'V', target: { document: 'd', section: '6.3' }, source: position, valueRow: { name: 'V' } };
  const place = { document: 'd', position, target: value.target };
  assert.equal(
    titled(value, place, reads()),
    'Click: source row in pane · Alt-click: source row in both · Right-click: its table',
  );
  assert.equal(titled(value, place, noPane()), 'Click: go to its row · Right-click: its table');
  assert.equal(
    titled(value, place, reads({ uses: true })),
    'Click or right-click: its table · Alt-click: source row in both',
  );
});

test('a name goes where its place says, details or definition, and to its other place where the gesture can do less there', () => {
  const details = {
    document: 'd',
    position: { section: '16.4.7', page: 86, name: 'Y', row: true, titled: true },
    target: { document: 'd', section: '16.4.7', name: 'Y' },
    of: 'details',
  };
  const definition = { ...row, of: 'definition' };
  assert.equal(
    nameTitle(rowName, details, reads(), definition),
    'Click: details in pane · Alt-click: details in both · Right-click: uses',
  );
  assert.equal(nameTitle(rowName, details, noPane(), definition), 'Click: go to details · Right-click: uses');
  assert.equal(
    nameTitle(rowName, definition, reads(), details),
    'Click: definition in pane · Alt-click: definition in both · Right-click: uses',
  );
  const unlined = { document: 'd', position: details.position, of: 'details' };
  assert.deepEqual(clickAction(rowName, unlined, plain, reads(), definition), { type: 'pane', place: unlined });
  assert.deepEqual(
    clickAction(rowName, unlined, alt, reads(), definition),
    { type: 'both', place: definition },
    'the view has no line for it',
  );
  assert.deepEqual(
    clickAction(rowName, unlined, plain, noPane(), definition),
    { type: 'both', place: definition },
    'nor the pane a reader',
  );
  assert.equal(
    nameTitle(rowName, unlined, reads(), definition),
    'Click: details in pane · Alt-click: definition in both · Right-click: uses',
  );
  assert.deepEqual(
    clickAction(rowName, unlined, alt, reads()),
    { type: 'pane', place: unlined },
    'with nothing to fall back on',
  );
  const nowhere = { document: 'd', position: definition.position, of: 'definition' };
  assert.deepEqual(
    clickAction(rowName, unlined, alt, reads(), nowhere),
    { type: 'pane', place: unlined },
    'nor with a fallback no better',
  );
  assert.deepEqual(clickAction(rowName, unlined, plain, reads({ uses: true }), definition), { type: 'uses' });
});

test("a command's name goes to its block by the same rule, lists by the control, and its popup is its definitions", () => {
  const command = {
    text: 'ACA',
    command: { code: 271, request: false, name: 'Accounting-Answer', abbreviation: 'ACA' },
  };
  const block = {
    document: 'rfc6733',
    position: { section: '9.7.2', page: 128, name: 'Accounting-Answer' },
    target: { document: 'rfc6733', section: '9.7.2', name: 'Accounting-Answer' },
    line: 261,
    of: 'definition',
  };
  assert.deepEqual(clickAction(command, block, plain, reads()), { type: 'pane', place: block });
  assert.deepEqual(clickAction(command, block, alt, reads()), { type: 'both', place: block });
  assert.deepEqual(clickAction(command, block, plain, reads({ uses: true })), { type: 'uses' });
  assert.equal(
    nameTitle(command, block, reads()),
    'Click: definition in pane · Alt-click: definition in both · Right-click: its definitions',
  );
  assert.equal(
    nameTitle(command, block, reads({ uses: true })),
    'Click or right-click: its definitions · Alt-click: definition in both',
  );
  assert.equal(
    clickAction(command, undefined, plain, reads()).type,
    'browser',
    'a registry half no document prints goes nowhere',
  );
});
