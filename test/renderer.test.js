import test from 'node:test';
import assert from 'node:assert/strict';
import { createView } from '../src/projection.js';
import { Renderer } from '../src/renderer.js';
import { Terrain } from '../src/terrain.js';
import { LEVELS } from '../src/levels.js';
import { Camera } from '../src/camera.js';
import { HOUSES } from '../src/config.js';

const GREEN_SEASONS = { Autumn: '#d9b23a', Winter: '#eef2f5', Spring: '#4a603a', Summer: '#4a603a' };

/** A renderer with just enough of itself to run collectWoods -- items are
 *  plain data (points + fill), so no fake canvas is needed at all. */
function woodsRenderer() {
  const renderer = Object.create(Renderer.prototype);
  // collectWoods reads the clock for sway; fixed so a test's own assertions
  // are never at the mercy of when it happened to run.
  renderer.startedAt = 0;
  renderer.camera = {
    view: createView({ focus: { x: 0, y: 0 }, distance: 150, elevation: 45, width: 1200, height: 800 }),
    width: 1200,
    height: 800,
    distance: 150,
  };
  return { renderer };
}

/** Runs collectWoods and hands back just the canopy tiers, the two shaded
 *  kite shapes a tree's own colour and turn actually show up on. */
function canopyItems(renderer, game, bounds = { minX: -10, minY: -10, maxX: 10, maxY: 10 }) {
  const items = [];
  renderer.collectWoods(items, renderer.camera.view, game, bounds);
  return items.filter((item) => item.kind === 'canopy');
}

/** A renderer with just enough of itself to run drawGround against a real
 *  Terrain, and a context that only counts how much it was asked to paint. */
function groundRenderer() {
  const calls = { fillRect: 0 };
  const context = {
    createRadialGradient() { return { addColorStop() {} }; },
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    fill() {},
    fillRect() { calls.fillRect += 1; },
    set fillStyle(value) { context._fillStyle = value; },
    get fillStyle() { return context._fillStyle; },
  };
  const renderer = Object.create(Renderer.prototype);
  renderer.ground = context;
  renderer.paintedGround = null;
  renderer.meshTint = [0, 0, 0];
  renderer.camera = new Camera(800, 600);
  return { renderer, calls };
}

function stubGame(level, terrain) {
  return {
    level,
    terrain,
    seasonPhase: 2.5,
    terrainRevision: 0,
    treesWithin: (minX, minY, maxX, maxY) => terrain.treesWithin(minX, minY, maxX, maxY),
  };
}

/** One tree at the origin, in a wood whose colours are given once per season. */
function oneTreeGame({ tree, seasonPhase = 0.5, canopySeasons = GREEN_SEASONS } = {}) {
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
  const { renderer } = woodsRenderer();
  const canopy = canopyItems(renderer, oneTreeGame());
  assert.equal(canopy.length, 2, 'expected a cap tier and a skirt tier, not a single cone');
  assert.equal(new Set(canopy.map((item) => item.fill)).size, 2, 'the two tiers should be shaded differently');
});

test('a tree also drops one shadow and stands on one trunk, not doubled up', () => {
  const { renderer } = woodsRenderer();
  const items = [];
  renderer.collectWoods(items, renderer.camera.view, oneTreeGame(), { minX: -10, minY: -10, maxX: 10, maxY: 10 });
  assert.equal(items.filter((item) => item.kind === 'shadow').length, 1);
  const [trunk] = items.filter((item) => item.kind === 'trunk');
  assert.equal(trunk.points.length, 4, 'expected a plain quad, not the canopy\'s kite shape');
});

test('past the distance a trunk is legible at all, only the canopy is drawn', () => {
  const { renderer } = woodsRenderer();
  renderer.camera.distance = 500;
  const items = [];
  renderer.collectWoods(items, renderer.camera.view, oneTreeGame(), { minX: -10, minY: -10, maxX: 10, maxY: 10 });
  assert.equal(items.filter((item) => item.kind === 'trunk').length, 0, 'no trunk this far out');
  assert.equal(items.filter((item) => item.kind === 'canopy').length, 2,
    'but the canopy tiers are unaffected by that distance');
});

test('a tree off the visible ground draws nothing at all', () => {
  const { renderer } = woodsRenderer();
  const farAway = oneTreeGame({ tree: { x: 100000, y: 100000 } });
  const items = [];
  renderer.collectWoods(items, renderer.camera.view, farAway, { minX: -10, minY: -10, maxX: 10, maxY: 10 });
  assert.equal(items.length, 0);
});

