// Interpreted Constraints in the site: their blocks in the text, the control hiding them, the marks beside the lines
// reading an AVP they hold for, and what a name's popup and the inspector say of them where it is read. TS 29.272 is
// the fixture's longest text, seconds to draw, so the checks of one view share its page.
import assert from 'node:assert/strict';
import test from 'node:test';
import { absent, boot, click, popupOf, present, settle } from './helpers.mjs';

const nameOn = (document, name, line) =>
  [...document.querySelectorAll('pre [data-avp]')].find(
    node => node.dataset.avp === name && node.closest('.dad-line').dataset.line === String(line),
  );
const lineAt = (document, line) => document.querySelector(`.dad-line[data-line="${line}"]`);
const texts = (node, selector) => [...node.querySelectorAll(selector)].map(item => item.textContent);
const toggleOf = document => document.querySelector('.interpreted-toggle input');
const text = document => document.querySelector('#document');
const routeOf = href => new URLSearchParams(href.split('?')[1]);
const closePopup = async page => {
  page.document.querySelector('.avp-popup .popup-title button')?.click();
  await settle();
};

// TS 29.272's lines, as the fixture holds them.
const DSR_BLOCK = 1320;
const DSR_QUOTE = 1328;
const DSR_MEMBER = 286;
const APN_MEMBER = 2301;
const APN_BLOCK = 2331;

test('the corrected text of TS 29.272', async t => {
  const page = await boot({ hash: '#29272-j60/5.2.2.2.1' });
  const { document, window } = page;
  try {
    await t.test(
      "a block's lines are interpreted, its quotes wrap, and its note opens the declaration's record",
      () => {
        const type = lineAt(document, DSR_BLOCK);
        assert.ok(type.classList.contains('interpreted'));
        assert.ok(type.classList.contains('corrected-line'), 'its note cites the declaration');
        assert.ok(lineAt(document, DSR_QUOTE).classList.contains('constraint-quote'));
        assert.ok(lineAt(document, DSR_BLOCK - 1).classList.contains('interpreted-gap'));
        assert.ok(!lineAt(document, DSR_BLOCK - 1).classList.contains('interpreted'));
        const note = type.querySelector('.correction-toggle');
        assert.equal(note.textContent, ';; interpreted');
        click(page, note);
        assert.match(
          type.querySelector('.correction-detail').textContent,
          /^ — interpreted from table 5\.2\.2\.2\.1\/1: /,
        );
        click(page, note);
      },
    );

    await t.test("a member's mark joins its category and an italic i, its title the rules; a copy leaves both", () => {
      const line = lineAt(document, DSR_MEMBER);
      const mark = line.querySelector('.line-mark');
      present(mark);
      assert.ok(mark.classList.contains('element-mark') && mark.classList.contains('constraint-mark'));
      assert.equal(mark.dataset.category, 'C');
      assert.equal(mark.dataset.interpreted, '1');
      assert.equal(mark.textContent, '');
      assert.equal(mark.getAttribute('aria-hidden'), 'true');
      assert.equal(
        mark.title,
        [
          'C: conditional · Context Identifier (See 7.3.27) · table 5.2.2.2.1/1',
          'Interpreted: present only if DSR-Flags has bit “PDN subscription contexts Withdrawal” set or DSR-Flags has bit “PDP contexts Withdrawal” set (in Delete-Subscriber-Data-Request); not 0 (in Delete-Subscriber-Data-Request)',
        ].join('\n'),
      );
      assert.equal(line.querySelectorAll('.line-mark').length, 1, 'one mark');
      assert.equal(mark.nextSibling.textContent, '\n');
      const onlyRules = lineAt(document, APN_MEMBER).querySelector('.line-mark');
      assert.ok(onlyRules.classList.contains('constraint-mark') && !onlyRules.classList.contains('element-mark'));
    });

    await t.test(
      'a popup says the constraints holding where the name is read, in words, with quote and block',
      async () => {
        const popup = await popupOf(page, nameOn(document, 'Context-Identifier', APN_MEMBER));
        const section = popup.querySelector('.popup-constraints');
        present(section);
        assert.equal(section.getAttribute('aria-label'), 'Interpreted constraints');
        assert.match(section.querySelector('.constraints-title').textContent, /^Interpreted 1/);
        assert.equal(
          section.querySelector('.constraints-about').getAttribute('href'),
          'https://github.com/sliva0/seanchai/blob/main/docs/constraints.md',
        );
        assert.deepEqual(texts(section, '.constraint-scope'), ['within APN-Configuration · 7.3.35']);
        assert.deepEqual(texts(section, '.constraint-reading summary'), ['not 0']);
        assert.match(
          section.querySelector('.constraint-reading details q').textContent,
          /shall not have a value of zero/,
        );
        const textOnly = texts(section, '.constraint-text-only');
        assert.equal(textOnly.length, 2);
        assert.match(textOnly[1], /^text only NOTE: If interworking with MAP is needed/);
        const route = routeOf(section.querySelector('.place-constraint .view-action').getAttribute('href'));
        assert.equal(route.get('line'), String(APN_BLOCK));
        assert.ok(!section.textContent.includes('DSR-Flags'), "the command's are not this place's");
        await closePopup(page);

        const inCommand = await popupOf(page, nameOn(document, 'Context-Identifier', DSR_MEMBER));
        const dsr = inCommand.querySelector('.popup-constraints');
        assert.deepEqual(texts(dsr, '.constraint-scope'), ['in DSR · 5.2.2.2.1 · table 5.2.2.2.1/1']);
        assert.deepEqual(texts(dsr, '.constraint-reading summary'), [
          'present only if DSR-Flags has bit “PDN subscription contexts Withdrawal” set or DSR-Flags has bit “PDP contexts Withdrawal” set',
          'not 0',
        ]);
        assert.ok(!dsr.textContent.includes('APN-Configuration'));
        await closePopup(page);
      },
    );

    await t.test("a name in a block says where it stands in it, and an encoding's codec is explained", async () => {
      const subject = document.querySelector('.dad-line.interpreted [data-avp="Visited-PLMN-Id"]');
      const popup = await popupOf(page, subject);
      assert.equal(texts(popup, '.popup-context p')[0], 'Here: the AVP of interpreted constraints · 7.3.9');
      const rule = popup.querySelector('.constraint-rule');
      assert.equal(rule.textContent, 'PLMN ID, MCC and MNC in 3 octets');
      assert.match(rule.title, /^MCC and MNC in 3 octets/);
      await closePopup(page);
      const condition = await popupOf(page, nameOn(document, 'DSR-Flags', DSR_QUOTE + 1));
      assert.equal(
        texts(condition, '.popup-context p')[0],
        'Here: a condition of an interpreted rule on Context-Identifier · in Delete-Subscriber-Data-Request · 5.2.2.2.1',
      );
      await closePopup(page);
    });

    await t.test('the inspector says what the popup says of them', async () => {
      click(page, nameOn(document, 'Context-Identifier', APN_MEMBER));
      await settle();
      const entry = document.querySelector('.inspector-entry');
      present(entry);
      assert.deepEqual(texts(entry, '.constraint-scope'), ['within APN-Configuration · 7.3.35']);
      absent(document.querySelector('.avp-popup'));
    });

    await t.test(
      'the strip hides the blocks for every document, and a move to one shows them for this page',
      async () => {
        const toggle = toggleOf(document);
        present(toggle);
        assert.equal(toggle.checked, true, 'shown by default');
        assert.ok(!text(document).classList.contains('interpreted-hidden'));
        const listed = () => texts(document, '#diagnostic-sections li');
        assert.ok(listed().some(title => title.includes('Interpreted Constraints IMEI')));
        toggle.click();
        await settle();
        assert.ok(text(document).classList.contains('interpreted-hidden'));
        assert.equal(window.localStorage.getItem('seanchai-interpreted'), 'hidden');
        assert.ok(!listed().some(title => title.includes('Interpreted Constraints IMEI')), 'nor listed in Sections');
        window.location.hash = `#29272-j60/5.2.2.2.1?line=${DSR_BLOCK}`;
        await settle();
        assert.ok(!text(document).classList.contains('interpreted-hidden'), 'a line among them shows them');
        assert.equal(toggleOf(document).checked, true);
        assert.equal(window.localStorage.getItem('seanchai-interpreted'), 'hidden', 'for this page alone');
        toggleOf(document).click();
        await settle();
        toggleOf(document).click();
        await settle();
        assert.ok(!text(document).classList.contains('interpreted-hidden'));
        assert.equal(window.localStorage.getItem('seanchai-interpreted'), 'shown');
      },
    );
  } finally {
    await page.close();
  }
});

