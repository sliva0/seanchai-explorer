import assert from 'node:assert/strict';
import test from 'node:test';
import { controlGroups } from '../../src/text/controls.ts';
import { absent, boot, click, settle } from './helpers.mjs';

const press = (page, init, target = page.document.body) => {
  const event = new page.window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
};
const follow = async (page, hash) => {
  const anchor = page.document.createElement('a');
  anchor.setAttribute('href', hash);
  page.document.body.append(anchor);
  click(page, anchor);
  anchor.remove();
  await settle();
};
const dialog = document => document.querySelector('#help');
const toggle = document => document.querySelector('header .help-toggle');

test('the "?" control beside the theme toggle opens a labelled modal dialog with the focus in it, and closes it again', async () => {
  const page = await boot();
  try {
    const { document } = page;
    const button = toggle(document);
    assert.ok(button.nextElementSibling === document.querySelector('header .theme-toggle'), 'beside the theme toggle');
    assert.equal(button.getAttribute('aria-label'), 'Help');
    assert.equal(button.getAttribute('aria-expanded'), 'false');
    assert.equal(dialog(document).hidden, true);
    button.focus();
    button.click();
    const help = dialog(document);
    assert.equal(help.hidden, false);
    assert.equal(help.getAttribute('role'), 'dialog');
    assert.equal(help.getAttribute('aria-modal'), 'true');
    assert.equal(document.getElementById(help.getAttribute('aria-labelledby')).textContent, 'Help');
    assert.equal(button.getAttribute('aria-expanded'), 'true');
    assert.ok(document.activeElement === help, 'the focus moves in');
    button.click();
    assert.equal(help.hidden, true, 'the control again closes it');
    assert.ok(document.activeElement === button, 'and the focus comes back');
  } finally {
    await page.close();
  }
});

test("it lists every control of controls.ts but the PDF viewer's, the README's keys among them, and the line marks apart", async () => {
  const page = await boot();
  try {
    const { document } = page;
    toggle(document).click();
    const help = dialog(document);
    const listed = controlGroups.filter(group => !group.selfHosted);
    assert.deepEqual(
      [...help.querySelectorAll('.help-group h3')].map(node => node.textContent),
      ['Mouse (on a name)', 'Line marks', 'Keyboard', 'Search'],
      "a public build's help says nothing of the PDF viewer",
    );
    assert.deepEqual(
      [...help.querySelectorAll('h3')].map(node => node.textContent).at(-1),
      'Interpreted constraints',
      'then what interpreted constraints are',
    );
    assert.doesNotMatch(help.textContent, /self-hosted|public build/i, 'nor names a build');
    const terms = [...help.querySelectorAll('.help-group:not(.help-marks) dt')].map(node =>
      [...node.querySelectorAll('kbd')].map(key => key.textContent),
    );
    assert.deepEqual(
      terms,
      listed.filter(group => !group.marks).flatMap(group => group.controls.map(control => control.keys)),
    );
    const marks = [...help.querySelectorAll('.help-marks dt')].map(node => [
      [...node.querySelectorAll('.help-mark')].map(mark => [mark.textContent, mark.className]),
      node.querySelectorAll('kbd').length,
    ]);
    assert.deepEqual(
      marks,
      [
        [[['C', 'help-mark help-mark-category']], 0],
        [
          [
            ['M', 'help-mark help-mark-disagrees'],
            ['O', 'help-mark help-mark-disagrees'],
            ['C', 'help-mark help-mark-disagrees'],
          ],
          0,
        ],
        [[['¶', 'help-mark help-mark-constraint']], 0],
      ],
      'the line marks drawn as the marks, not as keys',
    );
    for (const key of [
      'Click',
      'Alt-click',
      'Right-click',
      'Ctrl+O',
      'Alt+O',
      '[j',
      'Ctrl+I',
      'Alt+I',
      ']j',
      '[d',
      ']d',
    ])
      assert.ok(terms.flat().includes(key), key);
    assert.match(help.querySelector('dt').nextElementSibling.textContent, /source pane/);
    const kinds = [...help.querySelectorAll('.help-rule-kinds dt')].map(node => node.textContent);
    assert.ok(kinds.includes('default FALSE') && kinds.includes('bits at-most-one 3 6'), kinds.join('\n'));
    const said = [...help.querySelectorAll('.help-rule-kinds dd')].map(node => node.textContent);
    assert.ok(said.includes('Default value assumed when the AVP is absent.'));
    const constraints = help.querySelector('.help-constraints');
    assert.deepEqual(
      [...constraints.children].map(node => node.className || node.tagName),
      ['H3', 'help-note', 'help-note', 'help-note', 'help-list help-rule-kinds', 'help-note', 'help-list help-codecs'],
      'two paragraphs, then the rule kinds and the codecs, each after its line',
    );
    assert.match(constraints.children[2].textContent, /a note under seanchai\.interpreted\.$/);
    assert.match(constraints.children[2].textContent, /"encoding element" rule only as far as the document defining/);
    const mouse = help.querySelector('.help-group');
    assert.equal(mouse.querySelectorAll('.help-note').length, 1);
    assert.equal(mouse.querySelector('.help-note').textContent.split('. ').length, 1, 'one sentence of note');
    assert.deepEqual(
      [...mouse.querySelectorAll('dt')].slice(-2).map(node => node.textContent),
      ['; Section: or ; Page: or ; Table:', 'Table link'],
      "a block header's links and a popup's table as rows of their own",
    );
    const codec = [...help.querySelectorAll('.help-codecs dt')].findIndex(node => node.textContent === 'element');
    assert.match(help.querySelectorAll('.help-codecs dd')[codec].textContent, /how far the Wireshark plugin checks it/);
    assert.ok(
      said.some(text => text.includes('(;\u00a0Within:)')),
      '; Within: kept whole',
    );
  } finally {
    await page.close();
  }
});