test("each level's own colours reach the canopy, not a fixed constant", () => {
  const { renderer } = woodsRenderer();
  const cherry = { Autumn: '#d9b23a', Winter: '#eef2f5', Spring: '#eaacc7', Summer: '#4a603a' };
  // Spring's own midpoint, so the blend has settled on the season's colour
  // rather than still crossing into it -- see the seasonal tests below for
  // the crossing itself.
  const game = oneTreeGame({ seasonPhase: 0.5, canopySeasons: cherry });
  for (const item of canopyItems(renderer, game)) {
    const [r, g, b] = fillChannels(item.fill);
    assert.ok(r > g && b > g, `expected a pink tier at spring's midpoint, got ${item.fill}`);
  }
});

// --- turning with the year ------------------------------------------------

test('the canopy holds a season\'s own colour at its midpoint', () => {
  const { renderer } = woodsRenderer();
  // Autumn's midpoint is phase 2.5 -- see Season#seasonalColorMix.
  for (const item of canopyItems(renderer, oneTreeGame({ seasonPhase: 2.5 }))) {
    const [r, g, b] = fillChannels(item.fill);
    // Autumn's own colour, #d9b23a, is warm and has no blue in it at all;
    // a tier shaded lighter or darker keeps that same relationship.
    assert.ok(r > g && g > b, `expected autumn's yellow at its midpoint, got ${item.fill}`);
  }
});

test('the canopy turns white through winter, and green again by spring', () => {
  const { renderer } = woodsRenderer();
  for (const item of canopyItems(renderer, oneTreeGame({ seasonPhase: 3.5 }))) {
    const [r, g, b] = fillChannels(item.fill);
    assert.ok(Math.abs(r - g) < 15 && Math.abs(g - b) < 25,
      `expected near-white at winter's midpoint, got ${item.fill}`);
  }

  // A full cycle on from winter's own midpoint (3.5), rather than 0.5,
  // so this reads as the spring that actually follows winter, not one
  // that happens to sit earlier in the phase numbering.
  for (const item of canopyItems(renderer, oneTreeGame({ seasonPhase: 4.5 }))) {
    const [r, g, b] = fillChannels(item.fill);
    assert.ok(g > r && g > b, `expected green again at spring's midpoint, got ${item.fill}`);
  }
});

test('the turn is gradual, not a cut on the season\'s first tick', () => {
  const { renderer } = woodsRenderer();
  // Summer's own midpoint (green, red channel low), autumn's own midpoint
  // (yellow, red channel high), and a point partway across the boundary
  // between them, which should read as neither -- somewhere in between.
  const redAt = (seasonPhase) => fillChannels(canopyItems(renderer, oneTreeGame({ seasonPhase }))[0].fill)[0];
  const summerRed = redAt(1.5);
  const autumnRed = redAt(2.5);
  const partwayRed = redAt(2.2);
  assert.ok(partwayRed > summerRed && partwayRed < autumnRed,
    `expected the turn partway through, got ${partwayRed} outside ${summerRed}..${autumnRed}`);
});

/** The apex's own drift off the centre line its tier's base sits on --
 *  zero for a rigid, unswayed cone, and whatever the wind is doing to it
 *  otherwise. */
function leanOf(tier) {
  return tier.points[0].x - (tier.points[1].x + tier.points[3].x) / 2;
}

test('a canopy leans on the wind rather than standing rigid', () => {
  const { renderer } = woodsRenderer();
  // An own-property shadows the prototype's clock getter, so the wind is a
  // fixed moment rather than whatever the wall clock reads mid-test.
  Object.defineProperty(renderer, 'clock', { value: 1.7 });
  const [tier] = canopyItems(renderer, oneTreeGame());
  assert.notEqual(leanOf(tier), 0, 'expected the apex to have swung off the tier\'s own centre line');
});

test('a wood does not lean in lockstep -- each tree keeps its own phase', () => {
  const { renderer } = woodsRenderer();
  Object.defineProperty(renderer, 'clock', { value: 1.7 });
  const twoTrees = {
    seasonPhase: 0.5,
    treesWithin: () => [{ x: -15, y: 0, z: 0, size: 5 }, { x: 15, y: 10, z: 0, size: 5 }],
    terrain: { land: { trunkColor: '#543e2a', canopySeasons: GREEN_SEASONS } },
  };
  const items = [];
  renderer.collectWoods(items, renderer.camera.view, twoTrees, { minX: -20, minY: -20, maxX: 20, maxY: 20 });
  const canopy = items.filter((item) => item.kind === 'canopy');
  assert.equal(canopy.length, 4, 'expected two tiers apiece for both trees');
  assert.notEqual(leanOf(canopy[0]), leanOf(canopy[2]), 'expected the two trees to lean differently');
});

