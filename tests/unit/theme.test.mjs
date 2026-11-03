import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveTheme } from '../../src/theme.ts';
import { boot, settle } from './helpers.mjs';

test('a stored theme wins over the OS, which decides otherwise', () => {
  assert.equal(resolveTheme('dark', false), 'dark');
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme(null, true), 'dark');
  assert.equal(resolveTheme(null, false), 'light');
  assert.equal(resolveTheme('sepia', true), 'dark');
});

test('the page follows the OS until toggled, and toggling back follows it again', async () => {
  const page = await boot({ system: 'dark' });
  try {
    const root = page.document.documentElement;
    const button = page.document.querySelector('.theme-toggle');
    assert.equal(root.dataset.theme, 'dark');
    assert.equal(button.textContent, 'Light');
    page.setSystem('light');
    assert.equal(root.dataset.theme, 'light');
    button.click();
    assert.equal(root.dataset.theme, 'dark');
    assert.equal(page.window.localStorage.getItem('seanchai-theme'), 'dark');
    page.setSystem('dark');
    page.setSystem('light');
    assert.equal(root.dataset.theme, 'dark');
    button.click();
    assert.equal(root.dataset.theme, 'light');
    assert.equal(page.window.localStorage.getItem('seanchai-theme'), null);
    page.window.dispatchEvent(new page.window.StorageEvent('storage', { key: 'seanchai-theme', newValue: 'dark' }));
    assert.equal(root.dataset.theme, 'dark');
    await settle();
  } finally { await page.close(); }
});

test('a stored theme applies on load, and the three pages carry the pre-paint script', async () => {
  const { readFile } = await import('node:fs/promises');
  const page = await boot({ system: 'dark', stored: 'light' });
  try {
    assert.equal(page.document.documentElement.dataset.theme, 'light');
  } finally { await page.close(); }
  for (const file of ['index.html', 'rfc.html', 'viewer.html']) {
    const html = await readFile(new URL(`../../${file}`, import.meta.url), 'utf8');
    assert.match(html, /<head>[\s\S]*prefers-color-scheme[\s\S]*<\/head>/, file);
  }
});
