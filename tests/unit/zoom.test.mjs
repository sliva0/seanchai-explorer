import assert from 'node:assert/strict';
import test from 'node:test';
import { zoomStep } from '../../src/zoom.ts';

const steps = [0.5, 1, 1.5];

test('a zoom step moves to the next listed scale, from on or between them, and stops at the ends', () => {
  assert.equal(zoomStep(steps, 1, 1), 1.5);
  assert.equal(zoomStep(steps, 1, -1), 0.5);
  assert.equal(zoomStep(steps, 1.2, 1), 1.5);
  assert.equal(zoomStep(steps, 1.2, -1), 1);
  assert.equal(zoomStep(steps, 1.5, 1), undefined);
  assert.equal(zoomStep(steps, 0.5, -1), undefined);
  assert.equal(zoomStep(steps, 1.0000001, 1), 1.5, 'a scale barely off a step counts as on it');
});
