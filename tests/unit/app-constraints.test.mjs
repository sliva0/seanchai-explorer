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
const APN_MEMBER = 2315;
const APN_BLOCK = 2345;
const DSR_FLAGS_MEMBER = 284;
const NOR_FLAGS_MEMBER = 512;
const NOR_TERMINAL_MEMBER = 505;
const NOR_MEMBERS_RULE = 1487;

/**
 * No element rule of TS 29.272 names a document the corpus holds, so RAND's, which names TS 33.401, stands in for one
 * naming TS 29.329, which the fixture has, and its entry's first source, TS 33.401 V19.2.0, for TS 29.329's V19.1.0.
 */
function heldElement(path, data) {
  if (path !== 'data/documents/29272-j60.json') return data;
  for (const block of data.blocks)
    if (block.name === 'RAND' && block.readings)
      for (const reading of block.readings)
        for (const rule of reading.rules)
          if (rule.codec === 'element') {
            rule.document = 'TS29.329';
            Object.assign(rule.element_entry.sources[0], { document: 'TS29.329', edition: 'V19.1.0' });
          }
  return data;
}

test('the corrected text of TS 29.272', async t => {
  const page = await boot({ hash: '#29272-j60/5.2.2.2.1', transform: heldElement });
  const { document, window } = page;
  try {
    await t.test(
      "a block's lines are interpreted, its quotes wrap, and its note is plain text citing the declaration",
      () => {
        const type = lineAt(document, DSR_BLOCK);
        assert.ok(type.classList.contains('interpreted'));
        assert.ok(type.classList.contains('corrected-line'), 'its note cites the declaration');
        assert.ok(lineAt(document, DSR_QUOTE).classList.contains('interpreted-quote'));
        assert.ok(lineAt(document, DSR_QUOTE).classList.contains('interpreted'));
        assert.ok(!lineAt(document, DSR_QUOTE + 1).classList.contains('interpreted-quote'), 'a rule is no quote');
        assert.ok(lineAt(document, DSR_QUOTE + 1).classList.contains('interpreted-rule'), 'it wraps as a rule');
        assert.ok(!lineAt(document, DSR_BLOCK).classList.contains('interpreted-rule'));
        assert.ok(lineAt(document, DSR_BLOCK - 1).classList.contains('interpreted-gap'));
        assert.ok(!lineAt(document, DSR_BLOCK - 1).classList.contains('interpreted'));
        // Its record would say the clause and the quotes the block prints right under it: it opens none.
        absent(type.querySelector('.correction-toggle'), 'no record to open');
        absent(type.querySelector('.correction-detail'));
        const note = type.querySelector('.plain-note');
        assert.equal(note.textContent, ';; interpreted');
        assert.match(note.title, /^Written in \(TS29\.272\.dadx#[\w-]+\)$/, 'the .dadx file the block is written in');
        // A note whose record says why, which nothing else prints, still opens it.
        const corrected = [...document.querySelectorAll('.dad-line .correction-toggle')].find(toggle =>
          toggle.textContent.startsWith(';; corrected'),
        );
        present(corrected, 'a corrected note opens its record');
        click(page, corrected);
        assert.match(corrected.closest('.dad-line').querySelector('.correction-reason').textContent, /^— \S/);
        click(page, corrected);
      },
    );

    await t.test(
      "a member's mark joins its category and a ¶, its title where the rules were read and the rules in words, a button; a copy leaves both",
      () => {
        const line = lineAt(document, DSR_MEMBER);
        const mark = line.querySelector('.line-mark');
        present(mark);
        assert.ok(mark.classList.contains('element-mark') && mark.classList.contains('constraint-mark'));
        assert.equal(mark.dataset.category, 'C');
        assert.equal(mark.dataset.interpreted, '1');
        assert.equal(mark.textContent, '');
        assert.equal(mark.tagName, 'BUTTON');
        assert.equal(mark.getAttribute('aria-hidden'), null);
        assert.equal(mark.getAttribute('aria-label'), mark.title);
        assert.equal(mark.dataset.reads, 'Context-Identifier');
        assert.deepEqual(mark.title.split('\n'), [
          'C: conditional · Context Identifier (See 7.3.27) · table 5.2.2.2.1/1',
          "From this member's description in table 5.2.2.2.1/1:",
          '• present only if DSR-Flags has bit “PDN subscription contexts Withdrawal” set or DSR-Flags has bit “PDP contexts Withdrawal” set',
          mark.title.split('\n')[3],
          '• not 0',
          'Click to view each rule, its source quote, and a link to its block.',
        ]);
        assert.match(
          mark.title.split('\n')[3],
          /^• cannot be checked on a single message: “In the "PDN subscription contexts Withdrawal" case, .{20,100}…”$/,
          'a rule no checker can run, as its quote, shortened',
        );
        assert.equal(line.querySelectorAll('.line-mark').length, 1, 'one mark');
        assert.equal(mark.nextSibling.textContent, '\n');
        const onlyRules = lineAt(document, APN_MEMBER).querySelector('.line-mark');
        assert.ok(onlyRules.classList.contains('constraint-mark') && !onlyRules.classList.contains('element-mark'));
        assert.match(
          onlyRules.title,
          /^From the prose of section 7\.3\.35:\n• not 0\n• unique across APN-Configuration instances/,
        );
        assert.match(
          onlyRules.title,
          /\n• cannot be checked on a single message: “NOTE: If interworking with MAP is needed[^”]*”\n/,
        );
      },
    );

    await t.test(
      "an Information Elements row's mark says it was read from that row's description, and a text-only rule plainly",
      () => {
        const row = [...document.querySelectorAll('.dad-line')].find(
          line => line.textContent.startsWith('"SGSN number (See 7.3.102)"') && line.dataset.section === '5A.2.1.1.1',
        );
        assert.equal(
          row.querySelector('.constraint-mark').title,
          [
            "From this row's description:",
            '• cannot be checked on a single message: “It shall be present when the message is sent on the S7d interface.”',
            'From the prose of section 7.3.102:',
            '• TBCD-encoded E.164 number',
            'Click to view each rule, its source quote, and a link to its block.',
          ].join('\n'),
        );
      },
    );

    await t.test('a click on the mark opens the inspector at the interpreted constraints, flashing them', async () => {
      const mark = lineAt(document, APN_MEMBER).querySelector('.constraint-mark');
      click(page, mark);
      await settle();
      const entry = document.querySelector('.inspector-entry');
      present(entry);
      assert.equal(
        entry.querySelector('.popup-title strong, h2, h3')?.textContent ?? entry.getAttribute('aria-label'),
        'Context-Identifier',
      );
      const section = entry.querySelector('.popup-constraints');
      present(section);
      assert.ok(section.classList.contains('landing'), 'brought into view with a flash');
      absent(document.querySelector('.avp-popup'));
    });

    await t.test(
      'a popup says the constraints holding where the name is read, in words, with quote and block',
      async () => {
        const popup = await popupOf(page, nameOn(document, 'Context-Identifier', APN_MEMBER));
        const section = popup.querySelector('.popup-constraints');
        present(section);
        assert.equal(section.getAttribute('aria-label'), 'Interpreted constraints');
        assert.match(section.querySelector('.constraints-title').textContent, /^Interpreted 1/);
        const about = section.querySelector('.constraints-about');
        assert.equal(about.tagName, 'BUTTON', 'no link out: the help says what they are');
        about.click();
        assert.equal(document.getElementById('help').hidden, false, 'it opens the help');
        assert.ok(document.getElementById('help').querySelector('.help-constraints'));
        document.querySelector('.help-toggle').click();
        assert.deepEqual(texts(section, '.constraint-scope'), ['within APN-Configuration · 7.3.35']);
        assert.deepEqual(texts(section, '.constraint-reading .constraint-printed'), ['exclude 0', 'unique']);
        assert.deepEqual(texts(section, '.constraint-reading .constraint-words').slice(0, 2), [
          'not 0',
          'unique across APN-Configuration instances',
        ]);
        const first = section.querySelector('.constraint-rule');
        assert.deepEqual(
          [...first.children].map(part => part.className),
          ['constraint-words', 'constraint-printed'],
          'the words first, as printed under them',
        );
        assert.equal(
          section.querySelector('.constraints-about').title,
          'Rules extracted manually from specification prose rather than tables or ABNF, each paired with its source quote. Verify against the quote before relying on a rule.',
        );
        assert.equal(section.querySelector('.constraint-printed .constraint-keyword').textContent, 'exclude');
        assert.match(section.querySelector('.constraint-reading q').textContent, /shall not have a value of zero/);
        const textOnly = texts(section, '.constraint-text-only');
        assert.equal(textOnly.length, 1);
        assert.deepEqual(texts(section, '.constraint-text-only .constraint-words'), [
          'Cannot be checked on a single message',
        ]);
        absent(section.querySelector('.constraint-text-only .constraint-printed'));
        assert.match(
          section.querySelector('.constraint-text-only q').textContent,
          /^NOTE: If interworking with MAP is needed/,
        );
        const route = routeOf(section.querySelector('.place-constraint .view-action').getAttribute('href'));
        assert.equal(route.get('line'), String(APN_BLOCK));
        assert.ok(!section.textContent.includes('DSR-Flags'), "the command's are not this place's");
        await closePopup(page);

        const inCommand = await popupOf(page, nameOn(document, 'Context-Identifier', DSR_MEMBER));
        const dsr = inCommand.querySelector('.popup-constraints');
        assert.deepEqual(texts(dsr, '.constraint-scope'), ['in DSR · 5.2.2.2.1 · table 5.2.2.2.1/1']);
        assert.deepEqual(texts(dsr, '.constraint-reading .constraint-printed'), [
          'requires DSR-Flags bit "PDN subscription contexts Withdrawal" or DSR-Flags bit "PDP contexts Withdrawal"',
          'exclude 0',
        ]);
        assert.deepEqual(texts(dsr, '.constraint-reading .constraint-words'), [
          'present only if DSR-Flags has bit “PDN subscription contexts Withdrawal” set or DSR-Flags has bit “PDP contexts Withdrawal” set',
          'Cannot be checked on a single message',
          'not 0',
        ]);
        assert.ok(!dsr.textContent.includes('APN-Configuration'));
        await closePopup(page);
      },
    );

    await t.test("a name in a block says where it stands in it, and an encoding's codec is explained", async () => {
      const subject = document.querySelector('.dad-line.interpreted [data-avp="Visited-PLMN-Id"]');
      const popup = await popupOf(page, subject);
      assert.equal(texts(popup, '.popup-context p')[0], 'Here: subject of interpreted constraints · 7.3.9');
      const rule = popup.querySelector('.constraint-rule');
      // In its own block, which prints the rule, its quote and its place: the popup says the rule in words alone.
      assert.equal(rule.querySelector('.constraint-printed'), null);
      assert.equal(popup.querySelector('.constraint-quote'), null);
      assert.equal(popup.querySelector('.place-constraint'), null);
      assert.equal(rule.querySelector('.constraint-words').textContent, 'PLMN ID (MCC and MNC in 3 octets)');
      assert.match(rule.title, /^MCC and MNC in 3 octets/);
      await closePopup(page);
      const condition = await popupOf(page, nameOn(document, 'DSR-Flags', DSR_QUOTE + 1));
      assert.equal(
        texts(condition, '.popup-context p')[0],
        'Here: condition AVP in an interpreted rule on Context-Identifier · in Delete-Subscriber-Data-Request · 5.2.2.2.1',
      );
      await closePopup(page);
    });

    await t.test("a default and a rule on an AVP's own bits are said in words, in the popup and the mark", async () => {
      const bits = await popupOf(page, nameOn(document, 'DSR-Flags', DSR_FLAGS_MEMBER));
      assert.ok(
        texts(bits, '.constraint-reading .constraint-words').includes('at most one of bits 3, 6 set'),
        texts(bits, '.constraint-reading .constraint-words').join('\n'),
      );
      await closePopup(page);
      assert.match(
        lineAt(document, DSR_FLAGS_MEMBER).querySelector('.line-mark').title,
        /at most one of bits 3, 6 set/,
      );
      const nor = await popupOf(page, nameOn(document, 'NOR-Flags', NOR_FLAGS_MEMBER));
      assert.ok(texts(nor, '.constraint-reading .constraint-words').includes('defaults to 0 when absent'));
      await closePopup(page);
      assert.match(
        lineAt(document, NOR_FLAGS_MEMBER).querySelector('.line-mark').title,
        /^From this member's description in table 5\.2\.5\.1\.1\/1:\n• defaults to 0 when absent$/m,
      );
    });

    await t.test("a members rule's names link to their AVPs, and a name on it says it is one", async () => {
      const popup = await popupOf(page, nameOn(document, 'Terminal-Information', NOR_TERMINAL_MEMBER));
      const rule = [...popup.querySelectorAll('.constraint-rule')].find(node =>
        node.querySelector('.constraint-printed').textContent.startsWith('members'),
      );
      present(rule);
      assert.equal(rule.querySelector('.constraint-printed').textContent, 'members only IMEI Software-Version');
      assert.deepEqual(texts(rule, '.constraint-printed .constraint-name'), ['IMEI', 'Software-Version'], 'whole');
      assert.equal(
        rule.querySelector('.constraint-words').textContent,
        'no members present except IMEI, Software-Version',
      );
      assert.deepEqual(
        [...rule.querySelectorAll('a.constraint-avp')].map(link => [link.textContent, link.getAttribute('href')]),
        [
          ['IMEI', '#29272-j60/7.3.4?name=IMEI'],
          ['Software-Version', '#29272-j60/7.3.5?name=Software-Version'],
        ],
      );
      await closePopup(page);
      assert.match(
        lineAt(document, NOR_TERMINAL_MEMBER).querySelector('.line-mark').title,
        /^• no members present except IMEI, Software-Version$/m,
      );
      const member = await popupOf(page, nameOn(document, 'IMEI', NOR_MEMBERS_RULE));
      assert.equal(
        texts(member, '.popup-context p')[0],
        'Here: member referenced in an interpreted rule on Terminal-Information · in Notify-Request · 5.2.5.1.1',
      );
      await closePopup(page);
    });

    await t.test("an element rule's document links where the corpus holds it, and is text where not", async () => {
      const held = await popupOf(page, document.querySelector('.dad-line.interpreted [data-avp="RAND"]'));
      const link = held.querySelector('.constraint-rule a.constraint-document');
      present(link);
      assert.equal(link.textContent, 'TS 29.329');
      assert.equal(link.getAttribute('href'), '#29329-j10');
      assert.equal(held.querySelector('.constraint-words').textContent, 'encoded as TS 29.329 “RAND”');
      await closePopup(page);
      const zone = '.dad-line.interpreted [data-avp="Regional-Subscription-Zone-Code"]';
      const unheld = await popupOf(page, document.querySelector(zone));
      absent(unheld.querySelector('.constraint-rule a'));
      assert.equal(
        unheld.querySelector('.constraint-words').textContent,
        'encoded as TS 23.003 section 4.4 “Zone Code”',
      );
      await closePopup(page);
    });

    await t.test('an element rule says what the element is, how far it is checked, and where it was read', async () => {
      const rows = popup => texts(popup, '.constraint-element .element-row');
      const ecgi = await popupOf(
        page,
        document.querySelector('.dad-line.interpreted [data-avp="E-UTRAN-Cell-Global-Identity"]'),
      );
      const rule = ecgi.querySelector('.constraint-rule');
      assert.equal(
        rule.querySelector('.constraint-words').textContent,
        'encoded as TS 29.002 section 17.7.8 “E-UTRAN-CGI”',
      );
      assert.equal(rule.title, '', 'the rows say it, not a title');
      const said = rows(ecgi);
      assert.match(said[0], /^Element: /);
      assert.equal(said[1], 'Checked: full layout — 7 octets; a PLMN identity in octets 1 to 3');
      assert.match(
        said.at(-1),
        /^Read from: TS 29\.002 V19\.1\.0 \(17\.7\.8\), TS 29\.118 V19\.1\.0 \(9\.4\.3a\), TS 29\.274 /,
      );
      absent(ecgi.querySelector('.constraint-element a'), 'the corpus holds none of them');
      assert.match(ecgi.querySelector('.element-source').title, /E-UTRAN-CGI ::= OCTET STRING/);
      await closePopup(page);
      const trace = await popupOf(
        page,
        document.querySelector('.dad-line.interpreted [data-avp="Trace-Interface-List"]'),
      );
      const traced = rows(trace);
      assert.equal(traced[1], 'Checked: length only — 23 octets');
      assert.match(traced[2], /^Not checked: the spare bits/);
      await closePopup(page);
      const csg = await popupOf(page, document.querySelector('.dad-line.interpreted [data-avp="CSG-Id"]'));
      const none = [...csg.querySelectorAll('.constraint-element')].find(node =>
        node.classList.contains('element-depth-none'),
      );
      present(none);
      assert.ok(!texts(none, '.element-row').some(row => row.startsWith('Checked:')), 'no Checked row');
      assert.ok(texts(none, '.element-row').some(row => row.startsWith('Not checked: ')));
      await closePopup(page);
      const rand = await popupOf(page, document.querySelector('.dad-line.interpreted [data-avp="RAND"]'));
      const source = rand.querySelector('.constraint-element a.constraint-document');
      present(source);
      assert.equal(source.textContent, 'TS 29.329');
      assert.equal(source.getAttribute('href'), '#29329-j10');
      assert.match(
        texts(rand, '.element-row').at(-1),
        /^Read from: TS 29\.329 V19\.1\.0 \(6\.1\.2\), TS 33\.102 V19\.1\.0 \(6\.3\.7\)$/,
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
  const page = await boot({ hash: '#29328-j20' });
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
