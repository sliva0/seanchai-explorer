import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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

/** Tokens of a theme, each resolved to [r, g, b, alpha]. The dark block overrides the light one. */
async function palette(theme) {
  const css = await readFile(new URL('../../src/theme.css', import.meta.url), 'utf8');
  const blocks = theme === 'dark' ? [/:root \{([^}]*)\}/, /:root\[data-theme="dark"\] \{([^}]*)\}/] : [/:root \{([^}]*)\}/];
  const tokens = {};
  for (const block of blocks) {
    for (const [, name, value] of css.match(block)[1].matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
      const hex = value.match(/^#([\da-f]{6})$/);
      const rgb = value.match(/^rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)%\)$/);
      if (value === 'transparent') tokens[name] = [0, 0, 0, 0];
      else if (hex) tokens[name] = [0, 2, 4].map(start => parseInt(hex[1].slice(start, start + 2), 16)).concat(1);
      else if (rgb) tokens[name] = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), Number(rgb[4]) / 100];
    }
  }
  return tokens;
}

const over = ([r, g, b, alpha], base) => [r, g, b].map((value, index) => value * alpha + base[index] * (1 - alpha)).concat(1);
const luminance = color => color.slice(0, 3).map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
const contrast = (first, second) => {
  const [high, low] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (high + 0.05) / (low + 0.05);
};

test('a token\'s tint stays nearer the light paper than any highlight, and the dark theme has none', async () => {
  const light = await palette('light');
  const dark = await palette('dark');
  const paper = light['--ui-bg'];
  const distance = name => Math.max(...over(light[name], paper).slice(0, 3).map((value, index) => Math.abs(value - paper[index])));
  const tints = Object.keys(light).filter(name => name.startsWith('--syntax-') && name.endsWith('-bg'));
  assert.equal(tints.length, 8);
  const faintest = Math.min(...['--mark-bg', '--target-bg', '--ui-selected', '--ui-selection'].map(distance));
  for (const name of tints) {
    assert.ok(light[name][3] < 1, `${name} shows the band beneath`);
    assert.ok(distance(name) < faintest, `${name}: ${distance(name).toFixed(1)} against ${faintest.toFixed(1)}`);
    assert.deepEqual(dark[name], [0, 0, 0, 0], name);
  }
});

// What the dark filter in viewer.css makes of a PDF's white paper and black text.
const pdfPage = { light: { paper: [255, 255, 255, 1], text: [0, 0, 0, 1] }, dark: { paper: [27, 26, 25, 1], text: [239, 235, 228, 1] } };

for (const theme of ['light', 'dark']) {
  test(`the ${theme} palette keeps text at 4.5:1 and what marks a control or a row at 3:1 on all it lies on`, async () => {
    const tokens = await palette(theme);
    const failures = [];
    const check = (floor, foreground, ...backgrounds) => {
      for (const background of backgrounds) {
        const base = tokens['--ui-bg'];
        const value = contrast(tokens[foreground], over(tokens[background], base));
        if (value < floor) failures.push(`${foreground} on ${background}: ${value.toFixed(2)} < ${floor}`);
      }
    };
    const surfaces = ['--ui-bg', '--ui-surface', '--ui-chrome', '--ui-raised', '--ui-hover'];
    const bands = ['--ui-bg', '--ui-stripe', '--corrected-bg', '--warning-bg', '--target-bg'];
    const syntax = Object.keys(tokens).filter(name => name.startsWith('--syntax-') && !name.endsWith('-bg'));
    for (const name of ['--ui-fg', '--ui-muted', '--ui-link']) check(4.5, name, ...surfaces);
    check(4.5, '--ui-muted', '--ui-divider', ...bands);
    check(4.5, '--ui-fg', '--ui-selected', ...bands);
    check(4.5, '--ui-link', '--ui-selected', ...bands);
    for (const name of syntax) {
      check(4.5, name, '--ui-selected', ...bands);
      const tintName = `${name.replace(/-strong$/, '')}-bg`;
      for (const band of bands) {
        const value = contrast(tokens[name], over(tokens[tintName], over(tokens[band], tokens['--ui-bg'])));
        if (value < 4.5) failures.push(`${name} on ${tintName} on ${band}: ${value.toFixed(2)} < 4.5`);
      }
    }
    check(4.5, '--mark-fg', '--mark-bg');
    check(3, '--ui-border-strong', '--ui-bg', '--ui-surface', '--ui-chrome');
    check(3, '--warning', '--warning-bg');
    check(3, '--target-edge', '--target-bg');
    for (const name of ['--find-bg', '--find-current-bg']) {
      const { paper, text } = pdfPage[theme];
      const value = contrast(over(tokens[name], text), over(tokens[name], paper));
      if (value < 4.5) failures.push(`PDF text under ${name}: ${value.toFixed(2)} < 4.5`);
    }
    assert.deepEqual(failures, []);
  });
}
