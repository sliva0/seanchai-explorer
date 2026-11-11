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
  await page.locator('.search-result-codes .entry-document a').click();
  await page.waitForSelector('.target-line');
  assert.match(await page.locator('.target-line').textContent(), /^DIAMETER_ERROR_SERVICE_AREA\s+= 5123 ; 17\.8\.2/);
  const inView = await page.locator('.target-line').evaluate(line => {
    const pane = document.querySelector('#document').getBoundingClientRect();
    const box = line.getBoundingClientRect();
    return box.top >= pane.top && box.bottom <= pane.bottom;
  });
  assert.ok(inView);
  assert.equal(await page.locator('.target-line .variable\\.other\\.enum\\.dad').count(), 1, 'its name is coloured as an enum value');
  await page.locator('.target-line .value-name').click({ button: 'right' });
  assert.match(await page.locator('.avp-popup').textContent(), /Result code 5123 of Experimental-Result-Code/);
  await page.locator('.avp-popup .popup-actions button', { hasText: 'Next' }).click();
  assert.match(await page.locator('.avp-popup .usage-link[aria-current]').textContent(), /DIAMETER_ERROR_OUT_OF_RESOURCES/);
  assert.equal(await page.locator('.avp-current').evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(213, 227, 248)', 'the walked row shows over its token\'s tint');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.avp-popup').count(), 0);
  await done();
});

test('public, desktop: a result code another document defines links to its row there, and its popup and search say so', { skip }, async () => {
  const { page, done } = await open('#29283-j00');
  const line = page.locator('.dad-line', { hasText: /^DIAMETER_ERROR_USER_DATA_NOT_RECOGNIZED\s+= 5100 ; 7\.4\.3\.3\s+from TS29\.329/ });
  const origin = line.locator('a', { hasText: 'TS29.329' });
  assert.equal(await origin.getAttribute('href'), '#29329-j10/6.2.2.1?name=DIAMETER_ERROR_USER_DATA_NOT_RECOGNIZED');
  const looks = await line.evaluate(node => {
    const from = [...node.querySelectorAll('span')].find(span => span.textContent === 'from');
    const link = [...node.querySelectorAll('a')].find(anchor => anchor.textContent === 'TS29.329');
    return { from: from && getComputedStyle(from).fontWeight, linked: link.className };
  });
  assert.equal(looks.from, '700', 'the grammar\'s keyword');
  assert.match(looks.linked, /spec-ref/, 'and its reference');
  await line.locator('.value-name').click({ button: 'right' });
  const row = page.locator('.avp-popup .place-origin');
  assert.equal(await row.locator('.place-where').textContent(), 'TS 29.329 · 6.2.2.1');
  assert.equal(await row.locator('.pane-action').count(), 0, 'a PDF\'s pane is a placeholder, so only the text\'s way');
  const box = await page.locator('.avp-popup').evaluate(popup => ({ width: popup.getBoundingClientRect().width, scrolls: popup.scrollHeight > popup.clientHeight }));
  assert.ok(box.width <= 80 * 8 && !box.scrolls, JSON.stringify(box));
  await page.keyboard.press('Escape');
  await origin.click();
  await page.waitForSelector('.target-line');
  assert.match(await page.locator('.target-line').textContent(), /^DIAMETER_ERROR_USER_DATA_NOT_RECOGNIZED\s+= 5100 ; 6\.2\.2\.1/);
  await page.goto(`${base}#search?q=DIAMETER_ERROR_USER_DATA_NOT_RECOGNIZED`);
  const facts = page.locator('.search-result-codes .entry-facts').first();
  await facts.waitFor();
  assert.match(await facts.textContent(), /· defined in TS 29\.329$/);
  assert.equal(await facts.locator('a').getAttribute('href'), '#29329-j10/6.2.2.1?name=DIAMETER_ERROR_USER_DATA_NOT_RECOGNIZED');
  await done();
});

