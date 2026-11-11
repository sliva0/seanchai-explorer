// The document view: its text, its links and the strip above it.
import assert from 'node:assert/strict';
import test from 'node:test';
import { absent, boot, click, layOut, pane, readFixture, same, settle } from './helpers.mjs';

test('notes expand, comments are styled by kind and raw lines are marked', async () => {
  const page = await boot({ hash: '#29153-j00' });
  try {
    const { document } = page;
    const note = document.querySelector('pre .correction-toggle');
    assert.ok(note.parentElement.classList.contains('correction-note'));
    const detail = note.nextElementSibling;
    assert.equal(detail.hidden, true);
    assert.equal(note.getAttribute('aria-expanded'), 'false');
    click(page, note);
    assert.equal(detail.hidden, false);
    assert.equal(note.getAttribute('aria-expanded'), 'true');
    click(page, note);
    assert.equal(detail.hidden, true);
    await page.go('#29153-j00?raw=1');
    assert.ok([...document.querySelectorAll('#controls a')].some(a => a.textContent === 'Corrected'));
    assert.ok(document.querySelector('pre .raw-warning'));
    absent(document.querySelector('pre .correction-toggle'));
    const url = [...document.querySelectorAll('pre a')].find(a => a.textContent.startsWith('https://'));
    assert.equal(url.target, '_blank');
  } finally { await page.close(); }
});

test('the raw link is worked out when clicked, from the top visible section', async () => {
  const page = await boot({ hash: '#29153-j00/5.1?name=Ns' });
  try {
    const { document, window } = page;
    const toggle = [...document.querySelectorAll('#controls a')].find(a => a.textContent === 'Raw');
    assert.equal(toggle.getAttribute('href'), '#29153-j00/5.1?raw=1&name=Ns');
    const pane = document.querySelector('#document');
    const rows = [...pane.querySelectorAll('.dad-line[data-section]')];
    const visible = rows.findIndex(row => row.dataset.section !== rows[0].dataset.section);
    assert.ok(visible > 0);
    const position = new Map(rows.map((row, index) => [row, (index - visible) * 18]));
    const rect = window.HTMLElement.prototype.getBoundingClientRect;
    window.HTMLElement.prototype.getBoundingClientRect = function () {
      if (position.has(this)) return { top: position.get(this) + 1, bottom: position.get(this) + 18 };
      return this === pane ? { top: 0, bottom: 500 } : rect.call(this);
    };
    toggle.addEventListener('click', event => event.preventDefault());
    click(page, toggle);
    assert.equal(toggle.getAttribute('href'), `#29153-j00/${rows[visible].dataset.section}?raw=1`);
    window.HTMLElement.prototype.getBoundingClientRect = rect;
  } finally { await page.close(); }
});

