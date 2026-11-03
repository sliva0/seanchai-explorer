import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveTheme } from '../../src/theme.ts';
import { boot, settle } from './helpers.mjs';

test('a stored dark theme is kept, anything else is light', () => {
  assert.equal(resolveTheme('dark'), 'dark');
  assert.equal(resolveTheme('light'), 'light');
  assert.equal(resolveTheme(null), 'light');
  assert.equal(resolveTheme('sepia'), 'light');
});

test('the page starts light whatever the OS says, and keeps what the toggle chose', async () => {
  const page = await boot({ system: 'dark' });
  try {
    const root = page.document.documentElement;
    const button = page.document.querySelector('.theme-toggle');
    assert.equal(root.dataset.theme, 'light');
    assert.equal(button.textContent, 'Dark');
    button.click();
    assert.equal(root.dataset.theme, 'dark');
    assert.equal(page.window.localStorage.getItem('seanchai-theme'), 'dark');
    page.setSystem('light');
    assert.equal(root.dataset.theme, 'dark');
    button.click();
    assert.equal(root.dataset.theme, 'light');
    page.setSystem('dark');
    assert.equal(root.dataset.theme, 'light');
    assert.equal(page.window.localStorage.getItem('seanchai-theme'), 'light');
    page.window.dispatchEvent(new page.window.StorageEvent('storage', { key: 'seanchai-theme', newValue: 'dark' }));
    assert.equal(root.dataset.theme, 'dark');
    await settle();
  } finally { await page.close(); }
});

test('a stored theme applies on load, and the three pages carry a pre-paint script ignoring the OS', async () => {
  const { readFile } = await import('node:fs/promises');
  const page = await boot({ system: 'light', stored: 'dark' });
  try {
    assert.equal(page.document.documentElement.dataset.theme, 'dark');
  } finally { await page.close(); }
  for (const file of ['index.html', 'rfc.html', 'viewer.html']) {
    const html = await readFile(new URL(`../../${file}`, import.meta.url), 'utf8');
    assert.match(html, /<head>[\s\S]*seanchai-theme[\s\S]*<\/head>/, file);
    assert.doesNotMatch(html, /prefers-color-scheme/, file);
  }
});
