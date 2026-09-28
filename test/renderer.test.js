import test from 'node:test';
import assert from 'node:assert/strict';
import { createView } from '../src/projection.js';
import { Renderer } from '../src/renderer.js';
import { CAMERA } from '../src/config.js';

/** A renderer with just enough of itself to run drawWoods, and a context
 *  that records what was drawn instead of touching a real canvas. */
function woodsRenderer() {
  const calls = { beginPath: 0, fill: 0, fillRect: 0, fillStyles: [] };
  const context = {
    beginPath() { calls.beginPath += 1; },
    moveTo() {},
    lineTo() {},
    closePath() {},
    fillRect() { calls.fillRect += 1; },
    fill() {
      calls.fill += 1;
      calls.fillStyles.push(context.fillStyle);
    },
    set fillStyle(value) { context._fillStyle = value; },
    get fillStyle() { return context._fillStyle; },
  };
  const renderer = Object.create(Renderer.prototype);
  renderer.ground = context;
  renderer.camera = {
    view: createView({ focus: { x: 0, y: 0 }, distance: 150, elevation: 45, width: 1200, height: 800 }),
    width: 1200,
    height: 800,
    distance: 150,
  };
  return { renderer, calls };
}

function oneTreeGame(overrides = {}) {
  return {
    treesWithin: () => [{ x: 0, y: 0, z: 0, size: 5, ...overrides }],
    terrain: { land: { trunkColor: '#543e2a', canopyColor: '#4a603a' } },
  };
}

test('a canopy is drawn as two filled tiers, not one', () => {
  const { renderer, calls } = woodsRenderer();
  renderer.drawWoods(oneTreeGame(), { minX: -10, minY: -10, maxX: 10, maxY: 10 });
  assert.equal(calls.fill, 2, 'expected a cap tier and a skirt tier, not a single cone');
  assert.equal(new Set(calls.fillStyles).size, 2, 'the two tiers should be shaded differently');
});

test('the trunk is still one plain rectangle, not doubled with the canopy', () => {
  const { renderer, calls } = woodsRenderer();
  renderer.drawWoods(oneTreeGame(), { minX: -10, minY: -10, maxX: 10, maxY: 10 });
  assert.equal(calls.fillRect, 1);
});

test('past the distance a trunk is legible at all, only the canopy is drawn', () => {
  const { renderer, calls } = woodsRenderer();
  renderer.camera.distance = 500;
  renderer.drawWoods(oneTreeGame(), { minX: -10, minY: -10, maxX: 10, maxY: 10 });
  assert.equal(calls.fillRect, 0, 'no trunk this far out');
  assert.equal(calls.fill, 2, 'but the canopy tiers are unaffected by that distance');
});

test('a tree off the visible ground draws nothing at all', () => {
  const { renderer, calls } = woodsRenderer();
  const farAway = { treesWithin: () => [{ x: 100000, y: 100000, z: 0, size: 5 }], terrain: oneTreeGame().terrain };
  renderer.drawWoods(farAway, { minX: -10, minY: -10, maxX: 10, maxY: 10 });
  assert.equal(calls.fill, 0);
  assert.equal(calls.fillRect, 0);
});

test("each level's own colours reach the canopy, not a fixed constant", () => {
  const pink = { renderer: undefined };
  const { renderer, calls } = woodsRenderer();
  const game = oneTreeGame();
  game.terrain.land.canopyColor = '#eaacc7';
  renderer.drawWoods(game, { minX: -10, minY: -10, maxX: 10, maxY: 10 });
  for (const fill of calls.fillStyles) {
    const [, r, g, b] = fill.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    assert.ok(Number(r) > Number(g) && Number(b) > Number(g), `expected a pink tier, got ${fill}`);
  }
});
