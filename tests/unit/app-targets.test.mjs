// Where a click on a name goes, and the Definition and Details its popup offers.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  absent,
  boot,
  click,
  easing,
  layOut,
  nameLink,
  pane,
  paneAt,
  press,
  rightClick,
  same,
  settle,
  tmgi,
} from './helpers.mjs';

test("a uses popup names a Definition's document without publisher or version", async () => {
  const page = await boot({ hash: '#29153-j00' });
  try {
    const { document } = page;
    document.querySelector('.uses-toggle input').click();
    for (const [href, label] of [
      ['#29217-j00', /^TS 29\.217 · /],
      ['#rfc7944', /^RFC 7944 · /],
    ]) {
      click(page, document.querySelector(`pre a[data-avp][href^="${href}"]`));
      await settle();
      const row = document.querySelector('.avp-popup .place-definition');
      assert.match(row.querySelector('.place-where').textContent, label);
      assert.ok(row.querySelector('.view-action').getAttribute('href').startsWith(href), 'and goes there');
      absent(document.querySelector('.avp-popup .place-details'), 'no Details are made from its link');
    }
  } finally {
    await page.close();
  }
});

test("self-hosted: a table row's name goes to its Definition in the pane where chosen, and its Section cell to its Details", async () => {
  const page = await boot({ hash: '#29061-6f0/17.7', mode: 'self-hosted', clickTarget: 'definition' });
  try {
    const { document, window } = page;
    const name = tmgi(document);
    const route = window.location.hash;
    click(page, name);
    await settle();
    assert.equal(paneAt(document).get('search'), '17.7');
    assert.equal(paneAt(document).get('name'), 'TMGI');
    assert.equal(paneAt(document).get('row'), '1');
    assert.equal(paneAt(document).get('titled'), null);
    assert.ok(window.location.hash.startsWith(route), "the view's own place is the route's");
    name.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }));
    assert.equal(name.title, 'Click: definition in pane · Alt-click: definition in both · Right-click: uses');
    const cell = name.closest('.dad-line').querySelector('a[target="_blank"][data-token]');
    assert.equal(cell.textContent, '17.7.2');
    assert.equal(
      new URLSearchParams(new URL(cell.href).hash.slice(1)).get('name'),
      null,
      "the browser's link is the bare clause",
    );
    click(page, cell);
    await settle();
    assert.equal(paneAt(document).get('search'), '17.7.2');
    assert.equal(paneAt(document).get('name'), 'TMGI');
    assert.equal(paneAt(document).get('titled'), '1');
    assert.ok(window.location.hash.includes('titled=1'), 'kept in the route');
  } finally {
    await page.close();
  }
});

test('self-hosted: an alt-click takes the view to the row and the pane with it, and the list keeps where it left', async () => {
  const page = await boot({ hash: '#29061-6f0', mode: 'self-hosted', clickTarget: 'definition' });
  try {
    const { document, window } = page;
    layOut(page);
    const name = [...document.querySelectorAll('pre a[data-avp]')].find(
      node => node.dataset.avp === 'TMGI' && !node.closest('.table-row'),
    );
    pane(document).scrollTop = 407;
    const jumps = () => JSON.parse(window.sessionStorage.getItem('seanchai-jumps') ?? '{"entries":[]}').entries.length;
    click(page, name);
    await settle();
    assert.equal(paneAt(document).get('search'), '17.7', 'a plain click, from a mention, shows the row');
    assert.equal(paneAt(document).get('row'), '1');
    assert.equal(pane(document).scrollTop, 407, 'and leaves the view');
    assert.equal(jumps(), 0, 'with nothing to go back to');
    click(page, name, { altKey: true });
    await easing();
    const line = tmgi(document).closest('.dad-line');
    assert.equal(line.dataset.line, document.querySelector('.target-line').dataset.line);
    assert.equal(pane(document).scrollTop, Number(line.dataset.line) * 20 - 12);
    assert.equal(paneAt(document).get('search'), '17.7');
    assert.equal(paneAt(document).get('name'), 'TMGI');
    assert.equal(jumps(), 1);
    press(page, { key: 'o', ctrlKey: true });
    await settle();
    assert.equal(pane(document).scrollTop, 407);
  } finally {
    await page.close();
  }
});

