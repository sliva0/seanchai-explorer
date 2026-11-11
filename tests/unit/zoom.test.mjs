import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { Window } from 'happy-dom';
import { restoreZoom, showZoom, zoomStep, zoomSteps } from '../../src/zoom.ts';

const steps = [0.5, 1, 1.5];

async function zoomSelect() {
  const html = await readFile(new URL('../../viewer.html', import.meta.url), 'utf8');
  const { document } = new Window();
  document.body.innerHTML = html.match(/<select id="zoom"[\s\S]*?<\/select>/)[0];
  return document.querySelector('#zoom');
}
const labels = select => [...select.options].map(option => option.textContent);
const hidden = select => [...select.options].filter(option => option.hidden).map(option => option.value);

test('the list is short and every scale in it is a step', async () => {
  const select = await zoomSelect();
  assert.deepEqual(labels(select), ['Width', 'Page', '50%', '75%', '100%', '150%', '200%', '300%']);
  for (const { value } of select.options)
    if (!value.startsWith('page-')) assert.ok(zoomSteps.includes(Number(value)), value);
  assert.deepEqual(
    zoomSteps,
    zoomSteps.toSorted((a, b) => a - b),
  );
});

test('a step with no option shows through one hidden option, gone once a listed value is shown', async () => {
  const select = await zoomSelect();
  const count = select.options.length;
  showZoom(select, '1.25');
  assert.equal(select.value, '1.25');
  assert.equal(select.selectedOptions[0].textContent, '125%');
  assert.deepEqual(hidden(select), ['1.25']);
  showZoom(select, '1.1');
  assert.equal(select.selectedOptions[0].textContent, '110%');
  assert.deepEqual(hidden(select), ['1.1']);
  showZoom(select, '1.5');
  assert.equal(select.value, '1.5');
  assert.deepEqual(hidden(select), []);
  showZoom(select, '1.1');
  showZoom(select, 'page-width');
  assert.equal(select.value, 'page-width');
  assert.equal(select.options.length, count);
});

test('a preset the list lacks changes nothing', async () => {
  const select = await zoomSelect();
  select.value = '2';
  showZoom(select, 'auto');
  assert.equal(select.value, '2');
  assert.deepEqual(hidden(select), []);
  showZoom(select, '1.25');
  showZoom(select, 'auto');
  assert.equal(select.value, '1.25', 'not even an unlisted step on show');
  showZoom(select, '1.25');
  assert.equal(select.value, '1.25', 'the same unlisted step again');
  assert.deepEqual(hidden(select), ['1.25']);
});

test('a stored zoom comes back if it is an option or a step, as from the longer list before', async () => {
  for (const [stored, value] of [
    ['page-fit', 'page-fit'],
    ['1.5', '1.5'],
    ['1.25', '1.25'],
    ['0.9', '0.9'],
  ]) {
    const select = await zoomSelect();
    restoreZoom(select, stored);
    assert.equal(select.value, value);
  }
  for (const stored of [null, '', 'nonsense', '0', '-1', '1.3', 'auto']) {
    const select = await zoomSelect();
    restoreZoom(select, stored);
    assert.equal(select.value, 'page-width', String(stored));
    assert.deepEqual(hidden(select), []);
  }
});

test('a zoom step moves to the next listed scale, from on or between them, and stops at the ends', () => {
  assert.equal(zoomStep(steps, 1, 1), 1.5);
  assert.equal(zoomStep(steps, 1, -1), 0.5);
  assert.equal(zoomStep(steps, 1.2, 1), 1.5);
  assert.equal(zoomStep(steps, 1.2, -1), 1);
  assert.equal(zoomStep(steps, 1.5, 1), undefined);
  assert.equal(zoomStep(steps, 0.5, -1), undefined);
  assert.equal(zoomStep(steps, 1.0000001, 1), 1.5, 'a scale barely off a step counts as on it');
});
