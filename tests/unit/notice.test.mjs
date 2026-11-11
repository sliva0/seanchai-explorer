import assert from 'node:assert/strict';
import test from 'node:test';
import { boot, click } from './helpers.mjs';

/** Keeps what goes to console.error while `run` runs, instead of printing it. */
async function logged(run) {
  const errors = [];
  const original = console.error;
  console.error = error => errors.push(String(error));
  try {
    await run();
  } finally {
    console.error = original;
  }
  return errors;
}

/** The fixture, but every document other than TS 29.153 fails to load while `offline.on` is set. */
const offline = { on: false };
const flaky = (path, data) => {
  if (offline.on && path.startsWith('data/documents/') && !path.includes('29153')) throw new Error('offline');
  return data;
};

test('a failed pane load says what failed, is logged, and its Retry loads it', async () => {
  offline.on = false;
  const page = await boot({ hash: '#29153-j00', transform: flaky });
  try {
    const { document } = page;
    const region = document.querySelector('#notices');
    assert.ok(region !== null, 'there before anything fails');
    assert.equal(region.getAttribute('role'), 'status');
    assert.equal(region.getAttribute('aria-live'), 'polite');
    assert.equal(region.childElementCount, 0);
    offline.on = true;
    const errors = await logged(async () => {
      click(page, document.querySelector('pre a[data-avp][href^="#rfc7944"]'));
      await page.settle();
    });
    assert.deepEqual(errors, ['Error: offline']);
    const notices = () => [...document.querySelectorAll('#notices .notice')];
    assert.equal(notices().length, 1);
    assert.match(notices()[0].textContent, /^Could not load RFC 7944 for the source pane\. Error: offline/);
    assert.match(document.querySelector('.source-document').textContent, /^TS 29\.153/, 'the pane stays where it was');
    const again = await logged(async () => {
      notices()[0].querySelector('button').click();
      await page.settle();
    });
    assert.deepEqual(again, ['Error: offline']);
    assert.equal(notices().length, 1, 'a second failure replaces the first');
    offline.on = false;
    const retry = [...notices()[0].querySelectorAll('button')].find(button => button.textContent === 'Retry');
    retry.click();
    await page.settle();
    assert.equal(notices().length, 0);
    assert.match(
      document.querySelector('.source-document').textContent,
      /^RFC 7944/,
      'the retry did what the click asked',
    );
  } finally {
    await page.close();
  }
});

test('a notice is dismissed by its button, gives the focus back, and goes when the page is left', async () => {
  offline.on = false;
  const page = await boot({ hash: '#29153-j00', transform: flaky });
  try {
    const { document } = page;
    const name = document.querySelector('pre a[data-avp][href^="#rfc7944"]');
    name.focus();
    offline.on = true;
    await logged(async () => {
      click(page, name);
      await page.settle();
    });
    const dismiss = document.querySelector('#notices .notice-dismiss');
    assert.equal(dismiss.getAttribute('aria-label'), 'Dismiss');
    assert.ok(document.activeElement === name, 'a notice takes no focus');
    dismiss.focus();
    dismiss.click();
    assert.equal(document.querySelectorAll('#notices .notice').length, 0);
    assert.ok(document.activeElement === name, 'back where it was when the notice came');
    await logged(async () => {
      click(page, name);
      await page.settle();
    });
    assert.equal(document.querySelectorAll('#notices .notice').length, 1);
    await page.go('#search');
    assert.equal(document.querySelectorAll('#notices .notice').length, 0);
  } finally {
    await page.close();
  }
});

test('a definition the popup loads on demand says so when it fails, and its Retry redraws the popup', async () => {
  offline.on = true;
  const page = await boot({ hash: '#29153-j00', transform: flaky });
  try {
    const { document, window } = page;
    const name = document.querySelector('pre a[data-avp][href^="#rfc7944"]');
    const errors = await logged(async () => {
      name.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      await page.settle();
    });
    assert.ok(document.querySelector('.avp-popup') !== null);
    assert.ok(errors.includes('Error: offline'), errors.join());
    const notice = [...document.querySelectorAll('#notices .notice')].find(node =>
      /for the popup/.test(node.textContent),
    );
    assert.match(notice.textContent, /^Could not load RFC 7944 for the popup\./);
    offline.on = false;
    const popup = document.querySelector('.avp-popup');
    const retry = [...notice.querySelectorAll('button')].find(button => button.textContent === 'Retry');
    retry.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
    assert.ok(document.querySelector('.avp-popup') === popup, 'a press on the notice leaves the popup open');
    retry.click();
    await page.settle();
    assert.ok(
      document.querySelector('.avp-popup') !== null && document.querySelector('.avp-popup') !== popup,
      'drawn again with the document',
    );
    assert.equal(
      [...document.querySelectorAll('#notices .notice')].filter(node => /for the popup/.test(node.textContent)).length,
      0,
    );
  } finally {
    offline.on = false;
    await page.close();
  }
});

test('a load failing once its page has been left is logged and says nothing on the next page', async () => {
  const page = await boot({ hash: '#29153-j00' });
  try {
    const { attempt, clearNotices } = await import('../../src/notice.ts');
    const notices = () => page.document.querySelectorAll('#notices .notice').length;
    const pending = () => {
      let fail;
      return [
        new Promise((_, reject) => {
          fail = reject;
        }),
        () => fail(new Error('late')),
      ];
    };
    const [left, failLeft] = pending();
    attempt('Could not load it', () => left);
    clearNotices();
    const errors = await logged(async () => {
      failLeft();
      await page.settle();
    });
    assert.deepEqual([errors, notices()], [['Error: late'], 0]);
    const [shown, failShown] = pending();
    attempt('Could not load it', () => shown);
    await logged(async () => {
      failShown();
      await page.settle();
    });
    assert.equal(notices(), 1, 'on the page that asked, it is said');
  } finally {
    await page.close();
  }
});