test('sections, findings and holes link to their clause in the current view', async () => {
  const finding = { severity: 'note', rule: 'a-rule', message: 'Said.', section: '5.1', origin: null, accepted_by: null };
  const page = await boot({
    hash: '#29061-6f0',
    transform: (path, data) => path === 'data/documents/29061-6f0.json' ? { ...data, findings: [finding] } : data,
  });
  try {
    const { document } = page;
    const [findings, holes, sections] = document.querySelectorAll('.diagnostic-panel');
    assert.match(document.querySelector('.section-control .disclosure').textContent, /^Sections \d+$/);
    const first = sections.querySelector('li');
    const { sections: listed } = await readFixture('documents/29061-6f0.json');
    assert.equal(first.textContent, `${listed[0].section} ${listed[0].title} p. ${listed[0].page}`);
    assert.match(first.querySelector('a').getAttribute('href'), /^#29061-6f0\/[\d.]+$/);
    assert.equal(findings.querySelector('li a').getAttribute('href'), '#29061-6f0/5.1');
    assert.ok(holes.querySelector('li a'), 'a hole links to its clause');
    assert.match(holes.querySelector('li a').getAttribute('href'), /^#29061-6f0\/[\d.]+$/);
    await page.go('#29061-6f0?raw=1');
    assert.match(document.querySelector('#diagnostic-sections li a').getAttribute('href'), /\?raw=1$/);
  } finally { await page.close(); }
});

test('the strip\'s toggles open one panel at a time, and one with nothing to show stays off', async () => {
  const page = await boot({
    hash: '#29061-6f0',
    transform: (path, data) => path === 'data/documents/29061-6f0.json' ? { ...data, findings: [{ severity: 'warning', rule: 'r', message: 'm', section: '5.1', accepted_by: null }], holes: [] } : data,
  });
  try {
    const { document } = page;
    const [findings, holes, sections] = document.querySelectorAll('#diagnostics .disclosure');
    const panel = toggle => document.getElementById(toggle.getAttribute('aria-controls'));
    assert.equal(holes.disabled, true);
    assert.equal(holes.textContent, 'Holes 0');
    assert.equal(sections.disabled, false);
    assert.equal(panel(sections).hidden, true);
    sections.click();
    assert.equal(sections.getAttribute('aria-expanded'), 'true');
    assert.equal(panel(sections).hidden, false);
    findings.click();
    assert.equal(sections.getAttribute('aria-expanded'), 'false');
    assert.equal(panel(sections).hidden, true);
    assert.equal(panel(findings).hidden, false);
    findings.click();
    assert.equal(panel(findings).hidden, true);
    assert.equal(findings.getAttribute('aria-expanded'), 'false');
  } finally { await page.close(); }
});

test('a mention link marks its line, a later route clears it, and loading says so', async () => {
  const page = await boot({ hash: '#29153-j00/5.1?line=12' });
  try {
    const { document } = page;
    const line = document.querySelector('.target-line');
    assert.equal(line.dataset.line, '12');
    await page.go('#29153-j00/5.1');
    absent(document.querySelector('.target-line'));
    page.window.location.hash = '#29061-6f0';
    await new Promise(resolve => setTimeout(resolve, 0));
    const status = document.querySelector('main [role="status"]');
    if (status) assert.match(status.textContent, /^Loading TS 29\.061/);
    await settle();
    absent(document.querySelector('main [role="status"]'));
  } finally { await page.close(); }
});

test('; From: links to the document a reprint comes from, and the block\'s names to theirs', async () => {
  const page = await boot({ hash: '#29109-j00' });
  try {
    const { document, window } = page;
    const lines = [...document.querySelectorAll('.dad-line')];
    const type = lines.findIndex(line => line.textContent === '; Type: Reprinted AVP\n');
    const from = lines.slice(type).find(line => line.textContent.startsWith('; From:'));
    const anchor = from.querySelector('a');
    assert.equal(anchor.textContent, 'RFC6733');
    assert.equal(anchor.getAttribute('href'), '#rfc6733');
    assert.equal(anchor.dataset.token !== undefined, true);
    click(page, anchor);
    await settle();
    assert.equal(window.location.hash, '#rfc6733');
  } finally { await page.close(); }
});

test('the section list says what a clause\'s value tables hold', async () => {
  const page = await boot({ hash: '#29217-j00' });
  try {
    const items = [...page.document.querySelectorAll('.section-list li')].map(item => item.textContent);
    assert.ok(items.some(item => /Value Table \S+ · Bits \(\d+\)/.test(item)), items.join('\n'));
    assert.ok(items.some(item => /Value Table Feature-List · Features list \d+ \([^)]+\) \(\d+\)/.test(item)), items.join('\n'));
    assert.ok(items.some(item => /Value Table \S+ · Result codes \(\d+\)/.test(item)), items.join('\n'));
  } finally { await page.close(); }
});

test('the strip names the section at the top of the view, and opens the Sections panel at its entry', async () => {
  const page = await boot({ hash: '#29153-j00' });
  try {
    const { document, window } = page;
    layOut(page);
    const crumb = document.querySelector('.section-crumb');
    const rows = [...document.querySelectorAll('.dad-line[data-section]')];
    const row = rows.find(node => node.dataset.section !== rows[0].dataset.section);
    const section = row.dataset.section;
    const { title } = (await readFixture('documents/29153-j00.json')).sections.find(entry => entry.section === section);
    const toggle = document.querySelector('.section-control .disclosure');
    assert.deepEqual([...document.querySelectorAll('#diagnostics button')].map(node => node.textContent.split(' ')[0]).slice(0, 3), ['Findings', 'Holes', 'Sections']);
    same(toggle.nextElementSibling.firstElementChild, crumb, 'the crumb follows the Sections toggle');
    pane(document).scrollTop = Number(row.dataset.line) * 20 - 12;
    pane(document).dispatchEvent(new window.Event('scroll'));
    await new Promise(resolve => setTimeout(resolve, 200));
    assert.equal(crumb.textContent, `${section} · ${title}`);
    assert.match(window.location.hash, new RegExp(`top=${Number(row.dataset.line) - 1}$`), 'and the URL, once it has come to rest');
    click(page, crumb);
    const panel = document.querySelector('#diagnostic-sections');
    assert.equal(panel.hidden, false);
    assert.equal(toggle.getAttribute('aria-expanded'), 'true');
    const current = panel.querySelectorAll('[aria-current]');
    assert.equal(current.length, 1);
    assert.equal(current[0].dataset.section, section);
    same(document.activeElement, current[0].querySelector('a'));
    click(page, crumb);
    assert.equal(panel.hidden, false, 'a second click does not close it');
    assert.equal(panel.querySelectorAll('[aria-current]').length, 1);
    click(page, toggle);
    assert.equal(panel.hidden, true, 'the toggle does');
  } finally { await page.close(); }
});
