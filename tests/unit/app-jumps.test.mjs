// The jump list, its keys and buttons, and the positions a document comes back to.
import assert from 'node:assert/strict';
import test from 'node:test';
import { absent, boot, click, easing, layOut, notSame, pane, press, same, settle } from './helpers.mjs';

const follow = async (page, hash) => {
  const anchor = page.document.createElement('a');
  anchor.setAttribute('href', hash);
  page.document.body.append(anchor);
  click(page, anchor);
  anchor.remove();
  await settle();
};
const button = (document, walk) => document.querySelector(`.jump-button[data-walk="${walk}"]`);

test('ctrl+o and ctrl+i walk jumps exactly, within a document and between documents, and alt does too', async () => {
  const page = await boot({ hash: '#29153-j00' });
  try {
    const { document, window } = page;
    layOut(page);
    pane(document).scrollTop = 407;
    await follow(page, `#29153-j00/${document.querySelector('.section-list a').textContent}`);
    await easing();
    const atSection = pane(document).scrollTop;
    assert.notEqual(atSection, 407);
    const back = press(page, { key: 'o', ctrlKey: true });
    assert.equal(back.defaultPrevented, true);
    await settle();
    assert.equal(pane(document).scrollTop, 407, 'to the pixel');
    assert.match(window.location.hash, /top=20/);
    press(page, { key: 'i', ctrlKey: true });
    await settle();
    assert.equal(pane(document).scrollTop, atSection);
    await follow(page, '#rfc7944');
    assert.ok(document.querySelector('.document-header h1').textContent.startsWith('RFC 7944'));
    press(page, { key: 'o', altKey: true });
    await settle();
    assert.ok(document.querySelector('.document-header h1').textContent.startsWith('3GPP TS 29.153'));
    assert.equal(pane(document).scrollTop, atSection);
    press(page, { key: 'I', code: 'KeyI', altKey: true });
    await settle();
    assert.ok(document.querySelector('.document-header h1').textContent.startsWith('RFC 7944'));
  } finally {
    await page.close();
  }
});

test('the walks skip what is in the document for [d and ]d, [j and ]j are the plain ones, and a chord lapses', async () => {
  const page = await boot({ hash: '#29153-j00' });
  try {
    const { document } = page;
    layOut(page);
    const heading = () => document.querySelector('.document-header h1').textContent;
    await follow(page, '#29153-j00?line=40');
    await follow(page, '#rfc7944');
    await follow(page, '#rfc7944?line=30');
    press(page, { key: '[' });
    assert.equal(press(page, { key: 'd' }).defaultPrevented, true);
    await settle();
    assert.match(heading(), /^3GPP TS 29\.153/, "past the RFC's other place");
    press(page, { key: ']' });
    press(page, { key: 'd' });
    await settle();
    assert.match(heading(), /^RFC 7944/);
    press(page, { key: '[' });
    press(page, { key: 'j' });
    await settle();
    assert.match(heading(), /^RFC 7944/, 'one place back is still the RFC');
    const lapsed = press(page, { key: 'q' });
    assert.equal(lapsed.defaultPrevented, false);
    assert.equal(press(page, { key: 'd' }).defaultPrevented, false, 'a d alone is nothing');
    assert.equal(press(page, { key: '[', ctrlKey: true }).defaultPrevented, false);
  } finally {
    await page.close();
  }
});

test('the keys leave what takes typing alone, and work from a checkbox', async () => {
  const page = await boot({ hash: '#search?q=DRMP' });
  try {
    const { document } = page;
    const input = document.querySelector('.search-form input');
    input.focus();
    same(document.activeElement, input);
    assert.equal(press(page, { key: 'o', ctrlKey: true }, input).defaultPrevented, false);
    press(page, { key: '[' }, input);
    assert.equal(press(page, { key: 'd' }, input).defaultPrevented, false);
    await follow(page, '#rfc7944');
    const uses = document.querySelector('.uses-toggle input');
    uses.focus();
    assert.equal(press(page, { key: 'o', ctrlKey: true }, uses).defaultPrevented, true);
    await settle();
    assert.equal(document.querySelector('.search-form input').value, 'DRMP', 'back at the search');
    notSame(document.activeElement, document.querySelector('.search-form input'), 'with the keys still walking');
    assert.equal(press(page, { key: 'i', ctrlKey: true }).defaultPrevented, true);
    await settle();
    assert.ok(document.querySelector('#document'));
  } finally {
    await page.close();
  }
});

