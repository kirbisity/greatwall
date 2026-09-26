import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { Terrain } from '../src/terrain.js';
import { LEVELS } from '../src/levels.js';
import { WALL, WALL_HEIGHT_UNITS } from '../src/config.js';
import { compileStructure } from '../src/structures.js';
import { JAPAN_BUILDINGS, JAPAN_HOUSE } from '../src/buildings/index.js';
import { Renderer } from '../src/renderer.js';

/** The renderer's geometry needs none of its canvases, only its methods. */
function wallShapes() {
  return Object.create(Renderer.prototype);
}

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

function normalOf(a, b, c) {
  const u = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const v = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z };
  const n = { x: u.y * v.z - u.z * v.y, y: u.z * v.x - u.x * v.z, z: u.x * v.y - u.y * v.x };
  const length = Math.hypot(n.x, n.y, n.z) || 1;
  return { x: n.x / length, y: n.y / length, z: n.z / length };
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

test('the hill is high enough to climb, and the keep sits on the ground of it', () => {
  const terrain = islandTerrain();
  const hill = ISLAND.land.hill;
  assert.ok(hill.height > 50, `expected a tall hill, got ${hill.height}`);
  assert.ok(
    terrain.hillAt(0, 0) - terrain.hillAt(hill.radius * 0.75, 0) > 30,
    'it should climb sharply enough to be worth walling in stages',
  );
});

test('nothing snaps walls to fixed levels any more', () => {
  const terrain = islandTerrain();
  assert.equal(terrain.contours, undefined, 'the four fixed terraces are gone');
  assert.equal(terrain.snapToContour, undefined);
  assert.equal(terrain.contourAbove, undefined);
  assert.equal(ISLAND.land.hill.tiers, undefined, 'and the level no longer asks for tiers');
});

// --- walls ---------------------------------------------------------------

test('a wall follows the ground it is built on', () => {
  const game = island(1000000);
  const walls = ring(game, 120);
  assert.ok(walls.length > 6, 'expected a ring to go up');

  const grounds = walls.map((wall) => game.terrain.heightAt(wall.start.x, wall.start.y));
  assert.ok(Math.max(...grounds) - Math.min(...grounds) > 1, 'the hillside itself varies');

  // Every section's crest is its own ground plus the wall's height, rather
  // than a level shared with the rest of the ring.
  const renderer = wallShapes();
  const crests = walls.map((wall) => {
    const startGround = game.terrain.heightAt(wall.start.x, wall.start.y);
    const endGround = game.terrain.heightAt(wall.end.x, wall.end.y);
    const quads = renderer.wallQuads(wall, {
      halfWidth: 1.5, height: WALL_HEIGHT_UNITS, startGround, endGround,
      battered: true, home: { x: 0, y: 0 },
    });
    return { top: quads[0][0].z, ground: startGround };
  });
  for (const { top, ground } of crests) {
    assert.ok(
      Math.abs(top - ground - WALL_HEIGHT_UNITS) < 1e-9,
      `a crest should stand one wall above its own ground, got ${(top - ground).toFixed(2)}`,
    );
  }
  assert.ok(new Set(crests.map((one) => one.top.toFixed(3))).size > 1, 'so the ring is not level');
});

test('the island wall leans on its outer face and stands sheer behind', () => {
  const renderer = wallShapes();
  // Running east, the city to the south, so the outward side is north.
  const wall = { start: { x: -20, y: 40 }, end: { x: 20, y: 40 } };
  const quads = renderer.wallQuads(wall, {
    halfWidth: 1.5, height: 6, startGround: 0, endGround: 0,
    battered: true, home: { x: 0, y: 0 },
  });
  const [top, inner, , outer] = quads;

  assert.ok(normalOf(top[0], top[1], top[2]).z > 0.99, 'the walkway faces the sky');
  const outerNormal = normalOf(outer[0], outer[1], outer[2]);
  assert.ok(outerNormal.y > 0.5, 'the leaning face looks away from the city');
  assert.ok(outerNormal.z > 0.1, 'and leans, rather than standing straight up');
  const innerNormal = normalOf(inner[0], inner[1], inner[2]);
  assert.ok(innerNormal.y < -0.99, 'the inner face looks back at the city');
  assert.ok(Math.abs(innerNormal.z) < 1e-9, 'and is sheer');
  assert.ok(outer[0].y > outer[3].y, 'the foot stands proud of the crest');
});

test('only a level that asks for it gets the battered wall', () => {
  const renderer = wallShapes();
  const wall = { start: { x: 60, y: -20 }, end: { x: 60, y: 20 } };
  const options = { halfWidth: 1.5, height: 6, startGround: 0, endGround: 0, home: { x: 0, y: 0 } };
  const plain = renderer.wallQuads(wall, { ...options, battered: false });
  const battered = renderer.wallQuads(wall, { ...options, battered: true });

  assert.equal(ISLAND.wallStyle, 'battered');
  for (const level of LEVELS) {
    if (level !== ISLAND) {
      assert.equal(level.wallStyle, undefined, `${level.id} should keep the plain wall`);
    }
  }
  // A box has the same footprint top and bottom; a battered one does not.
  const spread = (quads) => Math.max(...quads.flat().map((point) => Math.abs(point.x - 60)));
  assert.ok(spread(battered) > spread(plain), 'the battered wall spreads at its foot');
});

test('a wall still bars the way, so raiders go round it as they always have', () => {
  const game = island(1000000);
  ring(game, 120);
  const navigation = game.navigation();
  assert.ok(navigation.barriers.length > 0, 'standing wall is what raiders route around');
  assert.equal(navigation.barriers.length, game.walls.filter((wall) => !wall.isPlanned).length);
});

test('the island charges more to keep a wall standing', () => {
  assert.ok(ISLAND.wallUpkeep > 1, 'revetted stone should cost more to hold');
  const game = island(1000000);
  const plain = new Game({ random: () => 0.5, level: LEVELS[0] });
  plain.tokens = 1000000;
  assert.equal(plain.wallUpkeep, 1);

  ring(game, 120);
  ring(plain, 120);
  const islandBill = game.incomeBreakdown.wallUpkeep;
  const plainBill = plain.incomeBreakdown.wallUpkeep;
  assert.equal(islandBill / plainBill, ISLAND.wallUpkeep);
  assert.equal(game.incomeBreakdown.upkeepPerWall, WALL.upkeepPerSection * ISLAND.wallUpkeep);
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