test('public, desktop: a clause\'s stated origin is a block of its own, its row the clause\'s, and the wildcard\'s note no row', { skip }, async () => {
  const { page, done } = await open('#29329-j10/6.3.9');
  const lines = await page.locator('.dad-line[data-section="6.3.9"]').evaluateAll(nodes => nodes.map(node => [node.textContent.trimEnd(), node.classList.contains('table-row')]));
  assert.deepEqual(lines.slice(0, 5), [['; Type: Reused AVPs', false], ['; Section: 6.3.9', false], ['; Page: 21', false], ['; Columns: Name   From', false], ['Server-Name       TS29.229', true]]);
  assert.match(await page.locator('.section-crumb').textContent(), /^6\.3\.9 · Reused AVPs Server-Name$/);
  await done();
});

test('after a reload the uses control is off, only a right-click lists a name, and alt goes to its definition', { skip }, async () => {
  const { page, done } = await open('#29061-6f0');
  const control = page.locator('.uses-toggle input');
  await control.check();
  await page.reload();
  await page.waitForSelector('pre .value-name');
  assert.equal(await control.isChecked(), false);
  await page.locator('pre .value-name').first().click();
  await page.waitForTimeout(50);
  assert.equal(await page.locator('.avp-popup').count(), 0, 'a value name is followed');
  await page.locator('pre .value-name').first().click({ button: 'right' });
  await page.waitForSelector('.avp-popup');
  await page.keyboard.press('Escape');
  await page.locator('pre a[data-avp]').first().click({ button: 'right' });
  await page.waitForSelector('.avp-popup');
  assert.match(await page.locator('.avp-popup .popup-title strong').textContent(), /^[A-Za-z0-9][A-Za-z0-9_-]*$/);
  await page.keyboard.press('Escape');
  await page.locator('pre a[data-avp]').first().click({ modifiers: ['Alt'] });
  await page.waitForTimeout(50);
  assert.equal(await page.locator('.avp-popup').count(), 0, 'alt lists nothing');
  await page.goto(`${base}#29061-6f0`);
  await page.waitForSelector('pre a[data-avp]');
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

test('public, desktop: a PDF\'s pane is a placeholder, a name in an RFC takes the pane alone, and one in a PDF goes to its page', { skip }, async () => {
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
  await scrollPane(page, 1237);
  const left = await scrollOf(page);
  await page.locator('pre a[data-avp][href^="#rfc7944"]').first().evaluate(node => node.click());
  await page.frameLocator('iframe').locator('.rfc-line', { hasText: 'DRMP AVP' }).last().waitFor();
  await page.waitForSelector('.source-header h2:has-text("RFC 7944")');
  assert.equal(await placeholder.count(), 0);
  assert.equal(await page.title(), 'TS 29.153 — Seanchaí');
  assert.ok(await page.evaluate(() => location.hash.startsWith('#29153-j00?') && location.hash.includes('source=rfc7944')));
  near(await scrollOf(page), left, 'the text stays');
  await page.locator('pre a[data-avp][href^="#29217-j00"]').first().evaluate(node => node.click());
  await page.waitForSelector('.document-header h1:has-text("29.217")');
  assert.ok(await page.evaluate(() => location.hash.startsWith('#29217-j00/')));
  await placeholder.waitFor();
  assert.match(await placeholder.textContent(), /TS 29\.217/);
  assert.match(await placeholder.locator('a').first().getAttribute('href'), /ts_129217v190000p\.pdf#page=\d+$/);
  assert.equal(await page.locator('iframe').count(), 0);
  assert.equal(pages.length, 0);
  await done();
});

test('public, desktop: the popup has only the text\'s way to a place the pane cannot read, and with the pane off it stays off', { skip }, async () => {
  const { page, context, done } = await open('#29153-j00?pane=0');
  const pages = [];
  context.on('page', opened => pages.push(opened));
  const name = page.locator('pre a[data-avp][href^="#29217-j00"]').first();
  await name.click({ button: 'right' });
  const row = page.locator('.avp-popup .place-definition');
  assert.match(await row.locator('.place-where').textContent(), /^TS 29\.217 · /);
  assert.equal(await row.locator('.pane-action').count(), 0);
  const edges = await page.locator('.avp-popup').evaluate(popup => [popup.querySelector('.view-action').getBoundingClientRect().right, popup.querySelector('.popup-title button').getBoundingClientRect().right]);
  assert.equal(edges[0], edges[1], 'no room kept for the action that is not there');
  await row.locator('.view-action').click();
  await page.waitForSelector('.document-header h1:has-text("29.217")');
  assert.equal(await page.locator('.avp-popup').count(), 0);
  assert.match(await page.evaluate(() => location.hash), /pane=0/);
  assert.equal(pages.length, 0);
  assert.equal(await page.title(), 'TS 29.217 — Seanchaí');
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
  await page.locator('.uses-toggle').click();
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
      toggle: document.querySelector('.section-control .disclosure').getBoundingClientRect().toJSON(),
      strip: document.querySelector('#document-tools').getBoundingClientRect().height,
      text: document.querySelector('#document').getBoundingClientRect().top,
      width: document.querySelector('#document').getBoundingClientRect().width,
      scrollTop: document.querySelector('#document').scrollTop,
    }));
    const before = await geometry();
    await page.locator('.section-control .disclosure').click();
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
    await page.locator('.section-control .disclosure').click();
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
  await page.locator('.uses-toggle input').check();
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

test('the uses popup is compact, monospace, sized to content, and has one scrollbar', { skip }, async () => {
  const { page, done } = await open('#29153-j00');
  await page.locator('.uses-toggle input').check();
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
  assert.equal(await page.locator('.raw-warning').first().evaluate(row => getComputedStyle(row).backgroundColor), 'rgb(253, 232, 212)');
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

test('alt on a publisher\'s link opens its new tab and downloads nothing', { skip }, async () => {
  const { page, done } = await open('#29153-j00');
  const context = page.context();
  await context.route(/etsi\.org/, route => route.fulfill({ contentType: 'text/plain', body: '' }));
  let downloads = 0;
  page.on('download', () => { downloads++; });
  const popup = context.waitForEvent('page');
  await page.locator('pre a[target="_blank"][data-token]').first().click({ modifiers: ['Alt'] });
  assert.match((await popup).url(), /etsi\.org/);
  assert.equal(downloads, 0);
  await done();
});

test('search: a typo finds a labelled name, mentions group by document, and the keyboard opens a result', { skip }, async () => {
  const { page, done } = await open('#search?q=DRMPP');
  await page.waitForSelector('.search-avp .approximate strong:has-text("DRMP")');
  assert.equal(await page.locator('.search-avp .approximate em').first().textContent(), 'approximate');
  assert.equal(await page.locator('#search-results details').count(), 0);
  await page.locator('.search-form input').fill('DRMP');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.search-mentions .mention-document h3 a');
  const headings = await page.locator('.mention-document h3 a').allTextContents();
  assert.equal(new Set(headings).size, headings.length, 'one heading per document');
  assert.ok(await page.locator('.mention-document li .mention-link').first().textContent().then(text => text.startsWith('· ')));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways scroll');
  const focused = () => page.evaluate(() => {
    const node = document.activeElement;
    const entry = node.closest('.search-entry');
    return { name: node.matches('strong a'), entry: entry && [...document.querySelectorAll('.search-entry')].indexOf(entry) };
  });
  await page.keyboard.press('ArrowDown');
  const first = await focused();
  assert.equal(first.name, true, 'down lands on an entry\'s name');
  await page.keyboard.press('ArrowRight');
  const within = await focused();
  assert.equal(within.name, false, 'right walks its documents');
  assert.equal(within.entry, first.entry);
  await page.keyboard.press('ArrowLeft');
  assert.equal((await focused()).name, true);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  const second = await focused();
  assert.equal(second.name, true, 'down leaves from any of its links');
  assert.equal(second.entry, first.entry + 1);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !location.hash.startsWith('#search'));
  await done();
});

test('search: a family and its documents are two columns, a document a line, at the size of the name', { skip }, async () => {
  const { page, done } = await open('#search?q=Session-Id');
  await page.waitForSelector('.search-avp .entry-families');
  const layout = await page.evaluate(() => {
    const documents = [...document.querySelectorAll('.search-avp .family-documents')].find(node => node.querySelectorAll('.entry-document').length > 1);
    const family = documents.closest('li').querySelector('.family');
    const lines = [...documents.querySelectorAll('.entry-document')].map(node => node.getBoundingClientRect());
    const size = node => getComputedStyle(node).fontSize;
    return {
      lines,
      familyBox: family.getBoundingClientRect(),
      sizes: [size(family), size(documents.querySelector('a')), size(documents.querySelector('.entry-document'))],
      name: size(documents.closest('.search-entry').querySelector('.entry-line strong')),
      scrolls: document.documentElement.scrollWidth > innerWidth,
    };
  });
  assert.ok(layout.lines.length > 1);
  assert.ok(layout.lines.every(line => line.left === layout.lines[0].left), 'one column');
  assert.ok(layout.lines.every((line, index) => !index || line.top >= layout.lines[index - 1].bottom), 'one a line');
  assert.ok(layout.lines[0].left >= layout.familyBox.right, 'beside the family');
  assert.ok(Math.abs(layout.lines[0].top - layout.familyBox.top) < 2, 'the first on the family\'s line');
  assert.deepEqual(layout.sizes, [layout.name, layout.name, layout.name]);
  assert.equal(layout.scrolls, false);
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
  await page.waitForSelector('.search-avp strong:has-text("DRMP")');
  assert.ok(requests.some(url => url.endsWith('/data/search.json')));
  assert.equal(await page.evaluate(() => document.activeElement?.closest('.search-form') !== null), true);
  await page.locator('.mention-link').first().click();
  await page.waitForSelector('.target-line');
  await done();
});

const scrollOf = page => page.locator('#document').evaluate(node => node.scrollTop);
// A number no line's height divides, so that it falls inside a line.
const scrollPane = async (page, to) => {
  await page.locator('#document').evaluate((node, value) => { node.scrollTop = value; }, to);
  await page.waitForFunction(() => /[?&]top=\d+/.test(location.hash));
};
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) <= 1, `${label}: ${actual} is not ${expected}`);

test('a jump in a document eases there, keeps the URL still until it ends, and flashes where it lands', { skip }, async () => {
  const { page, done } = await open('#29217-j00?pane=0');
  await page.locator('.section-control .disclosure').click();
  const moves = await page.evaluate(async () => {
    const pane = document.querySelector('#document');
    const links = document.querySelectorAll('.section-list a');
    const link = links[links.length - 2];
    const section = link.textContent;
    link.click();
    const began = performance.now();
    const samples = [];
    while (performance.now() - began < 350) {
      samples.push({ at: performance.now() - began, top: pane.scrollTop, hash: location.hash });
      await new Promise(requestAnimationFrame);
    }
    const row = document.getElementById(`section-${section}`);
    return { samples, gap: row.getBoundingClientRect().top - pane.getBoundingClientRect().top, flashing: row.classList.contains('landing'), section };
  });
  const tops = moves.samples.map(sample => sample.top);
  const final = tops.at(-1);
  assert.ok(final > 500, JSON.stringify(tops));
  assert.ok(new Set(tops.filter(top => top > 0 && top < final)).size >= 3, `in steps: ${tops}`);
  assert.ok(tops.every((top, index) => !index || top >= tops[index - 1]), `one way: ${tops}`);
  assert.ok(moves.samples.find(sample => sample.top === final).at < 320, 'about 200 ms');
  near(moves.gap, 12, 'just under the top edge');
  assert.ok(moves.flashing);
  const moving = moves.samples.filter(sample => sample.top !== final);
  assert.ok(moving.every(sample => !sample.hash.includes('top=')), 'no position in the URL on the way');
  await page.waitForFunction(() => /top=\d+/.test(location.hash));
  await page.waitForFunction(() => !document.querySelector('.landing'));
  await done();
});

test('with reduced motion a jump is instant, and the landing still shows', { skip }, async () => {
  const { page, done } = await open('#29217-j00?pane=0', { reducedMotion: 'reduce' });
  const landed = await page.evaluate(() => {
    const links = document.querySelectorAll('.section-list a');
    const link = links[links.length - 2];
    link.click();
    const row = document.getElementById(`section-${link.textContent}`);
    return { top: document.querySelector('#document').scrollTop, flashing: row.classList.contains('landing') };
  });
  assert.ok(landed.top > 500, JSON.stringify(landed));
  assert.ok(landed.flashing);
  await done();
});

test('a document comes back to the pixel, through the index, history, a reload and the jump list', { skip }, async () => {
  const { page, done } = await open('#29217-j00');
  await scrollPane(page, 1237);
  const left = await scrollOf(page);
  near(left, 1237, 'set');
  const hash = await page.evaluate(() => location.hash);
  assert.match(hash, /^#29217-j00\?top=\d+$/);
  await page.reload();
  await page.waitForSelector('main #document');
  near(await scrollOf(page), left, 'after a reload');
  await page.waitForTimeout(300);
  near(await scrollOf(page), left, 'and it stays');
  assert.equal(await page.evaluate(() => location.hash), hash);
  await page.locator('header nav a', { hasText: 'Index' }).click();
  await page.waitForSelector('main.index-view');
  await page.locator('main.index-view a[href="#29217-j00"]').first().click();
  await page.waitForSelector('main #document');
  near(await scrollOf(page), left, 'through the index');
  await page.locator('main #document pre').waitFor();
  await page.locator('#document').evaluate(node => { node.scrollTop = 3111; });
  await page.waitForTimeout(250);
  const again = await scrollOf(page);
  await page.evaluate(() => { location.hash = '#rfc7944'; });
  await page.waitForSelector('.document-header h1:has-text("RFC 7944")');
  await page.goBack();
  await page.waitForSelector('.document-header h1:has-text("29.217")');
  near(await scrollOf(page), again, 'through history');
  const historyLength = await page.evaluate(() => history.length);
  await page.keyboard.press('Control+o');
  await page.waitForSelector('.document-header h1:has-text("RFC 7944")');
  await page.keyboard.press('Control+o');
  await page.waitForSelector('.document-header h1:has-text("29.217")');
  near(await scrollOf(page), again, 'through the jump list');
  assert.ok(await page.evaluate(() => history.length) >= historyLength);
  assert.equal(await page.locator('.jump-button[data-walk="back"]').getAttribute('aria-disabled'), 'false');
  await page.reload();
  await page.waitForSelector('main #document');
  await page.keyboard.press('Control+i');
  await page.waitForSelector('.document-header h1:has-text("RFC 7944")');
  await done();
});

test('going back in a document restores its exact offset without easing, and the browser steps by document', { skip }, async () => {
  const { page, done } = await open('#29217-j00?pane=0');
  await scrollPane(page, 1237);
  const left = await scrollOf(page);
  const before = await page.evaluate(() => history.length);
  await page.evaluate(() => {
    const links = document.querySelectorAll('.section-list a');
    links[links.length - 2].click();
  });
  await page.waitForTimeout(300);
  assert.notEqual(await scrollOf(page), left);
  assert.equal(await page.evaluate(() => history.length), before, 'a move in the page is no history entry');
  const instant = await page.evaluate(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', ctrlKey: true, bubbles: true, cancelable: true }));
    return new Promise(resolve => setTimeout(() => resolve(document.querySelector('#document').scrollTop), 0));
  });
  near(instant, left, 'at once');
  await page.locator('.jump-button[data-walk="forward"]').click();
  await page.waitForTimeout(50);
  assert.notEqual(await scrollOf(page), left);
  await page.locator('header nav a', { hasText: 'Index' }).click();
  await page.waitForSelector('main.index-view');
  assert.equal(await page.evaluate(() => history.length), before + 1, 'a new page is one');
  await page.goBack();
  await page.waitForSelector('.document-header h1:has-text("29.217")');
  await done();
});

test('the strip names the section at the top of the view without moving, and opens its entry in the panel', { skip }, async () => {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 780 }]) {
    const { page, done } = await open('#29217-j00', { viewport });
    const crumb = page.locator('.section-crumb');
    const geometry = () => page.evaluate(() => ({
      strip: document.querySelector('#document-tools').getBoundingClientRect().toJSON(),
      header: document.querySelector('.document-header').getBoundingClientRect().toJSON(),
      text: document.querySelector('#document').getBoundingClientRect().toJSON(),
    }));
    const first = await crumb.textContent();
    assert.match(first, / · /);
    const before = await geometry();
    const target = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('.dad-line[data-section]')];
      const row = rows[Math.floor(rows.length / 2)];
      const pane = document.querySelector('#document');
      const section = row.dataset.section;
      const heading = rows.find(node => node.dataset.section === section);
      pane.scrollTop += heading.getBoundingClientRect().top - pane.getBoundingClientRect().top - 12;
      return section;
    });
    await page.waitForFunction(section => document.querySelector('.section-crumb').textContent.startsWith(`${section} · `), target);
    assert.notEqual(await crumb.textContent(), first);
    assert.deepEqual(await geometry(), before, 'the strip, header and text stay put');
    const overflow = await crumb.evaluate(node => ({ overflow: getComputedStyle(node).textOverflow, wide: node.getBoundingClientRect().right <= document.querySelector('#controls').getBoundingClientRect().right }));
    assert.equal(overflow.overflow, 'ellipsis');
    await crumb.click();
    const panel = page.locator('#diagnostic-sections');
    await panel.waitFor();
    assert.equal(await page.locator('.section-control .disclosure').getAttribute('aria-expanded'), 'true');
    const entry = panel.locator('li[aria-current]');
    assert.equal(await entry.count(), 1);
    assert.equal(await entry.getAttribute('data-section'), target);
    assert.ok(await entry.evaluate(node => {
      const box = node.getBoundingClientRect();
      const bounds = node.closest('.diagnostic-panel').getBoundingClientRect();
      return box.top >= bounds.top && box.bottom <= bounds.bottom;
    }), 'in view in the panel');
    assert.notEqual(await entry.evaluate(node => getComputedStyle(node).backgroundColor), 'rgba(0, 0, 0, 0)');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await done();
  }
});

