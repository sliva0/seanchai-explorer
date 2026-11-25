// What an interpreted rule reads beside its AVP, in the site: a name of a path through grouped AVPs, a member of the
// request an answer answers, an AVP a command's body admits only through * [ AVP ], and the clauses a block's
// ; Command-Section: and ; Request-Section: name. TS 29.272 and TS 29.273 are the fixture's longest texts, so the checks
// of one view share its page.
import assert from 'node:assert/strict';
import test from 'node:test';
import { absent, boot, click, popupOf, present, settle } from './helpers.mjs';

const nameOn = (document, name, line) =>
  [...document.querySelectorAll('pre [data-avp]')].find(
    node => node.dataset.avp === name && node.closest('.dad-line').dataset.line === String(line),
  );
const lineAt = (document, line) => document.querySelector(`.dad-line[data-line="${line}"]`);
const texts = (node, selector) => [...node.querySelectorAll(selector)].map(item => item.textContent);
const routeOf = href => new URLSearchParams(href.split('?')[1]);
const closePopup = async page => {
  page.document.querySelector('.avp-popup .popup-title button')?.click();
  await settle();
};

// TS 29.272's lines, as the fixture holds them: the IDA's EPS-User-State block and its rule reading the IDR's
// IDR-Flags, the S6a IDR's IDR-Flags and the IDA's EPS-User-State, and NOR's Visited-Network-Identifier rule.
const IDA_RULE = 1226;
const IDR_FLAGS_MEMBER = 190;
const IDA_EPS_USER_STATE = 237;
const NOR_VNI_RULE = 1509;

