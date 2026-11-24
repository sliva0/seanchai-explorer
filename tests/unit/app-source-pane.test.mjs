// The source pane: what each build shows in it, and how a name or section link reaches it.
import assert from 'node:assert/strict';
import test from 'node:test';
import { absent, boot, click, commandNames, frameSrc, nameLink, readFixture, rightClick, settle } from './helpers.mjs';

/** The publisher's links the page shows, which it shows once for a document: the source's header shows with the pane. */
const publisherLinks = document =>
  [...document.querySelectorAll('.publisher-link:not([hidden])')].filter(
    link => !link.closest('.source-header') || document.querySelector('#workspace').classList.contains('with-source'),
  );
const selfHostLink = document => document.querySelector('#source-pane .inspector-note a')?.href;
const sectionPage = async (id, section) =>
  (await readFixture(`documents/${id}.json`)).sections.find(entry => entry.section === section).page;

test('public: a PDF gets the pane and its toggle, with an inspector in place of the viewer', async () => {
  const page = await boot({ hash: '#29153-j00/5.1' });
  try {
    const { document } = page;
    const pageNumber = await sectionPage('29153-j00', '5.1');
    absent(document.querySelector('iframe'));
    assert.equal(document.querySelector('.source-toggle input').checked, true);
    assert.equal(document.querySelector('.source-toggle').textContent, 'Inspector ', 'the box names the inspector');
    assert.ok(document.querySelector('#workspace').classList.contains('with-source'));
    assert.equal(document.querySelectorAll('#source-pane').length, 1);
    const inspector = document.querySelector('#source-pane .inspector');
    assert.match(
      inspector.querySelector('.inspector-empty').textContent,
      /^Click a name to view it in the source pane/,
    );
    assert.match(
      inspector.querySelector('.inspector-empty').textContent,
      /Alt-click jumps to the name\. You can also press Menu or Shift\+F10/,
    );
    assert.match(
      inspector.querySelector('.inspector-note').textContent,
      /This public build does not embed the PDF for TS 29\.153 V19\.0\.0 due to publisher licensing restrictions\. Use a self-hosted build to view it here\./,
    );
    assert.equal(selfHostLink(document), undefined, 'the note links nowhere');
    assert.ok(document.querySelector('.source-document').textContent.startsWith('TS 29.153 V19.0.0 — '));
    assert.ok(document.querySelector('.document-header h1').textContent.startsWith('3GPP TS 29.153 V19.0.0 — '));
    assert.equal(document.querySelector('.source-header .source-page').textContent, `p. ${pageNumber}`);
    const [publisher, ...more] = publisherLinks(document);
    assert.deepEqual(more, [], "the publisher's copy is linked once");
    assert.ok(publisher.closest('.source-header'), "by the inspector's header");
    assert.match(publisher.href, new RegExp(`^https://www\\.etsi\\.org/.*#page=${pageNumber}$`));
    absent(inspector.querySelector('a[href*="etsi.org"]'));
    assert.equal(document.querySelector('.source-header .local-link').hidden, true);
    assert.equal(document.querySelector('.document-header .local-link').hidden, true);
    const toggle = document.querySelector('.source-toggle input');
    toggle.checked = false;
    toggle.dispatchEvent(new page.window.Event('change', { bubbles: true }));
    const [shown, ...others] = publisherLinks(document);
    assert.deepEqual(others, []);
    assert.ok(shown.closest('.document-header'), "the text's header links it with the pane off");
  } finally {
    await page.close();
  }
});

test("the page header says it all, the source pane's the short name, version and title", async () => {
  const page = await boot({ hash: '#29061-6f0' });
  try {
    const { document } = page;
    assert.equal(
      document.querySelector('.document-header h1').textContent,
      '3GPP TS 29.061 V6.15.0 · Gi, Gmb — PLMN interworking with packet data networks',
    );
    assert.equal(
      document.querySelector('.source-document').textContent,
      'TS 29.061 V6.15.0 — PLMN interworking with packet data networks',
    );
  } finally {
    await page.close();
  }
});

