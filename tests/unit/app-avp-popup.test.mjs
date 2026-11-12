// A name's popup: how it opens, and what it says of the name.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  absent,
  boot,
  click,
  commandNames,
  identities,
  pane,
  paneAt,
  popupOf,
  present,
  rightClick,
  same,
  easing,
  settle,
  tableRows,
  tmgi,
} from './helpers.mjs';

test("self-hosted: a name's popup says its code, vendor and type, and gives its value tables both ways to them", async () => {
  const page = await boot({ hash: '#29217-j00', mode: 'self-hosted' });
  try {
    const { document } = page;
    const row = [...document.querySelectorAll('.table-row a[data-avp]')].find(
      node => node.dataset.avp === 'Congestion-Level-Range',
    );
    let popup = await popupOf(page, row);
    assert.deepEqual(identities(popup), ['Code 4003 · Vendor-ID 10415 · Unsigned32']);
    assert.equal(popup.firstElementChild.nextElementSibling.className, 'popup-identity', 'under the title');
    assert.deepEqual(tableRows(popup), [['Bits:', '5.3.5', 'Jump to', 'Show on the right']]);
    present(
      popup.querySelector('.popup-tables').closest('.popup-places').querySelector('.place-definition'),
      "in the targets' grid, after them",
    );
    const before = pane(document).scrollTop;
    popup.querySelector('.place-table .pane-action').click();
    await settle();
    assert.deepEqual(
      [paneAt(document).get('search'), paneAt(document).get('name'), paneAt(document).get('value')],
      ['5.3.5', 'No congestion', '0'],
      'the pane at its first row',
    );
    assert.equal(pane(document).scrollTop, before);
    assert.ok(document.querySelector('.avp-popup'), 'still open');
    const jump = popup.querySelector('.place-table .view-action');
    assert.match(
      jump.getAttribute('href'),
      /^#29217-j00\/5\.3\.5\?source=29217-j00&sourceSection=5\.3\.5&.*&line=244$/,
    );
    click(page, jump);
    await settle();
    absent(document.querySelector('.avp-popup'));
    assert.equal(document.querySelector('.target-line').dataset.line, '244');
    popup = await popupOf(
      page,
      [...document.querySelectorAll('pre a[data-avp]')].find(node => node.dataset.avp === 'Experimental-Result-Code'),
    );
    assert.deepEqual(
      tableRows(popup).map(cells => cells.slice(0, 2)),
      [['Result codes:', '5.5']],
    );
    popup.querySelector('.place-table .pane-action').click();
    await settle();
    assert.deepEqual(
      [paneAt(document).get('search'), paneAt(document).get('name')],
      ['5.5', null],
      "a result code's table at its clause",
    );
    popup = await popupOf(
      page,
      [...document.querySelectorAll('pre [data-avp]')].find(node => node.dataset.avp === 'Feature-List'),
    );
    assert.deepEqual(
      tableRows(popup).map(cells => cells[0]),
      ['Features list 1 (Np):'],
    );
    assert.deepEqual(identities(popup), [], 'nothing said of it here');
    absent(popup.querySelector('.popup-identity'));
  } finally {
    await page.close();
  }
});

