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
  const calls = { fills: 0, images: 0, stops: [], arcs: 0 };
  return {
    calls,
    globalAlpha: 1,
    fillStyle: null,
    createLinearGradient: () => ({ addColorStop: (offset, color) => calls.stops.push({ offset, color }) }),
    fillRect: () => { calls.fills += 1; },
    drawImage: () => { calls.images += 1; },
    beginPath: () => {},
    arc: () => { calls.arcs += 1; },
    fill: () => {},
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

test('one cloud per layer count, across every layer, plus its winter standbys', () => {
  const atmosphere = new Atmosphere(camera(), { random: spread() });
  const expected = CLOUD_LAYERS.reduce((total, layer) => total + layer.count + (layer.winterExtra ?? 0), 0);
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
    assert.ok(alpha >= 0 && alpha <= FOG.maxOpacity + 1e-9, `alpha ${alpha} out of range`);
  }
});

test('fog takes its colour from the season, exactly at each one\'s midpoint', () => {
  const atmosphere = new Atmosphere(camera(), { random: spread() });
  for (const [index, season] of SEASONS.entries()) {
    const context = fakeContext();
    atmosphere.drawFog(context, index + 0.5);
    assert.ok(context.calls.stops.every((stop) => stop.color.includes(season.haze)),
      `season ${season.name} should tint with ${season.haze}`);
  }
});

test('fog blends smoothly across a season turning, not in a hard cut', () => {
  const atmosphere = new Atmosphere(camera(), { random: spread() });
  const colourAt = (phase) => {
    const context = fakeContext();
    atmosphere.drawFog(context, phase);
    return context.calls.stops[0].color.match(/rgba\(([\d, ]+),/)[1].split(',').map(Number);
  };
  // Either side of a season turn (phase 1 = the Autumn/Winter boundary), the
  // haze should be close to the boundary colour, not jump between the two
  // seasons' own midpoint colours.
  const justBefore = colourAt(0.999);
  const atTheTurn = colourAt(1);
  const justAfter = colourAt(1.001);
  const jump = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
  assert.ok(jump(justBefore, atTheTurn) < 2, 'a season turning should not visibly jump the haze');
  assert.ok(jump(atTheTurn, justAfter) < 2, 'a season turning should not visibly jump the haze');
});

test('fog thickens as the camera climbs', () => {
  const low = camera();
  low.distance = CAMERA.minDistance;
  low.targetDistance = low.distance;
  low.elevation = CAMERA.minElevation;
  low.targetElevation = low.elevation;
  low.refreshView();

  const high = camera();
  high.distance = CAMERA.maxDistance;
  high.targetDistance = high.distance;
  high.elevation = CAMERA.maxElevation;
  high.targetElevation = high.elevation;
  high.refreshView();

  const alphaAtTop = (view) => {
    const atmosphere = new Atmosphere(view, { random: spread() });
    const context = fakeContext();
    atmosphere.drawFog(context, 0);
    return Number(context.calls.stops[0].color.match(/([\d.]+)\)$/)[1]);
  };
  assert.ok(alphaAtTop(high) > alphaAtTop(low), 'a higher camera should read hazier at the same screen row');
});

test('a mist\'s own floor keeps a close, zoomed-in view from clearing up', () => {
  const view = camera();
  view.distance = CAMERA.minDistance;
  view.targetDistance = view.distance;
  view.refreshView();
  const atmosphere = new Atmosphere(view, { random: spread() });

  const plain = fakeContext();
  atmosphere.drawFog(plain, 0.5);
  const plainAlphas = plain.calls.stops.map((stop) => Number(stop.color.match(/([\d.]+)\)$/)[1]));
  assert.ok(Math.min(...plainAlphas) < 0.3, 'expected an ordinary sky to read thin this close to the ground');

  const sandstorm = fakeContext();
  atmosphere.drawFog(sandstorm, 0.5, { color: '226, 194, 112', blend: 0.8, density: 2.6, start: 0.22, floor: 0.55 });
  const stormAlphas = sandstorm.calls.stops.map((stop) => Number(stop.color.match(/([\d.]+)\)$/)[1]));
  assert.ok(Math.min(...stormAlphas) >= 0.55, `expected every row to hold the floor, got ${Math.min(...stormAlphas)}`);
});

test('with no floor of its own, a mist behaves exactly as it did before', () => {
  const view = camera();
  view.distance = CAMERA.minDistance;
  view.targetDistance = view.distance;
  view.refreshView();
  const atmosphere = new Atmosphere(view, { random: spread() });
  const withoutFloor = fakeContext();
  atmosphere.drawFog(withoutFloor, 0.5, { color: '196, 214, 226', blend: 0.45, density: 1.25, start: 0.8 });
  const noFloorAlphas = withoutFloor.calls.stops.map((stop) => Number(stop.color.match(/([\d.]+)\)$/)[1]));
  assert.ok(Math.min(...noFloorAlphas) < 0.3, 'expected a mist with no floor to still thin out close to the ground');
});

function captureClouds(atmosphere, seasonPhase = 0) {
  const drawn = [];
  const context = {
    globalAlpha: 1,
    drawImage: (image, x, y, w, h) => drawn.push({ x, y, w, h, alpha: context.globalAlpha }),
  };
  atmosphere.drawClouds(context, seasonPhase);
  return { drawn, context };
}

