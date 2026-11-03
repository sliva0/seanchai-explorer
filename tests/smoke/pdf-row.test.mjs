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
const reused = path.join(specifications, '3gpp/Rel-18/PDF/ts_129128v180000p.pdf');
const values = path.join(specifications, '3gpp/Rel-18/PDF/ts_129272v180700p.pdf');
const repeating = path.join(specifications, '3gpp/Rel-18/PDF/ts_129468v180000p.pdf');
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
    const file = name === '/29061-i10.pdf' ? pdf : name === '/29128-i00.pdf' ? reused : name === '/29272-i70.pdf' ? values : name === '/29468-i00.pdf' ? repeating : /^\/rfc\d+\.txt$/.test(name) ? path.join(specifications, 'rfc', name.slice(1))
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

test('a row selects its own match, not a mention earlier on the page', { skip: skip || !existsSync(reused) && `no held PDF ${reused}` }, async () => {
  const context = await browser.newContext({ viewport: { width: 1000, height: 900 } });
  const page = await context.newPage();
  try {
    // TS 29.128 table 6.4.1.1, page 42: a row with a match below it, and one with the match of Feature-List-ID above it.
    await page.goto(`${base}viewer.html?file=${encodeURIComponent(`${base}29128-i00.pdf`)}#page=39&search=6.4.1&name=SCEF-Reference-ID&row=1`);
    for (const [name, matchIndex] of [['SCEF-Reference-ID', 0], ['Feature-List', 1]]) {
      await page.evaluate(hash => { location.hash = hash; }, `#page=39&search=6.4.1&name=${name}&row=1`);
      await settled(page, name);
      await page.waitForFunction(index => window.PDFViewerApplication.findController.selected.matchIdx === index, matchIndex);
      await page.waitForFunction(text => document.querySelector('.highlight.selected')?.textContent === text, name);
      const state = await viewerState(page);
      assert.equal(state.page, 42, name);
      assert.equal(state.selectedPage, 42, name);
      assert.ok(state.selectedTop >= 0 && state.selectedTop < 30, `${name}: ${JSON.stringify(state)}`);
    }
  } finally { await context.close(); }
});

test('a renamed row shows and selects what the source prints', { skip: skip || !existsSync(reused) && `no held PDF ${reused}` }, async () => {
  const context = await browser.newContext({ viewport: { width: 1000, height: 900 } });
  const page = await context.newPage();
  try {
    await page.goto(`${base}viewer.html?file=${encodeURIComponent(`${base}29128-i00.pdf`)}#page=39&search=6.4.1&name=Bearer-Identifier&printed=Bearer-Identity&row=1`);
    await settled(page, 'Bearer-Identity');
    await page.waitForFunction(() => document.querySelector('.highlight.selected')?.textContent === 'Bearer-Identity');
    const state = await viewerState(page);
    assert.equal(state.page, 42);
    assert.equal(state.selectedPage, 42);
    assert.ok(state.selectedTop >= 0 && state.selectedTop < 60, JSON.stringify(state));
    assert.equal(await page.inputValue('#find'), 'Bearer-Identity');
  } finally { await context.close(); }
});

test('a name no table holds goes to where the source names it, and one it never names to the section heading', { skip }, async () => {
  const context = await browser.newContext({ viewport: { width: 1000, height: 900 } });
  const page = await context.newPage();
  try {
    await page.goto(`${base}viewer.html?file=${encodeURIComponent(`${base}29061-i10.pdf`)}${rowHash('3GPP-Session-Stop-Indicator')}`);
    await settled(page, '3GPP-Session-Stop-Indicator');
    const listed = await viewerState(page);
    assert.equal(listed.page, 98);
    assert.equal(listed.selectedPage, 98);
    await page.evaluate(hash => { location.hash = hash; }, rowHash('Not-In-This-Document'));
    await page.waitForFunction(() => document.querySelector('#page').value === '129', undefined, { timeout: 60000 });
    assert.equal((await viewerState(page)).page, 129);
  } finally { await context.close(); }
});

const noValues = skip || (!existsSync(values) || !existsSync(repeating)) && `no held PDFs ${values}, ${repeating}`;

