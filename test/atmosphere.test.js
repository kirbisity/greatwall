import test from 'node:test';
import assert from 'node:assert/strict';

// Atmosphere loads a cloud sprite on construction, which needs an Image.
globalThis.Image = class {
  constructor() {
    this.src = '';
    this.width = 241;
    this.height = 134;
  }
};

const { Atmosphere } = await import('../src/atmosphere.js');
const { Camera } = await import('../src/camera.js');
const { CAMERA, CLOUD_LAYERS, FOG, SEASONS } = await import('../src/config.js');
const { loadSettings, saveSettings, settings } = await import('../src/settings.js');

function fakeContext() {
  const calls = { fills: 0, images: 0, stops: [] };
  return {
    calls,
    globalAlpha: 1,
    fillStyle: null,
    createLinearGradient: () => ({ addColorStop: (offset, color) => calls.stops.push({ offset, color }) }),
    fillRect: () => { calls.fills += 1; },
    drawImage: () => { calls.images += 1; },
  };
}

function camera() {
  return new Camera(1200, 800);
}

/** Spread placements, so clouds land across the field rather than in a heap. */
function spread() {
  let step = 0;
  return () => {
    step += 1;
    return (step * 0.6180339887) % 1;
  };
}

test('one cloud per layer count, across every layer', () => {
  const atmosphere = new Atmosphere(camera(), { random: spread() });
  const expected = CLOUD_LAYERS.reduce((total, layer) => total + layer.count, 0);
  assert.equal(atmosphere.clouds.length, expected);
  for (const layer of CLOUD_LAYERS.keys()) {
    assert.ok(atmosphere.clouds.some((cloud) => cloud.layer === layer), `layer ${layer} unused`);
  }
});

test('ground is further away higher up the screen', () => {
  const atmosphere = new Atmosphere(camera(), { random: spread() });
  const near = atmosphere.groundDistanceAt(800);
  const far = atmosphere.groundDistanceAt(0);
  assert.ok(far > near, `expected ${far} > ${near}`);
});

test('fog is one gradient fill whose haze thickens with distance', () => {
  const atmosphere = new Atmosphere(camera(), { random: spread() });
  const context = fakeContext();
  atmosphere.drawFog(context, 0);

  assert.equal(context.calls.fills, 1, 'a single fill per frame');
  assert.equal(context.calls.stops.length, FOG.samples + 1);

  const alphaAt = (index) => Number(context.calls.stops[index].color.match(/([\d.]+)\)$/)[1]);
  assert.ok(alphaAt(0) > alphaAt(FOG.samples), 'top of screen is hazier than the bottom');
  for (const stop of context.calls.stops) {
    const alpha = Number(stop.color.match(/([\d.]+)\)$/)[1]);
    assert.ok(alpha >= 0 && alpha <= FOG.maxAlpha + 1e-9, `alpha ${alpha} out of range`);
  }
});

test('fog takes its colour from the season', () => {
  const atmosphere = new Atmosphere(camera(), { random: spread() });
  for (const [index, season] of SEASONS.entries()) {
    const context = fakeContext();
    atmosphere.drawFog(context, index);
    assert.ok(context.calls.stops.every((stop) => stop.color.includes(season.haze)),
      `season ${season.name} should tint with ${season.haze}`);
  }
});

function captureClouds(atmosphere) {
  const drawn = [];
  const context = {
    globalAlpha: 1,
    drawImage: (image, x, y, w, h) => drawn.push({ x, y, w, h, alpha: context.globalAlpha }),
  };
  atmosphere.drawClouds(context);
  return { drawn, context };
}

test('clouds are drawn and alpha is restored afterwards', () => {
  const atmosphere = new Atmosphere(camera(), { random: spread() });
  const { drawn, context } = captureClouds(atmosphere);
  assert.ok(drawn.length > 0, 'something is in the sky');
  assert.ok(drawn.every((cloud) => cloud.alpha > 0 && cloud.alpha <= 1), 'sane alpha');
  assert.equal(context.globalAlpha, 1, 'alpha reset so later drawing is opaque');
});