test("the header's buttons name their key and target, stay in the tab order at the ends, and keep the focus across documents", async () => {
  const page = await boot({ hash: '#29153-j00' });
  try {
    const { document } = page;
    layOut(page);
    assert.deepEqual(
      [...document.querySelectorAll('.jump-button')].map(node => node.textContent),
      ['‹', '›', '«', '»'],
    );
    same(
      document.querySelector('.document-header').firstElementChild,
      document.querySelector('.jump-controls'),
      'left of the title',
    );
    absent(document.querySelector('.source-header .jump-controls'));
    for (const node of document.querySelectorAll('.jump-button')) {
      assert.equal(node.getAttribute('aria-disabled'), 'true');
      assert.equal(node.disabled, false);
    }
    assert.equal(button(document, 'back').title, 'No earlier position (Ctrl+O)');
    pane(document).scrollTop = 2240;
    await follow(page, '#rfc7944');
    assert.equal(button(document, 'back').title, 'Back to TS 29.153 line 113 (Ctrl+O)');
    assert.equal(button(document, 'backDocument').title, 'Back to TS 29.153 line 113 ([d)');
    assert.equal(button(document, 'back').getAttribute('aria-disabled'), 'false');
    assert.equal(button(document, 'forward').getAttribute('aria-disabled'), 'true');
    assert.equal(button(document, 'forward').title, 'No later position (Ctrl+I)');
    button(document, 'back').focus();
    button(document, 'back').click();
    await settle();
    assert.ok(document.querySelector('.document-header h1').textContent.startsWith('3GPP TS 29.153'));
    assert.equal(pane(document).scrollTop, 2240);
    same(document.activeElement, button(document, 'back'));
    assert.equal(button(document, 'forward').title, 'Forward to RFC 7944 line 1 (Ctrl+I)');
    assert.equal(button(document, 'back').getAttribute('aria-disabled'), 'true');
    button(document, 'back').click();
    await settle();
    assert.ok(
      document.querySelector('.document-header h1').textContent.startsWith('3GPP TS 29.153'),
      'at the end it does nothing',
    );
    button(document, 'forwardDocument').click();
    await settle();
    assert.ok(document.querySelector('.document-header h1').textContent.startsWith('RFC 7944'));
    assert.equal(button(document, 'backDocument').title, 'Back to TS 29.153 line 113 ([d)');
    await follow(page, '#');
    await follow(page, '#search');
    absent(document.querySelector('.jump-button'), "only a document's header has them");
    document.activeElement.blur();
    press(page, { key: 'o', altKey: true });
    await settle();
    assert.ok(document.querySelector('.index-view'), 'the keys work everywhere');
  } finally {
    await page.close();
  }
});

