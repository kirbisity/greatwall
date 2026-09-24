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