test("a name's popup leaves out what it has nothing for, shows an Enumerated AVP block as a table, and every identity that disagrees", async () => {
  const page = await boot({ hash: '#29061-6f0/17.7' });
  try {
    const popup = await popupOf(page, tmgi(page.document));
    assert.deepEqual(identities(popup), ['Code 900 · Vendor-ID 10415 · OctetString']);
    absent(popup.querySelector('.popup-tables'));
  } finally {
    await page.close();
  }
  const recoded = (path, data) =>
    path !== 'data/documents/rfc7944.json'
      ? data
      : {
          ...data,
          lines: data.lines.map(line => ({
            ...line,
            tokens: line.tokens.map(token => ({ ...token, text: token.text.replace('header: 301', 'header: 302') })),
          })),
          blocks: data.blocks.map(block =>
            block.avp?.code === 301 ? { ...block, avp: { ...block.avp, code: 302 } } : block,
          ),
        };
  for (const [transform, expected] of [
    [undefined, ['Code 301 · Enumerated']],
    [recoded, ['Code 301 · Enumerated', 'Code 302 · Enumerated']],
  ]) {
    const drmp = await boot({ hash: '#rfc7944', transform });
    try {
      const popup = await popupOf(drmp, drmp.document.querySelector('pre a[data-avp="DRMP"]'));
      assert.deepEqual(identities(popup), expected, "IETF's vendor 0 is none to name");
      assert.deepEqual(
        tableRows(popup),
        [['Enumerated:', '9.1', 'Jump to', 'Show on the right']],
        'the RFC reader reads it',
      );
      assert.match(
        popup.querySelector('.place-table .view-action').getAttribute('href'),
        /^#rfc7944\/9\.1\?.*&line=13$/,
      );
      popup.querySelector('.place-table .pane-action').click();
      await settle();
      assert.deepEqual(
        [paneAt(drmp.document).get('section'), paneAt(drmp.document).get('query')],
        ['9.1', 'DRMP'],
        'the pane as at its Details',
      );
    } finally {
      await drmp.close();
    }
  }
});

test('a name defined in another document has its identity, flags and tables from there, loaded when its popup opens', async () => {
  const page = await boot({ hash: '#29153-j00' });
  try {
    const { document } = page;
    const drmp = [...document.querySelectorAll('pre a[data-avp]')].find(node => node.dataset.avp === 'DRMP');
    assert.ok(!page.fetched.includes('data/documents/rfc7944.json'));
    rightClick(page, drmp);
    await settle();
    await settle();
    const popup = document.querySelector('.avp-popup');
    assert.ok(page.fetched.includes('data/documents/rfc7944.json'), 'the document defining it is loaded');
    assert.deepEqual(identities(popup), ['Code 301 · Enumerated']);
    assert.deepEqual(
      [...popup.querySelectorAll('.popup-row .popup-flags td')].map(node => node.textContent),
      ['V'],
    );
    assert.deepEqual(
      tableRows(popup).map(cells => cells.slice(0, 3)),
      [['Enumerated:', 'RFC 7944 · 9.1', 'Jump to']],
    );
    assert.match(popup.querySelector('.place-table .view-action').getAttribute('href'), /^#rfc7944\/9\.1\?line=13$/);
  } finally {
    await page.close();
  }
});

test('the uses control lists a name on a plain tap, and Esc returns focus to it', async () => {
  const page = await boot({ hash: '#29153-j00' });
  try {
    const { document, window } = page;
    const control = document.querySelector('.uses-toggle input');
    assert.equal(control.checked, false);
    const name = document.querySelector('pre a[data-avp]');
    const before = window.location.hash;
    control.click();
    assert.equal(control.checked, true);
    name.focus();
    click(page, name);
    await settle();
    assert.equal(window.location.hash, before, 'not followed');
    const popup = document.querySelector('.avp-popup');
    assert.equal(popup.dataset.avp, name.dataset.avp);
    assert.ok(popup.querySelectorAll('.usage-link').length >= 1);
    same(document.activeElement, popup.querySelector('.popup-title button'));
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
    absent(document.querySelector('.avp-popup'));
    same(document.activeElement, name);
    click(page, name);
    document.querySelector('.avp-popup .popup-title button').click();
    same(document.activeElement, name);
    click(page, name);
    document.querySelector('.avp-popup .usage-link').click();
    assert.equal(document.querySelectorAll('.avp-current').length, 1);
    document.body.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true }));
    absent(document.querySelector('.avp-popup'));
    control.click();
    click(page, name);
    await settle();
    assert.notEqual(window.location.hash, before, 'followed again');
  } finally {
    await page.close();
  }
});

test('the uses control is read at click time and starts off on each document', async () => {
  const page = await boot({ hash: '#29153-j00' });
  try {
    const { document } = page;
    const control = document.querySelector('.uses-toggle input');
    assert.equal(control.checked, false);
    // As a browser restoring form state does: the box changes with no change event.
    control.checked = true;
    click(page, document.querySelector('pre a[data-avp]'));
    assert.ok(document.querySelector('.avp-popup'));
    document.querySelector('.avp-popup .popup-title button').click();
    await page.go('#rfc7944');
    assert.equal(document.querySelector('.uses-toggle input').checked, false);
    click(page, document.querySelector('pre a[data-avp]'));
    await settle();
    absent(document.querySelector('.avp-popup'));
  } finally {
    await page.close();
  }
});

