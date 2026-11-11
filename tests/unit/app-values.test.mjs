// Value names: their popups, their rows in the pane, and the documents defining them.
import assert from 'node:assert/strict';
import test from 'node:test';
import { absent, boot, click, frameSrc, readFixture, rightClick, settle } from './helpers.mjs';

const rowOf = (document, name) =>
  [...document.querySelectorAll('pre a.value-name')].find(node => node.textContent.replace(/^"|"$/g, '') === name);

test('public: right-click on a value name shows its table, with its AVP and source, and walks the rows', async () => {
  const page = await boot({ hash: '#29061-6f0' });
  try {
    const { document, window } = page;
    const before = window.location.hash;
    const name = rowOf(document, 'DIAMETER_ERROR_SERVICE_AREA');
    assert.equal(name.getAttribute('href'), '#29061-6f0/17.8.2');
    rightClick(page, name);
    await settle();
    assert.equal(window.location.hash, before, 'stays where it is');
    const popup = document.querySelector('.avp-popup');
    assert.equal(popup.dataset.value, 'DIAMETER_ERROR_SERVICE_AREA');
    assert.match(popup.textContent, /Result code 5123 of Experimental-Result-Code/);
    assert.equal(popup.querySelector('p a').getAttribute('href').split('?')[0], '#rfc6733/7.7');
    assert.match(popup.querySelector('a[target="_blank"]').href, /etsi\.org.*#page=92$/);
    assert.equal(popup.querySelector('.usage-link[aria-current]').textContent, '5123 · DIAMETER_ERROR_SERVICE_AREA');
    assert.ok(name.classList.contains('avp-current'));
    assert.match(popup.querySelector('.popup-actions span').textContent, /^Row 4\/\d+$/);
    [...popup.querySelectorAll('.popup-actions button')].at(-1).click();
    assert.equal(
      popup.querySelector('.usage-link[aria-current]').textContent,
      '4121 · DIAMETER_ERROR_OUT_OF_RESOURCES',
    );
    assert.ok(rowOf(document, 'DIAMETER_ERROR_OUT_OF_RESOURCES').classList.contains('avp-current'));
    assert.ok(!name.classList.contains('avp-current'));
    popup.querySelector('.popup-title button').click();
    absent(document.querySelector('.avp-popup'));
    const ctrl = new window.MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true });
    name.dispatchEvent(ctrl);
    assert.equal(ctrl.defaultPrevented, false, "a new tab is the browser's");
    absent(document.querySelector('.avp-popup'));
    click(page, name);
    await settle();
    assert.ok(
      window.location.hash.startsWith(`${name.getAttribute('href')}?name=DIAMETER_ERROR_SERVICE_AREA&`),
      'with only a placeholder, its link is followed',
    );
    assert.ok(document.querySelector('.target-line').contains(name), 'to its row');
    absent(document.querySelector('.avp-popup'));
  } finally {
    await page.close();
  }
});

test('self-hosted: a value name and its clause drive the pane to the row, and the table to its number', async () => {
  const page = await boot({ hash: '#29217-j00', mode: 'self-hosted' });
  try {
    const { document } = page;
    const pane = () => new URLSearchParams(new URL(frameSrc(document)).hash.slice(1));
    const doc = await readFixture('documents/29217-j00.json');
    const { valueTables } = await import('../../src/values.ts');
    const bits = valueTables(doc).find(table => table.kind === 'bits');
    const row = bits.rows[0];
    click(page, rowOf(document, row.name));
    await settle();
    assert.deepEqual(Object.fromEntries(['search', 'name', 'row', 'value'].map(key => [key, pane().get(key)])), {
      search: row.position.section,
      name: row.name,
      row: '1',
      value: String(row.value),
    });
    assert.match(page.window.location.hash, /sourceName=/);
    absent(document.querySelector('.avp-popup'));
    const codes = valueTables(doc).find(table => table.kind === 'result-codes');
    const code = codes.rows[0];
    const clause = [...document.querySelectorAll(`[data-line="${code.line}"] [data-token]`)].find(
      node => node.textContent === code.position.section,
    );
    click(page, clause);
    await settle();
    assert.deepEqual(Object.fromEntries(['search', 'name', 'row', 'titled'].map(key => [key, pane().get(key)])), {
      search: code.position.section,
      name: code.name,
      row: '1',
      titled: '1',
    });
    absent(document.querySelector('.avp-popup'));
  } finally {
    await page.close();
  }
});