test('self-hosted: a cell in the raw text keeps to the raw text', async () => {
  const page = await boot({ hash: '#29061-6f0?raw=1', mode: 'self-hosted', clickTarget: 'definition' });
  try {
    const { document, window } = page;
    click(page, tmgi(document), { altKey: true });
    await settle();
    assert.match(window.location.hash, /[?&]raw=1/);
    assert.ok(document.querySelector('.target-line').querySelector('a[data-avp="TMGI"]'));
  } finally {
    await page.close();
  }
});

test('self-hosted: the popup gives each target both panels first and the pane alone second, and neither is a jump until the view moves', async () => {
  const page = await boot({ hash: '#29061-6f0/17.7', mode: 'self-hosted' });
  try {
    const { document, window } = page;
    layOut(page);
    pane(document).scrollTop = 407;
    const jumps = () => JSON.parse(window.sessionStorage.getItem('seanchai-jumps') ?? '{"entries":[]}').entries.length;
    rightClick(page, tmgi(document));
    await settle();
    const popup = document.querySelector('.avp-popup');
    const definition = popup.querySelector('.place-definition');
    const details = popup.querySelector('.place-details');
    const words = row => [...row.children].map(node => node.textContent);
    assert.deepEqual(words(definition), ['Definition:', '17.7', 'Jump to', 'Show on the right']);
    assert.deepEqual(words(details), ['Details:', '17.7.2', 'Jump to', 'Show on the right']);
    assert.equal(definition.querySelector('button').className, 'control pane-action');
    assert.equal(definition.querySelector('a').className, 'control view-action');
    assert.match(definition.querySelector('a').title, /text on the left and the source pane on the right/);
    assert.match(
      definition.querySelector('button').title,
      /only the source pane on the right, and opens it if it is hidden/,
    );
    definition.querySelector('button').click();
    await settle();
    assert.equal(paneAt(document).get('search'), '17.7');
    assert.equal(paneAt(document).get('titled'), null);
    details.querySelector('button').click();
    await settle();
    assert.equal(paneAt(document).get('search'), '17.7.2');
    assert.ok(window.location.hash.includes('titled=1'), 'kept in the route');
    assert.ok(document.querySelector('.avp-popup'), 'the pane moves with the popup open');
    assert.equal(pane(document).scrollTop, 407);
    assert.equal(jumps(), 0);
    assert.match(
      definition.querySelector('a').getAttribute('href'),
      /^#29061-6f0\/17\.7\?name=TMGI&source=29061-6f0&sourceSection=17\.7&.*&line=\d+$/,
    );
    click(page, details.querySelector('a'));
    await settle();
    absent(document.querySelector('.avp-popup'), 'moving the view closes it');
    assert.equal(paneAt(document).get('search'), '17.7.2');
    assert.ok(window.location.hash.startsWith('#29061-6f0/17.7.2?'));
    assert.equal(jumps(), 1);
  } finally {
    await page.close();
  }
});

test('self-hosted: Show on the right opens a pane that is switched off, and leaves the text where it is', async () => {
  const page = await boot({ hash: '#29061-6f0/17.7?pane=0', mode: 'self-hosted' });
  try {
    const { document, window } = page;
    const control = document.querySelector('.source-toggle input');
    assert.equal(control.checked, false);
    const before = window.location.hash.split('?')[0];
    rightClick(page, tmgi(document));
    await settle();
    document.querySelector('.avp-popup .place-details .pane-action').click();
    await settle();
    assert.equal(control.checked, true);
    assert.doesNotMatch(window.location.hash, /pane=0/);
    assert.equal(paneAt(document).get('search'), '17.7.2');
    assert.equal(window.location.hash.split('?')[0], before);
    assert.ok(document.querySelector('.avp-popup'), 'still open');
  } finally {
    await page.close();
  }
});

