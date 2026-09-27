import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { Terrain } from '../src/terrain.js';
import { LEVELS } from '../src/levels.js';
import { compileStructure } from '../src/structures.js';
import { JAPAN_BUILDINGS, JAPAN_HOUSE } from '../src/buildings/index.js';

const ISLAND = LEVELS.find((level) => level.land.hill);

function island(tokens = 100000) {
  let state = 7;
  const random = () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
  const game = new Game({ random, level: ISLAND });
  game.tokens = tokens;
  return game;
}

function islandTerrain() {
  return new Terrain(1, ISLAND.land, null, ISLAND.sea);
}

/** A closed ring of finished wall at a given distance from the centre. */
function ring(game, radius, sides = 10) {
  const at = (i) => ({
    x: Math.cos((i / sides) * 2 * Math.PI) * radius,
    y: Math.sin((i / sides) * 2 * Math.PI) * radius,
  });
  const laid = [];
  for (let i = 0; i < sides; i += 1) {
    const built = game.buildWall(at(i), at((i + 1) % sides));
    if (built.wall) {
      built.wall.finish();
      laid.push(built.wall);
    }
  }
  return laid;
}

// --- the hill -----------------------------------------------------------

test('the island rises to a hill at its middle', () => {
  const terrain = islandTerrain();
  const hill = ISLAND.land.hill;
  let last = terrain.heightAt(0, 0);
  for (let reach = 40; reach <= hill.radius; reach += 40) {
    const here = terrain.heightAt(reach, 0);
    assert.ok(here < last, `the ground should fall away from the summit, ${here} at ${reach}`);
    last = here;
  }
  assert.equal(terrain.hillAt(hill.radius + 1, 0), 0, 'and be flat again past its foot');
});

test('the hill is high enough to climb, and tops out where the keep stands', () => {
  const terrain = islandTerrain();
  const hill = ISLAND.land.hill;
  // Measured against the ground it actually stands in rather than a fixed
  // number, so the hill can be resized without this saying anything untrue.
  let around = 0;
  const samples = 8;
  for (let i = 0; i < samples; i += 1) {
    const bearing = (i / samples) * Math.PI * 2;
    around += terrain.heightAt(Math.cos(bearing) * hill.radius, Math.sin(bearing) * hill.radius);
  }
  const rise = terrain.heightAt(0, 0) - around / samples;
  assert.ok(rise > hill.height * 0.6, `the summit only stands ${rise.toFixed(0)} above its own foot`);

  // Exactly, not nearly: the keep is placed on the summit, so the roughness
  // on its flanks must not eat into the height the level asked for.
  assert.equal(terrain.hillAt(0, 0), hill.height);
});

test('the hill is shaped rather than a dome', () => {
  const terrain = islandTerrain();
  const hill = ISLAND.land.hill;

  // Its reach wanders with the direction, giving it spurs and hollows.
  const reaches = [];
  for (let i = 0; i < 16; i += 1) {
    const bearing = (i / 16) * Math.PI * 2;
    let reach = 0;
    while (reach < 400 && terrain.hillAt(Math.cos(bearing) * reach, Math.sin(bearing) * reach) > 0.01) {
      reach += 2;
    }
    reaches.push(reach);
  }
  assert.ok(Math.max(...reaches) - Math.min(...reaches) > 40,
    `the foot only varied by ${Math.max(...reaches) - Math.min(...reaches)} units`);

  // And no ring around it stands at one height.
  let worst = 0;
  for (let reach = 20; reach < hill.radius * 0.9; reach += 10) {
    const ring = [];
    for (let i = 0; i < 24; i += 1) {
      const bearing = (i / 24) * Math.PI * 2;
      ring.push(terrain.hillAt(Math.cos(bearing) * reach, Math.sin(bearing) * reach));
    }
    worst = Math.max(worst, Math.max(...ring) - Math.min(...ring));
  }
  assert.ok(worst > 10, `the contours are near enough circles, varying only ${worst.toFixed(1)}`);

  // The walk right round it still closes, and it meets the flat ground.
  assert.ok(Math.abs(terrain.hillAt(120, 0) - terrain.hillAt(120, -0.0001)) < 0.01);
  assert.equal(terrain.hillAt(400, 0), 0);
});

test('nothing snaps walls to fixed levels any more', () => {
  const terrain = islandTerrain();
  assert.equal(terrain.contours, undefined, 'the four fixed terraces are gone');
  assert.equal(terrain.snapToContour, undefined);
  assert.equal(terrain.contourAbove, undefined);
  assert.equal(ISLAND.land.hill.tiers, undefined, 'and the level no longer asks for tiers');
});

// --- walls ---------------------------------------------------------------