test('Sections and its crumb are one control after Findings and Holes: the toggle opens and closes, the crumb opens at the current section', { skip }, async () => {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 780 }]) {
    const { page, done } = await open('#29217-j00', { viewport });
    const toggle = page.locator('.section-control .disclosure');
    const crumb = page.locator('.section-crumb');
    const panel = page.locator('#diagnostic-sections');
    const layout = await page.evaluate(() => {
      const [findings, holes, sections, crumbBox] = [...document.querySelectorAll('#diagnostics button')].map(node => node.getBoundingClientRect());
      return {
        order: findings.right <= holes.left && holes.right <= sections.left && sections.right <= crumbBox.left,
        sameRow: Math.abs(sections.top - crumbBox.top) < 1,
        strip: document.querySelector('#document-tools').getBoundingClientRect().height,
        sideways: document.documentElement.scrollWidth > innerWidth,
      };
    });
    assert.equal(layout.order, true);
    assert.equal(layout.sameRow, true);
    assert.equal(layout.sideways, false);
    if (viewport.width === 1280) assert.equal(layout.strip, 35);
    assert.equal(await page.getByRole('button', { name: await crumb.textContent(), exact: true }).count(), 1, 'the dot before it is not read out');
    await toggle.click();
    assert.equal(await panel.isVisible(), true);
    assert.equal(await panel.locator('li[aria-current]').count(), 0, 'the toggle marks no entry');
    await toggle.click();
    assert.equal(await panel.isVisible(), false);
    const section = await page.evaluate(() => {
      const pane = document.querySelector('#document');
      const rows = [...document.querySelectorAll('.dad-line[data-section]')];
      const { section } = rows[Math.floor(rows.length / 2)].dataset;
      const heading = rows.find(node => node.dataset.section === section);
      pane.scrollTop += heading.getBoundingClientRect().top - pane.getBoundingClientRect().top - 12;
      return section;
    });
    await page.waitForFunction(value => document.querySelector('.section-crumb').dataset.section === value, section);
    await crumb.focus();
    await page.keyboard.press('Enter');
    assert.equal(await panel.isVisible(), true);
    assert.equal(await panel.locator('li[aria-current]').getAttribute('data-section'), section);
    assert.ok(await panel.locator('li[aria-current]').evaluate(node => {
      const box = node.getBoundingClientRect();
      const bounds = node.closest('.diagnostic-panel').getBoundingClientRect();
      return box.top >= bounds.top && box.bottom <= bounds.bottom;
    }), 'in view in the panel');
    await toggle.focus();
    await page.keyboard.press('Enter');
    assert.equal(await panel.isVisible(), false);
    await done();
  }
});

