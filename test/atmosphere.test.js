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
const { CLOUD_LAYERS, FOG, SEASONS } = await import('../src/config.js');
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

test('one cloud per layer count, across every layer', () => {
  const atmosphere = new Atmosphere(camera(), { random: () => 0.5 });
  const expected = CLOUD_LAYERS.reduce((total, layer) => total + layer.count, 0);
  assert.equal(atmosphere.clouds.length, expected);
  for (const layer of CLOUD_LAYERS.keys()) {
    assert.ok(atmosphere.clouds.some((cloud) => cloud.layer === layer), `layer ${layer} unused`);
  }
});

test('ground is further away higher up the screen', () => {
  const atmosphere = new Atmosphere(camera(), { random: () => 0.5 });
  const near = atmosphere.groundDistanceAt(800);
  const far = atmosphere.groundDistanceAt(0);
  assert.ok(far > near, `expected ${far} > ${near}`);
});

test('fog is one gradient fill whose haze thickens with distance', () => {
  const atmosphere = new Atmosphere(camera(), { random: () => 0.5 });
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
  const atmosphere = new Atmosphere(camera(), { random: () => 0.5 });
  for (const [index, season] of SEASONS.entries()) {
    const context = fakeContext();
    atmosphere.drawFog(context, index);
    assert.ok(context.calls.stops.every((stop) => stop.color.includes(season.haze)),
      `season ${season.name} should tint with ${season.haze}`);
  }
});

test('every cloud is drawn once and alpha is restored afterwards', () => {
  const atmosphere = new Atmosphere(camera(), { random: () => 0.5 });
  const context = fakeContext();
  atmosphere.drawClouds(context);
  assert.equal(context.calls.images, atmosphere.clouds.length);
  assert.equal(context.globalAlpha, 1, 'alpha reset so later drawing is opaque');
});

test('clouds stay placed however far the camera pans or time runs', () => {
  const view = camera();
  let clock = 0;
  const atmosphere = new Atmosphere(view, { random: () => 0.5, now: () => clock });
  const positions = [];
  const original = atmosphere.sprite;
  const context = {
    globalAlpha: 1,
    drawImage: (image, x, y, w, h) => positions.push({ x, y, w, h }),
  };
  for (const pan of [-50000, -1, 0, 1, 50000]) {
    view.centerOn({ x: pan, y: -pan });
    clock += 9e6;
    atmosphere.drawClouds(context);
  }
  assert.ok(positions.length > 0);
  for (const position of positions) {
    assert.ok(Number.isFinite(position.x) && Number.isFinite(position.y), 'finite position');
    assert.ok(position.x > -position.w - 1 && position.x < view.width + position.w + 1,
      `x ${position.x} outside the wrap band`);
    assert.ok(position.y > -position.h - 1 && position.y < view.height + position.h + 1,
      `y ${position.y} outside the wrap band`);
  }
  assert.equal(atmosphere.sprite, original);
});

// Drift must come from the clock, not the game loop, or the sky freezes
// whenever the game is paused behind a menu.
test('clouds keep drifting while the game is paused', () => {
  let clock = 0;
  const atmosphere = new Atmosphere(camera(), { random: () => 0.5, now: () => clock });
  const xAt = (time) => {
    clock = time;
    const seen = [];
    atmosphere.drawClouds({ globalAlpha: 1, drawImage: (image, x) => seen.push(x) });
    return seen;
  };
  const before = xAt(0);
  const after = xAt(4000);
  assert.ok(before.some((x, index) => Math.abs(after[index] - x) > 20),
    'four seconds of sky time should visibly move the clouds');
});

test('each layer drifts faster than the one below it', () => {
  let clock = 0;
  const atmosphere = new Atmosphere(camera(), { random: () => 0.5, now: () => clock });
  const speeds = CLOUD_LAYERS.map((layer) => layer.drift);
  for (let i = 1; i < speeds.length; i += 1) {
    assert.ok(speeds[i] > speeds[i - 1], 'higher layers drift faster');
  }
  // A full screen width should take under two minutes at the fastest layer.
  const crossingSeconds = atmosphere.camera.width / speeds[speeds.length - 1];
  assert.ok(crossingSeconds < 120, `slowest crossing ${crossingSeconds.toFixed(0)}s is too sluggish`);
  assert.ok(crossingSeconds > 20, `crossing ${crossingSeconds.toFixed(0)}s would be frantic`);
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