// The point of putting clouds at altitude: a deck is nearer the camera than
// the ground it floats over, so panning slides it further across the screen
// than that same patch of ground.
test('a deck slides past faster than the ground beneath it', () => {
  const view = camera();
  // Pull back so all three decks have clouds in frame to compare.
  view.distance = 900;
  view.targetDistance = 900;
  view.refreshView();
  // A frozen clock keeps drift out of it, so the only thing that can move a
  // cloud in world space is the field wrapping round.
  const atmosphere = new Atmosphere(view, { random: spread(), now: () => 0 });

  const snapshot = () => new Map(atmosphere.placeClouds().map((placed) => [placed.cloud, placed]));
  const before = snapshot();
  view.centerOn({ x: 60, y: 0 });
  const after = snapshot();

  const byLayer = new Map();
  for (const [cloud, was] of before) {
    const now = after.get(cloud);
    // A cloud that wrapped to the far side of the field is not the same
    // journey, so it is not a fair comparison.
    if (!now || Math.hypot(now.world.x - was.world.x, now.world.y - was.world.y) > 1e-6) {
      continue;
    }
    const groundWas = view.toScreen({ x: was.world.x, y: was.world.y, z: 0 });
    view.centerOn({ x: 0, y: 0 });
    const groundBefore = view.toScreen({ x: was.world.x, y: was.world.y, z: 0 });
    view.centerOn({ x: 60, y: 0 });

    const cloudShift = Math.abs(now.screen.x - was.screen.x);
    const groundShift = Math.abs(groundWas.x - groundBefore.x);
    assert.ok(cloudShift > groundShift,
      `cloud moved ${cloudShift.toFixed(0)}px, the ground under it ${groundShift.toFixed(0)}px`);
    byLayer.set(cloud.layer, cloudShift / groundShift);
  }
  assert.ok(byLayer.size >= 2, 'needs at least two decks in view to compare');

  const levels = [...byLayer.keys()].sort((a, b) => a - b);
  assert.ok(byLayer.get(levels.at(-1)) > byLayer.get(levels[0]),
    'and the higher deck outruns the lower one by more');
});

test('a deck thins out as the camera drops onto it', () => {
  const view = camera();
  const atmosphere = new Atmosphere(view, { random: spread() });
  const high = captureClouds(atmosphere).drawn.length;

  // Drop the camera until it is among the lower decks.
  view.distance = CAMERA.minDistance;
  view.targetDistance = CAMERA.minDistance;
  view.refreshView();
  const low = captureClouds(atmosphere).drawn;
  assert.ok(low.length < high, 'the decks overhead are gone');
  assert.ok(low.every((cloud) => cloud.alpha > 0), 'whatever is left is still visible');
});

test('clouds keep drifting while the game is paused', () => {
  let clock = 0;
  const atmosphere = new Atmosphere(camera(), { random: spread(), now: () => clock });
  const before = captureClouds(atmosphere).drawn.map((cloud) => cloud.x);
  clock = 6000;
  const after = captureClouds(atmosphere).drawn.map((cloud) => cloud.x);
  assert.ok(before.some((x, index) => Math.abs(after[index] - x) > 5),
    'six seconds of sky time should visibly move the clouds');
});

test('clouds tile around the camera however far it travels', () => {
  const view = camera();
  const atmosphere = new Atmosphere(view, { random: spread() });
  for (const place of [0, 900, -1300, 40000, -40000]) {
    view.centerOn({ x: place, y: -place });
    const drawn = captureClouds(atmosphere).drawn;
    assert.ok(drawn.length > 0, `sky is empty at ${place}`);
    for (const cloud of drawn) {
      assert.ok(Number.isFinite(cloud.x) && Number.isFinite(cloud.y), 'finite position');
    }
  }
});

test('each deck drifts faster than the one below it', () => {
  const speeds = CLOUD_LAYERS.map((layer) => layer.drift);
  for (let i = 1; i < speeds.length; i += 1) {
    assert.ok(speeds[i] > speeds[i - 1], 'higher decks drift faster');
  }
  const altitudes = CLOUD_LAYERS.map((layer) => layer.altitude);
  for (let i = 1; i < altitudes.length; i += 1) {
    assert.ok(altitudes[i] > altitudes[i - 1], 'and sit higher');
  }
});

test('atmosphere is on by default', () => {
  assert.equal(settings.atmosphere, true);
});

test('settings survive storage being unavailable', () => {
  const saved = globalThis.localStorage;
  delete globalThis.localStorage;
  assert.doesNotThrow(() => loadSettings());
  assert.doesNotThrow(() => saveSettings());
  assert.equal(settings.atmosphere, true, 'defaults stand when storage is blocked');
  if (saved) {
    globalThis.localStorage = saved;
  }
});

test('settings round-trip through storage', () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
  };
  settings.atmosphere = false;
  saveSettings();
  settings.atmosphere = true;
  loadSettings();
  assert.equal(settings.atmosphere, false, 'the stored preference wins');
  settings.atmosphere = true;
  delete globalThis.localStorage;
});