test('the island builds walls exactly as the other levels do', () => {
  for (const level of LEVELS) {
    assert.equal(level.wallStyle, undefined, `${level.id} should not ask for a wall of its own`);
    assert.equal(level.wallUpkeep, undefined, `${level.id} should not charge its own upkeep`);
  }
  const game = island(1000000);
  const plain = new Game({ random: () => 0.5, level: LEVELS[0] });
  plain.tokens = 1000000;
  ring(game, 120);
  ring(plain, 120);

  const islandBill = game.incomeBreakdown;
  const plainBill = plain.incomeBreakdown;
  assert.equal(islandBill.upkeepPerWall, plainBill.upkeepPerWall, 'a section costs the same to hold');
  assert.equal(
    islandBill.wallUpkeep / islandBill.wallCount,
    plainBill.wallUpkeep / plainBill.wallCount,
    'and the bill is the same per section',
  );
});

test('a wall still bars the way, so raiders go round it as they always have', () => {
  const game = island(1000000);
  ring(game, 120);
  const navigation = game.navigation();
  assert.ok(navigation.barriers.length > 0, 'standing wall is what raiders route around');
  assert.equal(navigation.barriers.length, game.walls.filter((wall) => !wall.isPlanned).length);
});

// --- the keep's own stonework -------------------------------------------

test('the keep carries its own stone base, and the ground is only levelled', () => {
  const game = island();
  assert.equal(game.terraces, undefined, 'no terrace is raised under the city');
  const levelled = game.terrain.levelled;
  assert.equal(levelled.length, 1, 'the city levels its ground and nothing more');
  assert.equal(levelled[0].kind, 'settlement');

  // Flattened at the ground that was already there, not lifted above it.
  const wild = game.terrain.wildHeightAt(0, 0);
  assert.ok(Math.abs(game.terrain.heightAt(0, 0) - wild) < 1e-9, 'the keep stands on the hill, not over it');
});

test('every island keep is a battered base with storeys on its crest', () => {
  for (const keep of Object.values(JAPAN_BUILDINGS)) {
    const [base, ...storeys] = keep.parts;
    assert.equal(base.type, 'batter', `${keep.name} should start with a stone base`);
    assert.ok(base.spread > 0, 'which is wider at its foot than its crest');
    assert.equal(base.material, 'ishigaki');
    assert.equal(keep.radius, base.width / 2 + base.spread, 'and the radius covers that foot');

    assert.ok(storeys.length >= 2, `${keep.name} should carry storeys`);
    assert.equal(storeys[0].base, base.height, 'the first storey sits on the crest');
    for (const storey of storeys) {
      assert.equal(storey.type, 'building');
      assert.ok(storey.width <= base.width, 'and none oversails the base');
    }
  }
});

test('the stone base really is wider at the bottom once compiled', () => {
  for (const keep of Object.values(JAPAN_BUILDINGS)) {
    const faces = compileStructure(keep);
    const reachAt = (z) => Math.max(...faces
      .flatMap((face) => face.points)
      .filter((point) => Math.abs(point.z - z) < 0.01)
      .map((point) => Math.abs(point.x)));
    const base = keep.parts[0];
    assert.ok(reachAt(0) > reachAt(base.height), `${keep.name}'s base should taper upward`);
    assert.equal(reachAt(0), base.width / 2 + base.spread);
  }
});

test('the keeps grow tier by tier, and the settlement stays smaller than them', () => {
  const tiers = Object.values(JAPAN_BUILDINGS);
  for (let i = 1; i < tiers.length; i += 1) {
    assert.ok(tiers[i].radius > tiers[i - 1].radius, 'a bigger keep has a broader base');
    assert.ok(tiers[i].parts.length >= tiers[i - 1].parts.length, 'and at least as many storeys');
  }
  assert.ok(JAPAN_HOUSE.radius < tiers[0].radius, 'the settlement buildings are smaller than the keep');
});

test('the island fields castles of its own size, not the imperial city\'s', () => {
  const game = island();
  const plain = new Game({ random: () => 0.5, level: LEVELS[0] });
  for (const id of Object.keys(JAPAN_BUILDINGS)) {
    assert.ok(
      game.castleTypes[id].footprint < plain.castleTypes[id].footprint,
      `${id} should claim less ground on the island`,
    );
    assert.ok(
      game.castleTypes[id].footprint >= JAPAN_BUILDINGS[id].radius,
      `${id}'s footprint should at least cover the keep standing on it`,
    );
    assert.equal(game.castleTypes[id].cost, plain.castleTypes[id].cost, 'prices are unchanged');
  }
});