test('the trunk never sways, only the canopy standing on it', () => {
  const { renderer } = woodsRenderer();
  Object.defineProperty(renderer, 'clock', { value: 1.7 });
  const items = [];
  renderer.collectWoods(items, renderer.camera.view, oneTreeGame(), { minX: -10, minY: -10, maxX: 10, maxY: 10 });
  const [trunk] = items.filter((item) => item.kind === 'trunk');
  // Top-left over bottom-left, top-right over bottom-right: a plumb
  // rectangle, not one leaning the way the canopy above it does.
  assert.equal(trunk.points[0].x, trunk.points[3].x);
  assert.equal(trunk.points[1].x, trunk.points[2].x);
});

test('switching levels repaints the ground even when the camera has not moved', () => {
  const { renderer, calls } = groundRenderer();
  const mainland = new Terrain(1, LEVELS[0].land, LEVELS[0].river);
  const desert = new Terrain(1, LEVELS[1].land);

  renderer.drawGround(stubGame(LEVELS[0], mainland));
  const firstPaint = calls.fillRect;
  assert.ok(firstPaint > 0, 'expected the first call to actually paint something');

  renderer.drawGround(stubGame(LEVELS[0], mainland));
  assert.equal(calls.fillRect, firstPaint,
    'expected an unmoved camera on the same level to skip repainting');

  renderer.drawGround(stubGame(LEVELS[1], desert));
  assert.ok(calls.fillRect > firstPaint,
    'expected switching to a different level, and its Terrain, to repaint even though the camera did not move');
});

test('winter settling in repaints the ground, the same as autumn turning does', () => {
  const { renderer, calls } = groundRenderer();
  const mainland = new Terrain(1, LEVELS[0].land, LEVELS[0].river);
  const at = (seasonPhase) => ({
    level: LEVELS[0], terrain: mainland, seasonPhase, terrainRevision: 0,
    treesWithin: (minX, minY, maxX, maxY) => mainland.treesWithin(minX, minY, maxX, maxY),
  });

  // Summer's own midpoint (1.5) and winter's (3.5) share the same
  // groundGold (0, see config.js's SEASONS) -- picked deliberately so the
  // only thing that can force a repaint between them is snow cover's own
  // step in the key, not the gold one already there.
  renderer.drawGround(at(1.5)); // deep summer: no snow cover at all
  const summerPaint = calls.fillRect;
  assert.ok(summerPaint > 0, 'expected the first call to actually paint something');

  renderer.drawGround(at(3.5)); // winter's own midpoint: full snow cover
  assert.ok(calls.fillRect > summerPaint,
    'expected winter\'s own snow cover to repaint the ground even though the camera did not move');
});

// --- shadows on standing buildings ----------------------------------------

function houseDefinition() {
  return {
    name: 'House',
    radius: Math.max(HOUSES.footprint.width, HOUSES.footprint.depth) / 2 + HOUSES.footprint.overhang,
    parts: [{
      type: 'building', x: 0, y: 0,
      width: HOUSES.footprint.width, depth: HOUSES.footprint.depth, height: HOUSES.footprint.height,
      material: 'plaster',
      roof: { height: HOUSES.footprint.roofHeight, overhang: HOUSES.footprint.overhang, tiers: 1, material: 'roofTile' },
    }],
  };
}

test('a standing house drops one shadow of its own', () => {
  const { renderer } = groundRenderer();
  const definition = houseDefinition();
  const house = { position: { x: 0, y: 0 }, growth: 1, burning: false };
  const items = [];
  renderer.collectHouses(items, renderer.camera.view, [house], new Terrain(1), definition);
  assert.equal(items.filter((item) => item.kind === 'shadow').length, 1);
});

test('a burning house casts no shadow -- it is drawn as fire instead', () => {
  const { renderer } = groundRenderer();
  const definition = houseDefinition();
  const house = { position: { x: 0, y: 0 }, growth: 1, burning: true };
  const items = [];
  renderer.collectHouses(items, renderer.camera.view, [house], new Terrain(1), definition);
  assert.equal(items.length, 0);
});

// --- water's own glint ------------------------------------------------

test('shimmer points only ever stand on open water', () => {
  const { renderer } = groundRenderer();
  const pond = new Terrain(1, { ponds: [{ x: 0, y: 0, radius: 40, fieldRadius: 60 }] });
  const bounds = { minX: -100, minY: -100, maxX: 100, maxY: 100 };
  const points = renderer.sampleShimmerPoints(pond, bounds);
  assert.ok(points.length > 0, 'expected some shimmer over a pond this size');
  for (const point of points) {
    const channel = Math.max(
      pond.riverAt(point.x, point.y), pond.seaAt(point.x, point.y), pond.pondAt(point.x, point.y),
    );
    assert.ok(channel > 0, `expected a shimmer point at (${point.x}, ${point.y}) to sit on water`);
  }
});

