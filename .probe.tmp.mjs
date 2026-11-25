import { chromium } from 'playwright-core';
const base = process.env.BASE ?? 'http://127.0.0.1:4317/';
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium' });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', e => console.log('pageerror', e.message));
await page.goto(base + '#29328-j20/7.10');
await page.waitForSelector('pre .dad-line');
await page.waitForTimeout(800);
await page.goto(base + '#29329-j10/6.1.1');
await page.waitForSelector('pre .dad-line');
const line = await page.evaluate(() => {
  for (const l of document.querySelectorAll('pre .dad-line'))
    if (/\[ Server-Name \]/.test(l.textContent) && l.dataset.section === '6.1.1') return l.dataset.line;
});
console.log('line', line);
await page.locator(`.dad-line[data-line="${line}"] [data-avp="Server-Name"]`).click({ button: 'right' });
await page.waitForSelector('.avp-popup');
const claim = page.locator('.avp-popup .popup-claim').first();
console.log(await claim.textContent());
console.log('href', await claim.locator('a.claim-where').getAttribute('href'));
console.log('src btn', await claim.locator('.pane-action, .source-action').count());
await claim.locator('a.claim-where').click();
await page.waitForFunction(() => document.querySelector('.document-header h1')?.textContent.includes('29.328'));
await page.waitForTimeout(1500);
console.log('hash', await page.evaluate(() => location.hash));
console.log(
  'target',
  await page.evaluate(() => {
    const t = document.querySelector('.target-line');
    return t && [t.dataset.line, t.textContent];
  }),
);
const top = await page.evaluate(() => {
  const d = document.querySelector('#document');
  const lines = [...document.querySelectorAll('pre .dad-line')]
    .filter(l => {
      const r = l.getBoundingClientRect();
      return r.top >= d.getBoundingClientRect().top;
    })
    .slice(0, 3);
  return lines.map(l => l.dataset.line + ': ' + l.textContent.slice(0, 60));
});
console.log(top);
await page.screenshot({ path: process.env.HOME + '/.cache/explorer-shots/fold/probe-servername-jump.png' });
await browser.close();
