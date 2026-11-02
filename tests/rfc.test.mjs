import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Window } from 'happy-dom';
import { rfcPages } from '../src/rfc-text.ts';

const text = await readFile(new URL('../dist/data/sources/rfc6733.txt', import.meta.url), 'utf8');

test('RFC reader preserves the source and anchors headings rather than contents entries', () => {
  const pages = rfcPages(text);
  assert.equal(pages.map(page => page.text).join('\f'), text);
  const matches = pages.flatMap(page => page.lines.filter(line => line.section === '6.7.2').map(line => ({ ...line, page: page.page })));
  assert.equal(matches.length, 1);
  assert.equal(matches[0].page, 83);
  assert.match(matches[0].text, /Proxy-Info AVP/);
});

test('local RFC reader follows theme changes and navigates section and page fragments', async () => {
  const html = await readFile(new URL('../dist/rfc.html', import.meta.url), 'utf8');
  const script = html.match(/<script[^>]*src="([^"]+)"/)[1];
  const main = await readFile(new URL(`../dist/${script}`, import.meta.url), 'utf8');
  const window = new Window({
    url: 'http://localhost/rfc.html?file=http%3A%2F%2Flocalhost%2Fdata%2Fsources%2Frfc6733.txt#section=6.7.2&query=Proxy-Info',
    settings: { disableCSSFileLoading: true, enableJavaScriptEvaluation: true },
  });
  try {
    window.document.body.innerHTML = '<main id="rfc"></main>';
    for (const match of html.matchAll(/<link[^>]*href="([^"]+\.css)"/g)) {
      const style = window.document.createElement('style');
      style.textContent = await readFile(new URL(`../dist/${match[1]}`, import.meta.url), 'utf8');
      window.document.head.append(style);
    }
    window.localStorage.setItem('seanchai-theme', 'dark');
    window.fetch = async () => ({ ok: true, text: async () => text });
    const positioned = [];
    window.HTMLElement.prototype.getBoundingClientRect = function () {
      if (this.id.startsWith('section-') || this.dataset.page) positioned.push(this.id || this.dataset.page);
      return { top: 12, bottom: 30 };
    };
    await window.eval(`(async () => { ${main.replace(/^import[^;]+;/, '')} })()`);
    const doc = window.document;
    assert.equal(doc.documentElement.dataset.theme, 'dark');
    assert.equal(window.getComputedStyle(doc.documentElement).getPropertyValue('--ui-bg').trim(), '#151c24');
    assert.ok(positioned.includes('section-6.7.2'));
    assert.match(doc.querySelector('.rfc-match').textContent, /Proxy-Info/i);
    window.dispatchEvent(new window.StorageEvent('storage', { key: 'seanchai-theme', newValue: 'light' }));
    assert.equal(doc.documentElement.dataset.theme, 'light');
    assert.equal(window.getComputedStyle(doc.documentElement).getPropertyValue('--ui-bg').trim(), '#fff');
    window.eval(`window.dispatchEvent(new MessageEvent('message', {
      origin: location.origin, source: window.parent, data: { type: 'seanchai-theme', theme: 'dark' },
    }))`);
    assert.equal(doc.documentElement.dataset.theme, 'dark');
    window.location.hash = 'page=84&exact=1';
    window.dispatchEvent(new window.HashChangeEvent('hashchange'));
    assert.equal(positioned.at(-1), '84');
  } finally { await window.happyDOM.close(); }
});
