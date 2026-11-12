// Where a popup goes beside the name it is about.
import assert from 'node:assert/strict';
import test from 'node:test';
import { placement } from '../../src/popup/place.ts';

const box = (top, height, left = 0, width = 100) => ({
  top,
  bottom: top + height,
  left,
  right: left + width,
  width,
  height,
});
const view = { width: 1000, height: 800 };
const area = box(100, 700, 0, 600);
const size = { width: 300, height: 200 };

test('a popup goes below its name, above it where it does not fit below, and keeps the side it is on while it fits', () => {
  assert.deepEqual(placement(box(200, 20, 50), size, area, view), { left: 50, top: 228, side: 'below' });
  assert.deepEqual(placement(box(600, 20, 50), size, area, view), { left: 50, top: 392, side: 'above' });
  assert.deepEqual(placement(box(400, 20, 50), size, area, view, 'above'), { left: 50, top: 192, side: 'above' });
  assert.deepEqual(placement(box(250, 20, 50), size, area, view, 'above'), { left: 50, top: 278, side: 'below' });
  assert.deepEqual(
    placement(box(300, 20, 50), { width: 300, height: 500 }, area, view),
    { left: 50, top: 288, side: 'below' },
    'at the bottom where it fits neither side',
  );
  assert.deepEqual(placement(box(200, 20, 900), size, area, view).left, 688, 'in the window');
});

test("a popup whose name has left the text's view stays at the edge it left by, and says so", () => {
  assert.deepEqual(placement(box(-400, 20, 50), size, area, view), {
    left: 50,
    top: 108,
    side: 'below',
    detached: 'up',
  });
  assert.deepEqual(placement(box(90, 10, 50), size, area, view, 'above'), {
    left: 50,
    top: 108,
    side: 'above',
    detached: 'up',
  });
  assert.deepEqual(placement(box(1200, 20, 50), size, area, view), {
    left: 50,
    top: 588,
    side: 'below',
    detached: 'down',
  });
  assert.deepEqual(placement(box(300, 20, -500), size, area, view), {
    left: 12,
    top: 328,
    side: 'below',
    detached: 'left',
  });
  assert.equal(placement(box(95, 10, 50), size, area, view).detached, undefined, 'a name partly in view is by it');
  assert.deepEqual(
    placement(box(300, 20, 50), { width: 300, height: 760 }, area, view),
    { left: 50, top: 28, side: 'below' },
    'taller than the text, it keeps to the window',
  );
});

test('with no pane to keep to, a popup keeps to the window', () => {
  assert.deepEqual(placement(box(0, 0, 0, 0), size, box(0, 0, 0, 0), view), { left: 12, top: 12, side: 'below' });
  assert.deepEqual(placement(box(700, 20, 40), size, box(0, 0, 0, 0), view), { left: 40, top: 492, side: 'above' });
});