test("self-hosted: opening a value's popup leaves the pane where it was, and choosing a row moves it", async () => {
  const page = await boot({ hash: '#29217-j00', mode: 'self-hosted' });
  try {
    const { document } = page;
    const pane = () => new URLSearchParams(new URL(frameSrc(document)).hash.slice(1)).get('name');
    const doc = await readFixture('documents/29217-j00.json');
    const { valueTables } = await import('../../src/values.ts');
    const [first, second] = valueTables(doc).find(table => table.kind === 'bits').rows;
    click(page, rowOf(document, first.name));
    await settle();
    assert.equal(pane(), first.name);
    rightClick(page, rowOf(document, second.name));
    await settle();
    assert.equal(document.querySelector('.avp-popup').dataset.value, second.name);
    assert.equal(pane(), first.name, 'the popup opening moves nothing');
    document.querySelector('.avp-popup .usage-link[aria-current]').click();
    await settle();
    assert.equal(pane(), second.name);
  } finally {
    await page.close();
  }
});

test('self-hosted: a link to a row opens the pane there and survives a reload of its route', async () => {
  const page = await boot({ hash: '#29061-6f0/17.8.2?name=DIAMETER_ERROR_SERVICE_AREA', mode: 'self-hosted' });
  try {
    const { document } = page;
    assert.ok(document.querySelector('.target-line').textContent.startsWith('DIAMETER_ERROR_SERVICE_AREA'));
    const pane = new URLSearchParams(new URL(frameSrc(document)).hash.slice(1));
    assert.deepEqual(Object.fromEntries(['search', 'name', 'row', 'titled', 'page'].map(key => [key, pane.get(key)])), {
      search: '17.8.2',
      name: 'DIAMETER_ERROR_SERVICE_AREA',
      row: '1',
      titled: '1',
      page: '92',
    });
    await page.go('#29061-6f0/17.8.2');
    absent(document.querySelector('.target-line'), 'a link to the clause marks no row');
  } finally {
    await page.close();
  }
});

test("self-hosted: a result code's origin goes to its row there, the pane alone on a click and both on alt", async () => {
  const page = await boot({ hash: '#29283-j00', mode: 'self-hosted' });
  try {
    const { document, window } = page;
    const name = rowOf(document, 'DIAMETER_ERROR_USER_DATA_NOT_RECOGNIZED');
    const origin = [...name.closest('.dad-line').querySelectorAll('a')].find(node => node.textContent === 'TS29.329');
    assert.equal(origin.getAttribute('href'), '#29329-j10/6.2.2.1?name=DIAMETER_ERROR_USER_DATA_NOT_RECOGNIZED');
    assert.match(origin.className, /spec-ref/);
    const before = window.location.hash;
    click(page, origin);
    await settle();
    assert.equal(window.location.hash.split('?')[0], before.split('?')[0], 'the text stays where it is');
    const pane = new URL(frameSrc(document));
    assert.match(pane.searchParams.get('file'), /29329-j10\.pdf$/);
    const params = new URLSearchParams(pane.hash.slice(1));
    assert.deepEqual(
      Object.fromEntries(['search', 'name', 'row', 'titled', 'value', 'page'].map(key => [key, params.get(key)])),
      {
        search: '6.2.2.1',
        name: 'DIAMETER_ERROR_USER_DATA_NOT_RECOGNIZED',
        row: '1',
        titled: '1',
        value: '5100',
        page: '16',
      },
    );
    click(page, origin, { altKey: true });
    await settle();
    assert.ok(
      window.location.hash.startsWith(
        '#29329-j10/6.2.2.1?name=DIAMETER_ERROR_USER_DATA_NOT_RECOGNIZED&source=29329-j10&',
      ),
    );
    assert.ok(
      document.querySelector('.target-line').textContent.startsWith('DIAMETER_ERROR_USER_DATA_NOT_RECOGNIZED'),
      'the view on its row there',
    );
  } finally {
    await page.close();
  }
});