test('TS 29.272: rules reading the request, and names on a path', async t => {
  const page = await boot({ hash: '#29272-j60/5.2.2.1.1' });
  const { document } = page;
  try {
    await t.test("a rule's names are its own, request/ and / are scoped apart and are no names", () => {
      const line = lineAt(document, IDA_RULE);
      assert.deepEqual(
        [...line.querySelectorAll('[data-avp]')].map(node => node.dataset.avp),
        ['IDR-Flags', 'Result-Code'],
      );
      assert.equal(line.querySelector('[class*="keyword.other.root.dad"]')?.textContent, 'request');
      assert.equal(line.querySelector('[class*="punctuation.separator.path.dad"]')?.textContent, '/');
      assert.ok(
        texts(line, '[class*="keyword.operator.condition.dad"]').includes('and'),
        texts(line, '[class*="keyword.operator.condition.dad"]').join(','),
      );
      const flags = nameOn(document, 'IDR-Flags', IDA_RULE);
      assert.equal(flags.tagName, 'A', 'a link, as the member it is links');
      assert.match(flags.getAttribute('href'), /^#29272-j60\/7\.3\.103/);
      const path = lineAt(document, NOR_VNI_RULE);
      assert.deepEqual(
        [...path.querySelectorAll('[data-avp]')].map(node => node.dataset.avp),
        ['MIP6-Agent-Info', 'MIP6-Agent-Info', 'MIP-Home-Agent-Host'],
      );
      assert.match(nameOn(document, 'MIP-Home-Agent-Host', NOR_VNI_RULE).getAttribute('href'), /^#rfc4004\/7\.11/);
    });

    await t.test("a request's name says it is the request's, and goes to its member in the request", async () => {
      const popup = await popupOf(page, nameOn(document, 'IDR-Flags', IDA_RULE));
      assert.equal(
        texts(popup, '.popup-context p')[0],
        'Here: member of the request, read by an interpreted rule on EPS-User-State · in Insert-Subscriber-Data-Answer · 5.2.2.1.1',
      );
      const member = popup.querySelector('.place-member .view-action');
      present(member);
      assert.equal(routeOf(member.getAttribute('href')).get('line'), String(IDR_FLAGS_MEMBER), "the S6a IDR's member");
      // Read where it is, in the IDR, its popup lists the IDA's rules reading it.
      const readers = popup.querySelectorAll('.constraint-reader');
      assert.deepEqual(
        texts(popup, '.constraint-reader .constraint-scope').map(scope => scope.split(' · ').slice(0, 2).join(' · ')),
        ['rule on EPS-Location-Information · in IDA', 'rule on Local-Time-Zone · in IDA'],
        'the other rules reading it; the one opened on says its words in the text',
      );
      assert.equal(readers.length, 2);
      await closePopup(page);
    });

    await t.test(
      "the request's member lists the answer's rules reading it, saying the plugin needs the request",
      async () => {
        const popup = await popupOf(page, nameOn(document, 'IDR-Flags', IDR_FLAGS_MEMBER));
        const readers = [...popup.querySelectorAll('.constraint-reader')];
        assert.deepEqual(
          readers.map(group => group.querySelector('.constraint-words').textContent),
          [
            "present if the request's IDR-Flags has bit “EPS User State Request” set and Result-Code is DIAMETER_SUCCESS",
            "present if the request's IDR-Flags has bit “EPS Location Information Request” set and Result-Code is DIAMETER_SUCCESS",
            "present if the request's IDR-Flags has bit “Local Time Zone Request” set and Result-Code is DIAMETER_SUCCESS",
          ],
        );
        assert.match(
          readers[0].querySelector('.constraint-scope').textContent,
          /^rule on EPS-User-State · in IDA · 5\.2\.2\.1\.1/,
        );
        assert.equal(
          readers[0].querySelector('.constraint-note').textContent,
          'The Wireshark plugin checks this only when the capture holds the request.',
        );
        await closePopup(page);
      },
    );

    await t.test("an answer's AVP whose rule reads the request goes to the request's block", async () => {
      const popup = await popupOf(page, nameOn(document, 'EPS-User-State', IDA_EPS_USER_STATE));
      const group = [...popup.querySelectorAll('.constraint-group')].find(item =>
        item.querySelector('.constraint-note'),
      );
      present(group);
      assert.deepEqual(texts(group, '.place-request > span:first-child'), ['Request:']);
      assert.match(group.querySelector('.place-request').textContent, /IDR · 7\.2\.9/);
      const route = routeOf(group.querySelector('.place-request .view-action').getAttribute('href'));
      assert.equal(route.get('line'), '174', "the S6a IDR's block, of the answer's application");
      await closePopup(page);
    });

    await t.test("a member of a path's grouped AVP says so, and goes to its member there", async () => {
      const popup = await popupOf(page, nameOn(document, 'MIP-Home-Agent-Host', NOR_VNI_RULE));
      assert.equal(
        texts(popup, '.popup-context p')[0],
        'Here: member of MIP6-Agent-Info, read by an interpreted rule on Visited-Network-Identifier · in Notify-Request · 5.2.5.1.1',
      );
      await closePopup(page);
    });
  } finally {
    await page.close();
  }
});

// TS 29.273's lines: STa's DEA, its * [ AVP ] line, SWa's DEA's, and the S6b AA-Answer block naming both clauses.
const STA_DEA = 148;
const STA_DEA_WILDCARD = 197;
const SWA_DEA_WILDCARD = 73;
const S6B_BLOCK = 5346;

test("TS 29.273: an AVP a command's body admits only through * [ AVP ], and the clauses a block names", async t => {
  const page = await boot({ hash: '#29273-j20/5.2.2.1.2' });
  const { document } = page;
  try {
    await t.test("its ¶ is on the command's * [ AVP ] line, saying which AVP, and opens the command", async () => {
      const mark = lineAt(document, STA_DEA_WILDCARD).querySelector('.constraint-mark');
      present(mark);
      assert.ok(mark.title.includes('• Auth-Session-State: never sent in DEA'), mark.title);
      absent(lineAt(document, SWA_DEA_WILDCARD).querySelector('.constraint-mark'), "SWa's DEA has no such block");
      click(page, mark);
      await settle();
      const entry = document.querySelector('.inspector-entry');
      present(entry);
      const section = entry.querySelector('.popup-constraints');
      present(section);
      assert.ok(section.classList.contains('landing'));
      assert.deepEqual(texts(section, '.constraint-scope'), ['Auth-Session-State · 5.2.4']);
      assert.deepEqual(texts(section, '.constraint-words'), ['never sent in DEA']);
      assert.equal(
        entry.querySelector('.popup-title strong')?.textContent,
        'Diameter-EAP-Answer (DEA)',
        "the command's",
      );
    });

    await t.test("the command's popup lists what its lines cannot show, beside its AVPs", async () => {
      const head = [...lineAt(document, STA_DEA).parentElement.querySelectorAll('.dad-line')]
        .filter(line => Number(line.dataset.line) >= STA_DEA && Number(line.dataset.line) < STA_DEA_WILDCARD)
        .map(line => line.querySelector('[data-command]'))
        .find(Boolean);
      present(head);
      const popup = await popupOf(page, head);
      const section = popup.querySelector('.popup-constraints');
      present(section);
      assert.match(section.querySelector('.constraints-title').textContent, /^Interpreted 1/);
      assert.deepEqual(texts(section, '.constraint-words'), ['never sent in DEA']);
      assert.equal(section.querySelector('.constraint-printed').textContent, 'absent');
      assert.match(
        section.querySelector('.constraint-quote').textContent,
        /shall not include the Auth-Session-State AVP/,
      );
      await closePopup(page);
    });

    await t.test('; Command-Section: and ; Request-Section: of a block link to their clauses', () => {
      const link = (line, section) =>
        [...lineAt(document, line).querySelectorAll('a')].find(node => node.textContent === section);
      assert.match(link(S6B_BLOCK + 4, '9.2.2.2.2').getAttribute('href'), /^#29273-j20\/9\.2\.2\.2\.2/);
      assert.match(link(S6B_BLOCK + 5, '9.2.2.2.1').getAttribute('href'), /^#29273-j20\/9\.2\.2\.2\.1/);
    });
  } finally {
    await page.close();
  }
});

// TS 29.329's Result-Code rules, one a command, each on a path into Experimental-Result: UDA's at 330.
const UDA_RESULT_CODE_RULE = 330;

test("TS 29.329: a path's name in one answer's rule lists no other answer's rule reading the same path", async () => {
  const page = await boot({ hash: '#29329-j10/6.2' });
  const { document } = page;
  try {
    const name = [...lineAt(document, UDA_RESULT_CODE_RULE).querySelectorAll('[data-avp="Experimental-Result-Code"]')];
    assert.equal(name.length, 14, 'each condition names it');
    assert.ok(
      name.every(node => node.previousSibling?.textContent === '/'),
      'each a name of its own after Experimental-Result/',
    );
    const popup = await popupOf(page, name[0]);
    assert.equal(
      texts(popup, '.popup-context p')[0],
      'Here: member of Experimental-Result, read by an interpreted rule on Result-Code · in User-Data-Answer · 6.2',
    );
    assert.equal(popup.querySelectorAll('.constraint-reader').length, 0, "PUA's, SNA's and PNA's rules are not UDA's");
  } finally {
    await page.close();
  }
});