test('dry land carries no shimmer at all', () => {
  const { renderer } = groundRenderer();
  const dry = new Terrain(1);
  const bounds = { minX: -100, minY: -100, maxX: 100, maxY: 100 };
  assert.equal(renderer.sampleShimmerPoints(dry, bounds).length, 0);
});

test('a sea\'s whole reach costs no more shimmer than a single pond', () => {
  const { renderer } = groundRenderer();
  const island = new Terrain(1, LEVELS[2].land, null, LEVELS[2].sea);
  const bounds = { minX: -900, minY: -900, maxX: 900, maxY: 900 };
  const points = renderer.sampleShimmerPoints(island, bounds);
  assert.ok(points.length <= 40, `expected a capped handful of points, got ${points.length}`);
});

test('an empty shimmer list draws nothing, and a real one draws something', () => {
  const { renderer } = groundRenderer();
  const calls = { fill: 0 };
  const overlay = {
    set fillStyle(value) {},
    beginPath() {},
    arc() {},
    fill() { calls.fill += 1; },
  };
  renderer.overlay = overlay;
  renderer.startedAt = 0;
  const game = { terrain: new Terrain(1, { ponds: [{ x: 0, y: 0, radius: 20, fieldRadius: 30 }] }) };

  renderer.shimmerPoints = [];
  renderer.drawShimmer(renderer.camera.view, game);
  assert.equal(calls.fill, 0, 'expected an empty list to draw nothing at all');

  // sin(0) = 0, so twinkle sits at its own midpoint (0.5) -- comfortably
  // past SHIMMER_VISIBLE_ABOVE, so every point here should still draw.
  renderer.shimmerPoints = Array.from({ length: 10 }, (unused, i) => ({ x: i, y: 0, phase: 0 }));
  Object.defineProperty(renderer, 'clock', { value: 0 });
  renderer.drawShimmer(renderer.camera.view, game);
  assert.ok(calls.fill > 0, 'expected a real list, twinkling above the threshold, to draw something');
});

// --- transient order/selection effects never crash the render loop --------

/** A renderer with just enough of itself for the overlay-drawn pings: a
 *  camera view to project through, and a stub 2d context whose arc() throws
 *  on a negative radius, the same way a real CanvasRenderingContext2D does. */
function pingRenderer() {
  const context = {
    save() {},
    restore() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    fill() {},
    arc(x, y, radius) {
      if (radius < 0) {
        throw new DOMException(`The radius provided (${radius}) is negative.`, 'IndexSizeError');
      }
    },
    set strokeStyle(value) {},
    set fillStyle(value) {},
    set lineWidth(value) {},
  };
  const renderer = Object.create(Renderer.prototype);
  renderer.overlay = context;
  renderer.camera = { view: createView({ focus: { x: 0, y: 0 }, distance: 150, elevation: 45, width: 1200, height: 800 }) };
  return renderer;
}

test('a selection ping never throws, even if its own lifetime is somehow extended past its duration', () => {
  const renderer = pingRenderer();
  Object.defineProperty(renderer, 'clock', { value: 0, configurable: true });
  renderer.pingSelection(10, 10, 0);
  // A ping's `until` is only ever set once, at creation -- this reproduces
  // what happens if something later stretches it out regardless.
  renderer.selectionPing.until = 1000;
  Object.defineProperty(renderer, 'clock', { value: 5, configurable: true });
  assert.doesNotThrow(() => renderer.drawSelectionPing(renderer.camera.view));
});

test('a move order ping never throws, even if its own lifetime is somehow extended past its duration', () => {
  const renderer = pingRenderer();
  Object.defineProperty(renderer, 'clock', { value: 0, configurable: true });
  renderer.pingMoveOrder([{ x: 0, y: 0 }], [{ x: 10, y: 0 }], { x: 10, y: 0 }, 0);
  renderer.moveOrder.until = 1000;
  Object.defineProperty(renderer, 'clock', { value: 5, configurable: true });
  assert.doesNotThrow(() => renderer.drawMoveOrder(renderer.camera.view));
});

test('both pings run clean across their entire natural lifetime, not just at the ends', () => {
  const renderer = pingRenderer();
  Object.defineProperty(renderer, 'clock', { value: 0, configurable: true });
  renderer.pingSelection(10, 10, 0);
  renderer.pingMoveOrder([{ x: 0, y: 0 }], [{ x: 10, y: 0 }], { x: 10, y: 0 }, 0);
  for (const clock of [0, 0.2, 0.4, 0.6, 0.8, 1, 1.2]) {
    Object.defineProperty(renderer, 'clock', { value: clock, configurable: true });
    assert.doesNotThrow(() => renderer.drawSelectionPing(renderer.camera.view), `selection at clock=${clock}`);
    assert.doesNotThrow(() => renderer.drawMoveOrder(renderer.camera.view), `move order at clock=${clock}`);
  }
});