test('public: a name defined in an RFC goes to the pane and leaves the main view', async () => {
  const page = await boot({ hash: '#29153-j00' });
  try {
    const { document, window } = page;
    let opened = 0;
    window.open = () => {
      opened++;
    };
    const name = nameLink(document, '#rfc7944');
    assert.ok(name, 'a name defined in another document');
    click(page, name);
    await settle();
    assert.ok(document.querySelector('.document-header h1').textContent.startsWith('3GPP TS 29.153'));
    assert.ok(window.location.hash.startsWith('#29153-j00?'));
    assert.equal(new URLSearchParams(window.location.hash.split('?')[1]).get('source'), 'rfc7944');
    const source = new URL(frameSrc(document));
    assert.equal(source.pathname, '/rfc.html');
    assert.equal(new URLSearchParams(source.hash.slice(1)).get('query'), name.dataset.avp);
    absent(document.querySelector('.inspector'));
    assert.ok(document.querySelector('.source-document').textContent.startsWith('RFC 7944'));
    // Walking this document's own names has nothing to show, so the RFC stays.
    rightClick(page, name);
    document.querySelector('.avp-popup .usage-link').click();
    assert.equal(frameSrc(document), source.href);
    document.querySelector('.avp-popup .popup-title button').click();
    const base = [...document.querySelectorAll('pre a')].find(a => a.getAttribute('href') === '#rfc6733');
    click(page, base);
    await settle();
    assert.equal(window.location.hash, '#rfc6733', 'not in the fixture, so its page is tried');
    assert.equal(opened, 0);
  } finally {
    await page.close();
  }
});

test('public: a click on a name defined in a PDF shows it in the inspector at its page, and the text stays', async () => {
  const page = await boot({ hash: '#29153-j00' });
  try {
    const { document, window } = page;
    const name = nameLink(document, '#29217-j00/');
    const section = decodeURIComponent(name.getAttribute('href').split('?')[0].split('/')[1]);
    const pageNumber = await sectionPage('29217-j00', section);
    const title = () => {
      name.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }));
      return name.title;
    };
    assert.equal(title(), 'Click: inspect in source pane · Alt-click: go to definition · Right-click: uses');
    const before = window.location.hash;
    click(page, name);
    await settle();
    assert.ok(window.location.hash.startsWith(`${before}?`), 'the text stays');
    assert.equal(new URLSearchParams(window.location.hash.split('?')[1]).get('source'), '29217-j00');
    assert.ok(document.querySelector('.document-header h1').textContent.startsWith('3GPP TS 29.153'));
    absent(document.querySelector('.avp-popup'), 'no popup');
    const entry = document.querySelector('#source-pane .inspector-entry');
    assert.equal(entry.dataset.avp, name.dataset.avp);
    assert.equal(entry.querySelector('.popup-title').textContent, name.dataset.avp);
    absent(entry.querySelector('.popup-title button'), 'nothing to close');
    assert.ok(entry.querySelector('.popup-uses'), 'where it is used');
    assert.match(document.querySelector('#source-pane .inspector-note').textContent, /self-hosted build/);
    assert.ok(document.querySelector('.source-document').textContent.startsWith('TS 29.217 V19.0.0'));
    assert.equal(document.querySelector('.source-header .source-page').textContent, `p. ${pageNumber}`);
    assert.match(
      document.querySelector('.source-header .publisher-link').href,
      new RegExp(`/ts_129217v190000p\\.pdf#page=${pageNumber}$`),
    );
    click(page, name, { altKey: true });
    await settle();
    assert.ok(window.location.hash.startsWith(`#29217-j00/${section}`), 'alt-click moves the text');
    assert.ok(document.querySelector('.document-header h1').textContent.startsWith('3GPP TS 29.217'));
  } finally {
    await page.close();
  }
});