test('a rule of the theme\'s border stands between the strip\'s right-hand controls, and none is left by a hidden one', { skip }, async () => {
  const { page, done } = await open('#29153-j00');
  const rules = () => page.evaluate(() => {
    const strong = getComputedStyle(document.documentElement).getPropertyValue('--ui-border-strong').trim();
    const probe = document.createElement('i');
    probe.style.color = strong;
    document.body.append(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    const controls = [...document.querySelectorAll('#controls > *')].filter(node => !node.hidden).map(node => {
      const style = getComputedStyle(node);
      return { width: style.borderLeftWidth, colour: style.borderLeftColor, height: node.getBoundingClientRect().height };
    });
    return { colour, controls, strip: document.querySelector('#document-tools').getBoundingClientRect().height };
  });
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark') await page.locator('.theme-toggle').click();
    const { colour, controls, strip } = await rules();
    assert.equal(controls.length, 4);
    assert.equal(controls[0].width, '0px');
    for (const control of controls.slice(1)) assert.deepEqual([control.width, control.colour], ['1px', colour]);
    assert.equal(new Set(controls.map(control => control.height)).size, 1, 'rules of one height');
    assert.equal(strip, 35);
  }
  await done();
  const narrow = await open('#29153-j00', { viewport: { width: 390, height: 780 } });
  const shown = await narrow.page.evaluate(() => [...document.querySelectorAll('#controls > *')].filter(node => !node.hidden).map(node => getComputedStyle(node).borderLeftWidth));
  assert.deepEqual(shown, ['0px', '1px', '1px'], 'Source is hidden, Raw and the two click controls keep their rules');
  await narrow.done();
});

