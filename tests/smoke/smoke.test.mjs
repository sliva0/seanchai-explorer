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
  // With no icon declared, the browser asks for one at the default path.
  page.on('console', message => { if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico')) errors.push(message.text()); });
  await prepare(page);
  await page.goto(base + hash);
  await page.waitForSelector('main h1, main #document, main.index-view');
  return { page, context, errors, done: async () => { await context.close(); assert.deepEqual(errors, []); } };
}

test('public, desktop: a value row: search groups it, its link marks the row, its name keeps a popup with its table', { skip }, async () => {
  const { page, done } = await open('#search?q=DIAMETER_ERROR_SERVICE_AREA');
  await page.locator('.search-result-codes summary').click();
  await page.locator('.search-result-codes li a').click();
  await page.waitForSelector('.target-line');
  assert.match(await page.locator('.target-line').textContent(), /^DIAMETER_ERROR_SERVICE_AREA\s+= 5123 ; 17\.8\.2/);
  const inView = await page.locator('.target-line').evaluate(line => {
    const pane = document.querySelector('#document').getBoundingClientRect();
    const box = line.getBoundingClientRect();
    return box.top >= pane.top && box.bottom <= pane.bottom;
  });
  assert.ok(inView);
  assert.equal(await page.locator('.target-line .variable\\.other\\.enum\\.dad').count(), 1, 'its name is coloured as an enum value');
  await page.locator('.target-line .value-name').click({ modifiers: ['Alt'] });
  assert.match(await page.locator('.avp-popup').textContent(), /Result code 5123 of Experimental-Result-Code/);
  await page.locator('.avp-popup .popup-actions button', { hasText: 'Next' }).click();
  assert.match(await page.locator('.avp-popup .usage-link[aria-current]').textContent(), /DIAMETER_ERROR_OUT_OF_RESOURCES/);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.avp-popup').count(), 0);
  await done();
});

test('after a reload the occurrences control is off, and only alt lists a name', { skip }, async () => {
  const { page, done } = await open('#29061-6f0');
  const control = page.locator('.occurrences-toggle input');
  await control.check();
  await page.reload();
  await page.waitForSelector('pre .value-name');
  assert.equal(await control.isChecked(), false);
  await page.locator('pre .value-name').first().click();
  await page.waitForTimeout(50);
  assert.equal(await page.locator('.avp-popup').count(), 0, 'a value name is followed');
  await page.locator('pre .value-name').first().click({ modifiers: ['Alt'] });
  await page.waitForSelector('.avp-popup');
  await page.keyboard.press('Escape');
  await page.locator('pre a[data-avp]').first().click();
  await page.waitForTimeout(50);
  assert.equal(await page.locator('.avp-popup').count(), 0, 'a name is followed');
  await done();
});

test('public, desktop: ; From: links to the document a reprint comes from', { skip }, async () => {
  const { page, context, done } = await open('#29109-j00');
  const pages = [];
  context.on('page', opened => pages.push(opened));
  const from = page.locator('.dad-line', { hasText: /^; From: RFC6733/ }).first().locator('a');
  assert.equal(await from.getAttribute('href'), '#rfc6733');
  await from.click();
  await page.waitForFunction(() => location.hash === '#rfc6733');
  assert.deepEqual(pages, []);
  await done();
});

test('public, desktop: a PDF\'s pane is a placeholder, and names swap it for their RFC or theirs', { skip }, async () => {
  const { page, context, done } = await open('#29153-j00');
  const pages = [];
  context.on('page', opened => pages.push(opened));
  const placeholder = page.locator('#source-pane .source-placeholder');
  await placeholder.waitFor();
  assert.equal(await page.locator('iframe').count(), 0);
  assert.equal(await page.locator('.source-toggle').isVisible(), true);
  assert.match(await placeholder.textContent(), /The PDF of TS 29\.153 V19\.0\.0 cannot be shown here/);
  const fit = await placeholder.evaluate(node => {
    const pane = node.parentElement.getBoundingClientRect();
    const box = node.getBoundingClientRect();
    const text = node.querySelector('p').getBoundingClientRect();
    return { filled: box.width === pane.width && box.height === pane.height, centred: Math.abs(text.left + text.right - pane.left - pane.right) < 2, overflows: node.scrollHeight > node.clientHeight };
  });
  assert.deepEqual(fit, { filled: true, centred: true, overflows: false });
  await page.locator('pre a[data-avp][href^="#rfc7944"]').first().click();
  await page.frameLocator('iframe').locator('.rfc-line', { hasText: 'DRMP AVP' }).last().waitFor();
  await page.waitForSelector('.source-header h2:has-text("RFC 7944")');
  assert.equal(await placeholder.count(), 0);
  assert.equal(await page.title(), 'TS 29.153 — Seanchaí');
  assert.ok(await page.evaluate(() => location.hash.startsWith('#29153-j00?') && location.hash.includes('source=rfc7944')));
  await page.locator('pre a[data-avp][href^="#29217-j00"]').first().click();
  await placeholder.waitFor();
  assert.match(await placeholder.textContent(), /TS 29\.217/);
  assert.match(await placeholder.locator('a').first().getAttribute('href'), /ts_129217v190000p\.pdf#page=\d+$/);
  assert.equal(await page.locator('iframe').count(), 0);
  assert.equal(pages.length, 0);
  await done();
});

test('public, desktop: with the pane off a name opens the target page in the same tab', { skip }, async () => {
  const { page, context, done } = await open('#29153-j00?pane=0');
  const pages = [];
  context.on('page', opened => pages.push(opened));
  await page.locator('pre a[data-avp][href^="#rfc7944"]').first().click();
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
  assert.equal(await page.locator('.source-toggle').isVisible(), false);
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

test('the strip\'s section panel is bounded, one column, and moves the text below only by its own height', { skip }, async () => {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 780 }]) {
    const { page, done } = await open('#29217-j00', { viewport });
    const geometry = () => page.evaluate(() => ({
      toggle: document.querySelector('#diagnostics button').getBoundingClientRect().toJSON(),
      strip: document.querySelector('#document-tools').getBoundingClientRect().height,
      text: document.querySelector('#document').getBoundingClientRect().top,
      width: document.querySelector('#document').getBoundingClientRect().width,
      scrollTop: document.querySelector('#document').scrollTop,
    }));
    const before = await geometry();
    await page.locator('#diagnostics button').first().click();
    const after = await geometry();
    const panel = await page.locator('.diagnostic-panel:not([hidden])').evaluate(node => {
      const items = [...node.querySelectorAll('li')].map(item => item.getBoundingClientRect());
      const links = [...node.querySelectorAll('li a')].map(a => a.getBoundingClientRect().left);
      return {
        height: node.getBoundingClientRect().height,
        rowsStacked: items.every((item, index) => !index || item.top >= items[index - 1].bottom - 0.5),
        sameLeft: new Set(links).size,
        overflowsSideways: node.scrollWidth > node.clientWidth,
      };
    });
    assert.deepEqual(after.toggle, before.toggle, 'the toggle stays put');
    assert.ok(panel.height <= Math.min(viewport.height * 0.4, 18 * 16) + 1, JSON.stringify(panel));
    assert.ok(panel.rowsStacked);
    assert.equal(panel.sameLeft, 1, 'entries align');
    assert.equal(panel.overflowsSideways, false);
    assert.ok(Math.abs(after.text - before.text - (after.strip - before.strip)) < 1, 'the text moves by the panel alone');
    assert.equal(after.width, before.width);
    assert.equal(after.scrollTop, before.scrollTop);
    await page.locator('#diagnostics button').first().click();
    assert.deepEqual(await geometry(), before, 'closing restores it');
    await done();
  }
});

test('the header stays put, and neither theme label nor text length moves what is beside it', { skip }, async () => {
  const { page, done } = await open('#rfc7944/9.1');
  const top = selector => page.locator(selector).evaluate(node => node.getBoundingClientRect().top);
  await page.evaluate(() => {
    for (const node of [document.scrollingElement, document.body, document.querySelector('#app'), document.querySelector('#content'), document.querySelector('#workspace')]) node.scrollTop = 200;
    window.scrollTo(0, 200);
  });
  assert.equal(await top('header'), 0);
  await page.locator('pre [data-avp]').last().evaluate(node => node.scrollIntoView());
  assert.equal(await top('header'), 0);
  const theme = page.locator('.theme-toggle');
  const box = await theme.boundingBox();
  await theme.click();
  assert.equal(await theme.textContent(), 'Light');
  assert.deepEqual(await theme.boundingBox(), box, 'the toggle keeps its size for either label');
  const headerTop = await top('#workspace');
  const header = await page.locator('.source-header').boundingBox();
  await page.locator('.occurrences-toggle input').check();
  assert.equal(await top('#workspace'), headerTop);
  assert.deepEqual(await page.locator('.source-header').boundingBox(), header);
  await done();
});

test('the splitter follows the pointer from where it was grabbed, without jumping', { skip }, async () => {
  const { page, done } = await open('#rfc7944');
  const divider = page.locator('#divider');
  const start = await divider.boundingBox();
  const rows = await page.locator('.document-header').boundingBox();
  const grabbed = start.x + 2;
  await page.mouse.move(grabbed, 400);
  await page.mouse.down();
  assert.ok(await page.locator('#workspace.resizing').count());
  await page.mouse.move(grabbed, 400);
  await page.waitForTimeout(50);
  assert.ok(Math.abs((await divider.boundingBox()).x - start.x) <= 1, 'no jump on the first move');
  await page.mouse.move(grabbed + 120, 300);
  await page.waitForTimeout(50);
  assert.ok(Math.abs((await divider.boundingBox()).x - (start.x + 120)) <= 1);
  await page.mouse.up();
  assert.equal(await page.locator('#workspace.resizing').count(), 0);
  assert.equal((await page.locator('.document-header').boundingBox()).height, rows.height);
  await page.locator('.source-toggle input').uncheck();
  const widths = await page.locator('#document').boundingBox();
  assert.equal(widths.width, 1280, 'with no source the text has the whole width');
  await page.locator('.source-toggle input').check();
  assert.ok(Math.abs((await divider.boundingBox()).x - (start.x + 120)) <= 1, 'the split is kept');
  await done();
});

test('a quick document load keeps the old page until the new one, a slow one says it is loading', { skip }, async () => {
  const { page, done } = await open('#rfc7944', {}, async opened => {
    await opened.route('**/data/documents/29153-j00.json', async route => {
      await new Promise(resolve => setTimeout(resolve, 600));
      await route.continue();
    });
  });
  await page.evaluate(() => { location.hash = '#29153-j00'; });
  await page.waitForTimeout(60);
  assert.ok(await page.locator('main #document').count(), 'the old page stays at first');
  await page.waitForSelector('main [role="status"]');
  await page.waitForSelector('.document-header h1:has-text("29.153")');
  assert.equal(await page.locator('main [role="status"]').count(), 0);
  await done();
});

test('the occurrence popup is compact, monospace, sized to content, and has one scrollbar', { skip }, async () => {
  const { page, done } = await open('#29153-j00');
  await page.locator('.occurrences-toggle input').check();
  await page.locator('pre a[data-avp]').first().click();
  const popup = await page.locator('.avp-popup').evaluate(node => {
    const list = node.querySelector('.usage-list');
    const style = getComputedStyle(node);
    const box = node.getBoundingClientRect();
    return { font: style.fontFamily, width: box.width, height: box.height, bottom: box.bottom, selfScrolls: node.scrollHeight > node.clientHeight, listOverflow: getComputedStyle(list).overflowY };
  });
  assert.match(popup.font, /monospace/);
  assert.ok(popup.width <= 80 * 8, JSON.stringify(popup));
  assert.ok(popup.height <= 22 * 16 + 1, JSON.stringify(popup));
  assert.ok(popup.bottom <= 800);
  assert.equal(popup.selfScrolls, false, 'only its list scrolls');
  await page.keyboard.press('Escape');
  await done();
});

test('lines are blocks reaching the pane edge, at the spacing of one text line', { skip }, async () => {
  const { page, done } = await open('#29153-j00', { viewport: { width: 1280, height: 800 } });
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
  await page.goto(`${base}#29153-j00?raw=1`);
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

test('search: a typo finds a labelled name, mentions group by document, and the keyboard opens a result', { skip }, async () => {
  const { page, done } = await open('#search?q=DRMPP');
  await page.waitForSelector('.search-avp details.approximate summary:has-text("DRMP")');
  assert.equal(await page.locator('.search-avp details.approximate em').first().textContent(), 'approximate');
  await page.locator('.search-form input').fill('DRMP');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.search-mentions .mention-document h3 a');
  const headings = await page.locator('.mention-document h3 a').allTextContents();
  assert.equal(new Set(headings).size, headings.length, 'one heading per document');
  assert.ok(await page.locator('.mention-document li .mention-link').first().textContent().then(text => text.startsWith('· ')));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways scroll');
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'SUMMARY');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.search-avp details[open]');
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'A');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !location.hash.startsWith('#search'));
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
