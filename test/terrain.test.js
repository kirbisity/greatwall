import test from 'node:test';
import assert from 'node:assert/strict';

const { Terrain } = await import('../src/terrain.js');
const { TERRAIN } = await import('../src/config.js');

function channels(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

const BANDS = [TERRAIN.grassColor, TERRAIN.mossColor, TERRAIN.dirtColor, TERRAIN.rockColor].map(channels);

/** Which band a mottled colour was drawn from, or -1 if it matches none. */
function bandOf(hex) {
  const color = channels(hex);
  return BANDS.findIndex((band) => band.every((c, i) => Math.abs(color[i] - c) <= c * TERRAIN.mottleStrength + 1));
}

test('ground colour stays within a mottle of one of the four configured bands', () => {
  const terrain = new Terrain(1);
  for (let x = 0; x < 2000; x += 37) {
    assert.ok(bandOf(terrain.groundColorAt(x, x * 1.3)) >= 0, `unexpected colour at ${x}`);
  }
});

test('all four bands turn up across a wide enough patch', () => {
  const terrain = new Terrain(1);
  const seen = new Set();
  for (let x = 0; x < 4000; x += 53) {
    for (let y = 0; y < 4000; y += 53) {
      seen.add(bandOf(terrain.groundColorAt(x, y)));
    }
  }
  assert.equal(seen.size, BANDS.length, `expected all ${BANDS.length} bands, saw ${seen.size}`);
});

test('ground colour is stable for the same spot and seed', () => {
  const terrain = new Terrain(5);
  const first = terrain.groundColorAt(123, 456);
  const second = terrain.groundColorAt(123, 456);
  assert.equal(first, second);
});

test('ground reads as patches, not one flat colour', () => {
  const terrain = new Terrain(1);
  const seen = new Set();
  for (let x = 0; x < 4000; x += 53) {
    for (let y = 0; y < 4000; y += 53) {
      seen.add(terrain.groundColorAt(x, y));
    }
  }
  assert.ok(seen.size > 1, 'expected more than one ground colour across the map');
});

test('a different seed grows a different patchwork', () => {
  const a = new Terrain(1);
  const b = new Terrain(2);
  let differs = false;
  for (let x = 0; x < 2000 && !differs; x += 31) {
    if (a.groundColorAt(x, x * 0.7) !== b.groundColorAt(x, x * 0.7)) {
      differs = true;
    }
  }
  assert.ok(differs, 'expected the two seeds to disagree somewhere');
});

test('there are a few mountains, not none and not a range', () => {
  const terrain = new Terrain(1);
  const mountains = terrain.mountainsWithin(-1000, -1000, 1000, 1000);
  assert.ok(mountains.length > 0, 'expected at least one mountain in a 2000x2000 span');
  assert.ok(mountains.length < 60, `expected a handful, not ${mountains.length} -- that reads as a mountain range`);
});

test('mountainsWithin is stable for the same span and seed', () => {
  const terrain = new Terrain(3);
  const first = terrain.mountainsWithin(0, 0, 1500, 1500);
  const second = terrain.mountainsWithin(0, 0, 1500, 1500);
  assert.deepEqual(first, second);
});

test('a mountain peak stands well above the rolling hills around it', () => {
  const terrain = new Terrain(1);
  const [mountain] = terrain.mountainsWithin(-1000, -1000, 1000, 1000);
  const peakHeight = terrain.wildHeightAt(mountain.x, mountain.y);
  const farHeight = terrain.wildHeightAt(mountain.x + 5000, mountain.y);
  assert.ok(peakHeight > farHeight + TERRAIN.mountainMinHeight - 5,
    `expected the peak (${peakHeight.toFixed(1)}) to clear ordinary ground (${farHeight.toFixed(1)}) by a mountain's worth`);
});

test('height eases back to the ordinary ground past a mountain\'s reach', () => {
  const terrain = new Terrain(1);
  const [mountain] = terrain.mountainsWithin(-1000, -1000, 1000, 1000);
  const farAway = { x: mountain.x + 3000, y: mountain.y };
  const atDistance = terrain.wildHeightAt(farAway.x, farAway.y);
  const bareGround = terrain.wildHeightAt(farAway.x + 1, farAway.y);
  assert.ok(Math.abs(atDistance - bareGround) < 5, 'well clear of any peak, height should read as ordinary hills');
});

test('the ground reads as bare rock on a mountain\'s slope', () => {
  const terrain = new Terrain(1);
  const [mountain] = terrain.mountainsWithin(-1000, -1000, 1000, 1000);
  const ROCK_BAND = BANDS.length - 1;
  assert.equal(bandOf(terrain.groundColorAt(mountain.x, mountain.y)), ROCK_BAND);
});

test('trees only stand where the ground band is grass', () => {
  const terrain = new Terrain(1);
  const trees = terrain.treesWithin(-1500, -1500, 1500, 1500);
  assert.ok(trees.length > 0, 'expected some trees over a span this size');
  for (const tree of trees) {
    assert.equal(terrain.groundBandAt(tree.x, tree.y), TERRAIN.grassColor,
      `a tree grew on a non-grass band at (${tree.x}, ${tree.y})`);
  }
});

test('no tree grows on a mountain\'s slope, even where the band beneath is grass', () => {
  const terrain = new Terrain(1);
  const [mountain] = terrain.mountainsWithin(-1000, -1000, 1000, 1000);
  const trees = terrain.treesWithin(
    mountain.x - mountain.radius, mountain.y - mountain.radius,
    mountain.x + mountain.radius, mountain.y + mountain.radius,
  );
  for (const tree of trees) {
    const dist = Math.hypot(tree.x - mountain.x, tree.y - mountain.y);
    assert.ok(dist >= mountain.radius * 0.5, `a tree grew practically on the peak at distance ${dist.toFixed(1)}`);
  }
});

test('groundTintAt and groundColorAt describe the same colour', () => {
  const terrain = new Terrain(1);
  for (let x = -600; x < 600; x += 37) {
    const y = x * 0.6;
    const tint = terrain.groundTintAt(x, y);
    const hex = terrain.groundColorAt(x, y);
    assert.deepEqual(tint, channels(hex), `mismatch at ${x}, ${y}`);
  }
});

test('groundTintAt fills an array it is handed rather than making one', () => {
  const terrain = new Terrain(1);
  const scratch = [0, 0, 0];
  const returned = terrain.groundTintAt(120, -80, scratch);
  assert.equal(returned, scratch, 'should hand back the very array it was given');
  assert.deepEqual(scratch, terrain.groundTintAt(120, -80));
});

test('the mountain cache answers the same as working it out afresh', () => {
  const cached = new Terrain(1);
  for (let x = -900; x < 900; x += 97) {
    for (let y = -900; y < 900; y += 97) {
      // A terrain with an empty cache has to derive the neighbourhood; one
      // that has been walked over already reads it back. Both must agree.
      const fresh = new Terrain(1);
      assert.equal(cached.heightAt(x, y), fresh.heightAt(x, y), `height at ${x}, ${y}`);
      assert.equal(cached.groundColorAt(x, y), fresh.groundColorAt(x, y), `colour at ${x}, ${y}`);
    }
  }
});