test('public: a pane restored to a placeholder gives way to an RFC and comes back, in the one pane', async () => {
  const shared = '#29153-j00?source=29217-j00&sourceSection=5.1';
  const page = await boot({ hash: shared });
  try {
    const { document } = page;
    assert.ok(document.querySelector('.inspector'));
    assert.match(document.querySelector('.source-document').textContent, /^TS 29\.217/);
    assert.ok(document.querySelector('main h1').textContent.startsWith('3GPP TS 29.153'));
    click(page, nameLink(document, '#rfc7944'));
    await settle();
    absent(document.querySelector('.inspector'));
    assert.equal(new URL(frameSrc(document)).pathname, '/rfc.html');
    await page.go(shared);
    absent(document.querySelector('iframe'));
    assert.ok(document.querySelector('.inspector'));
    assert.match(document.querySelector('.source-document').textContent, /^TS 29\.217/);
  } finally {
    await page.close();
  }
});

test('public: a switched-off pane is switched on for a place it can read, and to show a name it cannot; too narrow, a name goes to its page', async () => {
  const off = await boot({ hash: '#29153-j00?pane=0' });
  try {
    const { document, window } = off;
    click(off, nameLink(document, '#rfc7944'));
    await settle();
    assert.ok(window.location.hash.startsWith('#29153-j00?'), 'the view stays');
    assert.doesNotMatch(window.location.hash, /pane=0/);
    assert.equal(document.querySelector('.source-toggle input').checked, true);
    assert.match(document.querySelector('.source-document').textContent, /^RFC 7944/);
    assert.equal(document.querySelector('.source-toggle').textContent, 'Source ', 'an RFC beside a PDF is a source');
  } finally {
    await off.close();
  }
  const placeholder = await boot({ hash: '#29153-j00?pane=0' });
  try {
    click(placeholder, nameLink(placeholder.document, '#29217-j00/'));
    await settle();
    assert.ok(placeholder.window.location.hash.startsWith('#29153-j00?'), 'the view stays');
    assert.doesNotMatch(placeholder.window.location.hash, /pane=0/);
    assert.equal(placeholder.document.querySelector('.source-toggle input').checked, true);
    assert.ok(placeholder.document.querySelector('.inspector-entry'));
    click(placeholder, nameLink(placeholder.document, '#29217-j00/'), { altKey: true });
    await settle();
    assert.ok(placeholder.window.location.hash.startsWith('#29217-j00/'));
  } finally {
    await placeholder.close();
  }
  const narrow = await boot({ hash: '#29153-j00', width: 500 });
  try {
    assert.equal(narrow.document.querySelector('.source-toggle').hidden, true);
    assert.ok(!narrow.document.querySelector('#workspace').classList.contains('with-source'));
    click(narrow, nameLink(narrow.document, '#rfc7944'));
    await settle();
    assert.ok(narrow.window.location.hash.startsWith('#rfc7944'));
  } finally {
    await narrow.close();
  }
});

test('public: ; Section: links open the publisher in a new tab', async () => {
  const page = await boot({ hash: '#29153-j00' });
  try {
    const section = page.document.querySelector('pre a[target="_blank"][data-token]');
    assert.ok(section.href.startsWith('https://www.etsi.org/'));
    assert.match(section.href, /#page=\d+$/);
    const event = new page.window.MouseEvent('click', { bubbles: true, cancelable: true });
    section.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false);
    const opened = [];
    page.window.open = (...args) => {
      opened.push(args);
      return null;
    };
    const alt = new page.window.MouseEvent('click', { bubbles: true, cancelable: true, altKey: true });
    section.dispatchEvent(alt);
    assert.equal(alt.defaultPrevented, true, 'a browser would download what alt-click leaves to it');
    assert.deepEqual(opened, [[section.href, '_blank', 'noopener']]);
  } finally {
    await page.close();
  }
});