const paneHash = page => page.locator('iframe').evaluate(frame => Object.fromEntries(new URLSearchParams(new URL(frame.src).hash.slice(1))));

test('a plain click on a name moves the pane and leaves the text, an alt-click moves both and is a jump', { skip }, async () => {
  const { page, done } = await open('#29153-j00');
  await scrollPane(page, 1237);
  const left = await scrollOf(page);
  const back = page.locator('.jump-button[data-walk="back"]');
  const name = page.locator('pre a[data-avp][href^="#rfc7944"]').first();
  const avp = await name.getAttribute('data-avp');
  await name.evaluate(node => node.click());
  await page.waitForSelector('.source-header h2:has-text("RFC 7944")');
  await page.waitForTimeout(350);
  near(await scrollOf(page), left, 'the text stays');
  assert.equal((await paneHash(page)).query, avp);
  assert.equal(await back.getAttribute('aria-disabled'), 'true', 'nothing moved to go back from');
  await name.evaluate(node => node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, altKey: true })));
  await page.waitForSelector('.document-header h1:has-text("RFC 7944")');
  assert.ok(await page.evaluate(() => location.hash.startsWith('#rfc7944/')));
  await page.frameLocator('iframe').locator('.rfc-line', { hasText: 'DRMP AVP' }).last().waitFor();
  assert.equal((await paneHash(page)).query, avp, 'the pane with it');
  await back.click();
  await page.waitForSelector('.document-header h1:has-text("29.153")');
  near(await scrollOf(page), left, 'the jump list goes back to the pixel');
  await done();
});

