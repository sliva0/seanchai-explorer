import assert from 'node:assert/strict';
import test from 'node:test';
import { controlGroups } from '../../src/controls.ts';
import { boot, click, settle } from './helpers.mjs';

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
    assert.equal(button.getAttribute('aria-label'), 'Mouse and keyboard');
    assert.equal(button.getAttribute('aria-expanded'), 'false');
    assert.equal(dialog(document).hidden, true);
    button.focus();
    button.click();
    const help = dialog(document);
    assert.equal(help.hidden, false);
    assert.equal(help.getAttribute('role'), 'dialog');
    assert.equal(help.getAttribute('aria-modal'), 'true');
    assert.equal(document.getElementById(help.getAttribute('aria-labelledby')).textContent, 'Mouse and keyboard');
    assert.equal(button.getAttribute('aria-expanded'), 'true');
    assert.ok(document.activeElement === help, 'the focus moves in');
    button.click();
    assert.equal(help.hidden, true, 'the control again closes it');
    assert.ok(document.activeElement === button, 'and the focus comes back');
  } finally { await page.close(); }
});

test('it lists every control of controls.ts, the README\'s keys among them', async () => {
  const page = await boot();
  try {
    const { document } = page;
    toggle(document).click();
    const help = dialog(document);
    assert.deepEqual([...help.querySelectorAll('h3')].map(node => node.textContent), controlGroups.map(group => group.title));
    const terms = [...help.querySelectorAll('dt')].map(node => [...node.querySelectorAll('kbd')].map(key => key.textContent));
    assert.deepEqual(terms, controlGroups.flatMap(group => group.controls.map(control => control.keys)));
    for (const key of ['Click', 'Alt-click', 'Right-click', 'Ctrl+O', 'Alt+O', '[j', 'Ctrl+I', 'Alt+I', ']j', '[d', ']d']) assert.ok(terms.flat().includes(key), key);
    assert.match(help.querySelector('dt').nextElementSibling.textContent, /source pane/);
  } finally { await page.close(); }
});

test('? opens it but not while typing, Escape closes it and gives the focus back, a click outside closes it', async () => {
  const page = await boot({ hash: '#search' });
  try {
    const { document, window } = page;
    const input = document.querySelector('.search-form input');
    input.focus();
    assert.equal(press(page, { key: '?' }, input).defaultPrevented, false);
    assert.equal(dialog(document).hidden, true, 'a ? typed in the box is the box\'s');
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
    dialog(document).querySelector('h3').dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
    assert.equal(dialog(document).hidden, false, 'a click inside keeps it');
    document.querySelector('main').dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
    assert.equal(dialog(document).hidden, true);
  } finally { await page.close(); }
});

test('the focus stays in the dialog while it is open', async () => {
  const page = await boot();
  try {
    const { document } = page;
    toggle(document).click();
    const help = dialog(document);
    const close = help.querySelector('.popup-title button');
    assert.equal(close.getAttribute('aria-label'), 'Close');
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
  } finally { await page.close(); }
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
    assert.ok(document.querySelector('.avp-popup') === popup, 'the help\'s Escape is its own');
    assert.ok(popup.contains(document.activeElement), 'the focus is back in the popup');
    press(page, { key: 'Escape' }, document.activeElement);
    assert.ok(document.querySelector('.avp-popup') === null, 'the popup\'s Escape still closes it');
    assert.ok(document.activeElement === name);
  } finally { await page.close(); }
});