test('public: an RFC page shows itself in the pane, and names go there when they can', async () => {
  const page = await boot({ hash: '#rfc7944' });
  try {
    const { document } = page;
    const source = new URL(frameSrc(document));
    assert.equal(source.pathname, '/rfc.html');
    assert.equal(source.searchParams.get('file'), 'http://localhost/data/sources/rfc7944.txt');
    assert.ok(document.querySelector('#workspace').classList.contains('with-source'));
    const local = [...document.querySelectorAll('pre a[data-avp]')].find(a =>
      a.getAttribute('href').startsWith('#rfc7944/'),
    );
    const before = page.window.location.hash;
    click(page, local);
    await settle();
    assert.equal(page.window.location.hash.split('?')[0], before, 'stays on the page');
    assert.equal(new URLSearchParams(new URL(frameSrc(document)).hash.slice(1)).get('query'), local.dataset.avp);
    const away = [...document.querySelectorAll('pre a')].find(a => a.getAttribute('href')?.startsWith('#rfc6733'));
    click(page, away);
    await settle();
    assert.equal(page.window.location.hash, away.getAttribute('href'), 'not in the fixture, so its page is tried');
    assert.equal(document.querySelector('main h1').textContent, 'Document not found');
  } finally {
    await page.close();
  }
});

test('narrow: the pane is hidden, its source is not loaded, and names navigate', async () => {
  const page = await boot({ hash: '#rfc7944', width: 500 });
  try {
    const { document, window } = page;
    assert.equal(frameSrc(document), null);
    assert.ok(!document.querySelector('#workspace').classList.contains('with-source'));
    assert.equal(document.querySelector('.source-toggle').hidden, true);
    const local = [...document.querySelectorAll('pre a[data-avp]')].find(a =>
      a.getAttribute('href').startsWith('#rfc7944/'),
    );
    click(page, local);
    await settle();
    assert.equal(
      window.location.hash.split('?')[0],
      local.getAttribute('href').split('?')[0],
      'to the clause describing it',
    );
    document.querySelector('.click-target input[value="definition"]').click();
    click(page, local);
    await settle();
    assert.equal(
      document.querySelector('.target-line [data-avp]').dataset.avp,
      local.dataset.avp,
      'or to the row listing it',
    );
    assert.equal(frameSrc(document), null);
    page.resize(1280);
    assert.ok(document.querySelector('#workspace').classList.contains('with-source'));
    assert.equal(document.querySelector('.source-toggle').hidden, false);
    assert.ok(frameSrc(document).includes('rfc.html'));
    page.resize(500);
    assert.ok(!document.querySelector('#workspace').classList.contains('with-source'));
  } finally {
    await page.close();
  }
});

test('switched off: the source is not loaded, a click on a name or section link switches it on, and alt leaves it off', async () => {
  const page = await boot({ hash: '#rfc7944', width: 500 });
  try {
    const { document, window } = page;
    page.resize(1280);
    const toggle = document.querySelector('.source-toggle input');
    const switchOff = () => {
      toggle.checked = false;
      toggle.dispatchEvent(new window.Event('change'));
    };
    assert.equal(toggle.hasAttribute('aria-expanded'), false);
    switchOff();
    assert.ok(!document.querySelector('#workspace').classList.contains('with-source'));
    const local = [...document.querySelectorAll('pre a[data-avp]')].find(a =>
      a.getAttribute('href').startsWith('#rfc7944/'),
    );
    const before = window.location.hash;
    click(page, local, { altKey: true });
    await settle();
    assert.notEqual(window.location.hash, before, 'alt moves the view');
    assert.match(window.location.hash, /pane=0/);
    assert.equal(toggle.checked, false);
    click(page, local);
    await settle();
    assert.equal(document.querySelector('.source-toggle input').checked, true);
    assert.ok(document.querySelector('#workspace').classList.contains('with-source'));
    assert.doesNotMatch(window.location.hash, /pane=0/);
    assert.equal(new URLSearchParams(new URL(frameSrc(document)).hash.slice(1)).get('query'), local.dataset.avp);
    switchOff();
    click(page, document.querySelector('pre a[target="_blank"][data-token]'));
    assert.equal(document.querySelector('.source-toggle input').checked, true);
    assert.ok(document.querySelector('#workspace').classList.contains('with-source'));
  } finally {
    await page.close();
  }
});

