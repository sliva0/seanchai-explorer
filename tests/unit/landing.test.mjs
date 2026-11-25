import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Window } from 'happy-dom';
import { land, LANDING, LANDING_MS } from '../../src/landing.ts';

test('a landing fades in shortly, holds and fades out slowly, several seconds in all', () => {
  assert.ok(LANDING.in <= 250, 'in');
  assert.ok(LANDING.hold >= 1000, 'held');
  assert.ok(LANDING.out >= 2000, 'out');
  assert.equal(LANDING_MS, LANDING.in + LANDING.hold + LANDING.out);
});

test("the stylesheet's landing runs as long as the timer, its stops where the fade in ends and the fade out starts", async () => {
  const css = await readFile(new URL('../../src/layout.css', import.meta.url), 'utf8');
  const keyframes = css.match(/@keyframes landing \{([\s\S]*?)\n\}/)[1];
  const stops = [...keyframes.matchAll(/([\d.]+)%/g)].map(([, at]) => Number(at));
  assert.deepEqual(stops, [
    Math.round((LANDING.in / LANDING_MS) * 1000) / 10,
    Math.round(((LANDING.in + LANDING.hold) / LANDING_MS) * 1000) / 10,
  ]);
  assert.match(css, new RegExp(`\\.landing \\{\\s*animation: landing ${LANDING_MS}ms`));
  // Reduced motion keeps the tint for as long, without the fades.
  assert.match(css, /prefers-reduced-motion: reduce\) \{\s*\.landing \{\s*animation-name: landing-still;/);
});

test('land adds the class, starts it again where it is on, and takes it off once it has run', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { document } = new Window();
  const node = document.createElement('div');
  land(node);
  assert.ok(node.classList.contains('landing'));
  t.mock.timers.tick(LANDING_MS - 500);
  land(node);
  t.mock.timers.tick(600);
  assert.ok(node.classList.contains('landing'), 'a second landing runs its own time');
  t.mock.timers.tick(LANDING_MS - 600);
  assert.ok(!node.classList.contains('landing'));
});
