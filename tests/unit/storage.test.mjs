import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { readStored, readStoredJSON, storageKeys, writeStored } from '../../src/storage.ts';
import { createJumpList } from '../../src/jump-list.ts';
import { createPositionStore } from '../../src/positions.ts';
import { themeColors } from '../../src/theme.ts';
import { boot } from './helpers.mjs';

const memory = (entries = {}) => {
  const map = new Map(Object.entries(entries));
  return { map, getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)) };
};
const blocked = () => { throw new Error('SecurityError'); };

test('the keys are the names the site has always stored under, so a reader keeps every setting', () => {
  assert.deepEqual(storageKeys, {
    theme: 'seanchai-theme',
    clickTarget: 'seanchai-click-target',
    outline: 'seanchai-outline',
    zoom: 'seanchai-zoom',
    positions: 'seanchai-positions',
    jumps: 'seanchai-jumps',
  });
});

test('a value is read and written under its key, and blocked storage is nothing stored and nothing thrown', () => {
  const store = memory({ 'seanchai-zoom': '1.5', 'seanchai-jumps': '{"index":0}', 'seanchai-positions': 'not json' });
  assert.equal(readStored('zoom', () => store), '1.5');
  assert.equal(readStored('outline', () => store), null);
  writeStored('outline', 'hidden', () => store);
  assert.equal(store.map.get('seanchai-outline'), 'hidden');
  assert.deepEqual(readStoredJSON('jumps', () => store), { index: 0 });
  assert.equal(readStoredJSON('positions', () => store), null, 'what no longer parses');
  assert.equal(readStoredJSON('theme', () => store), null, 'what is not there');
  assert.equal(readStored('theme', blocked), null);
  assert.equal(readStoredJSON('jumps', blocked), null);
  assert.doesNotThrow(() => writeStored('theme', 'dark', blocked));
  const full = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); } };
  assert.doesNotThrow(() => writeStored('positions', '{}', () => full));
});

test('the stores of a tab read what an earlier version wrote, and work on with storage blocked', () => {
  const store = memory({
    'seanchai-positions': JSON.stringify({ '29153-j00': { top: 12, offset: 3 } }),
    'seanchai-jumps': JSON.stringify({ entries: [{ document: '', top: 0, offset: 0, hash: '#' }], index: 1 }),
  });
  assert.deepEqual(createPositionStore(() => store).get('29153-j00'), { top: 12, offset: 3 });
  const jumps = createJumpList(() => store);
  assert.equal(jumps.entries.length, 1);
  assert.equal(jumps.index, 1);
  const positions = createPositionStore(blocked);
  positions.set('a', { top: 1, offset: 2 });
  assert.deepEqual(positions.get('a'), { top: 1, offset: 2 });
  const walks = createJumpList(blocked);
  walks.push({ document: 'a', top: 0, offset: 0, hash: '#a' });
  assert.equal(walks.entries.length, 1);
});

test('the app\'s settings are stored under their keys, as before', async () => {
  const page = await boot({ hash: '#29153-j00', clickTarget: 'definition' });
  try {
    const { document, window } = page;
    const definition = document.querySelector('.click-target input[value="definition"]');
    assert.equal(definition.checked, true, 'an earlier choice holds');
    const details = document.querySelector('.click-target input[value="details"]');
    details.click();
    assert.equal(window.localStorage.getItem('seanchai-click-target'), 'details');
    document.querySelector('.theme-toggle').click();
    assert.equal(window.localStorage.getItem('seanchai-theme'), 'dark');
  } finally { await page.close(); }
});

test('only storage.ts touches the browser\'s storage, and the pages\' inline theme read uses its key', async () => {
  const source = new URL('../../src/', import.meta.url);
  for (const file of (await readdir(source)).filter(name => name.endsWith('.ts') && name !== 'storage.ts')) {
    const text = await readFile(new URL(file, source), 'utf8');
    assert.doesNotMatch(text, /\b(localStorage|sessionStorage)\b/, file);
    for (const key of Object.values(storageKeys)) assert.ok(!text.includes(`'${key}'`) || (file === 'theme.ts' || file === 'source-pane.ts') && key === 'seanchai-theme', `${file} names ${key}`);
  }
  for (const file of ['index.html', 'rfc.html', 'viewer.html']) {
    const html = await readFile(new URL(`../../${file}`, import.meta.url), 'utf8');
    assert.ok(html.includes(`localStorage.getItem('${storageKeys.theme}')`), file);
  }
});

test('the browser\'s bar takes the header\'s colour of the stored theme', async () => {
  const css = await readFile(new URL('../../src/theme.css', import.meta.url), 'utf8');
  const chrome = block => css.match(block)[1].match(/--ui-chrome:\s*(#[\da-f]{6});/)[1];
  assert.equal(themeColors.light, chrome(/:root \{([^}]*)\}/));
  assert.equal(themeColors.dark, chrome(/:root\[data-theme="dark"\] \{([^}]*)\}/));
  const page = await boot({ prepare: ({ document }) => {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = themeColors.light;
    document.head.append(meta);
  }, stored: 'dark' });
  try {
    const meta = page.document.querySelector('meta[name="theme-color"]');
    assert.equal(meta.getAttribute('content'), themeColors.dark);
    page.document.querySelector('.theme-toggle').click();
    assert.equal(meta.getAttribute('content'), themeColors.light);
  } finally { await page.close(); }
  for (const file of ['index.html', 'rfc.html', 'viewer.html']) {
    const html = await readFile(new URL(`../../${file}`, import.meta.url), 'utf8');
    assert.ok(html.includes(`<meta name="theme-color" content="${themeColors.light}" />`), file);
  }
});