test('the popup\'s two ways to a target are two like buttons side by side, in both themes, and stay compact', { skip }, async () => {
  const { page, done } = await open('#rfc7944');
  await page.locator('pre a[data-avp]', { hasText: 'DRMP' }).first().click({ button: 'right' });
  const row = page.locator('.avp-popup .place-definition');
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark') {
      await page.keyboard.press('Escape');
      await page.locator('.theme-toggle').click();
      await page.locator('pre a[data-avp]', { hasText: 'DRMP' }).first().click({ button: 'right' });
    }
    assert.deepEqual([await row.locator('a').textContent(), await row.locator('button').textContent()], ['Jump to', 'Show on the right']);
    const look = await page.locator('.avp-popup').evaluate(popup => {
      const jump = popup.querySelector('.view-action');
      const show = popup.querySelector('.pane-action');
      const looks = node => {
        const style = getComputedStyle(node);
        return [style.borderTopWidth, style.borderTopColor, style.borderTopStyle, style.borderRadius, style.color, style.backgroundColor, style.fontFamily, style.fontSize, style.fontWeight, style.textDecorationLine, node.getBoundingClientRect().height];
      };
      const box = popup.getBoundingClientRect();
      return {
        jump: looks(jump),
        show: looks(show),
        first: jump.getBoundingClientRect().right <= show.getBoundingClientRect().left,
        sameLine: jump.getBoundingClientRect().top === show.getBoundingClientRect().top,
        width: box.width,
        selfScrolls: popup.scrollHeight > popup.clientHeight,
      };
    });
    assert.deepEqual(look.jump, look.show);
    assert.equal(look.first, true);
    assert.equal(look.sameLine, true);
    assert.ok(look.width <= 80 * 8, JSON.stringify(look));
    assert.equal(look.selfScrolls, false);
    await row.locator('a').hover();
    const hovered = await row.locator('a').evaluate(node => getComputedStyle(node).textDecorationLine);
    assert.equal(hovered, 'none', 'no underline the button has not');
  }
  const before = await scrollOf(page);
  await row.locator('button').click();
  await page.waitForFunction(() => /row=1/.test(document.querySelector('iframe').src));
  assert.equal(await scrollOf(page), before);
  assert.ok(await page.locator('.avp-popup').count(), 'still open, to walk on');
  assert.equal(await page.locator('.jump-button[data-walk="back"]').getAttribute('aria-disabled'), 'true');
  await row.locator('a').click();
  await page.waitForSelector('.target-line');
  assert.equal(await page.locator('.avp-popup').count(), 0);
  assert.equal(await page.locator('.jump-button[data-walk="back"]').getAttribute('aria-disabled'), 'false');
  await done();
});

