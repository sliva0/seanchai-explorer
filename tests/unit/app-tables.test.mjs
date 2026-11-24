// A block's ; Table: number, a link to the source at that table, and a table a popup names, a link to its block.
import assert from 'node:assert/strict';
import test from 'node:test';
import { boot, click, frameSrc, popupOf, settle } from './helpers.mjs';

const tableLink = (document, table) =>
  [...document.querySelectorAll('pre .dad-line')]
    .find(line => line.textContent.startsWith(`; Table: ${table}\n`) || line.textContent === `; Table: ${table}`)
    ?.querySelector('a');

test("public: a ; Table: number opens the publisher's copy at its page, as a ; Page: number does", async () => {
  const page = await boot({ hash: '#29328-j20' });
  try {
    const { document, window } = page;
    const second = tableLink(document, '6.1.1.2');
    assert.equal(second.textContent, '6.1.1.2');
    assert.match(second.href, /etsi\.org\/.*ts_129328v190200p\.pdf#page=14$/);
    assert.equal(second.target, '_blank');
    const before = window.location.hash;
    const event = new window.MouseEvent('click', { bubbles: true, cancelable: true });
    second.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false, "the browser's, in a new tab");
    assert.equal(window.location.hash, before);
  } finally {
    await page.close();
  }
});

test('self-hosted: a ; Table: number moves the pane to that table of its clause, kept in the route', async () => {
  const page = await boot({ hash: '#29328-j20', mode: 'self-hosted' });
  try {
    const { document, window } = page;
    const pane = () => new URLSearchParams(new URL(frameSrc(document)).hash.slice(1));
    for (const table of ['6.1.1.1', '6.1.1.2']) {
      click(page, tableLink(document, table));
      await settle();
      assert.deepEqual(
        Object.fromEntries(['search', 'page', 'table'].map(key => [key, pane().get(key)])),
        { search: '6.1.1', page: '14', table },
        'the clause, its page and the table, whose caption the viewer finds there',
      );
      assert.equal(new URLSearchParams(window.location.hash.split('?')[1]).get('sourceTable'), table);
    }
    const route = window.location.hash;
    await page.go('#29329-j10');
    await page.go(route);
    assert.equal(pane().get('table'), '6.1.1.2', 'a route back to it shows that table again');
  } finally {
    await page.close();
  }
});

test("a popup's table is a link to its block in the text", async () => {
  const page = await boot({ hash: '#29328-j20' });
  try {
    const { document } = page;
    const name = [...document.querySelectorAll('pre [data-avp="Wildcarded-IMPU"]')].find(
      node => node.closest('.dad-line').dataset.line === '47',
    );
    const popup = await popupOf(page, name);
    const here = [...popup.querySelectorAll('.popup-context p')].find(p => p.textContent.startsWith('Here:'));
    assert.equal(here.textContent, 'Here: an element of User-Data-Answer · table 6.1.1.2 · 6.1.1');
    const link = here.querySelector('a.table-link');
    assert.equal(link.getAttribute('href'), '#29328-j20/6.1.1?line=38');
    click(page, link);
    await settle();
    assert.ok(document.querySelector('.target-line')?.textContent.startsWith('; Type: Information Elements'));
    assert.equal(document.querySelector('.target-line').dataset.line, '38');
  } finally {
    await page.close();
  }
});
