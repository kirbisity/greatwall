import test from 'node:test';
import assert from 'node:assert/strict';
import { clampIntoView } from '../src/hud.js';

const phone = { width: 375, height: 667, top: 56 };
const box = (left, top, width = 200, height = 60) => ({ left, top, right: left + width, bottom: top + height });

test('a menu already on screen is left where it is', () => {
  assert.deepEqual(clampIntoView(box(80, 200), phone, 8), { dx: 0, dy: 0 });
});

test('a menu hanging off the left edge is slid back on, with a margin', () => {
  // Measured on a phone: x -110..172 with the castle near the left edge.
  assert.deepEqual(clampIntoView(box(-110, 273, 282, 51), phone, 8), { dx: 118, dy: 0 });
});

test('a menu hanging off the right edge is slid back on', () => {
  const { dx } = clampIntoView(box(300, 200), phone, 8);
  assert.equal(dx, 375 - 8 - 500);
});

test('a menu that would sit under the top bar is pushed below it', () => {
  const { dy } = clampIntoView(box(80, 20), phone, 8);
  assert.equal(dy, 56 + 8 - 20);
});

test('a menu wider than the screen keeps its start on screen', () => {
  const { dx } = clampIntoView(box(-40, 200, 420), phone, 8);
  assert.equal(-40 + dx, 8, 'its first option must be reachable even if its last is not');
});
