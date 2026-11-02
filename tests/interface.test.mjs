import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';
import { Window } from 'happy-dom';

const root = fileURLToPath(new URL('../', import.meta.url));
const index = JSON.parse(await readFile(path.join(root, 'dist/data/index.json'), 'utf8'));
const html = await readFile(path.join(root, 'dist/index.html'), 'utf8');
const script = html.match(/<script[^>]*src="([^"]+)"/)[1];
const main = await readFile(new URL(`../dist/${script}`, import.meta.url), 'utf8');

test('built viewer navigates documents, corrections, raw views, search, and PDF deep links', async () => {
  const window = new Window({
    url: 'http://localhost/',
    settings: { disableIframePageLoading: true, disableCSSFileLoading: true, enableJavaScriptEvaluation: true },
  });
  try {
    window.document.body.innerHTML = '<div id="app"></div>';
    for (const match of html.matchAll(/<link[^>]*href="([^"]+\.css)"/g)) {
      const style = window.document.createElement('style');
      style.textContent = await readFile(new URL(`../dist/${match[1]}`, import.meta.url), 'utf8');
      window.document.head.append(style);
    }
    window.fetch = async url => {
      const parsed = new URL(url);
      const file = path.join(root, 'dist', parsed.pathname);
      return { ok: true, json: async () => JSON.parse(await readFile(file, 'utf8')) };
    };
    const module = main.replace(/^import[^;]+;/, '');
    await window.eval(`(async () => { ${module} })()`);
    const settle = async () => {
      for (let i = 0; i < 10; i++) await new Promise(resolve => setTimeout(resolve, 10));
    };
    const go = async hash => {
      window.location.hash = hash;
      await settle();
    };
    const document = window.document;
    assert.equal(document.querySelector('header nav').textContent, 'IndexSearch');
    assert.equal(document.querySelector('.demo-badge').textContent, 'Demo');
    const themeButton = document.querySelector('.theme-toggle');
    assert.equal(document.documentElement.dataset.theme, 'light');
    assert.equal(themeButton.textContent, 'Dark');
    themeButton.click();
    assert.equal(document.documentElement.dataset.theme, 'dark');
    assert.equal(window.localStorage.getItem('seanchai-theme'), 'dark');
    assert.equal(window.getComputedStyle(document.documentElement).getPropertyValue('--syntax-type-bg').trim(), 'transparent');
    themeButton.click();
    assert.equal(document.documentElement.dataset.theme, 'light');
    assert.equal(document.querySelectorAll('main li > a').length, index.documents.length);
    await go('#29272-i70/7.3.138');
    assert.ok(document.querySelector('#section-7\\.3\\.138'));
    const frame = document.querySelector('iframe');
    const source = new URL(frame.src);
    assert.ok(source.pathname.endsWith('/viewer.html'));
    assert.ok(source.searchParams.get('file').endsWith('/data/sources/29272-i70.pdf'));
    assert.equal(new URLSearchParams(source.hash.slice(1)).get('search'), '7.3.138');
    assert.ok(document.querySelector('.source-document').textContent.startsWith('3GPP TS 29.272 V18.7.0'));
    assert.equal(document.querySelector('.document-header').textContent, document.querySelector('.source-header').textContent);
    assert.ok(document.querySelector('.document-header').textContent.includes('—'));
    assert.equal(document.querySelector('.source-header .publisher-link span').textContent, 'etsi.org');
    assert.equal(document.querySelector('.source-header .local-pdf-link span').textContent, 'localhost');
    assert.equal(document.querySelectorAll('.source-header .pane-actions svg').length, 4);
    const themes = [];
    Object.defineProperty(frame, 'contentWindow', { configurable: true, value: { postMessage: data => { if (data.type === 'seanchai-theme') themes.push(data.theme); } } });
    themeButton.click();
    await settle();
    assert.equal(themes.at(-1), 'dark');
    themeButton.click();
    window.dispatchEvent(new window.MessageEvent('message', {
      origin: window.location.origin, source: frame.contentWindow,
      data: { type: 'seanchai-pdf-page', file: 'http://localhost/data/sources/29272-i70.pdf', page: 245 },
    }));
    assert.ok(document.querySelector('.source-header .local-pdf-link').href.endsWith('#page=245'));
    assert.ok(document.querySelector('.source-header .publisher-link').href.endsWith('#page=245'));
    assert.equal(document.querySelector('.share-view'), null);
    await go('#29272-i70/7.3.138?source=29272-i70&sourceSection=7.3.138&page=245');
    assert.equal(new URLSearchParams(new URL(document.querySelector('iframe').src).hash.slice(1)).get('exact'), '1');
    delete frame.contentWindow;
    assert.ok(document.querySelector('pre .correction-toggle').title.includes('clause'));
    const headerPDF = [...document.querySelectorAll('pre a')].find(a => a.textContent.startsWith('https://'));
    assert.ok(headerPDF.href.startsWith('https://www.etsi.org/'));
    assert.equal(headerPDF.target, '_blank');
    const pane = document.querySelector('#document');
    pane.scrollTop = 137;
    pane.scrollLeft = 21;
    const before = window.location.hash;
    const definition = document.querySelector('pre a[href="#29272-i70/7.3.138"]');
    definition.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    await settle();
    assert.equal(pane.scrollTop, 137);
    assert.equal(pane.scrollLeft, 21);
    assert.equal(window.location.hash, before);
    assert.equal(document.querySelector('.avp-popup'), null);
    definition.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, altKey: true }));
    const popup = document.querySelector('.avp-popup');
    assert.equal(popup.dataset.avp, 'Area-Scope');
    assert.ok(popup.querySelectorAll('.usage-link').length > 1);
    assert.ok(popup.querySelector('.definition-link').href.includes('29272-i70/7.3.138'));
    assert.equal(popup.querySelector('details'), null);
    assert.equal(popup.querySelector('output'), null);
    assert.equal(popup.querySelectorAll('.popup-actions').length, 1);
    popup.querySelector('.usage-link').click();
    assert.equal(document.querySelectorAll('.avp-current').length, 1);
    assert.equal(popup.querySelectorAll('.usage-link[aria-current]').length, 1);
    pane.scrollTop = 137;
    const origin = [...document.querySelectorAll('pre a')].find(a => a.getAttribute('href')?.startsWith('#rfc6733/'));
    origin.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    await settle();
    assert.equal(pane.scrollTop, 137);
    assert.equal(window.location.hash, before);
    assert.equal(new URL(document.querySelector('iframe').src).pathname, '/rfc.html');
    assert.ok(new URL(document.querySelector('iframe').src).searchParams.get('file').endsWith('/data/sources/rfc6733.txt'));
    assert.ok(document.querySelector('.source-document').textContent.startsWith('RFC 6733'));
    const toggle = document.querySelector('#controls input');
    toggle.checked = false;
    toggle.dispatchEvent(new window.Event('change'));
    assert.ok(!document.querySelector('#workspace').classList.contains('with-source'));
    origin.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    await settle();
    assert.ok(document.querySelector('.document-header h2').textContent.startsWith('RFC 6733'));
    assert.equal(document.querySelector('#controls input').checked, false);
    assert.equal(document.querySelector('iframe').getAttribute('src'), null);
    const sectionLink = document.querySelector('pre a[class*="constant.other.section"]');
    sectionLink.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    assert.equal(document.querySelector('#controls input').checked, true);
    assert.ok(document.querySelector('#workspace').classList.contains('with-source'));
    assert.equal(new URL(document.querySelector('iframe').src).pathname, '/rfc.html');
    await go('#29329-i00');
    const tableName = [...document.querySelectorAll('.table-row a')].find(a => a.textContent === 'Supported-Features');
    tableName.click();
    const rowParams = new URLSearchParams(new URL(document.querySelector('iframe').src).hash.slice(1));
    assert.equal(rowParams.get('row'), '1');
    assert.equal(rowParams.get('name'), 'Supported-Features');
    assert.equal(rowParams.get('page'), '17');
    assert.equal(rowParams.get('search'), '6.3');
    const tableSection = [...tableName.closest('.dad-line').querySelectorAll('a')].find(a => a.textContent === '6.3.11');
    tableSection.click();
    const sectionParams = new URLSearchParams(new URL(document.querySelector('iframe').src).hash.slice(1));
    assert.equal(sectionParams.get('row'), null);
    assert.equal(sectionParams.get('search'), '6.3.11');
    const tableSource = document.querySelector('#controls input');
    tableSource.checked = false;
    tableSource.dispatchEvent(new window.Event('change'));
    tableName.click();
    await settle();
    assert.equal(window.location.hash, '#29229-i10/6.3.29?name=Supported-Features');
    assert.equal(document.querySelector('#controls input').checked, false);
    document.querySelector('pre a[class*="constant.other.section"]').click();
    await go('#29272-i70/7.3.138?raw=1');
    assert.ok([...document.querySelectorAll('#controls a')].some(a => a.textContent === 'Corrected'));
    assert.equal(document.querySelectorAll('pre .correction').length, 0);
    assert.ok(document.querySelector('pre .raw-warning'));
    await go('#29229-i10?raw=1');
    const sourceToggle = document.querySelector('#controls input');
    sourceToggle.checked = true;
    sourceToggle.dispatchEvent(new window.Event('change'));
    const digest = [...document.querySelectorAll('pre a')].find(a => a.textContent === 'Digest-QoP' && a.getAttribute('href') === '#rfc4590/3.8');
    assert.equal(digest.getAttribute('href'), '#rfc4590/3.8');
    digest.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    await settle();
    assert.ok(document.querySelector('.source-document').textContent.startsWith('RFC 4590'));
    await go('#29229-i10');
    const comment = [...document.querySelectorAll('pre .correction-toggle')].find(button => button.title.includes('rta-session-id-repeated'));
    assert.equal(comment.textContent, ";; deleted: AVP rule 'Session-Id'");
    assert.equal(window.getComputedStyle(comment).display, 'inline');
    assert.equal(window.getComputedStyle(comment).paddingTop, '0px');
    assert.ok(comment.title.includes('(occurrence 2)'));
    assert.ok(comment.parentElement.parentElement.textContent.trimStart().startsWith(';; deleted:'));
    assert.equal(comment.parentElement.parentElement.querySelectorAll('a').length, 0);
    const fullComment = comment.nextElementSibling;
    assert.equal(fullComment.hidden, true);
    comment.click();
    assert.equal(fullComment.hidden, false);
    assert.ok(comment.textContent.includes('TS29.229.py#rta-session-id-repeated'));
    assert.equal(comment.parentElement.textContent.match(/;; deleted:/g).length, 1);
    assert.equal(comment.getAttribute('aria-expanded'), 'true');
    comment.click();
    assert.equal(fullComment.hidden, true);
    await go('#search?q=Call-Barring');
    assert.ok(document.querySelector('#search-results details'));
    assert.deepEqual([...document.querySelectorAll('#search-results h2')].map(node => node.textContent.split(' (')[0]), ['Specifications', 'AVPs', 'Mentions']);
    const input = document.querySelector('input[type=search]');
    input.value = 'infor-list';
    input.dispatchEvent(new window.Event('input'));
    await new Promise(resolve => setTimeout(resolve, 160));
    assert.ok(document.querySelector('#search-results').textContent.includes('Call-Barring-Info'));
    document.querySelector('.search-form input').value = '505';
    document.querySelector('.search-form').dispatchEvent(new window.Event('submit', { cancelable: true }));
    assert.ok(document.querySelector('.search-avps').textContent.includes('AF-Charging-Identifier'));
    assert.ok(document.querySelector('.search-mentions .mention-link'));
    document.querySelector('.search-form input').value = '29.214';
    document.querySelector('.search-form').dispatchEvent(new window.Event('submit', { cancelable: true }));
    assert.ok(document.querySelector('.search-specifications').textContent.includes('Policy and charging control over Rx'));
    await go('#does-not-exist');
    assert.equal(document.querySelector('main').textContent, 'Document not found');
  } finally { await window.happyDOM.close(); }
});

