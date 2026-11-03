import assert from 'node:assert/strict';
import test from 'node:test';
import { filterMentions, identityLabel, searchEntries, searchSpecifications, sortMentions } from '../../src/search.ts';
import { boot, readFixture, settle } from './helpers.mjs';

const avp = (name, vendor_id, code, more = {}) => ({ name, kind: 'avp', document: 'a', identity: { kind: 'avp', vendor_id, code }, wireshark_name: null, abbreviation: null, defined_in: [], ...more });
const command = (name, command_code, application_id, more = {}) => ({ name, kind: 'command', document: 'a', identity: { kind: 'command', command_code, application_id, header_application_id: application_id, application: null }, wireshark_name: null, abbreviation: null, defined_in: [], ...more });
const application = (name, application_id) => ({ name, kind: 'application', document: 'a', identity: { kind: 'application', application_id }, wireshark_name: null, abbreviation: null, defined_in: [] });
const registry = (name, code) => ({ name, kind: 'registry', document: 'a', identity: { kind: 'registry', registry: 'Application IDs', code }, wireshark_name: null, abbreviation: null, defined_in: [] });
const names = groups => groups.map(group => group.name);

test('every kind of name is searched, and a number means what it identifies for each kind', () => {
  const entries = [avp('Session-Id', 0, 263), avp('Other', 10415, 300), command('Capabilities-Exchange-Request', 257, 0, { abbreviation: 'CER' }), command('Three-Hundred', 300, 16777216), application('Cx', 16777216), registry('3GPP Cx/Px', 16777216), registry('Code-300', 300)];
  const code = searchEntries(entries, '300');
  assert.deepEqual(names(code.avp), ['Other']);
  assert.deepEqual(names(code.command), ['Three-Hundred']);
  assert.deepEqual(names(code.registry), ['Code-300']);
  assert.deepEqual(names(code.application), []);
  const id = searchEntries(entries, '16777216');
  assert.deepEqual(names(id.application), ['Cx']);
  assert.deepEqual(names(id.registry), ['3GPP Cx/Px']);
  assert.deepEqual(names(id.command), ['Three-Hundred']);
  assert.deepEqual(names(id.avp), []);
  assert.deepEqual(names(searchEntries(entries, '30').avp), [], 'not part of a code');
  assert.deepEqual(names(searchEntries(entries, '10415:300').avp), ['Other']);
  assert.deepEqual(names(searchEntries(entries, '10415/300').avp), ['Other']);
  assert.deepEqual(names(searchEntries(entries, '0:300').avp), []);
  assert.deepEqual(names(searchEntries(entries, '16777216:300').command), ['Three-Hundred']);
  assert.deepEqual(names(searchEntries(entries, 'cer').command), ['Capabilities-Exchange-Request']);
  assert.deepEqual(names(searchEntries(entries, 'cx').application), ['Cx']);
});

test('a command is found by its resolved application name too', () => {
  const entry = command('Update-Location-Request', 316, 16777251);
  entry.identity.application = 'S6a/S6d';
  assert.deepEqual(names(searchEntries([entry], 's6a').command), ['Update-Location-Request']);
});

test('results go exact, prefix, then substring', () => {
  const entries = ['Mid-Session', 'Session', 'Session-Id', 'A-Session-B', 'Session-Binding'].map((name, code) => avp(name, 0, code));
  assert.deepEqual(names(searchEntries(entries, 'session').avp), ['Session', 'Session-Binding', 'Session-Id', 'A-Session-B', 'Mid-Session']);
});

test('aliases find all occurrences without merging different wire identities', () => {
  const entry = avp('Call-Barring-Info', 10415, 1488, { wireshark_name: 'Call-Barring-Infor-List', document: 'a' });
  const found = searchEntries([entry, { ...entry, document: 'b' }, { ...entry, identity: { kind: 'avp', vendor_id: 0, code: 1488 }, document: 'c' }], '  infor-list ').avp;
  assert.deepEqual(found.map(group => group.entries.length).sort(), [1, 2]);
  assert.deepEqual(names(searchEntries([entry], '').avp), []);
  assert.deepEqual(names(searchEntries([entry], 'missing').avp), []);
});

