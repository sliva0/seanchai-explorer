// Command names and their popups.
import assert from 'node:assert/strict';
import test from 'node:test';
import { boot, click, commandNames, frameSrc, identities, paneAt, popupOf, settle } from './helpers.mjs';

const placeRows = (popup, selector) => [...popup.querySelectorAll(selector)].map(row => [...row.children].map(node => node.textContent));
const groupTitles = popup => [...popup.querySelectorAll('.popup-group-title')].map(node => node.textContent);

test('self-hosted: a command\'s name and abbreviation are names, which go to its block in the pane, in both with alt, and list with the control', async () => {
  const page = await boot({ hash: '#29061-6f0', mode: 'self-hosted' });
  try {
    const { document, window } = page;
    const names = commandNames(document, '265 answer');
    assert.deepEqual(names.map(node => [node.textContent, node.closest('.dad-line').dataset.line, node.tagName]), [['AA-Answer', '44', 'A'], ['AAA', '44', 'BUTTON'], ['AA-Answer', '47', 'A']]);
    const abbreviation = names[1];
    abbreviation.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }));
    assert.equal(abbreviation.title, 'Click: definition in pane · Alt-click: definition in both · Right-click: its definitions', 'it has no Details to choose, so Definition it is');
    const route = window.location.hash;
    click(page, abbreviation);
    await settle();
    assert.deepEqual([paneAt(document).get('search'), paneAt(document).get('name'), paneAt(document).get('page')], ['17.6.2', 'AA-Answer', '83']);
    assert.equal(window.location.hash.split('?')[0], route.split('?')[0], 'the view stays');
    click(page, commandNames(document, '265 request')[0], { altKey: true });
    await settle();
    assert.equal(document.querySelector('.target-line').dataset.line, '15', 'the block\'s Type line');
    assert.equal(paneAt(document).get('search'), '17.6.1');
    document.querySelector('.uses-toggle input').click();
    click(page, commandNames(document, '265 answer')[2]);
    await settle();
    assert.equal(document.querySelector('.avp-popup').dataset.command, '265 answer');
  } finally { await page.close(); }
});