test('growing the castle keeps the ground levelled under the new footprint', () => {
  const game = island(1000000);
  const before = game.terrain.levelled[0].radius;
  game.upgradeCastleAt({ x: 0, y: 0 });
  const after = game.terrain.levelled[0].radius;
  assert.ok(after > before, `the levelled ground should widen with the castle, ${before} to ${after}`);
  assert.equal(after, game.castles[0].type.footprint);
});

// --- the ground underneath ----------------------------------------------

test('the zone index answers exactly what a full scan would', () => {
  const terrain = islandTerrain();
  for (let i = 0; i < 200; i += 1) {
    terrain.raise(`z${i}`, (i % 20) * 18 - 180, Math.floor(i / 20) * 18 - 90, 9, 3, 9);
  }
  const scanned = islandTerrain();
  scanned.levelled = terrain.levelled.slice();
  scanned.zonesNear = function all() { return this.levelled; };

  let worst = 0;
  for (let i = 0; i < 2000; i += 1) {
    const x = (i * 13) % 500 - 250;
    const y = (i * 29) % 500 - 250;
    worst = Math.max(worst, Math.abs(terrain.heightAt(x, y) - scanned.heightAt(x, y)));
  }
  assert.equal(worst, 0, 'the bucketed lookup must be exact, not merely close');
});

// --- what stands over the keep ------------------------------------------

test('the flag and the health bar are pinned to the roof, not the ground', async () => {
  const { Renderer } = await import('../src/renderer.js');
  const renderer = Object.create(Renderer.prototype);
  renderer.structures = new Map();

  for (const definition of Object.values(JAPAN_BUILDINGS)) {
    const { height } = renderer.structureFor(definition);
    let tallest = 0;
    for (const face of compileStructure(definition)) {
      if (face.ground) {
        continue;
      }
      for (const point of face.points) {
        tallest = Math.max(tallest, point.z);
      }
    }
    assert.equal(height, tallest, `${definition.name} should report its real height`);
    assert.ok(height > definition.radius, 'a keep is taller than it is wide, so a radius is no stand-in');
  }
});

test('a keep on the hill hangs its bar far above sea level', () => {
  const game = island();
  const keep = game.castles[0];
  const ground = game.terrain.heightAt(keep.position.x, keep.position.y);
  assert.ok(ground > 20, `the keep should stand well up the hill, it is at ${ground.toFixed(0)}`);
  // The anchor is ground plus roof, so it can never come out at zero the way
  // the old fixed z=0 anchor did wherever the city happened to stand.
  assert.ok(ground + JAPAN_BUILDINGS[keep.typeId].radius > 0);
});

// --- the wall's section --------------------------------------------------

test('the island wall is a trapezoid, and no other level changes shape', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../src/renderer.js', import.meta.url), 'utf8');
  const body = source.slice(
    source.indexOf('function taperedWallQuads'),
    source.indexOf('function squarePrism'),
  );
  // eslint-disable-next-line no-new-func
  const taperedWallQuads = new Function(`${body}; return taperedWallQuads;`)();

  assert.equal(ISLAND.wallShape, 'tapered');
  for (const level of LEVELS) {
    if (level !== ISLAND) {
      assert.equal(level.wallShape, undefined, `${level.id} should keep the squared wall`);
    }
  }

  const halfWidth = 1.5;
  const spread = 1.35;
  const quads = taperedWallQuads({ x: -20, y: 0 }, { x: 20, y: 0 }, halfWidth, spread, 6, [0, 0, 0, 0]);
  const [top, southSide, eastEnd, northSide] = quads;

  const normalOf = (a, b, c) => {
    const u = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
    const v = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z };
    const n = { x: u.y * v.z - u.z * v.y, y: u.z * v.x - u.x * v.z, z: u.x * v.y - u.y * v.x };
    const length = Math.hypot(n.x, n.y, n.z) || 1;
    return { x: n.x / length, y: n.y / length, z: n.z / length };
  };

  assert.ok(normalOf(top[0], top[1], top[2]).z > 0.99, 'the crest faces the sky');
  for (const point of top) {
    assert.equal(Math.abs(point.y), halfWidth, 'and is the narrow face');
  }
  // Both long sides lean outward and down; the ends stay square so two
  // sections still meet cleanly at a junction.
  for (const side of [southSide, northSide]) {
    const normal = normalOf(side[0], side[1], side[2]);
    assert.ok(normal.z > 0.1, 'a long side should lean');
    assert.ok(Math.abs(normal.x) < 1e-9, 'and face across the run, not along it');
    assert.equal(Math.abs(side[0].y), halfWidth + spread, 'with its foot spread');
  }
  assert.ok(Math.abs(normalOf(eastEnd[0], eastEnd[1], eastEnd[2]).x) > 0.99, 'the ends stay square');
});