test('self-hosted: PDFs go to the viewer pane at the clause and table row', async () => {
  const page = await boot({ hash: '#29153-j00/5.1', mode: 'self-hosted' });
  try {
    const { document } = page;
    const source = new URL(frameSrc(document));
    assert.equal(source.pathname, '/viewer.html');
    assert.ok(source.searchParams.get('file').endsWith('/data/sources/29153-j00.pdf'));
    assert.equal(new URLSearchParams(source.hash.slice(1)).get('search'), '5.1');
    assert.equal(document.querySelector('.source-toggle').textContent, 'Source ', 'the box names the source it shows');
    assert.ok(document.querySelector('.source-document').textContent.startsWith('TS 29.153'));
    assert.equal(document.querySelector('.source-header .publisher-link span').textContent, 'etsi.org');
    assert.equal(document.querySelector('.source-header .local-link span').textContent, 'localhost');
    const row = [...document.querySelectorAll('.table-row a[data-avp]')][0];
    click(page, row);
    const params = new URLSearchParams(new URL(frameSrc(document)).hash.slice(1));
    assert.equal(params.get('row'), '1');
    assert.equal(params.get('name'), row.dataset.avp);
  } finally {
    await page.close();
  }
});

test('a shared pane state the build cannot show falls back to the document itself', async () => {
  const unlinked = (path, data) =>
    path === 'data/index.json'
      ? {
          ...data,
          documents: data.documents.map(doc =>
            doc.id === '29153-j00' ? { ...doc, source: { ...doc.source, url: null } } : doc,
          ),
        }
      : data;
  const page = await boot({ hash: '#rfc7944?source=29153-j00&sourceSection=5.1', transform: unlinked });
  try {
    const source = new URL(page.document.querySelector('iframe').getAttribute('src'));
    assert.equal(source.pathname, '/rfc.html');
    assert.ok(source.searchParams.get('file').endsWith('rfc7944.txt'));
  } finally {
    await page.close();
  }
});

test("public: an RFC page restores a PDF's inspector beside it from a shared pane state", async () => {
  const page = await boot({ hash: '#rfc7944?source=29153-j00&sourceSection=5.1' });
  try {
    const { document } = page;
    absent(document.querySelector('iframe'));
    assert.ok(document.querySelector('.document-header h1').textContent.startsWith('RFC 7944'));
    assert.ok(document.querySelector('.inspector'));
    assert.match(document.querySelector('.source-document').textContent, /^TS 29\.153/);
  } finally {
    await page.close();
  }
});

test("public: a click on a command shows its popup's content in the inspector, its places one per row", async () => {
  const page = await boot({ hash: '#29061-6f0/17.6.2' });
  try {
    const { document, window } = page;
    const before = window.location.hash.split('?')[0];
    click(page, commandNames(document, '265 request')[0]);
    await settle();
    assert.equal(window.location.hash.split('?')[0], before, 'the text stays');
    absent(document.querySelector('.avp-popup'));
    const entry = document.querySelector('#source-pane .inspector-entry');
    assert.equal(entry.dataset.command, '265 request');
    assert.match(entry.querySelector('.popup-title').textContent, /^AA-Request/);
    assert.ok(entry.querySelector('.command-places .place-definition'));
    assert.ok(!commandNames(document, '265 request')[0].classList.contains('avp-current'), 'marking no name');
  } finally {
    await page.close();
  }
});