test("right-click and the context-menu key list a name's uses, alt-click goes to its definition", async () => {
  const page = await boot({ hash: '#29153-j00' });
  try {
    const { document, window } = page;
    const name = document.querySelector('pre a[data-avp]');
    const escape = () => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
    assert.equal(rightClick(page, name), false, "the browser's menu is replaced");
    const popup = document.querySelector('.avp-popup');
    assert.equal(popup.dataset.avp, name.dataset.avp);
    assert.equal(popup.querySelector('.popup-title strong').textContent, name.dataset.avp);
    assert.equal(popup.getAttribute('aria-label'), name.dataset.avp);
    assert.match(popup.querySelector('.usage-details').textContent, /^Uses \d+/);
    assert.equal(popup.querySelector('.usage-details').open, false, "closed, as a Grouped AVP's contents are");
    escape();
    name.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ContextMenu', bubbles: true, cancelable: true }));
    assert.equal(document.querySelector('.avp-popup').dataset.avp, name.dataset.avp);
    escape();
    const line = [...document.querySelectorAll('pre .dad-line')].find(
      node => !node.querySelector('[data-avp], .value-name'),
    );
    assert.equal(rightClick(page, line), true, "anywhere else the menu is the browser's");
    assert.equal(rightClick(page, document.querySelector('.document-header')), true);
    absent(document.querySelector('.avp-popup'));
    click(page, document.querySelector('pre a[data-avp][href^="#rfc7944"]'), { altKey: true });
    await settle();
    absent(document.querySelector('.avp-popup'), 'alt lists nothing');
    assert.ok(window.location.hash.startsWith('#rfc7944/'), 'the view goes to its definition');
    assert.match(document.querySelector('.source-document').textContent, /^RFC 7944/, 'and the pane');
  } finally {
    await page.close();
  }
});

test("a name's title follows the pane and the control, and the control says what it does", async () => {
  const page = await boot({ hash: '#29153-j00' });
  try {
    const { document, window } = page;
    const name = document.querySelector('pre a[data-avp][href^="#rfc7944"]');
    assert.equal(name.title, 'Click: go to definition · Right-click: uses', 'until the pane is known');
    const hover = () => name.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }));
    hover();
    assert.equal(name.title, 'Click: definition in pane · Alt-click: definition in both · Right-click: uses');
    const control = document.querySelector('.uses-toggle');
    assert.equal(control.textContent.trim(), 'Click shows uses');
    assert.equal(control.title, 'Plain click lists where a name is used instead of going to it');
    control.querySelector('input').click();
    hover();
    assert.equal(name.title, 'Click or right-click: uses · Alt-click: definition in both');
    control.querySelector('input').click();
    hover();
    assert.equal(name.title, 'Click: definition in pane · Alt-click: definition in both · Right-click: uses');
  } finally {
    await page.close();
  }
});

