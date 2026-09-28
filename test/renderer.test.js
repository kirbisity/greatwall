import test from 'node:test';
import assert from 'node:assert/strict';
import { createView } from '../src/projection.js';
import { Renderer } from '../src/renderer.js';

const GREEN_SEASONS = { Autumn: '#d9b23a', Winter: '#eef2f5', Spring: '#4a603a', Summer: '#4a603a' };

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

/** One tree at the origin, in a wood whose colours are given once per season. */
function oneTreeGame({ tree, seasonPhase = 2.5, canopySeasons = GREEN_SEASONS } = {}) {
  return {
    seasonPhase,
    treesWithin: () => [{ x: 0, y: 0, z: 0, size: 5, ...tree }],
    terrain: { land: { trunkColor: '#543e2a', canopySeasons } },
  };
}

function fillChannels(fill) {
  const [, r, g, b] = fill.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  return [Number(r), Number(g), Number(b)];
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
  const farAway = oneTreeGame({ tree: { x: 100000, y: 100000 } });
  renderer.drawWoods(farAway, { minX: -10, minY: -10, maxX: 10, maxY: 10 });
  assert.equal(calls.fill, 0);
  assert.equal(calls.fillRect, 0);
});

test("each level's own colours reach the canopy, not a fixed constant", () => {
  const { renderer, calls } = woodsRenderer();
  const cherry = { Autumn: '#d9b23a', Winter: '#eef2f5', Spring: '#eaacc7', Summer: '#4a603a' };
  // Spring's own midpoint, so the blend has settled on the season's colour
  // rather than still crossing into it -- see the seasonal tests below for
  // the crossing itself.
  const game = oneTreeGame({ seasonPhase: 2.5, canopySeasons: cherry });
  renderer.drawWoods(game, { minX: -10, minY: -10, maxX: 10, maxY: 10 });
  for (const fill of calls.fillStyles) {
    const [r, g, b] = fillChannels(fill);
    assert.ok(r > g && b > g, `expected a pink tier at spring's midpoint, got ${fill}`);
  }
});

// --- turning with the year ------------------------------------------------

test('the canopy holds a season\'s own colour at its midpoint', () => {
  const { renderer, calls } = woodsRenderer();
  // Autumn's midpoint is phase 0.5 -- see Season#seasonalColorMix.
  renderer.drawWoods(oneTreeGame({ seasonPhase: 0.5 }), { minX: -10, minY: -10, maxX: 10, maxY: 10 });
  for (const fill of calls.fillStyles) {
    const [r, g, b] = fillChannels(fill);
    // Autumn's own colour, #d9b23a, is warm and has no blue in it at all;
    // a tier shaded lighter or darker keeps that same relationship.
    assert.ok(r > g && g > b, `expected autumn's yellow at its midpoint, got ${fill}`);
  }
});

test('the canopy turns white through winter, and green again by spring', () => {
  const { renderer, calls } = woodsRenderer();
  renderer.drawWoods(oneTreeGame({ seasonPhase: 1.5 }), { minX: -10, minY: -10, maxX: 10, maxY: 10 });
  for (const fill of calls.fillStyles) {
    const [r, g, b] = fillChannels(fill);
    assert.ok(Math.abs(r - g) < 15 && Math.abs(g - b) < 25, `expected near-white at winter's midpoint, got ${fill}`);
  }

  calls.fillStyles.length = 0;
  renderer.drawWoods(oneTreeGame({ seasonPhase: 2.5 }), { minX: -10, minY: -10, maxX: 10, maxY: 10 });
  for (const fill of calls.fillStyles) {
    const [r, g, b] = fillChannels(fill);
    assert.ok(g > r && g > b, `expected green again at spring's midpoint, got ${fill}`);
  }
});

test('the turn is gradual, not a cut on the season\'s first tick', () => {
  const { renderer, calls } = woodsRenderer();
  // Summer's own midpoint (green, red channel low), autumn's own midpoint
  // (yellow, red channel high), and a point partway across the boundary
  // between them, which should read as neither -- somewhere in between.
  const redAt = (seasonPhase) => {
    calls.fillStyles.length = 0;
    renderer.drawWoods(oneTreeGame({ seasonPhase }), { minX: -10, minY: -10, maxX: 10, maxY: 10 });
    return fillChannels(calls.fillStyles[0])[0];
  };
  const summerRed = redAt(3.5);
  const autumnRed = redAt(0.5);
  const partwayRed = redAt(4.2);
  assert.ok(partwayRed > summerRed && partwayRed < autumnRed,
    `expected the turn partway through, got ${partwayRed} outside ${summerRed}..${autumnRed}`);
});