test('a use in the popup is the line with its alignment padding collapsed, after the rule it is a member of, in its text and its title', async () => {
  const page = await boot({ hash: '#29061-6f0/17.7' });
  try {
    const { document } = page;
    rightClick(page, tmgi(document));
    await settle();
    const uses = [...document.querySelectorAll('.avp-popup .usage-link')];
    assert.deepEqual(
      uses.map(use => use.textContent),
      [
        '17.6.2 · AAA · [ TMGI ] ; bold',
        '17.6.5 · RAR · [ TMGI ] ; bold',
        '17.7 · TMGI 900 17.7.2 OctetString M,V P - - Yes',
      ],
    );
    assert.deepEqual(
      uses.map(use => use.title),
      uses.map(use => use.textContent),
    );
  } finally {
    await page.close();
  }
});

test("the popup shows one target where a row's clause is its table's", async () => {
  const onlyRow = (path, data) =>
    path !== 'data/documents/29061-6f0.json'
      ? data
      : {
          ...data,
          lines: data.lines.map(line => {
            const row = line.tokens.find(token => token.avp === 'TMGI' && token.source?.row);
            return row
              ? {
                  ...line,
                  tokens: line.tokens.map(token =>
                    token === row
                      ? { ...token, target: { document: '29061-6f0', section: row.source.section } }
                      : token.source
                        ? { ...token, source: { ...token.source, section: row.source.section } }
                        : token,
                  ),
                }
              : line;
          }),
        };
  const page = await boot({ hash: '#29061-6f0/17.7', mode: 'self-hosted', transform: onlyRow });
  try {
    const { document } = page;
    rightClick(page, tmgi(document));
    await settle();
    const popup = document.querySelector('.avp-popup');
    assert.equal(popup.querySelector('.place-definition .place-where').textContent, '17.7');
    absent(popup.querySelector('.place-details'));
  } finally {
    await page.close();
  }
});

test("public: the popup has only the view's way to a target, under the publisher's copy, and a name's click goes there", async () => {
  const page = await boot({ hash: '#29061-6f0/17.7', clickTarget: 'definition' });
  try {
    const { document, window } = page;
    const name = tmgi(document);
    rightClick(page, name);
    await settle();
    const definition = document.querySelector('.avp-popup .place-definition');
    absent(definition.querySelector('button'));
    assert.equal(definition.querySelector('.view-action').textContent, 'Jump to');
    assert.match(definition.querySelector('.place-where').href, /etsi\.org.*#page=\d+$/);
    document.querySelector('.avp-popup .popup-title button').click();
    click(page, name);
    await settle();
    assert.equal(window.location.hash.split('?')[0], '#29061-6f0/17.7');
    assert.equal(document.querySelector('.target-line a[data-avp]').dataset.avp, 'TMGI');
    assert.match(document.querySelector('.source-placeholder').textContent, /cannot be shown here/);
  } finally {
    await page.close();
  }
});

test('a Details clause the view has no line for has only its way to the pane', async () => {
  const unanchored = (path, data) =>
    path !== 'data/documents/29061-6f0.json'
      ? data
      : { ...data, lines: data.lines.map(line => (line.anchor === '17.7.2' ? { ...line, anchor: null } : line)) };
  const page = await boot({ hash: '#29061-6f0/17.7', mode: 'self-hosted', transform: unanchored });
  try {
    const { document } = page;
    rightClick(page, tmgi(document));
    await settle();
    const details = document.querySelector('.avp-popup .place-details');
    assert.ok(details.querySelector('.pane-action'));
    absent(details.querySelector('.view-action'));
  } finally {
    await page.close();
  }
});

test("a Definition in a document the pane has no reader for is only the view's, as a click on it is", async () => {
  const unread = (path, data) => {
    const plain = doc =>
      doc.id === 'rfc7944'
        ? {
            ...doc,
            source: { kind: 'other', url: 'https://example.org/default.aspx?docID=1', local: null, text: null },
          }
        : doc;
    return path === 'data/index.json'
      ? { ...data, documents: data.documents.map(plain) }
      : path === 'data/documents/rfc7944.json'
        ? plain(data)
        : data;
  };
  const page = await boot({ hash: '#29153-j00/5.1', mode: 'self-hosted', transform: unread });
  try {
    const { document, window } = page;
    const name = nameLink(document, '#rfc7944');
    rightClick(page, name);
    await settle();
    const definition = document.querySelector('.avp-popup .place-definition');
    absent(definition.querySelector('button'));
    assert.ok(definition.querySelector('.view-action'));
    document.querySelector('.avp-popup .popup-title button').click();
    click(page, name);
    await settle();
    assert.ok(window.location.hash.startsWith('#rfc7944/'));
    absent(document.querySelector('#source-pane'), 'and its own page has no pane');
  } finally {
    await page.close();
  }
});

test("self-hosted: a click goes to a name's Details by default, and the strip's choice of Definition is kept for every document", async () => {
  const page = await boot({ hash: '#29061-6f0/17.7', mode: 'self-hosted' });
  try {
    const { document, window } = page;
    const control = document.querySelector('.click-target');
    same(control.previousElementSibling, document.querySelector('.uses-toggle'));
    same(control.nextElementSibling, document.querySelector('.source-toggle'), "beside the pane's toggle");
    assert.equal(control.getAttribute('role'), 'radiogroup');
    assert.deepEqual(
      [...control.querySelectorAll('label')].map(label => label.textContent.trim()),
      ['Definition', 'Details'],
    );
    const chosen = () => control.querySelector('input:checked').value;
    assert.equal(chosen(), 'details');
    const name = tmgi(document);
    const hover = () => {
      name.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }));
      return name.title;
    };
    assert.equal(hover(), 'Click: details in pane · Alt-click: details in both · Right-click: uses');
    click(page, name);
    await settle();
    assert.equal(paneAt(document).get('search'), '17.7.2');
    assert.equal(paneAt(document).get('titled'), '1');
    control.querySelector('input[value="definition"]').click();
    assert.equal(window.localStorage.getItem('seanchai-click-target'), 'definition');
    assert.equal(hover(), 'Click: definition in pane · Alt-click: definition in both · Right-click: uses');
    click(page, name);
    await settle();
    assert.equal(paneAt(document).get('search'), '17.7');
    assert.equal(paneAt(document).get('titled'), null);
    await page.go('#rfc7944');
    assert.equal(document.querySelector('.click-target input:checked').value, 'definition');
    const drmp = document.querySelector('pre a[data-avp="DRMP"]');
    drmp.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }));
    assert.equal(drmp.title, 'Click: definition in pane · Alt-click: definition in both · Right-click: uses');
    document.querySelector('.click-target input[value="details"]').click();
    assert.equal(window.localStorage.getItem('seanchai-click-target'), 'details');
  } finally {
    await page.close();
  }
});