test('following a link pushes history only for a new page, and in a page it replaces', async () => {
  const page = await boot({ hash: '#29153-j00' });
  try {
    const { document, window } = page;
    const length = window.history.length;
    let pushed = 0;
    const pushState = window.history.pushState.bind(window.history);
    window.history.pushState = (...args) => {
      pushed++;
      pushState(...args);
    };
    click(page, document.querySelector('.section-list a'));
    await settle();
    assert.match(window.location.hash, /^#29153-j00\//);
    assert.equal(window.history.length, length);
    await follow(page, '#29153-j00?line=20');
    assert.equal(window.location.hash, '#29153-j00?line=20');
    assert.equal(pushed, 0);
    await follow(page, '#rfc7944');
    assert.equal(window.location.hash, '#rfc7944');
    assert.equal(window.history.length, length + 1);
    await follow(page, '#');
    await follow(page, '#search?q=DRMP');
    await follow(page, '#search?q=Ns');
    assert.equal(pushed, 3, 'index and search are pages, and another search is the same one');
    await follow(page, '#29153-j00');
    await follow(page, '#29153-j00?raw=1');
    assert.equal(pushed, 5, 'raw text has its own lines, so it is a page');
  } finally {
    await page.close();
  }
});

test('a document comes back where it was left unless its route says otherwise, and raw keeps its own place', async () => {
  const page = await boot({ hash: '#29153-j00' });
  try {
    const { document } = page;
    layOut(page);
    pane(document).scrollTop = 1237;
    await follow(page, '#');
    await follow(page, '#29153-j00');
    assert.equal(pane(document).scrollTop, 1237);
    await follow(page, '#29153-j00?raw=1');
    assert.equal(pane(document).scrollTop, 0, "the raw text's lines are not these");
    await follow(page, '#');
    await follow(page, '#29153-j00?top=9');
    assert.equal(pane(document).scrollTop, 180, 'a line in the route wins');
    assert.ok(page.window.sessionStorage.getItem('seanchai-positions').includes('"29153-j00"'));
  } finally {
    await page.close();
  }
});

test('a second walk before a document has loaded keeps the exact place of the first', async () => {
  const page = await boot({ hash: '#29153-j00' });
  try {
    const { document } = page;
    layOut(page);
    pane(document).scrollTop = 1237;
    await follow(page, '#rfc7944');
    press(page, { key: 'o', ctrlKey: true });
    press(page, { key: 'i', ctrlKey: true });
    await settle();
    assert.ok(document.querySelector('.document-header h1').textContent.startsWith('RFC 7944'));
    press(page, { key: 'o', ctrlKey: true });
    await settle();
    assert.equal(pane(document).scrollTop, 1237);
  } finally {
    await page.close();
  }
});

test('the index comes back as far down as it was left', async () => {
  const page = await boot({ hash: '' });
  try {
    const { document } = page;
    const content = document.querySelector('#content');
    content.scrollTop = 300;
    await follow(page, '#rfc7944');
    assert.equal(button(document, 'back').title, 'Back to Index (Ctrl+O)');
    press(page, { key: 'o', ctrlKey: true });
    await settle();
    assert.ok(document.querySelector('.index-view'));
    assert.equal(content.scrollTop, 300);
  } finally {
    await page.close();
  }
});

test('a reload keeps the jump list and the position, and steps over a document no longer in the corpus', async () => {
  const entry = (document, top, offset) => ({ document, top, offset, hash: `#${document}?top=${top}` });
  const page = await boot({
    hash: '#29153-j00',
    session: {
      'seanchai-positions': JSON.stringify({ '29153-j00': { top: 50, offset: 3 } }),
      'seanchai-jumps': JSON.stringify({ entries: [entry('rfc7944', 10, 4), entry('gone', 1, 0)], index: 2 }),
    },
    prepare: layOut,
  });
  try {
    const { document } = page;
    assert.equal(pane(document).scrollTop, 1003);
    assert.equal(button(document, 'back').title, 'Back to RFC 7944 line 11 (Ctrl+O)');
    press(page, { key: 'o', ctrlKey: true });
    await settle();
    assert.ok(document.querySelector('.document-header h1').textContent.startsWith('RFC 7944'));
    assert.equal(pane(document).scrollTop, 204);
    assert.equal(JSON.parse(page.window.sessionStorage.getItem('seanchai-jumps')).index, 0);
  } finally {
    await page.close();
  }
});

test("moving the pane alone is no jump, moving both is, and going back moves both back with the reader's pane state", async () => {
  const page = await boot({ hash: '#29153-j00' });
  try {
    const { document, window } = page;
    layOut(page);
    pane(document).scrollTop = 407;
    const shows = () => document.querySelector('.source-document').textContent;
    const heading = () => document.querySelector('.document-header h1').textContent;
    const name = document.querySelector('pre a[data-avp][href^="#rfc7944"]');
    click(page, name);
    await settle();
    assert.match(shows(), /^RFC 7944/);
    assert.match(window.location.hash, /source=rfc7944/);
    assert.equal(pane(document).scrollTop, 407);
    assert.equal(button(document, 'back').getAttribute('aria-disabled'), 'true', 'nothing to go back to');
    assert.equal(window.sessionStorage.getItem('seanchai-jumps'), null);
    click(page, name, { altKey: true });
    await settle();
    assert.match(heading(), /^RFC 7944/);
    assert.equal(button(document, 'back').getAttribute('aria-disabled'), 'false');
    press(page, { key: 'o', ctrlKey: true });
    await settle();
    assert.match(heading(), /^3GPP TS 29\.153/);
    assert.equal(pane(document).scrollTop, 407);
    assert.match(window.location.hash, /source=rfc7944/, 'as the pane was left');
    assert.match(shows(), /^RFC 7944/);
    press(page, { key: 'i', ctrlKey: true });
    await settle();
    assert.match(heading(), /^RFC 7944/);
    const toggle = document.querySelector('.source-toggle input');
    toggle.checked = false;
    toggle.dispatchEvent(new window.Event('change'));
    press(page, { key: 'o', ctrlKey: true });
    await settle();
    assert.match(window.location.hash, /pane=0/);
    assert.equal(document.querySelector('.source-toggle input').checked, false);
  } finally {
    await page.close();
  }
});