test('value rows: bits and features beside their numbers, repeated names, wrapped names, and a result code at its clause', { skip: noValues }, async () => {
  const context = await browser.newContext({ viewport: { width: 1000, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  try {
    for (const [file, hash, expected] of [
      ['29272-i70', 'page=124&search=7.3.31&name=GERAN+Not+Allowed&row=1&value=1', { page: 125, text: 'GERAN Not Allowed', query: 'GERAN Not Allowed' }],
      ['29272-i70', 'page=102&search=7.3.8&name=Separation+Indication&row=1&value=0', { page: 102, text: 'Separation', query: 'Separation Indication' }],
      ['29272-i70', 'page=102&search=7.3.10.1&name=ODB-HPLMN-APN&row=1&value=1', { page: 104, text: 'ODB-', query: 'ODB-HPLMN-APN' }],
      ['29272-i70', 'page=176&search=7.4.3.1&name=DIAMETER_ERROR_USER_UNKNOWN&row=1&titled=1', { page: 176, text: 'DIAMETER_ERROR_USER_UNKNOWN', query: 'DIAMETER_ERROR_USER_UNKNOWN' }],
      ['29468-i00', 'page=27&search=6.4.33&name=System+error&row=1&value=6', { page: 27, text: 'System error', query: 'System error', match: 2 }],
    ]) {
      await page.goto(`${base}viewer.html?file=${encodeURIComponent(`${base}${file}.pdf`)}#${hash}`);
      await settled(page, expected.query);
      await page.waitForFunction(text => document.querySelector('.highlight.selected')?.textContent === text, expected.text, { timeout: 15000 });
      if (expected.match !== undefined) await page.waitForFunction(index => window.PDFViewerApplication.findController.selected.matchIdx === index, expected.match);
      const state = await viewerState(page);
      assert.equal(state.page, expected.page, hash);
      assert.equal(state.selectedPage, expected.page, hash);
      assert.ok(state.selectedTop >= 0 && state.selectedTop < 70, `${hash}: ${JSON.stringify(state)}`);
    }
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test('the RFC reader shows a result code on its line, as a bullet, and at its own clause', { skip }, async () => {
  const context = await browser.newContext({ viewport: { width: 1000, height: 600 } });
  const page = await context.newPage();
  try {
    for (const [file, hash, line] of [
      ['rfc6733', '#page=89&section=7.1.2&query=DIAMETER_SUCCESS&row=1&titled=1', 'DIAMETER_SUCCESS 2001'],
      ['rfc4740', '#page=59&section=10.1.1&query=DIAMETER_SERVER_SELECTION&row=1&titled=1', 'o  DIAMETER_SERVER_SELECTION 2007'],
      ['rfc7075', '#page=7&section=3.4&query=DIAMETER_REALM_REDIRECT_INDICATION&row=1&titled=1', '3.4.  DIAMETER_REALM_REDIRECT_INDICATION Protocol Error Code'],
    ]) {
      await page.goto(`${base}rfc.html?file=${encodeURIComponent(`${base}${file}.txt`)}${hash}`);
      await page.waitForSelector('.rfc-line', { state: 'attached' });
      await page.waitForFunction(text => [...document.querySelectorAll('.rfc-match')].some(node => node.textContent.trim().startsWith(text)), line);
      const first = await page.evaluate(() => {
        const top = document.querySelector('#rfc').getBoundingClientRect().top + 12;
        return [...document.querySelectorAll('.rfc-line')].find(node => node.getBoundingClientRect().bottom > top).textContent.trim();
      });
      assert.ok(first.startsWith(line), `${file}: ${first}`);
    }
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

test('the RFC reader shows a misprinted row, the table holding a row, and the clause named after one', { skip }, async () => {
  const context = await browser.newContext({ viewport: { width: 1000, height: 600 } });
  const page = await context.newPage();
  try {
    for (const [file, hash, line] of [
      ['rfc4005', '#page=50&section=8&query=Accounting-Auth-Method&row=1', 'Acounting-Auth-'],
      ['rfc4072', '#page=18&section=4.1.1&query=EAP-Payload&row=1', 'EAP-Payload   '],
      ['rfc6734', '#page=3&section=3.1&query=Key-SPI&row=1', '3.1.5.  Key-SPI'],
    ]) {
      await page.goto(`${base}rfc.html?file=${encodeURIComponent(`${base}${file}.txt`)}${hash}`);
      await page.waitForSelector('.rfc-line', { state: 'attached' });
      await page.waitForFunction(text => [...document.querySelectorAll('.rfc-match')].some(node => node.textContent.trim().startsWith(text)), line.trim());
      const first = await page.evaluate(() => {
        const top = document.querySelector('#rfc').getBoundingClientRect().top + 12;
        return [...document.querySelectorAll('.rfc-line')].find(node => node.getBoundingClientRect().bottom > top).textContent.trim();
      });
      assert.ok(first.startsWith(line.trim()), `${file}: ${first}`);
    }
  } finally { await context.close(); }
});