test("a name's popup says how the line opened on uses it, the flags its row sets and a Grouped AVP's contents; a command's lists its AVPs", async () => {
  const page = await boot({ hash: '#29329-j10' });
  try {
    const { document } = page;
    const at = (name, line) =>
      [...document.querySelectorAll('pre [data-avp]')].find(
        node => node.dataset.avp === name && node.closest('.dad-line').dataset.line === line,
      );
    const texts = (popup, selector) => [...popup.querySelectorAll(selector)].map(node => node.textContent);
    let popup = await popupOf(page, at('User-Identity', '24'));
    assert.deepEqual(texts(popup, '.popup-context p'), [
      'Here: in command User-Data-Request (UDR) · 6.1.1',
      'Required { } · must be present, in any position · exactly once',
      'Bold in the source: the document defines or modifies it here',
    ]);
    assert.deepEqual(
      texts(popup, '.popup-row-title'),
      ['AVP Table 6.3.1 · Application-ID 16777217'],
      "the row's table and the application of its commands, opened away from it; alone, not marked as applying",
    );
    assert.deepEqual(texts(popup, '.popup-flags th, .popup-flags td'), ['Must', 'M, V'], 'no empty columns, no P');
    assert.match(popup.querySelector('.popup-flags td').title, /^M must be set\. Mandatory/);
    absent(popup.querySelector('.popup-facts'), 'Encrypt is not shown');
    const button = popup.querySelector('.popup-flags-line .popup-key-button');
    const key = popup.querySelector('.popup-key');
    assert.equal(key.hidden, true);
    button.click();
    assert.deepEqual([key.hidden, button.getAttribute('aria-expanded')], [false, 'true']);
    assert.deepEqual(texts(key, 'dt'), ['M', 'V', 'Encrypt']);
    assert.match(texts(key, 'dd')[2], /^No · Not shown/, "the row's Encrypt cell");
    const contents = popup.querySelector('.popup-contents');
    assert.equal(contents.open, false, 'closed away from its rule');
    assert.equal(contents.querySelector('summary').textContent, 'Contents 4');
    assert.deepEqual(texts(contents, '.contents-list > *').slice(-2), [
      '* [ AVP ]',
      'optional, any number of times · any other AVP',
    ]);
    popup.querySelector('.popup-title button').click();
    popup = await popupOf(page, at('User-Identity', '318'));
    assert.deepEqual(texts(popup, '.popup-context p'), ['Here: the rule of Grouped AVP User-Identity · 6.3.1']);
    assert.equal(popup.querySelector('.popup-contents').open, true, 'open on its rule');
    popup.querySelector('.popup-title button').click();
    popup = await popupOf(page, at('External-Identifier', '279'));
    assert.deepEqual(texts(popup, '.popup-context p'), ['Here: a row of Reused AVPs 6.3/2']);
    assert.deepEqual(texts(popup, '.popup-row-title'), [], 'the "Here:" line names the row opened on');
    assert.deepEqual(texts(popup, '.popup-flags th, .popup-flags td'), ['Must', 'M'], 'its M-bit cell as the M flag');
    assert.deepEqual(texts(popup, '.popup-facts dt, .popup-facts dd'), ['From', 'TS29.336']);
    assert.equal(popup.querySelector('.popup-key').hidden, false, 'the key stays open from the last popup');
    assert.deepEqual(texts(popup, '.popup-key dt'), ['M', 'V', 'From'], 'a Reused AVPs row has no P or Encrypt to say');
    popup.querySelector('.popup-title button').click();
    popup = await popupOf(page, commandNames(document, '306 request')[0]);
    assert.match(popup.querySelector('.popup-contents summary').textContent, /^AVPs \d+$/);
    assert.deepEqual(texts(popup, '.contents-list > *').slice(0, 2), ['< Session-Id >', 'fixed, exactly once']);
    popup.querySelector('.popup-title button').click();
    rightClick(page, at('DRMP', '16'));
    await settle();
    await settle();
    popup = document.querySelector('.avp-popup');
    assert.equal(
      texts(popup, '.popup-row-title').at(-1),
      'AVP Table 9.2 · RFC 7944',
      "drawn again once the document defining it is loaded, after the tables of the command's own clause",
    );
    const rows = [...popup.querySelectorAll('.popup-row')];
    assert.deepEqual(texts(rows[0], '.popup-flags th, .popup-flags td'), ['Must not', 'M, V'], "the command's table");
    assert.deepEqual(texts(rows.at(-1), '.popup-flags th, .popup-flags td'), ['Must not', 'V'], "RFC 7944's");
  } finally {
    await page.close();
  }
});