test('the arrows sit left of the title, in one row', { skip }, async () => {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 780 }]) {
    const { page, done } = await open('#29153-j00', { viewport });
    const layout = await page.evaluate(() => {
      const box = node => node.getBoundingClientRect();
      const header = document.querySelector('.document-header');
      const buttons = [...header.querySelectorAll('.jump-button')].map(box);
      return { buttons, title: box(header.querySelector('h1')), header: box(header), sideways: document.documentElement.scrollWidth > innerWidth };
    });
    assert.equal(layout.buttons.length, 4);
    assert.ok(layout.buttons.every(button => button.top === layout.buttons[0].top && button.height <= 22 && button.width <= 22), JSON.stringify(layout.buttons));
    assert.ok(layout.buttons.at(-1).right <= layout.title.left, 'left of the title');
    assert.equal(layout.sideways, false);
    await done();
  }
});

test('a command\'s abbreviation is a name: its popup is compact, in the targets\' grid, and a click goes to its block', { skip }, async () => {
  const fetched = [];
  const { page, done } = await open('#29061-6f0', {}, async page => page.on('request', request => fetched.push(new URL(request.url()).pathname)));
  assert.ok(fetched.includes('/data/commands.json'), 'the index comes with the document');
  assert.ok(!fetched.includes('/data/search.json'), 'search data does not');
  const abbreviation = page.locator('pre button[data-command="265 answer"]', { hasText: 'AAA' });
  await abbreviation.click({ button: 'right' });
  const popup = page.locator('.avp-popup');
  assert.equal(await popup.locator('.popup-title strong').textContent(), 'AA-Answer (AAA)');
  assert.deepEqual(await popup.locator('.popup-identity p').allTextContents(), ['Code 265 · Answer · PXY', 'Application-ID 16777223 · Gmb · from 17, not the header']);
  const look = await popup.evaluate(node => {
    const box = node.getBoundingClientRect();
    const jumps = [...node.querySelectorAll('.view-action')].map(jump => jump.getBoundingClientRect().left);
    const labels = [...node.querySelectorAll('.popup-place > span:first-child')].map(label => label.textContent);
    return { width: box.width, height: box.height, inside: box.top >= 0 && box.bottom <= innerHeight, jumps, labels, selfScrolls: node.scrollHeight > node.clientHeight };
  });
  assert.deepEqual(look.labels, ['Definition:', 'Request:']);
  assert.equal(new Set(look.jumps).size, 1, `one column of Jump to: ${look.jumps}`);
  assert.ok(look.width <= 80 * 8 && look.height <= 22 * 16, JSON.stringify(look));
  assert.equal(look.inside, true);
  assert.equal(look.selfScrolls, false);
  await page.keyboard.press('Escape');
  await abbreviation.click();
  await page.waitForSelector('.target-line');
  assert.equal(await page.locator('.target-line').getAttribute('data-line'), '43', 'the public pane cannot read the PDF, so both go to the block');
  await done();
});