test("a self-hosted build's help lists the PDF viewer's keys too, naming no build", async () => {
  const page = await boot({ mode: 'self-hosted' });
  try {
    const { document } = page;
    toggle(document).click();
    const help = dialog(document);
    assert.deepEqual(
      [...help.querySelectorAll('.help-group h3')].map(node => node.textContent),
      controlGroups.map(group => group.title),
    );
    assert.equal(help.querySelectorAll('.help-group h3')[4].textContent, 'PDF viewer');
    assert.doesNotMatch(help.textContent, /self-hosted|public build/i);
  } finally {
    await page.close();
  }
});

test('? opens it but not while typing, Escape closes it and gives the focus back, a click outside closes it', async () => {
  const page = await boot({ hash: '#search' });
  try {
    const { document, window } = page;
    const input = document.querySelector('.search-form input');
    input.focus();
    assert.equal(press(page, { key: '?' }, input).defaultPrevented, false);
    assert.equal(dialog(document).hidden, true, "a ? typed in the box is the box's");
    const theme = document.querySelector('.theme-toggle');
    theme.focus();
    assert.equal(press(page, { key: '?' }, theme).defaultPrevented, true);
    assert.equal(dialog(document).hidden, false);
    press(page, { key: 'Escape' }, document.activeElement);
    assert.equal(dialog(document).hidden, true);
    assert.ok(document.activeElement === theme, 'back where it was');
    press(page, { key: '?' }, theme);
    press(page, { key: '?' }, document.activeElement);
    assert.equal(dialog(document).hidden, true, 'a second ? closes it');
    press(page, { key: '?', ctrlKey: true }, theme);
    assert.equal(dialog(document).hidden, true, 'with a modifier it is not the help');
    press(page, { key: '?' }, theme);
    dialog(document)
      .querySelector('h3')
      .dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
    assert.equal(dialog(document).hidden, false, 'a click inside keeps it');
    document.querySelector('main').dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
    assert.equal(dialog(document).hidden, true);
  } finally {
    await page.close();
  }
});

test('the focus stays in the dialog while it is open', async () => {
  const page = await boot();
  try {
    const { document } = page;
    toggle(document).click();
    const help = dialog(document);
    const close = help.querySelector('.popup-title button');
    assert.equal(close.getAttribute('aria-label'), 'Close');
    // Its one stop is Close: it links nowhere else.
    absent(help.querySelector('a[href]'));
    close.focus();
    assert.equal(press(page, { key: 'Tab' }, close).defaultPrevented, true);
    assert.ok(document.activeElement === close, 'Tab wraps');
    assert.equal(press(page, { key: 'Tab', shiftKey: true }, close).defaultPrevented, true);
    assert.ok(document.activeElement === close, 'and Shift+Tab');
    help.focus();
    assert.equal(press(page, { key: 'Tab', shiftKey: true }, help).defaultPrevented, true);
    assert.ok(document.activeElement === close);
    document.querySelector('.index-view a').focus();
    assert.ok(help.contains(document.activeElement), 'the focus sent outside comes back');
    close.click();
    assert.equal(help.hidden, true);
    assert.ok(document.activeElement === toggle(document));
  } finally {
    await page.close();
  }
});

test('the chords still walk with the help closed, wait while it is open, and the popup keeps its own Escape', async () => {
  const page = await boot({ hash: '#29153-j00' });
  try {
    const { document, window } = page;
    const heading = () => document.querySelector('.document-header h1').textContent;
    await follow(page, '#rfc7944');
    toggle(document).click();
    press(page, { key: '[' }, document.activeElement);
    assert.equal(press(page, { key: 'd' }, document.activeElement).defaultPrevented, false);
    await settle();
    assert.match(heading(), /^RFC 7944/, 'nothing moves under the dialog');
    press(page, { key: 'Escape' }, document.activeElement);
    press(page, { key: '[' });
    assert.equal(press(page, { key: 'd' }).defaultPrevented, true);
    await settle();
    assert.match(heading(), /^3GPP TS 29\.153/);
    press(page, { key: ']' });
    press(page, { key: '?', shiftKey: true });
    press(page, { key: 'Escape' }, document.activeElement);
    press(page, { key: ']' });
    press(page, { key: 'd' });
    await settle();
    assert.match(heading(), /^RFC 7944/, 'a chord after the help is a chord');
    const name = document.querySelector('pre a[data-avp]');
    name.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    const popup = document.querySelector('.avp-popup');
    assert.ok(popup !== null);
    press(page, { key: '?' }, document.activeElement);
    assert.equal(dialog(document).hidden, false);
    press(page, { key: 'Escape' }, document.activeElement);
    assert.equal(dialog(document).hidden, true);
    assert.ok(document.querySelector('.avp-popup') === popup, "the help's Escape is its own");
    assert.ok(popup.contains(document.activeElement), 'the focus is back in the popup');
    press(page, { key: 'Escape' }, document.activeElement);
    assert.ok(document.querySelector('.avp-popup') === null, "the popup's Escape still closes it");
    assert.ok(document.activeElement === name);
  } finally {
    await page.close();
  }
});
