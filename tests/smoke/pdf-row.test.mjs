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
const specifications =
  process.env.SEANCHAI_SPECIFICATIONS ??
  path.join(process.env.SEANCHAI_ROOT ?? path.join(root, '../..'), 'specifications');
const pdf = path.join(specifications, '3gpp/Rel-19/PDF/ts_129061v190100p.pdf');
const reused = path.join(specifications, '3gpp/Rel-19/PDF/ts_129128v190200p.pdf');
const values = path.join(specifications, '3gpp/Rel-19/PDF/ts_129272v190600p.pdf');
const repeating = path.join(specifications, '3gpp/Rel-19/PDF/ts_129468v190000p.pdf');
const rfc = path.join(specifications, 'rfc/rfc5580.txt');
const elements = path.join(specifications, '3gpp/Rel-19/PDF/ts_129328v190200p.pdf');
const quoted = path.join(specifications, '3gpp/Rel-19/PDF/ts_129214v190300p.pdf');
const skip = !existsSync(executablePath)
  ? `no browser at ${executablePath}`
  : !existsSync(pdf) || !existsSync(rfc)
    ? `no held PDF and RFC in ${specifications}`
    : false;
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.txt': 'text/plain',
  '.pdf': 'application/pdf',
  '.wasm': 'application/wasm',
};

let browser;
let server;
let base;

