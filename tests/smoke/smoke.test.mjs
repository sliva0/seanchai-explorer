// Drives a build of the fixture export in headless Chromium: CHROMIUM=/path/to/chromium npm run test:smoke
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('../../', import.meta.url));
const dist = path.join(root, '.smoke-dist');
const executablePath = process.env.CHROMIUM ?? '/usr/bin/chromium';
const skip = !existsSync(executablePath) && `no browser at ${executablePath}`;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.txt': 'text/plain' };

let browser;
let server;
let base;

before(async () => {
  if (skip) return;
  const env = { ...process.env, SEANCHAI_EXPORT: path.join(root, 'tests/fixtures/export') };
  for (const [command, args] of [['node', ['scripts/prepare.mjs']], ['npx', ['vite', 'build', '--outDir', dist, '--logLevel', 'error']]]) {
    const result = spawnSync(command, args, { cwd: root, env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
  server = http.createServer(async (request, response) => {
    const { pathname } = new URL(request.url, 'http://localhost');
    const file = path.join(dist, decodeURIComponent(pathname === '/' ? '/index.html' : pathname));
    try {
      const body = await readFile(file);
      response.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end();
    }
  }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch({ executablePath });
});

after(async () => {
  await browser?.close();
  server?.close();
  await rm(dist, { recursive: true, force: true });
});

async function open(hash, options = {}, prepare = async () => {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...options });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await prepare(page);
  await page.goto(base + hash);
  await page.waitForSelector('main h1, main #document, main.index-view');
  return { page, context, errors, done: async () => { await context.close(); assert.deepEqual(errors, []); } };
}

test('public, desktop: a name opens the target page in the same tab', { skip }, async () => {
  const { page, context, done } = await open('#29153-i00');
  const pages = [];
  context.on('page', opened => pages.push(opened));
  assert.equal(await page.locator('iframe').count(), 0);
  await page.locator('pre a', { hasText: /^RFC6733$/ }).first().evaluate(a => a.getAttribute('href'));
  const name = page.locator('pre a[data-avp][href^="#rfc7944"]').first();
  await name.click();
  await page.waitForFunction(() => location.hash.startsWith('#rfc7944'));
  await page.waitForSelector('.document-header h1:has-text("RFC 7944")');
  assert.equal(pages.length, 0);
  assert.equal(await page.title(), 'RFC 7944 — Seanchaí');
  await page.goBack();
  await page.waitForSelector('.document-header h1:has-text("29.153")');
  await done();
});

test('mobile: no pane is loaded, names navigate, nothing scrolls sideways', { skip }, async () => {
  const { page, context, done } = await open('#rfc7944', { viewport: { width: 390, height: 800 } });
  const pages = [];
  context.on('page', opened => pages.push(opened));
  assert.equal(await page.locator('iframe').getAttribute('src'), null);
  assert.equal(await page.locator('#source-pane').isVisible(), false);
  assert.equal(await page.locator('#controls label').isVisible(), false);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.equal(await page.evaluate(() => document.querySelector('header').getBoundingClientRect().top), 0, 'the skip link stays out of the layout');
  assert.ok(await page.evaluate(() => document.querySelector('.skip-link').getBoundingClientRect().bottom <= 0));
  await page.locator('pre a[data-avp]').first().click();
  await page.waitForFunction(() => location.hash.startsWith('#rfc7944/'));
  assert.equal(pages.length, 0);
  await page.locator('.occurrences-toggle').click();
  await page.locator('pre a[data-avp]').first().click();
  await page.waitForSelector('.avp-popup');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.avp-popup').count(), 0);
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.avp !== undefined), true);
  await done();
});

test('lines are blocks reaching the pane edge, at the spacing of one text line', { skip }, async () => {
  const { page, done } = await open('#29153-i00', { viewport: { width: 1280, height: 800 } });
  const sizes = await page.evaluate(() => {
    const pane = document.querySelector('#document');
    const row = pane.querySelector('.dad-line.striped');
    const blank = [...pane.querySelectorAll('.dad-line')].find(line => line.textContent === '\n');
    const pre = pane.querySelector('pre');
    return {
      display: getComputedStyle(row).display,
      rowWidth: row.getBoundingClientRect().width,
      preWidth: pre.getBoundingClientRect().width,
      paneWidth: pane.clientWidth - 24,
      rowHeight: row.getBoundingClientRect().height,
      blankHeight: blank.getBoundingClientRect().height,
      lineHeight: parseFloat(getComputedStyle(pre).lineHeight),
    };
  });
  assert.equal(sizes.display, 'block');
  await page.goto(`${base}#29153-i00?raw=1`);
  await page.waitForSelector('.raw-warning');
  assert.equal(await page.locator('.raw-warning').first().evaluate(row => getComputedStyle(row).backgroundColor), 'rgb(255, 240, 210)');
  assert.equal(sizes.rowWidth, sizes.preWidth);
  assert.ok(sizes.rowWidth >= sizes.paneWidth);
  assert.ok(Math.abs(sizes.rowHeight - sizes.lineHeight) < 1, JSON.stringify(sizes));
  assert.ok(Math.abs(sizes.blankHeight - sizes.lineHeight) < 1, JSON.stringify(sizes));
  await done();
});

test('an RFC shows in the pane from shipped text or rfc-editor.org, and the page indicator follows', { skip }, async () => {
  const shipped = await open('#rfc7944/9.1');
  const inner = shipped.page.frameLocator('iframe');
  await inner.locator('.rfc-line', { hasText: 'DRMP AVP' }).last().waitFor();
  assert.notEqual(await shipped.page.locator('.source-header .source-page').textContent(), '');
  await shipped.done();
  let fetched = 0;
  const text = await readFile(path.join(root, 'tests/fixtures/export/sources/rfc7944.txt'));
  const fetchedRfc = await open('#rfc7944/9.1', {}, async page => {
    const withoutText = async (route, change) => {
      const response = await route.fetch();
      await route.fulfill({ response, json: change(await response.json()) });
    };
    const clear = doc => doc.source.kind === 'rfc-text' ? { ...doc, source: { ...doc.source, text: null } } : doc;
    await page.route('**/data/index.json', route => withoutText(route, data => ({ ...data, documents: data.documents.map(clear) })));
    await page.route('**/data/documents/rfc7944.json', route => withoutText(route, clear));
    await page.route('https://www.rfc-editor.org/**', route => {
      fetched++;
      return route.fulfill({ body: text, contentType: 'text/plain', headers: { 'access-control-allow-origin': '*' } });
    });
  });
  const frame = fetchedRfc.page.frameLocator('iframe');
  await frame.locator('.rfc-line', { hasText: 'DRMP AVP' }).last().waitFor();
  assert.ok(fetched >= 1);
  assert.match(await fetchedRfc.page.locator('.source-header .source-page').textContent(), /^p\. \d+$/);
  await frame.locator('#rfc').evaluate(node => { node.scrollTop = node.scrollHeight; });
  await fetchedRfc.page.waitForFunction(() => /page=\d+/.test(location.hash) && /exact=1/.test(location.hash));
  await fetchedRfc.done();
});

test('light applies under a dark OS, the reader in the pane follows the toggle, and the choice survives a reload', { skip }, async () => {
  const { page, done } = await open('#rfc7944', { colorScheme: 'dark' });
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
  const inner = page.frames().find(frame => frame.url().includes('rfc.html'));
  await inner.waitForSelector('.rfc-line', { state: 'attached' });
  assert.equal(await inner.evaluate(() => document.documentElement.dataset.theme), 'light');
  await page.locator('.theme-toggle').click();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  await inner.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await page.reload();
  await page.waitForSelector('main #document');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  await done();
});

test('the header link opens search with its input focused, and search data loads only there', { skip }, async () => {
  const requests = [];
  const { page, done } = await open('', {}, async opened => {
    opened.on('request', request => requests.push(request.url()));
  });
  assert.ok(!requests.some(url => url.endsWith('/data/search.json')));
  await page.locator('header nav a', { hasText: 'Search' }).click();
  await page.waitForSelector('.search-form input:focus');
  await page.keyboard.type('DRMP');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.search-avp summary:has-text("DRMP")');
  assert.ok(requests.some(url => url.endsWith('/data/search.json')));
  assert.equal(await page.evaluate(() => document.activeElement?.closest('.search-form') !== null), true);
  await page.locator('.mention-link').first().click();
  await page.waitForSelector('.target-line');
  await done();
});