test('self-hosted: where the view has no line for the Details, an alt-click takes both to the Definition, and the title says so', async () => {
  const unanchored = (path, data) =>
    path !== 'data/documents/29061-6f0.json'
      ? data
      : { ...data, lines: data.lines.map(line => (line.anchor === '17.7.2' ? { ...line, anchor: null } : line)) };
  const page = await boot({ hash: '#29061-6f0/17.7', mode: 'self-hosted', transform: unanchored });
  try {
    const { document, window } = page;
    const name = tmgi(document);
    name.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }));
    assert.equal(name.title, 'Click: details in pane · Alt-click: definition in both · Right-click: uses');
    click(page, name, { altKey: true });
    await settle();
    assert.ok(document.querySelector('.target-line').querySelector('a[data-avp="TMGI"]'), 'the row listing it');
    assert.equal(paneAt(document).get('search'), '17.7');
  } finally {
    await page.close();
  }
});

test('public: where neither panel can show the Details, a click goes to the Definition', async () => {
  const unanchored = (path, data) =>
    path !== 'data/documents/29061-6f0.json'
      ? data
      : { ...data, lines: data.lines.map(line => (line.anchor === '17.7.2' ? { ...line, anchor: null } : line)) };
  const page = await boot({ hash: '#29061-6f0/17.7', transform: unanchored });
  try {
    const { document, window } = page;
    const name = tmgi(document);
    name.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }));
    assert.equal(name.title, 'Click: go to definition · Right-click: uses');
    click(page, name);
    await settle();
    assert.ok(document.querySelector('.target-line').querySelector('a[data-avp="TMGI"]'));
  } finally {
    await page.close();
  }
});