test('self-hosted: a command\'s popup says its header, where its application comes from, and gives its block and partner both ways', async () => {
  const page = await boot({ hash: '#29061-6f0', mode: 'self-hosted' });
  try {
    const { document } = page;
    const popup = await popupOf(page, commandNames(document, '265 answer')[1]);
    assert.equal(popup.querySelector('.popup-title strong').textContent, 'AA-Answer (AAA)');
    assert.equal(popup.getAttribute('aria-label'), 'AA-Answer (AAA)');
    assert.deepEqual(identities(popup), ['Code 265 · Answer · PXY', 'Application-ID 16777223 · Gmb · from 17, not the header']);
    assert.deepEqual(placeRows(popup, '.popup-place'), [['Definition:', '17.6.2', 'Jump to', 'Show on the right'], ['Request:', '17.6.1 · AAR', 'Jump to', 'Show on the right']]);
    assert.deepEqual(groupTitles(popup), [], 'no other document prints it, nor a registry');
    assert.match(popup.querySelector('.place-partner .view-action').getAttribute('href'), /^#29061-6f0\/17\.6\.1\?name=AA-Request&source=29061-6f0&sourceSection=17\.6\.1&page=82&sourceName=AA-Request&line=15$/);
    popup.querySelector('.place-partner .pane-action').click();
    await settle();
    assert.deepEqual([paneAt(document).get('search'), paneAt(document).get('name')], ['17.6.1', 'AA-Request']);
    assert.ok(document.querySelector('.avp-popup'), 'still open');
  } finally { await page.close(); }
});

test('a header printing its own id says no more, and one printing none with no scope says so', async () => {
  const unscoped = { header_application_id: null, application_id: null, application: null, application_clause: null };
  const bare = (path, data) => path !== 'data/documents/29109-j00.json' ? data : {
    ...data,
    lines: data.lines.map(line => ({ ...line, tokens: line.tokens.map(token => ({ ...token, text: token.text.replace('303, PXY, 16777221 >', '303, PXY >') })) })),
    blocks: data.blocks.map(block => block.command?.code === 303 && !block.command.request ? { ...block, command: { ...block.command, ...unscoped } } : block),
  };
  const page = await boot({ hash: '#29109-j00', transform: bare });
  try {
    const popup = await popupOf(page, commandNames(page.document, '303 answer')[0]);
    assert.deepEqual(identities(popup), ['Code 303 · Answer · PXY', 'No Application-ID: the header prints none']);
    popup.querySelector('.popup-title button').click();
    assert.deepEqual(identities(await popupOf(page, commandNames(page.document, '303 request')[0])), ['Code 303 · Request · REQ, PXY', 'Application-ID 16777221']);
  } finally { await page.close(); }
});

test('self-hosted: a command\'s popup lists its registry row and every other document printing it, and those printing its name for another command apart', async () => {
  const elsewhere = (document, fields) => ({ document, name: 'AA-Answer', abbreviation: 'AAA', section: '4.2', page: 9, line: 40, code: 265, flags: ['PXY'], header: null, application: 16777223, scope: { name: 'Gmb', section: '4' }, ...fields });
  const transform = (path, data) => path !== 'data/commands.json' ? data : {
    ...data,
    commands: [...data.commands, elsewhere('29109-j00'), elsewhere('29153-j00', { name: 'AA-Answer-Renamed', section: '5.6.2', line: 50 }), elsewhere('29217-j00', { section: '5.6.1', line: 60, application: 1, scope: null, header: 1 })],
    registry: [{ document: '29217-j00', code: 265, name: 'AA-Request/Answer', abbreviation: 'AAR/AAA', section: '5.1', page: 12, line: 7, table: '5.1/1', defined: ['29061-6f0'] }],
  };
  const page = await boot({ hash: '#29061-6f0', mode: 'self-hosted', transform });
  try {
    const { document, window } = page;
    const popup = await popupOf(page, commandNames(document, '265 answer')[0]);
    assert.deepEqual(groupTitles(popup), ['Other definitions 2', 'Same name, other command 1']);
    assert.deepEqual(placeRows(popup, '.place-registry'), [['Registry:', 'TS 29.217 · 5.1 · table 5.1/1', 'Jump to', 'Show on the right']]);
    assert.deepEqual(placeRows(popup, '.popup-others .place-other'), [
      ['TS 29.109:', '4.2', 'Jump to', 'Show on the right'],
      ['TS 29.153:', '5.6.2 · AA-Answer-Renamed', 'Jump to', 'Show on the right'],
    ]);
    assert.deepEqual(placeRows(popup, '.popup-differing .place-differs'), [['≠ TS 29.217:', '5.6.1 · Application-ID 1', 'Jump to', 'Show on the right']]);
    assert.equal(popup.querySelector('.command-places').childElementCount > 0, true, 'in the one grid');
    assert.match(popup.querySelector('.place-other .view-action').getAttribute('href'), /^#29109-j00\/4\.2\?name=AA-Answer&line=40$/);
    popup.querySelector('.place-other .pane-action').click();
    await settle();
    assert.equal(new URL(frameSrc(document)).searchParams.get('file').endsWith('sources/29109-j00.pdf'), true, 'the other document in the pane');
    assert.deepEqual([paneAt(document).get('search'), paneAt(document).get('name')], ['4.2', 'AA-Answer']);
    click(page, popup.querySelector('.place-registry .view-action'));
    await settle();
    assert.equal(window.location.hash.split('?')[0], '#29217-j00/5.1');
    assert.equal(document.querySelector('.target-line').dataset.line, '7');
  } finally { await page.close(); }
});

test('a build with no command index still gives a command its block and partner, and loads it once', async () => {
  const page = await boot({ hash: '#29061-6f0', commands: false });
  try {
    const popup = await popupOf(page, commandNames(page.document, '275 request')[0]);
    assert.deepEqual(placeRows(popup, '.popup-place').map(cells => cells.slice(0, 2)), [['Definition:', '17.6.3'], ['Answer:', '17.6.4 · STA']]);
    await page.go('#29109-j00');
    assert.equal(page.fetched.filter(path => path === 'data/commands.json').length, 1);
  } finally { await page.close(); }
});

test('a raw view\'s command popup lists the members its raw rule prints', async () => {
  const page = await boot({ hash: '#29061-6f0?raw=1' });
  try {
    const popup = await popupOf(page, commandNames(page.document, '258 answer')[0]);
    const members = [...popup.querySelectorAll('.contents-list code')].map(node => node.textContent);
    assert.ok(members.includes('* [ Redirected-Host ]'), members.join());
    assert.ok(!members.includes('* [ Redirect-Host ]'));
  } finally { await page.close(); }
});