test('a popup drawn again once its document loads keeps the use stepped to, the opened uses and the focus', async () => {
  const page = await boot({ hash: '#29329-j10' });
  try {
    const { document } = page;
    rightClick(
      page,
      [...document.querySelectorAll('pre [data-avp]')].find(
        node => node.dataset.avp === 'DRMP' && node.closest('.dad-line').dataset.line === '16',
      ),
    );
    const first = document.querySelector('.avp-popup');
    const titles = popup => [...popup.querySelectorAll('.popup-row-title')].map(node => node.textContent);
    assert.ok(!titles(first).includes('AVP Table 9.2 · RFC 7944'), 'RFC 7944 is not loaded yet');
    const next = [...first.querySelectorAll('.popup-actions button')].find(node => node.textContent === 'Next');
    next.focus();
    next.click();
    const stepped = document.querySelector('.avp-popup');
    same(stepped, first, 'the popup open, drawn again over its own nodes');
    assert.match(stepped.querySelector('.popup-actions span').textContent, /^\.dad 2\//, 'for the use stepped to');
    assert.equal(document.activeElement.textContent, 'Next');
    stepped.querySelector('.popup-uses').open = true;
    await settle();
    await settle();
    const popup = document.querySelector('.avp-popup');
    same(popup, first, 'drawn again over its own nodes');
    assert.deepEqual(
      titles(popup),
      [
        'AVP Table 6.3.1 · Application-ID 16777217 · applies here',
        'Reused AVPs 6.3.1 · Application-ID 16777217 · applies here',
        'AVP Table 9.2 · RFC 7944',
      ],
      "the tables of the command opened in first and marked, then the defining document's",
    );
    assert.match(popup.querySelector('.popup-actions span').textContent, /^\.dad 2\//);
    assert.equal(popup.querySelectorAll('.usage-link')[1].getAttribute('aria-current'), 'location');
    assert.equal(popup.querySelector('.popup-uses').open, true);
    assert.equal(document.activeElement.textContent, 'Next');
    assert.equal(document.querySelectorAll('pre .avp-current').length, 1);
  } finally {
    await page.close();
  }
});

test('a popup drawn again once its document loads leaves a focus outside it where it is', async () => {
  const page = await boot({ hash: '#29329-j10' });
  try {
    const { document } = page;
    rightClick(
      page,
      [...document.querySelectorAll('pre [data-avp]')].find(
        node => node.dataset.avp === 'DRMP' && node.closest('.dad-line').dataset.line === '16',
      ),
    );
    const first = document.querySelector('.avp-popup');
    const titles = () => [...first.querySelectorAll('.popup-row-title')].map(node => node.textContent);
    assert.ok(!titles().includes('AVP Table 9.2 · RFC 7944'), 'RFC 7944 is not loaded yet');
    const outside = document.querySelector('header .theme-toggle');
    outside.focus();
    await settle();
    await settle();
    same(document.querySelector('.avp-popup'), first, 'drawn again over its own nodes');
    assert.ok(titles().includes('AVP Table 9.2 · RFC 7944'), 'drawn again with the document');
    same(document.activeElement, outside);
  } finally {
    await page.close();
  }
});

/** A page laid out as a browser would for a popup: the text's pane from 100 to 700, lines of 20 pixels, popups 300 by 200. */
const layOutPopup = page => {
  const { HTMLElement } = page.window;
  const box = (top, height, left = 0, width = 100) => ({
    top,
    bottom: top + height,
    left,
    right: left + width,
    width,
    height,
  });
  HTMLElement.prototype.getBoundingClientRect = function () {
    if (this.id === 'document') return box(100, 600, 0, 1280);
    if (this.classList.contains('avp-popup')) return box(0, 200, 0, 300);
    const line = this.closest('.dad-line');
    if (!line) return box(0, 0, 0, 0);
    return box(100 + Number(line.dataset.line) * 20 - this.closest('#document').scrollTop, 20, 40);
  };
};
const frames = () => new Promise(resolve => setTimeout(resolve, 40));

test("a name's popup stays by its name as the text scrolls, and at the text's edge, detached, when the name has left it", async () => {
  const page = await boot({ hash: '#29329-j10' });
  try {
    const { document } = page;
    layOutPopup(page);
    const name = [...document.querySelectorAll('pre [data-avp]')].find(
      node => node.dataset.avp === 'User-Identity' && node.closest('.dad-line').dataset.line === '24',
    );
    const text = pane(document);
    text.scrollTop = 0;
    const popup = await popupOf(page, name);
    const at = () => [parseFloat(popup.style.top), parseFloat(popup.style.left), popup.dataset.detached];
    assert.deepEqual(at(), [100 + 24 * 20 - 200 - 8, 40, undefined], 'above it, where below does not fit');
    text.scrollTop = 300;
    text.dispatchEvent(new page.window.Event('scroll'));
    await frames();
    assert.deepEqual(
      at(),
      [100 + 24 * 20 - 300 + 20 + 8, 40, undefined],
      'below it once that fits, the name having moved up',
    );
    const list = popup.querySelector('.usage-list');
    text.scrollTop = 1000;
    list.dispatchEvent(new page.window.Event('scroll'));
    await frames();
    assert.equal(parseFloat(popup.style.top), 100 + 24 * 20 - 300 + 20 + 8, "its own list's scroll moves nothing");
    text.dispatchEvent(new page.window.Event('scroll'));
    await frames();
    assert.deepEqual(at(), [108, 40, 'up'], 'the name scrolled away above: at the top of the text, detached');
    text.scrollTop = 0;
    text.dispatchEvent(new page.window.Event('scroll'));
    await frames();
    assert.deepEqual(at(), [100 + 24 * 20 - 200 - 8, 40, undefined], 'back by it');
  } finally {
    await page.close();
  }
});

test("Next and a use in the list draw a name's popup again for the use gone to, keeping its sections, key and focus", async () => {
  const page = await boot({ hash: '#29329-j10' });
  try {
    const { document, window } = page;
    layOutPopup(page);
    const texts = (popup, selector) => [...popup.querySelectorAll(selector)].map(node => node.textContent);
    const opener = [...document.querySelectorAll('pre [data-avp]')].find(
      node => node.dataset.avp === 'User-Identity' && node.closest('.dad-line').dataset.line === '24',
    );
    opener.focus();
    let popup = await popupOf(page, opener);
    assert.match(texts(popup, '.popup-context p')[0], /^Here: in command User-Data-Request/);
    popup.querySelector('.popup-key-button').click();
    popup.querySelector('.popup-uses').open = true;
    const entries = [...popup.querySelectorAll('.usage-link')];
    const head = entries.findIndex(node => node.textContent.includes('User-Identity ::='));
    assert.ok(head > 0, texts(popup, '.usage-link').join('\n'));
    entries[head].focus();
    entries[head].click();
    const first = popup;
    popup = document.querySelector('.avp-popup');
    same(popup, first, 'drawn again over its own nodes');
    assert.deepEqual(texts(popup, '.popup-context p'), ['Here: the rule of Grouped AVP User-Identity · 6.3.1']);
    assert.equal(popup.querySelector('.popup-contents').open, true, 'open on its rule, as if opened there');
    assert.equal(popup.querySelector('.popup-uses').open, true, 'the uses stay open');
    assert.equal(popup.querySelector('.popup-key').hidden, false, 'the key stays open');
    assert.equal(popup.querySelectorAll('.usage-link')[head].getAttribute('aria-current'), 'location');
    same(document.activeElement, popup.querySelectorAll('.usage-link')[head], 'the focus on the entry pressed');
    assert.match(popup.querySelector('.popup-actions span').textContent, new RegExp(`^\\.dad ${head + 1}/`));
    const use = document.querySelector('pre .avp-current');
    assert.equal(use.closest('.dad-line').dataset.line, '318');
    await easing();
    await frames();
    const line = Number(use.closest('.dad-line').dataset.line);
    const bottom = 100 + line * 20 - pane(document).scrollTop + 20;
    assert.equal(parseFloat(popup.style.top), bottom + 8, 'below the use gone to, once the text is there');
    popup.querySelector('.popup-contents').open = false;
    const next = [...popup.querySelectorAll('.popup-actions button')].find(node => node.textContent === 'Next');
    next.focus();
    next.click();
    popup = document.querySelector('.avp-popup');
    assert.equal(document.activeElement.textContent, 'Next', 'the focus on Next');
    assert.ok(popup.contains(document.activeElement));
    assert.notDeepEqual(texts(popup, '.popup-context p'), ['Here: the rule of Grouped AVP User-Identity · 6.3.1']);
    assert.equal(popup.querySelector('.popup-contents')?.open ?? false, false, 'closed as the reader left it');
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
    absent(document.querySelector('.avp-popup'));
    same(document.activeElement, opener, 'Escape gives the focus back to the name opened on');
  } finally {
    await page.close();
  }
});