test('a group lists its newest release first', () => {
  const release = { old: { release: 6 }, new: { release: 18 } };
  const found = searchEntries([avp('X', 0, 1, { document: 'old' }), avp('X', 0, 1, { document: 'new' })], 'x', id => release[id]).avp;
  assert.deepEqual(found[0].entries.map(entry => entry.document), ['new', 'old']);
});

test('identities read per kind', () => {
  assert.equal(identityLabel(avp('X', 10415, 505)), '10415:505');
  assert.equal(identityLabel(application('X', 4)), 'Application 4');
  assert.equal(identityLabel(registry('X', 4)), 'Application IDs 4');
  const bare = command('X', 316, 16777251);
  bare.identity.header_application_id = null;
  bare.identity.application = 'S6a';
  assert.equal(identityLabel(bare), 'Command 316 · application 16777251 (S6a) · header none');
  assert.equal(identityLabel(command('X', 316, 4)), 'Command 316 · application 4');
  assert.equal(identityLabel({ identity: null }), '');
});

test('specifications match by number or title, best match and newest first', () => {
  const doc = (id, reference, specification, title, release) => ({ id, reference, specification, title, version: null, release });
  const documents = [
    doc('29214-7c0', 'TS29.214', '3GPP TS 29.214', 'Policy and charging control over Rx', 7),
    doc('29214-i40', 'TS29.214', '3GPP TS 29.214', 'Policy and charging control over Rx', 18),
    doc('32299-i00', 'TS32.299', '3GPP TS 32.299', 'Mentions TS29.214 only in title 29214', 18),
    doc('rfc2', 'RFC2', 'RFC 2', 'Other', null),
    doc('rfc29', 'RFC29', 'RFC 29', 'Other', null),
  ];
  const ids = query => searchSpecifications(documents, query).map(doc => doc.id);
  assert.deepEqual(ids('29214'), ['29214-i40', '29214-7c0', '32299-i00']);
  assert.deepEqual(ids('29.214'), ['29214-i40', '29214-7c0', '32299-i00']);
  assert.deepEqual(ids('policy rx'), ['29214-i40', '29214-7c0']);
  assert.deepEqual(ids('29.215'), []);
  assert.deepEqual(ids('rfc2'), ['rfc2', 'rfc29']);
  assert.deepEqual(ids(' '), []);
});

test('mentions match on every word or a found AVP, newest release first', () => {
  const mentions = [
    { document: 'old', section: '1', line: 1, text: 'Session Id here', avps: [] },
    { document: 'new', section: '1', line: 2, text: 'names it', avps: ['Session-Id'] },
    { document: 'rfc', section: '1', line: 3, text: 'id session', avps: [] },
    { document: 'new', section: '1', line: 4, text: 'session only', avps: [] },
  ];
  const summary = id => ({ old: { release: 6 }, new: { release: 18 }, rfc: { release: null } })[id];
  const sorted = sortMentions(mentions, summary);
  assert.deepEqual(sorted.map(mention => mention.line), [2, 4, 1, 3]);
  assert.deepEqual(filterMentions(sorted, 'session id', new Set()).map(mention => mention.line), [1, 3]);
  assert.deepEqual(filterMentions(sorted, 'session id', new Set(['Session-Id'])).map(mention => mention.line), [2, 1, 3]);
  assert.deepEqual(filterMentions(sorted, '', new Set(['Session-Id'])), []);
});

