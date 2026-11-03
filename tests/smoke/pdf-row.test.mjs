// Row links through the real viewer and reader, over a held PDF and RFC: CHROMIUM=/path/to/chromium npm run test:smoke
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright-core';
import { build } from 'vite';

const root = fileURLToPath(new URL('../../', import.meta.url));
const dist = path.join(root, '.smoke-viewer-dist');
const executablePath = process.env.CHROMIUM ?? '/usr/bin/chromium';
const specifications = process.env.SEANCHAI_SPECIFICATIONS ?? path.join(process.env.SEANCHAI_ROOT ?? path.join(root, '../..'), 'specifications');
const pdf = path.join(specifications, '3gpp/Rel-18/PDF/ts_129061v180100p.pdf');
const rfc = path.join(specifications, 'rfc/rfc5580.txt');
const skip = !existsSync(executablePath) ? `no browser at ${executablePath}` : !existsSync(pdf) || !existsSync(rfc) ? `no held PDF and RFC in ${specifications}` : false;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.txt': 'text/plain', '.pdf': 'application/pdf', '.wasm': 'application/wasm' };

let browser;
let server;
let base;

before(async () => {
  if (skip) return;
  // No public directory: the other smoke test fills it, and the sources are served from where they are held.
  await build({ root, mode: 'self-hosted', publicDir: false, logLevel: 'error', build: { outDir: dist } });
  server = http.createServer(async (request, response) => {
    const { pathname } = new URL(request.url, 'http://localhost');
    const name = decodeURIComponent(pathname);
    const file = name === '/29061-i10.pdf' ? pdf : name === '/rfc5580.txt' ? rfc
      : name.startsWith('/pdfjs/') ? path.join(root, 'node_modules/pdfjs-dist', name.slice('/pdfjs/'.length))
      : path.join(dist, name);
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

const rowHash = name => `#page=129&search=16a.5&name=${encodeURIComponent(name)}&row=1`;
// The find has settled when a match is selected and the count names it.
const settled = (page, name) => page.waitForFunction(query => {
  const { findController } = window.PDFViewerApplication;
  return findController.state?.query === query && findController.selected.pageIdx !== -1 && /^[1-9]/.test(document.querySelector('#matches').textContent);
}, name, { timeout: 60000 });
const viewerState = page => page.evaluate(() => {
  const container = document.querySelector('#viewerContainer');
  const selected = document.querySelector('.highlight.selected');
  return {
    page: Number(document.querySelector('#page').value),
    matches: document.querySelector('#matches').textContent,
    selectedPage: window.PDFViewerApplication.findController.selected.pageIdx + 1,
    selectedText: selected?.textContent,
    selectedTop: selected && selected.getBoundingClientRect().top - container.getBoundingClientRect().top,
  };
});

test('table 9a of TS 29.061: a row link shows the row, wrapped or not, and selects its match', { skip }, async () => {
  const context = await browser.newContext({ viewport: { width: 1000, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  try {
    await page.goto(`${base}viewer.html?file=${encodeURIComponent(`${base}29061-i10.pdf`)}${rowHash('3GPP-Selection-Mode')}`);
    await settled(page, '3GPP-Selection-Mode');
    const first = await viewerState(page);
    assert.equal(first.page, 131, 'the page after the printed 16a.5 heading and table title');
    assert.equal(first.selectedPage, 131);
    assert.equal(first.matches, '5 / 5');
    for (const [name, fragment] of [['3GPP-GGSN-Address', '3GPP-GGSN-'], ['3GPP-IMSI', '3GPP-IMSI'], ['3GPP-GPRS-Negotiated-QoS-Profile', '3GPP-GPRS-'], ['3GPP-UE-Source-Port', '3GPP-UE-Source-']]) {
      await page.evaluate(hash => { location.hash = hash; }, rowHash(name));
      await settled(page, name);
      await page.waitForFunction(text => document.querySelector('.highlight.selected')?.textContent === text, fragment, { timeout: 15000 });
      const state = await viewerState(page);
      assert.equal(state.page, 131, name);
      assert.equal(state.selectedPage, 131, name);
      assert.ok(state.selectedTop >= 0 && state.selectedTop < 60, `${name} is at the top of the view: ${JSON.stringify(state)}`);
    }
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('a name the table does not hold goes to the section heading', { skip }, async () => {
  const context = await browser.newContext({ viewport: { width: 1000, height: 900 } });
  const page = await context.newPage();
  try {
    await page.goto(`${base}viewer.html?file=${encodeURIComponent(`${base}29061-i10.pdf`)}${rowHash('3GPP-Session-Stop-Indicator')}`);
    await page.waitForFunction(() => window.PDFViewerApplication.pdfViewer.pagesCount > 0 && document.querySelector('#page').value === '129', undefined, { timeout: 60000 });
    assert.equal((await viewerState(page)).page, 129);
  } finally { await context.close(); }
});

test('the RFC reader shows a row whose name the ASCII table wraps', { skip }, async () => {
  const context = await browser.newContext({ viewport: { width: 1000, height: 600 } });
  const page = await context.newPage();
  try {
    await page.goto(`${base}rfc.html?file=${encodeURIComponent(`${base}rfc5580.txt`)}#page=30&section=6&query=Location-Data`);
    await page.waitForSelector('.rfc-line', { state: 'attached' });
    const firstLine = () => page.evaluate(() => {
      const top = document.querySelector('#rfc').getBoundingClientRect().top + 12;
      return [...document.querySelectorAll('.rfc-line')].find(line => line.getBoundingClientRect().bottom > top).textContent.trim();
    });
    assert.match(await firstLine(), /^6\.\s+Diameter RADIUS Interoperability/);
    for (const [name, line] of [['Basic-Location-Policy-Rules', '|Basic-Location-'], ['Extended-Location-Policy-Rules', '|Extended-Location-'], ['Requested-Location-Info', '|Requested-']]) {
      await page.evaluate(hash => { location.hash = hash; }, `#page=30&section=6&query=${name}&row=1`);
      await page.waitForFunction(text => [...document.querySelectorAll('.rfc-match')].some(node => node.textContent.trim().startsWith(text)), line);
      assert.ok((await firstLine()).startsWith(line), name);
    }
    await page.evaluate(hash => { location.hash = hash; }, '#page=30&section=6&query=Not-In-Table&row=1');
    await page.waitForFunction(() => document.querySelectorAll('.rfc-match').length === 0);
    assert.match(await firstLine(), /^6\.\s+Diameter RADIUS Interoperability/);
  } finally { await context.close(); }
});