before(async () => {
  if (skip) return;
  // No public directory: the other smoke test fills it, and the sources are served from where they are held.
  await build({ root, mode: 'self-hosted', publicDir: false, logLevel: 'error', build: { outDir: dist } });
  server = http
    .createServer(async (request, response) => {
      const { pathname } = new URL(request.url, 'http://localhost');
      const name = decodeURIComponent(pathname);
      const file =
        name === '/29061-j10.pdf'
          ? pdf
          : name === '/29128-j20.pdf'
            ? reused
            : name === '/29272-j60.pdf'
              ? values
              : name === '/29468-j00.pdf'
                ? repeating
                : name === '/29328-j20.pdf'
                  ? elements
                  : name === '/29214-j30.pdf'
                    ? quoted
                    : /^\/rfc\d+\.txt$/.test(name)
                      ? path.join(specifications, 'rfc', name.slice(1))
                      : name.startsWith('/pdfjs/')
                        ? path.join(root, 'node_modules/pdfjs-dist', name.slice('/pdfjs/'.length))
                        : path.join(dist, name);
      try {
        const body = await readFile(file);
        response.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' });
        response.end(body);
      } catch {
        response.writeHead(404);
        response.end();
      }
    })
    .listen(0, '127.0.0.1');
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
const settled = (page, name) =>
  page.waitForFunction(
    query => {
      const { findController } = window.PDFViewerApplication;
      return (
        findController.state?.query === query &&
        findController.selected.pageIdx !== -1 &&
        /^[1-9]/.test(document.querySelector('#matches').textContent)
      );
    },
    name,
    { timeout: 60000 },
  );
const viewerState = page =>
  page.evaluate(() => {
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

test(
  'zoom steps through its list by button and key and wheel, and stays through page moves and a reload',
  { skip },
  async () => {
    const context = await browser.newContext({ viewport: { width: 1000, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    const zoom = () => page.locator('#zoom').inputValue();
    const scale = () => page.evaluate(() => window.PDFViewerApplication.pdfViewer.currentScale);
    try {
      const url = `${base}viewer.html?file=${encodeURIComponent(`${base}29061-j10.pdf`)}#page=10`;
      await page.goto(url);
      await page.waitForFunction(() => document.querySelector('.pdfViewer .page canvas'));
      assert.equal(await zoom(), 'page-width');
      assert.deepEqual(await page.locator('#zoom option').allTextContents(), [
        'Fit width',
        'Fit page',
        '50%',
        '75%',
        '100%',
        '150%',
        '200%',
        '300%',
      ]);
      await page.locator('#zoom').selectOption('1.5');
      assert.equal(await scale(), 1.5);
      await page.locator('#zoom-out').click();
      assert.equal(await zoom(), '1.25', 'a step need not be listed');
      assert.equal(await scale(), 1.25);
      assert.equal(await page.locator('#zoom').evaluate(select => select.selectedOptions[0].textContent), '125%');
      await page.locator('#zoom-in').click();
      assert.equal(await zoom(), '1.5');
      await page.locator('#zoom-out').click();
      await page.keyboard.press('Control+=');
      assert.equal(await zoom(), '1.5');
      await page.keyboard.press('Control+-');
      await page.keyboard.press('Control+-');
      assert.equal(await zoom(), '1.1');
      await page.mouse.move(600, 500);
      await page.keyboard.down('Control');
      await page.mouse.wheel(0, -120);
      await page.waitForFunction(() => document.querySelector('#zoom').value === '1.25');
      await page.mouse.wheel(0, 120);
      await page.waitForFunction(() => document.querySelector('#zoom').value === '1.1');
      await page.keyboard.up('Control');
      assert.equal(await page.evaluate(() => devicePixelRatio), 1, 'the browser did not zoom');
      await page.locator('#page').fill('40');
      await page.keyboard.press('Enter');
      await page.locator('#outline a').nth(3).click();
      await page.evaluate(() => {
        location.hash = '#page=70&search=5.1';
      });
      await page.waitForFunction(
        () => document.querySelector('#page').value === '70' || Number(document.querySelector('#page').value) > 1,
      );
      assert.equal(await zoom(), '1.1', 'page moves keep it');
      assert.equal(await scale(), 1.1);
      await page.reload();
      await page.waitForFunction(() => document.querySelector('.pdfViewer .page canvas'));
      assert.equal(await zoom(), '1.1', 'a new load keeps it');
      assert.equal(await scale(), 1.1);
      await page.locator('#zoom').selectOption('3');
      await page.keyboard.press('Control+=');
      assert.equal(await zoom(), '3', 'nothing past the last step');
      await page.locator('#zoom-in').click();
      assert.equal(await zoom(), '3', 'nor by the button');
      await page.locator('#zoom').selectOption('page-width');
      const width = await scale();
      await page.keyboard.press('Control+=');
      assert.ok((await scale()) > width, 'a preset steps from the scale it came to');
      assert.notEqual(await zoom(), 'page-width');
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  },
);

test('the find bar takes the free width of the toolbar, wide and narrow', { skip }, async () => {
  const context = await browser.newContext({ viewport: { width: 1200, height: 600 } });
  const page = await context.newPage();
  const box = selector =>
    page.locator(selector).evaluate(element => {
      const { left, right, top, width } = element.getBoundingClientRect();
      return { left, right, top, width };
    });
  try {
    await page.goto(`${base}viewer.html?file=${encodeURIComponent(`${base}29061-j10.pdf`)}#page=10`);
    await page.waitForFunction(() => document.querySelector('.pdfViewer .page canvas'));
    for (const [width, least] of [
      [1200, 500],
      [400, 100],
    ]) {
      await page.setViewportSize({ width, height: 600 });
      const toolbar = await page
        .locator('#toolbar')
        .evaluate(element => ({ inner: element.clientWidth, content: element.scrollWidth }));
      assert.ok(toolbar.content <= toolbar.inner, `${width}: toolbar overflows, ${JSON.stringify(toolbar)}`);
      const [find, group, previous, next, matches] = await Promise.all(
        ['#find', '#find-controls', '#find-previous', '#find-next', '#matches'].map(box),
      );
      assert.ok(find.width >= least, `${width}: find is ${find.width} wide`);
      assert.ok(group.right >= width - 16 && group.right <= width, `${width}: find group ends at ${group.right}`);
      assert.ok(
        find.right < previous.left && previous.right < next.left && next.right < matches.left,
        `${width}: controls follow the input`,
      );
      assert.ok(matches.right <= group.right + 0.5, `${width}: matches stay in the group`);
      const [out, select, plus] = await Promise.all(['#zoom-out', '#zoom', '#zoom-in'].map(box));
      assert.ok(
        out.right < select.left && select.right < plus.left && out.top === plus.top,
        `${width}: zoom buttons sit either side of the list`,
      );
    }
  } finally {
    await context.close();
  }
});

test('table 9a of TS 29.061: a row link shows the row, wrapped or not, and selects its match', { skip }, async () => {
  const context = await browser.newContext({ viewport: { width: 1000, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  try {
    await page.goto(
      `${base}viewer.html?file=${encodeURIComponent(`${base}29061-j10.pdf`)}${rowHash('3GPP-Selection-Mode')}`,
    );
    await settled(page, '3GPP-Selection-Mode');
    const first = await viewerState(page);
    assert.equal(first.page, 131, 'the page after the printed 16a.5 heading and table title');
    assert.equal(first.selectedPage, 131);
    assert.equal(first.matches, '5 / 5');
    for (const [name, fragment] of [
      ['3GPP-GGSN-Address', '3GPP-GGSN-'],
      ['3GPP-IMSI', '3GPP-IMSI'],
      ['3GPP-GPRS-Negotiated-QoS-Profile', '3GPP-GPRS-'],
      ['3GPP-UE-Source-Port', '3GPP-UE-Source-'],
    ]) {
      await page.evaluate(hash => {
        location.hash = hash;
      }, rowHash(name));
      await settled(page, name);
      await page.waitForFunction(
        text => document.querySelector('.highlight.selected')?.textContent === text,
        fragment,
        { timeout: 15000 },
      );
      const state = await viewerState(page);
      assert.equal(state.page, 131, name);
      assert.equal(state.selectedPage, 131, name);
      assert.ok(
        state.selectedTop >= 0 && state.selectedTop < 60,
        `${name} is at the top of the view: ${JSON.stringify(state)}`,
      );
    }
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test(
  'a row selects its own match, not a mention earlier on the page',
  { skip: skip || (!existsSync(reused) && `no held PDF ${reused}`) },
  async () => {
    const context = await browser.newContext({ viewport: { width: 1000, height: 900 } });
    const page = await context.newPage();
    try {
      // TS 29.128 table 6.4.1.1, page 43: a row with a match below it, and one below Feature-List-ID, which a whole name does not match.
      await page.goto(
        `${base}viewer.html?file=${encodeURIComponent(`${base}29128-j20.pdf`)}#page=39&search=6.4.1&name=SCEF-Reference-ID&row=1`,
      );
      for (const [name, matchIndex] of [
        ['SCEF-Reference-ID', 0],
        ['Feature-List', 0],
      ]) {
        await page.evaluate(hash => {
          location.hash = hash;
        }, `#page=39&search=6.4.1&name=${name}&row=1`);
        await settled(page, name);
        await page.waitForFunction(
          index => window.PDFViewerApplication.findController.selected.matchIdx === index,
          matchIndex,
        );
        await page.waitForFunction(text => document.querySelector('.highlight.selected')?.textContent === text, name);
        const state = await viewerState(page);
        assert.equal(state.page, 43, name);
        assert.equal(state.selectedPage, 43, name);
        assert.ok(state.selectedTop >= 0 && state.selectedTop < 30, `${name}: ${JSON.stringify(state)}`);
      }
    } finally {
      await context.close();
    }
  },
);

test(
  'a renamed row shows and selects what the source prints',
  { skip: skip || (!existsSync(reused) && `no held PDF ${reused}`) },
  async () => {
    const context = await browser.newContext({ viewport: { width: 1000, height: 900 } });
    const page = await context.newPage();
    try {
      await page.goto(
        `${base}viewer.html?file=${encodeURIComponent(`${base}29128-j20.pdf`)}#page=39&search=6.4.1&name=Bearer-Identifier&printed=Bearer-Identity&row=1`,
      );
      await settled(page, 'Bearer-Identity');
      await page.waitForFunction(
        () => document.querySelector('.highlight.selected')?.textContent === 'Bearer-Identity',
      );
      const state = await viewerState(page);
      assert.equal(state.page, 43);
      assert.equal(state.selectedPage, 43);
      assert.ok(state.selectedTop >= 0 && state.selectedTop < 60, JSON.stringify(state));
      assert.equal(await page.inputValue('#find'), 'Bearer-Identity');
    } finally {
      await context.close();
    }
  },
);

test(
  'a name no table holds goes to where the source names it, and one it never names to the section heading',
  { skip },
  async () => {
    const context = await browser.newContext({ viewport: { width: 1000, height: 900 } });
    const page = await context.newPage();
    try {
      await page.goto(
        `${base}viewer.html?file=${encodeURIComponent(`${base}29061-j10.pdf`)}${rowHash('3GPP-Session-Stop-Indicator')}`,
      );
      await settled(page, '3GPP-Session-Stop-Indicator');
      const listed = await viewerState(page);
      assert.equal(listed.page, 98);
      assert.equal(listed.selectedPage, 98);
      await page.evaluate(hash => {
        location.hash = hash;
      }, rowHash('Not-In-This-Document'));
      await page.waitForFunction(() => document.querySelector('#page').value === '129', undefined, { timeout: 60000 });
      assert.equal((await viewerState(page)).page, 129);
    } finally {
      await context.close();
    }
  },
);

test(
  "Details: a row of a clause's numbered description table, not the contents or the AVP table, wrapped or not",
  { skip },
  async () => {
    const context = await browser.newContext({ viewport: { width: 1000, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    try {
      await page.goto(
        `${base}viewer.html?file=${encodeURIComponent(`${base}29061-j10.pdf`)}#page=129&search=16.4.7&name=3GPP-Selection-Mode&row=1&titled=1`,
      );
      await settled(page, '3GPP-Selection-Mode');
      await page.waitForFunction(
        () => document.querySelector('.highlight.selected')?.textContent === '3GPP-Selection-',
        undefined,
        { timeout: 15000 },
      );
      const state = await viewerState(page);
      assert.equal(state.page, 88, 'table 16.4.7.1, under a subclause of the one asked for');
      assert.equal(state.selectedPage, 88);
      assert.ok(state.selectedTop >= 0 && state.selectedTop < 60, JSON.stringify(state));
      assert.equal(await page.inputValue('#find'), '3GPP-Selection-Mode');
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  },
);

test(
  'Details: a clause with no such table is its heading, even under the table listing the AVP',
  { skip },
  async () => {
    const context = await browser.newContext({ viewport: { width: 1000, height: 900 } });
    const page = await context.newPage();
    try {
      for (const [hash, name, expected, afterTable] of [
        ['page=172&search=17.7.2&name=TMGI&row=1&titled=1', 'TMGI', 150, false],
        ['page=172&search=20.5a.1&name=MBMS-Access-Indicator&row=1&titled=1', 'MBMS-Access-Indicator', 175, true],
      ]) {
        await page.goto(`${base}viewer.html?file=${encodeURIComponent(`${base}29061-j10.pdf`)}#${hash}`);
        await settled(page, name);
        await page.waitForFunction(text => document.querySelector('.highlight.selected')?.textContent === text, name, {
          timeout: 15000,
        });
        if (afterTable)
          await page.waitForFunction(() => window.PDFViewerApplication.findController.selected.matchIdx > 0);
        const state = await viewerState(page);
        assert.equal(state.page, expected, hash);
        assert.equal(state.selectedPage, expected, hash);
        assert.ok(state.selectedTop >= 0 && state.selectedTop < 70, `${hash}: ${JSON.stringify(state)}`);
      }
    } finally {
      await context.close();
    }
  },
);

test(
  'Details in the RFC reader: the clause an AVP table points to',
  { skip: skip || (!existsSync(path.join(specifications, 'rfc/rfc5778.txt')) && 'no held rfc5778') },
  async () => {
    const context = await browser.newContext({ viewport: { width: 1000, height: 600 } });
    const page = await context.newPage();
    try {
      await page.goto(
        `${base}rfc.html?file=${encodeURIComponent(`${base}rfc5778.txt`)}#page=18&section=6.20&query=MIP6-Auth-Mode&row=1&titled=1`,
      );
      await page.waitForSelector('.rfc-line', { state: 'attached' });
      await page.waitForFunction(() => document.querySelector('.rfc-match, .rfc-match-line'));
      const first = await page.evaluate(() => {
        const top = document.querySelector('#rfc').getBoundingClientRect().top + 12;
        return [...document.querySelectorAll('.rfc-line')]
          .find(node => node.getBoundingClientRect().bottom > top)
          .textContent.trim();
      });
      assert.match(first, /^6\.20\.\s+MIP6-Auth-Mode/);
    } finally {
      await context.close();
    }
  },
);

const noValues = skip || ((!existsSync(values) || !existsSync(repeating)) && `no held PDFs ${values}, ${repeating}`);

test(
  'value rows: bits and features beside their numbers, repeated names, wrapped names, and a result code at its clause',
  { skip: noValues },
  async () => {
    const context = await browser.newContext({ viewport: { width: 1000, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    try {
      for (const [file, hash, expected] of [
        [
          '29272-j60',
          'page=126&search=7.3.31&name=GERAN+Not+Allowed&row=1&value=1',
          { page: 127, text: 'GERAN Not Allowed', query: 'GERAN Not Allowed' },
        ],
        [
          '29272-j60',
          'page=103&search=7.3.8&name=Separation+Indication&row=1&value=0',
          { page: 103, text: 'Separation', query: 'Separation Indication' },
        ],
        [
          '29272-j60',
          'page=103&search=7.3.10.1&name=ODB-HPLMN-APN&row=1&value=1',
          { page: 106, text: 'ODB-', query: 'ODB-HPLMN-APN' },
        ],
        [
          '29272-j60',
          'page=180&search=7.4.3.1&name=DIAMETER_ERROR_USER_UNKNOWN&row=1&titled=1',
          { page: 180, text: 'DIAMETER_ERROR_USER_UNKNOWN', query: 'DIAMETER_ERROR_USER_UNKNOWN' },
        ],
        [
          '29468-j00',
          'page=27&search=6.4.33&name=System+error&row=1&value=6',
          { page: 27, text: 'System error', query: 'System error', match: 2 },
        ],
      ]) {
        await page.goto(`${base}viewer.html?file=${encodeURIComponent(`${base}${file}.pdf`)}#${hash}`);
        await settled(page, expected.query);
        await page.waitForFunction(
          text => document.querySelector('.highlight.selected')?.textContent === text,
          expected.text,
          { timeout: 15000 },
        );
        if (expected.match !== undefined)
          await page.waitForFunction(
            index => window.PDFViewerApplication.findController.selected.matchIdx === index,
            expected.match,
          );
        const state = await viewerState(page);
        assert.equal(state.page, expected.page, hash);
        assert.equal(state.selectedPage, expected.page, hash);
        assert.ok(state.selectedTop >= 0 && state.selectedTop < 70, `${hash}: ${JSON.stringify(state)}`);
      }
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  },
);

test(
  "a table link: TS 29.272 5A.2.1.1.1's two tables, each at its own caption, past the sentence naming both",
  { skip: noValues },
  async () => {
    const context = await browser.newContext({ viewport: { width: 1000, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    try {
      const tops = [];
      for (const [table, expected] of [
        ['5A.2.1.1.1/1', 61],
        ['5A.2.1.1.1/2', 62],
      ]) {
        const hash = `page=61&search=5A.2.1.1.1&table=${encodeURIComponent(table)}`;
        await page.goto(`${base}viewer.html?file=${encodeURIComponent(`${base}29272-j60.pdf`)}#${hash}`);
        await settled(page, `Table ${table}`);
        await page.waitForFunction(
          text => document.querySelector('.highlight.selected')?.textContent === text,
          `Table ${table}`,
          { timeout: 15000 },
        );
        const state = await viewerState(page);
        assert.equal(state.selectedPage, expected, table);
        assert.equal(state.page, expected, table);
        assert.ok(state.selectedTop >= 0 && state.selectedTop < 70, `${table}: ${JSON.stringify(state)}`);
        tops.push([state.selectedPage, state.selectedTop]);
      }
      assert.notDeepEqual(tops[0], tops[1], 'two places');
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  },
);

test('the RFC reader shows a result code on its line, as a bullet, and at its own clause', { skip }, async () => {
  const context = await browser.newContext({ viewport: { width: 1000, height: 600 } });
  const page = await context.newPage();
  try {
    for (const [file, hash, line] of [
      ['rfc6733', '#page=89&section=7.1.2&query=DIAMETER_SUCCESS&row=1&titled=1', 'DIAMETER_SUCCESS 2001'],
      [
        'rfc4740',
        '#page=59&section=10.1.1&query=DIAMETER_SERVER_SELECTION&row=1&titled=1',
        'o  DIAMETER_SERVER_SELECTION 2007',
      ],
      [
        'rfc7075',
        '#page=7&section=3.4&query=DIAMETER_REALM_REDIRECT_INDICATION&row=1&titled=1',
        '3.4.  DIAMETER_REALM_REDIRECT_INDICATION Protocol Error Code',
      ],
    ]) {
      await page.goto(`${base}rfc.html?file=${encodeURIComponent(`${base}${file}.txt`)}${hash}`);
      await page.waitForSelector('.rfc-line', { state: 'attached' });
      await page.waitForFunction(
        text =>
          [...document.querySelectorAll('.rfc-match, .rfc-match-line')].some(node =>
            node.closest('.rfc-line').textContent.trim().startsWith(text),
          ),
        line,
      );
      const first = await page.evaluate(() => {
        const top = document.querySelector('#rfc').getBoundingClientRect().top + 12;
        return [...document.querySelectorAll('.rfc-line')]
          .find(node => node.getBoundingClientRect().bottom > top)
          .textContent.trim();
      });
      assert.ok(first.startsWith(line), `${file}: ${first}`);
    }
  } finally {
    await context.close();
  }
});

test('the RFC reader shows a row whose name the ASCII table wraps', { skip }, async () => {
  const context = await browser.newContext({ viewport: { width: 1000, height: 600 } });
  const page = await context.newPage();
  try {
    await page.goto(
      `${base}rfc.html?file=${encodeURIComponent(`${base}rfc5580.txt`)}#page=30&section=6&query=Location-Data`,
    );
    await page.waitForSelector('.rfc-line', { state: 'attached' });
    const firstLine = () =>
      page.evaluate(() => {
        const top = document.querySelector('#rfc').getBoundingClientRect().top + 12;
        return [...document.querySelectorAll('.rfc-line')]
          .find(line => line.getBoundingClientRect().bottom > top)
          .textContent.trim();
      });
    assert.match(await firstLine(), /^6\.\s+Diameter RADIUS Interoperability/);
    for (const [name, line] of [
      ['Basic-Location-Policy-Rules', '|Basic-Location-'],
      ['Extended-Location-Policy-Rules', '|Extended-Location-'],
      ['Requested-Location-Info', '|Requested-'],
    ]) {
      await page.evaluate(hash => {
        location.hash = hash;
      }, `#page=30&section=6&query=${name}&row=1`);
      await page.waitForFunction(
        text =>
          [...document.querySelectorAll('.rfc-match, .rfc-match-line')].some(node =>
            node.closest('.rfc-line').textContent.trim().startsWith(text),
          ),
        line,
      );
      assert.ok((await firstLine()).startsWith(line), name);
    }
    await page.evaluate(hash => {
      location.hash = hash;
    }, '#page=30&section=6&query=Not-In-Table&row=1');
    await page.waitForFunction(() => document.querySelectorAll('.rfc-match, .rfc-match-line').length === 0);
    assert.match(await firstLine(), /^6\.\s+Diameter RADIUS Interoperability/);
  } finally {
    await context.close();
  }
});

test(
  'the RFC reader shows a misprinted row, the table holding a row, and the clause named after one',
  { skip },
  async () => {
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
        await page.waitForFunction(
          text =>
            [...document.querySelectorAll('.rfc-match, .rfc-match-line')].some(node =>
              node.closest('.rfc-line').textContent.trim().startsWith(text),
            ),
          line.trim(),
        );
        const first = await page.evaluate(() => {
          const top = document.querySelector('#rfc').getBoundingClientRect().top + 12;
          return [...document.querySelectorAll('.rfc-line')]
            .find(node => node.getBoundingClientRect().bottom > top)
            .textContent.trim();
        });
        assert.ok(first.startsWith(line.trim()), `${file}: ${first}`);
      }
    } finally {
      await context.close();
    }
  },
);

test(
  'the viewer in a production build keeps the chosen theme under a dark OS, its highlights themed and only its canvas inverted',
  { skip },
  async () => {
    const context = await browser.newContext({ viewport: { width: 1000, height: 900 }, colorScheme: 'dark' });
    const page = await context.newPage();
    try {
      await page.goto(
        `${base}viewer.html?file=${encodeURIComponent(`${base}29061-j10.pdf`)}${rowHash('3GPP-Session-Stop-Indicator')}`,
      );
      await settled(page, '3GPP-Session-Stop-Indicator');
      await page.waitForFunction(() => document.querySelector('.highlight.selected'));
      const state = () =>
        page.evaluate(() => {
          const selected = document.querySelector('.highlight.selected');
          const pageNode = selected.closest('.page');
          return {
            scheme: getComputedStyle(document.documentElement).colorScheme,
            selected: getComputedStyle(selected).backgroundColor,
            filter: getComputedStyle(pageNode).filter,
            canvas: getComputedStyle(pageNode.querySelector('.canvasWrapper')).filter !== 'none',
          };
        });
      assert.deepEqual(await state(), {
        scheme: 'light',
        selected: 'rgba(255, 150, 40, 0.3)',
        filter: 'none',
        canvas: false,
      });
      await page.evaluate(() => {
        document.documentElement.dataset.theme = 'dark';
      });
      assert.deepEqual(await state(), {
        scheme: 'dark',
        selected: 'rgba(255, 140, 50, 0.26)',
        filter: 'none',
        canvas: true,
      });
    } finally {
      await context.close();
    }
  },
);

const viewerOf = (file, hash) => `${base}viewer.html?file=${encodeURIComponent(`${base}${file}`)}#${hash}`;

test(
  "TS 29.328 table 6.1.1.1: an Information Elements row is found by its AVP, in the table's second column, and its match selected",
  { skip: skip || (!existsSync(elements) && `no ${elements}`) },
  async () => {
    const context = await browser.newContext({ viewport: { width: 1000, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    try {
      await page.goto(viewerOf('29328-j20.pdf', 'page=14&search=6.1.1&name=Server-Name&row=1'));
      await settled(page, 'Server-Name');
      await page.waitForFunction(() => document.querySelector('.highlight.selected')?.textContent === 'Server-Name');
      const state = await viewerState(page);
      assert.ok(state.selectedTop >= 0 && state.selectedTop < 80, `the row at the top: ${JSON.stringify(state)}`);
      // The selected match is the row's own: its line holds the element's name in the first column.
      const row = await page.evaluate(() => {
        const box = document.querySelector('.highlight.selected').getBoundingClientRect();
        return [...document.querySelectorAll('.textLayer span')]
          .filter(span => {
            const other = span.getBoundingClientRect();
            return Math.abs(other.top + other.height / 2 - (box.top + box.height / 2)) < 4;
          })
          .map(span => span.textContent)
          .join(' ');
      });
      // As the PDF prints it: "Application Server-Name", then Server-Name, C.
      assert.match(row, /^Application Server-Name Server-Name\s+C\b/);
      await page.screenshot({ path: process.env.SHOTS ? `${process.env.SHOTS}/pane-row-29328.png` : undefined });
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  },
);

test(
  "TS 29.214 5.4.0: an interpreted rule's quote is found from its clause on, and its first words selected",
  { skip: skip || (!existsSync(quoted) && `no ${quoted}`) },
  async () => {
    const context = await browser.newContext({ viewport: { width: 1000, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    try {
      const quote = 'The AF shall set the "Prefix Length" to 128 and encode the Ipv6 address';
      await page.goto(viewerOf('29214-j30.pdf', `page=62&search=5.4.0&quote=${encodeURIComponent(quote)}`));
      const query = quote.split(' ').slice(0, 8).join(' ');
      await settled(page, query);
      const state = await viewerState(page);
      // pdf.js marks a match a span at a time: all of them together read as the quote's first words.
      const selected = await page.evaluate(() =>
        [...document.querySelectorAll('.highlight.selected')].map(node => node.textContent).join(''),
      );
      assert.match(selected.replace(/\s+/g, ' '), /^The ?AF shall set the "Prefix Length" to/, JSON.stringify(state));
      assert.ok(state.selectedTop >= 0 && state.selectedTop < 80, `the sentence at the top: ${JSON.stringify(state)}`);
      assert.ok(state.selectedPage >= 62, 'from the clause on');
      await page.screenshot({ path: process.env.SHOTS ? `${process.env.SHOTS}/pane-quote-29214.png` : undefined });
      // A quote the page does not print leaves the clause as the place, and highlights nothing.
      await page.evaluate(() => {
        location.hash = `page=62&search=5.4.0&quote=${encodeURIComponent('No such sentence is printed in this clause at all')}`;
      });
      await page.waitForFunction(() => document.querySelector('#find').value === '5.4.0');
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  },
);

test(
  'the RFC reader shows a quote over a page break, its running footer and header left unmarked',
  { skip: skip || (!existsSync(path.join(specifications, 'rfc/rfc6733.txt')) && 'no RFC 6733') },
  async () => {
    const context = await browser.newContext({ viewport: { width: 1000, height: 600 } });
    const page = await context.newPage();
    try {
      const quote = 'Therefore, it is possible that a DPR/DPA exchange completes while application messages';
      await page.goto(
        `${base}rfc.html?file=${encodeURIComponent(`${base}rfc6733.txt`)}#page=22&section=2.1.1&quote=${encodeURIComponent(quote)}`,
      );
      await page.waitForSelector('.rfc-match-line');
      const marked = await page.evaluate(() =>
        [...document.querySelectorAll('.rfc-match-line')].map(node => node.textContent.trim()),
      );
      assert.deepEqual(marked, [
        'delivery mechanism is used.  Therefore, it is possible that a DPR/DPA',
        'exchange completes while application messages are still in transit,',
      ]);
      const first = await page.evaluate(() => {
        const top = document.querySelector('#rfc').getBoundingClientRect().top + 12;
        return [...document.querySelectorAll('.rfc-line')]
          .find(line => line.getBoundingClientRect().bottom > top)
          .textContent.trim();
      });
      assert.match(first, /Therefore, it is possible/);
      assert.ok(await page.evaluate(() => document.querySelector('.rfc-match-line').classList.contains('landing')));
      await page.screenshot({ path: process.env.SHOTS ? `${process.env.SHOTS}/pane-quote-rfc6733.png` : undefined });
    } finally {
      await context.close();
    }
  },
);

test(
  "the RFC reader finds a quote in the clause containing the block's where its own does not print it",
  { skip: skip || (!existsSync(path.join(specifications, 'rfc/rfc6733.txt')) && 'no RFC 6733') },
  async () => {
    const context = await browser.newContext({ viewport: { width: 1000, height: 600 } });
    const page = await context.newPage();
    try {
      // A block of clause 10.1's table quotes the symbol clause 10 prints for it.
      const marked = async (section, quote) => {
        await page.goto(
          `${base}rfc.html?file=${encodeURIComponent(`${base}rfc6733.txt`)}#page=133&section=${section}&quote=${encodeURIComponent(quote)}`,
        );
        await page.waitForSelector('.rfc-match-line');
        return page.evaluate(() =>
          [...document.querySelectorAll('.rfc-match-line')].map(node => node.textContent.trim()),
        );
      };
      assert.deepEqual(await marked('10.1', '0 The AVP MUST NOT be present in the message.'), [
        '0     The AVP MUST NOT be present in the message.',
      ]);
      assert.deepEqual(
        await marked('10.1', 'Acct-Interim- |0 |0 |0 |0 |0 |0 |0-1|0 |0 |0 |0 |0 | Interval | | | | | | | | | | | | |'),
        ['Acct-Interim-       |0  |0  |0  |0  |0  |0  |0-1|0  |0  |0  |0  |0  |'],
        'and one its own clause prints there, the row its first dozen words start',
      );
    } finally {
      await context.close();
    }
  },
);