test("a value's popup says the document defining it, both ways to its row there, or only its name where the corpus lacks it", async () => {
  const page = await boot({ hash: '#29283-j00', mode: 'self-hosted' });
  try {
    const { document } = page;
    rightClick(page, rowOf(document, 'DIAMETER_ERROR_USER_DATA_NOT_RECOGNIZED'));
    await settle();
    let popup = document.querySelector('.avp-popup');
    const origin = popup.querySelector('.place-origin');
    assert.equal(origin.querySelector('span').textContent, 'Defined in:');
    assert.equal(origin.querySelector('.place-where').textContent, 'TS 29.329 · 6.2.2.1');
    assert.match(
      origin.querySelector('a.view-action').getAttribute('href'),
      /^#29329-j10\/6\.2\.2\.1\?name=DIAMETER_ERROR_USER_DATA_NOT_RECOGNIZED&source=29329-j10&sourceSection=6\.2\.2\.1&/,
    );
    assert.ok(origin.querySelector('.pane-action'));
    assert.equal(
      popup.querySelector('.usage-link[aria-current]').textContent,
      '5100 · DIAMETER_ERROR_USER_DATA_NOT_RECOGNIZED · from TS 29.329',
    );
    origin.querySelector('.pane-action').click();
    await settle();
    assert.match(new URL(frameSrc(document)).searchParams.get('file'), /29329-j10\.pdf$/);
    rightClick(page, rowOf(document, 'DIAMETER_ERROR_USER_UNKNOWN'));
    await settle();
    popup = document.querySelector('.avp-popup');
    absent(popup.querySelector('.place-origin'));
    assert.equal(popup.querySelector('.value-origin').textContent, 'Defined in TS29.229');
    assert.equal(
      popup.querySelector('.usage-link[aria-current]').textContent,
      '5001 · DIAMETER_ERROR_USER_UNKNOWN · from TS29.229',
    );
  } finally {
    await page.close();
  }
});

test("self-hosted: a row of a clause's stated origin is no row to find: its use goes to the clause, as its name's Details do", async () => {
  const page = await boot({ hash: '#29329-j10', mode: 'self-hosted' });
  try {
    const { document } = page;
    const pane = () => new URLSearchParams(new URL(frameSrc(document)).hash.slice(1));
    const line = [...document.querySelectorAll('.dad-line[data-section="6.3.9"]')].find(node =>
      node.querySelector('[data-avp="Server-Name"]'),
    );
    const name = line.querySelector('[data-avp="Server-Name"]');
    click(page, name);
    await settle();
    assert.deepEqual(
      Object.fromEntries(['search', 'page'].map(key => [key, pane().get(key)])),
      { search: '6.3.9', page: '21' },
      'the clause its table row points to',
    );
    rightClick(page, name);
    await settle();
    const popup = document.querySelector('.avp-popup');
    assert.equal(popup.querySelector('.place-details .place-where').textContent, '6.3.9');
    popup.querySelector('.usage-link[aria-current]').click();
    await settle();
    assert.deepEqual(
      Object.fromEntries(['search', 'name', 'row', 'exact', 'page'].map(key => [key, pane().get(key)])),
      { search: '6.3.9', name: 'Server-Name', row: null, exact: '1', page: '21' },
      "the name in the clause's prose",
    );
    const section = [...document.querySelectorAll('#diagnostic-sections li')].find(
      item => item.dataset.section === '6.3.9',
    );
    assert.match(section.textContent, /Reused AVPs Server-Name/);
  } finally {
    await page.close();
  }
});