test('local artifact contains PDFs and PDF.js resources without a deployment workflow', async () => {
  const documents = index.documents.filter(doc => doc.source.local);
  assert.ok(documents.length > 40);
  for (const doc of documents) {
    const bytes = await readFile(path.join(root, 'dist/data', doc.source.local));
    assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
  }
  const viewer = await readFile(path.join(root, 'dist/viewer.html'), 'utf8');
  assert.ok(viewer.includes('viewerContainer'));
  assert.ok(viewer.includes('<title>Seanchaí</title>'));
  assert.ok(html.includes('<title>Seanchaí</title>'));
  assert.ok(viewer.includes('id="chapters"'));
  assert.ok(!viewer.includes('id="previous"'));
  assert.ok(!viewer.includes('id="next"'));
  const window = new Window();
  try {
    window.document.body.innerHTML = viewer;
    const controls = window.document.querySelector('#find-controls');
    assert.ok(controls.querySelector('#find'));
    for (const direction of ['previous', 'next']) {
      const button = controls.querySelector(`#find-${direction}`);
      assert.equal(button.type, 'button');
      assert.ok(button.getAttribute('aria-label').toLowerCase().includes(`${direction} match`));
    }
  } finally { await window.happyDOM.close(); }
  const wasm = await readFile(path.join(root, 'dist/pdfjs/wasm/openjpeg.wasm'));
  assert.ok(wasm.length > 0);
  await assert.rejects(readFile(path.join(root, '.github/workflows/pages.yml')));
});