test('a document opens with the blocks hidden where the browser keeps that choice', async () => {
  const page = await boot({
    hash: '#29272-j60/7.2.11',
    prepare: ({ window }) => window.localStorage.setItem('seanchai-interpreted', 'hidden'),
  });
  try {
    assert.ok(text(page.document).classList.contains('interpreted-hidden'));
    assert.equal(toggleOf(page.document).checked, false);
  } finally {
    await page.close();
  }
});

test('a document with no blocks has no control, and a raw view marks lines by the corrected blocks', async () => {
  const page = await boot({ hash: '#29329-j10' });
  try {
    absent(toggleOf(page.document));
  } finally {
    await page.close();
  }
  const raw = await boot({ hash: '#29272-j60/7.2.11?raw=1' });
  try {
    const { document } = raw;
    absent(toggleOf(document));
    absent(document.querySelector('.dad-line.interpreted'));
    const member = [...document.querySelectorAll('.dad-line')].find(
      line => line.dataset.section === '7.2.11' && line.querySelector('[data-avp="Context-Identifier"]'),
    );
    present(member.querySelector('.constraint-mark'));
    const popup = await popupOf(raw, member.querySelector('[data-avp="Context-Identifier"]'));
    const route = routeOf(popup.querySelector('.place-constraint .view-action').getAttribute('href'));
    assert.equal(route.get('line'), String(DSR_BLOCK));
    assert.equal(route.get('raw'), null, 'to the corrected text, which has the block');
  } finally {
    await raw.close();
  }
});