test('winter stands more clouds up, gained gradually rather than all at once', () => {
  const WINTER = 3;
  const atmosphere = new Atmosphere(camera(), { random: spread() });
  const summerCount = captureClouds(atmosphere, 1.5).drawn.length;
  const approachingWinter = captureClouds(atmosphere, WINTER - 0.2).drawn.length;
  const deepWinter = captureClouds(atmosphere, WINTER + 0.5).drawn.length;
  assert.ok(approachingWinter > summerCount, 'more clouds should already be gathering ahead of winter');
  assert.ok(deepWinter > approachingWinter, 'winter itself should have even more than the approach to it');
});

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

test('a level\'s own wind drives the whole sky faster, not just its haze', () => {
  // Built at clock 0, then queried at a later, fixed instant: the only
  // thing that can move a cloud between the two calls below is the wind
  // multiplier itself, not time actually passing between them.
  let clock = 0;
  const atmosphere = new Atmosphere(camera(), { random: spread(), now: () => clock });
  clock = 2000;
  const calm = new Map(atmosphere.placeClouds(0, null).map((placed) => [placed.cloud, placed]));
  const storm = new Map(atmosphere.placeClouds(0, { windSpeed: 4 }).map((placed) => [placed.cloud, placed]));
  let moved = 0;
  for (const [cloud, was] of calm) {
    const now = storm.get(cloud);
    if (now && Math.abs(now.world.x - was.world.x) > 5) {
      moved += 1;
    }
  }
  assert.ok(moved > 0, 'expected a stronger wind to carry at least some clouds further along');
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

// --- falling snow ----------------------------------------------------------

test('no snow falls outside winter\'s own reach', () => {
  const atmosphere = new Atmosphere(camera(), { random: spread() });
  assert.equal(atmosphere.placeSnow(1.5).length, 0, 'expected no snow at summer\'s own midpoint');
});

test('snow gathers at winter, thickening gradually rather than all at once', () => {
  const atmosphere = new Atmosphere(camera(), { random: spread() });
  const deepWinter = atmosphere.placeSnow(3.5);
  // Close enough to winter's own midpoint (3.5) for the temperature to have
  // already dipped below freezing, but short of it -- see Season#snowCoverAt.
  const approaching = atmosphere.placeSnow(3.3);
  assert.ok(deepWinter.length > 0, 'expected snow at winter\'s own midpoint');
  assert.ok(approaching.length > 0, 'expected snow already falling on the approach to winter');
  const totalAlpha = (flakes) => flakes.reduce((sum, flake) => sum + flake.alpha, 0);
  assert.ok(totalAlpha(deepWinter) > totalAlpha(approaching),
    'expected winter\'s own midpoint to fall thicker than the approach to it');
});

test('a flake falls over time rather than standing still', () => {
  let clock = 0;
  const atmosphere = new Atmosphere(camera(), { random: spread(), now: () => clock });
  const before = atmosphere.placeSnow(3.5).map((flake) => flake.y);
  clock = 2000;
  const after = atmosphere.placeSnow(3.5).map((flake) => flake.y);
  assert.ok(before.some((y, i) => after[i] !== undefined && Math.abs(after[i] - y) > 1),
    'expected two seconds to visibly move at least some flakes');
});

test('a flake is a point near the ground, not fixed to the screen -- panning moves it a lot', () => {
  const view = camera();
  // A flake sits close over the ground (well under the lowest cloud
  // layer), so the same pan that barely shifts the ground itself should
  // swing a flake a long way across the screen -- the whole point of
  // placing snow in the world rather than painting it straight onto the
  // screen.
  const atmosphere = new Atmosphere(view, { random: spread(), now: () => 0 });
  const before = atmosphere.placeSnow(3.5);
  view.centerOn({ x: 40, y: 0 });
  const after = atmosphere.placeSnow(3.5);
  assert.ok(before.length > 0 && after.length > 0, 'expected flakes on screen before and after the pan');
  let moved = 0;
  for (let i = 0; i < Math.min(before.length, after.length); i += 1) {
    if (Math.abs(after[i].x - before[i].x) > 20) {
      moved += 1;
    }
  }
  assert.ok(moved > 0, 'expected a 40-unit pan to swing at least one nearby flake more than 20px');
});

test('a flake swells on a zoom the way anything else standing nearby does', () => {
  const view = camera();
  const atmosphere = new Atmosphere(view, { random: spread(), now: () => 0 });
  const far = atmosphere.placeSnow(3.5);
  view.distance = CAMERA.minDistance;
  view.targetDistance = CAMERA.minDistance;
  view.refreshView();
  const near = atmosphere.placeSnow(3.5);
  assert.ok(far.length > 0 && near.length > 0, 'expected flakes on screen at both distances');
  const avgSize = (flakes) => flakes.reduce((sum, flake) => sum + flake.size, 0) / flakes.length;
  assert.ok(avgSize(near) > avgSize(far), 'expected flakes to read larger once the camera has zoomed in');
});

test('snow is drawn as filled circles, and alpha is restored once it is done', () => {
  const atmosphere = new Atmosphere(camera(), { random: spread() });
  const context = fakeContext();
  atmosphere.drawSnow(context, 3.5);
  assert.ok(context.calls.arcs > 0, 'expected at least one flake drawn at winter\'s own midpoint');
  assert.equal(context.globalAlpha, 1, 'expected alpha restored for whatever draws next');
});

test('summer draws no snow at all, not even at zero alpha', () => {
  const atmosphere = new Atmosphere(camera(), { random: spread() });
  const context = fakeContext();
  atmosphere.drawSnow(context, 1.5);
  assert.equal(context.calls.arcs, 0);
});