test('the search page shows a section per kind with matches over the fixture, and focuses its input', async () => {
  const { entries } = await readFixture('search.json');
  const named = kind => entries.find(entry => entry.kind === kind && entry.identity && entry.target);
  const page = await boot({ hash: `#search?q=${encodeURIComponent(named('command').name)}` });
  try {
    const { document, window } = page;
    const headings = [...document.querySelectorAll('#search-results h2')].map(node => node.textContent);
    assert.ok(headings.some(heading => heading.startsWith('Commands (')));
    assert.ok(!headings.some(heading => heading.endsWith('(0)')), 'groups without matches are left out');
    assert.ok(document.querySelector('.search-command summary').textContent.includes(named('command').name));
    const input = document.querySelector('.search-form input');
    assert.equal(document.activeElement, input);
    assert.equal(document.querySelector('.header-search').hidden, true);
    input.value = named('application').name;
    input.dispatchEvent(new window.Event('input'));
    assert.match(window.location.hash, /^#search\?q=/);
    document.querySelector('.search-form').dispatchEvent(new window.Event('submit', { cancelable: true }));
    assert.ok(document.querySelector('.search-application summary').textContent.includes(named('application').name));
    const mention = document.querySelector('.search-mentions .mention-link');
    assert.match(mention.getAttribute('href'), /line=\d+/);
  } finally { await page.close(); }
});

test('more shows every remaining entry of its group, and only of that group', async () => {
  const { entries } = await readFixture('search.json');
  const base = entries.find(entry => entry.kind === 'avp' && entry.identity && entry.target);
  const extra = Array.from({ length: 47 }, (_, index) => ({ ...base, name: `Zzexpand-${index}`, abbreviation: null, wireshark_name: null, identity: { ...base.identity, code: 900000 + index } }));
  const mentions = Array.from({ length: 47 }, (_, index) => ({ document: base.document, section: null, line: index + 1, text: `zzexpand ${index}` }));
  const page = await boot({ hash: '#search?q=zzexpand', transform: (path, data) => path === 'data/search.json' ? { ...data, entries: [...data.entries, ...extra], mentions: [...data.mentions, ...mentions] } : data });
  try {
    const { document } = page;
    assert.deepEqual([...document.querySelectorAll('#search-results h2')].map(node => node.textContent), ['AVPs (47)', 'Mentions (47)']);
    assert.equal(document.querySelectorAll('.search-avp details').length, 20);
    assert.equal(document.querySelectorAll('.search-mentions li').length, 20);
    document.querySelector('.search-avp details').open = true;
    document.querySelector('.search-avp > button').click();
    assert.equal(document.querySelectorAll('.search-avp details').length, 47);
    assert.equal(document.querySelector('.search-avp > button'), null);
    assert.equal(document.querySelector('.search-avp details').open, true, 'what is open stays open');
    assert.equal(document.querySelectorAll('.search-mentions li').length, 20);
    assert.ok(document.querySelector('.search-mentions > button'));
  } finally { await page.close(); }
});

test('a search matching nothing has no headings', async () => {
  const page = await boot({ hash: '#search?q=zzznothing' });
  try {
    const results = page.document.querySelector('#search-results');
    assert.equal(results.querySelector('h2'), null);
    assert.equal(results.textContent, 'No matches.');
  } finally { await page.close(); }
});

test('the header box searches from any page, and / focuses it unless typing', async () => {
  const page = await boot({ hash: '#29153-i00' });
  try {
    const { document, window } = page;
    const input = document.querySelector('.header-search input');
    const press = (target, init = {}) => target.dispatchEvent(new window.KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true, ...init }));
    press(document.body);
    assert.equal(document.activeElement, input);
    input.blur();
    press(document.body, { ctrlKey: true });
    assert.notEqual(document.activeElement, input);
    input.focus();
    assert.equal(press(input), true, 'typing a slash in a field is left alone');
    input.value = 'DRMP';
    document.querySelector('.header-search').dispatchEvent(new window.Event('submit', { cancelable: true }));
    await settle();
    assert.equal(window.location.hash, '#search?q=DRMP');
    assert.equal(document.querySelector('.search-form input').value, 'DRMP');
    assert.ok(document.querySelector('.search-avp details'));
  } finally { await page.close(); }
});
