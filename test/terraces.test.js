import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { Terrain } from '../src/terrain.js';
import { LEVELS } from '../src/levels.js';
import { CASTLE_PLATFORM, WALL } from '../src/config.js';

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
  const summit = terrain.heightAt(0, 0);
  let last = summit;
  for (let reach = 40; reach <= hill.radius; reach += 40) {
    const here = terrain.heightAt(reach, 0);
    assert.ok(here < last, `the ground should fall away from the summit, ${here} at ${reach}`);
    last = here;
  }
  assert.equal(terrain.hillAt(hill.radius + 1, 0), 0, 'and be flat again past its foot');
  assert.ok(terrain.hillAt(0, 0) > 0);
});

test('a level with no hill has no contours, and snapping leaves it alone', () => {
  const plain = new Terrain(1, LEVELS[0].land, LEVELS[0].river);
  assert.equal(plain.contours, null);
  assert.equal(plain.contourStep, 0);
  assert.equal(plain.snapToContour(17.25), 17.25);
});

test('the hill carries four terraces, evenly spaced from its foot to its summit', () => {
  const terrain = islandTerrain();
  const contours = terrain.contours;
  assert.equal(contours.length, ISLAND.land.hill.tiers);
  assert.equal(contours.length, 4);

  const steps = contours.slice(1).map((height, i) => height - contours[i]);
  for (const step of steps) {
    assert.ok(Math.abs(step - steps[0]) < 1e-9, 'the terraces should be evenly spaced');
    assert.ok(step > 0, 'and climb');
  }
  assert.ok(Math.abs(terrain.contourStep - steps[0]) < 1e-9);
  assert.ok(
    Math.abs(contours[contours.length - 1] - terrain.heightAt(0, 0)) < 1e-9,
    'the topmost terrace is the summit itself',
  );
});

test('every terrace is reachable somewhere on the island', () => {
  const terrain = islandTerrain();
  const used = new Set();
  for (let reach = 0; reach <= 250; reach += 5) {
    for (const angle of [0, 1.6, 3.1, 4.7]) {
      const x = Math.cos(angle) * reach;
      const y = Math.sin(angle) * reach;
      if (terrain.isAshore(x, y)) {
        used.add(terrain.snapToContour(terrain.heightAt(x, y)));
      }
    }
  }
  assert.equal(used.size, terrain.contours.length,
    `only ${used.size} of ${terrain.contours.length} terraces can be reached`);
});

test('snapping takes the nearest terrace, and never invents one', () => {
  const terrain = islandTerrain();
  const contours = terrain.contours;
  for (const height of [-40, -8, 0, 5, 12, 20, 26, 60]) {
    const snapped = terrain.snapToContour(height);
    assert.ok(contours.includes(snapped), `${snapped} is not a terrace`);
    for (const other of contours) {
      assert.ok(
        Math.abs(height - snapped) <= Math.abs(height - other) + 1e-9,
        `${height} snapped to ${snapped} with ${other} nearer`,
      );
    }
  }
});

// --- walls on the terraces ----------------------------------------------

test('the island builds walls again, and has no ground-raising tool', () => {
  const game = island();
  assert.equal(ISLAND.tools, undefined, 'the build button lays wall as everywhere else');
  assert.equal(game.raiseGround, undefined, 'the ramping-earth tool is gone');
  assert.equal(game.platforms, undefined);

  const built = game.buildWall({ x: 60, y: -40 }, { x: 60, y: 40 });
  assert.equal(built.status, 'built');
  assert.equal(game.walls.length, 1);
});

test('a ring of wall stands level, at one terrace all the way round', () => {
  const game = island(1000000);
  const walls = ring(game, 90);
  assert.ok(walls.length > 6, 'expected a ring to go up');

  const tops = walls.map((wall) => {
    const midX = (wall.start.x + wall.end.x) / 2;
    const midY = (wall.start.y + wall.end.y) / 2;
    return game.terrain.snapToContour(game.terrain.heightAt(midX, midY));
  });
  const distinct = new Set(tops);
  assert.equal(distinct.size, 1, `a ring at one radius spanned ${distinct.size} terraces`);

  // The ground it is cut into is not level; the wall is.
  const grounds = walls.map((wall) => game.terrain.heightAt(wall.start.x, wall.start.y));
  assert.ok(Math.max(...grounds) - Math.min(...grounds) > 1, 'the hillside itself varies');
});

test('rings at different heights sit on different terraces', () => {
  const game = island(1000000);
  const inner = ring(game, 70);
  const outer = ring(game, 200, 14);
  const tierOf = (wall) => game.terrain.snapToContour(game.terrain.heightAt(
    (wall.start.x + wall.end.x) / 2,
    (wall.start.y + wall.end.y) / 2,
  ));
  assert.ok(inner.length > 0 && outer.length > 0);
  assert.ok(tierOf(inner[0]) > tierOf(outer[0]), 'the inner ring should stand above the outer');
});

test('a terrace wall leans on its outer face and stands sheer behind', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../src/renderer.js', import.meta.url), 'utf8');
  const body = source.slice(
    source.indexOf('function terraceWallQuads'),
    source.indexOf('function prismFrom'),
  );
  // eslint-disable-next-line no-new-func
  const terraceWallQuads = new Function(`${body}; return terraceWallQuads;`)();

  // Running east, the city to the south, so the outward side is north.
  const quads = terraceWallQuads({ x: -20, y: 0 }, { x: 20, y: 0 }, 1.5, 2.4, { x: 0, y: 1 }, [0, 0, 0, 0], 6);
  const normalOf = (a, b, c) => {
    const u = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
    const v = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z };
    const n = { x: u.y * v.z - u.z * v.y, y: u.z * v.x - u.x * v.z, z: u.x * v.y - u.y * v.x };
    const length = Math.hypot(n.x, n.y, n.z) || 1;
    return { x: n.x / length, y: n.y / length, z: n.z / length };
  };

  const [top, inner, , outer] = quads;
  assert.ok(normalOf(top[0], top[1], top[2]).z > 0.99, 'the walkway should face the sky');
  for (const point of top) {
    assert.equal(point.z, 6, 'and be flat, whatever the ground below does');
  }
  const outerNormal = normalOf(outer[0], outer[1], outer[2]);
  assert.ok(outerNormal.y > 0.5, 'the leaning face should look away from the city');
  assert.ok(outerNormal.z > 0.1, 'and lean, rather than stand straight up');
  const innerNormal = normalOf(inner[0], inner[1], inner[2]);
  assert.ok(innerNormal.y < -0.99, 'the inner face looks back at the city');
  assert.ok(Math.abs(innerNormal.z) < 1e-9, 'and is sheer');

  // The foot spreads outward past the crest, which is what a batter is.
  assert.ok(outer[0].y > outer[3].y, 'the foot should stand proud of the crest');
});

test('the terrace wall is only used where there are terraces', async () => {
  const { Renderer } = await import('../src/renderer.js');
  const renderer = Object.create(Renderer.prototype);
  renderer.gameHome = { x: 0, y: 0 };
  const wall = { start: { x: 60, y: -20 }, end: { x: 60, y: 20 } };

  const terraced = renderer.wallQuads(wall, islandTerrain(), 1.5, 6, 0, 0, { x: 0, y: 0 });
  const plainTerrain = new Terrain(1, LEVELS[0].land, LEVELS[0].river);
  const plain = renderer.wallQuads(wall, plainTerrain, 1.5, 6, 0, 0, { x: 0, y: 0 });

  // A box has a level top at the wall's own height; a terrace wall's top
  // sits on the contour instead.
  assert.equal(plain[0].every((point) => point.z === 6), true, 'a plain wall is a box on the ground');
  assert.ok(terraced[0].every((point) => point.z !== 6), 'a terrace wall stands on its contour');
});

// --- the castle terrace --------------------------------------------------

test('the keep stands on a terrace of its own, a step above the summit', () => {
  const game = island();
  const summit = game.terrain.contours[game.terrain.contours.length - 1];
  assert.equal(game.terraces.size, 1);
  const terrace = [...game.terraces.values()][0];
  assert.equal(terrace.lift, 0, 'it has not risen yet the instant the city is founded');

  for (let frame = 0; frame < 60 * (CASTLE_PLATFORM.growSeconds + 2); frame += 1) {
    game.step();
  }
  const standing = game.terrain.heightAt(0, 0);
  assert.ok(standing > summit, 'the keep should end up above the highest wall ground');
  assert.ok(
    Math.abs(standing - summit - game.terrain.contourStep * CASTLE_PLATFORM.riseInTiers) < 0.1,
    `expected one terrace above the summit, got ${(standing - summit).toFixed(2)}`,
  );
  assert.ok(terrace.zone.square, 'and it is squared off, not a mound');
});

test('growing the castle widens its terrace', () => {
  const game = island(1000000);
  const before = [...game.terraces.values()][0].zone.radius;
  game.upgradeCastleAt({ x: 0, y: 0 });
  const after = [...game.terraces.values()][0].zone.radius;
  assert.ok(after > before, `the terrace should grow with the castle, ${before} to ${after}`);
  assert.equal(after, game.castles[0].type.footprint + CASTLE_PLATFORM.margin);
});

test('levels without a hill level their ground as they always did', () => {
  const game = new Game({ random: () => 0.5, level: LEVELS[0] });
  assert.equal(game.terraces.size, 0, 'no terrace where there is no hill');
  assert.ok(game.terrain.levelled.length > 0, 'but the ground under the city is still levelled');
});

// --- what it costs to hold ----------------------------------------------

test('the island charges more to keep a wall standing', () => {
  assert.ok(ISLAND.wallUpkeep > 1, 'terraced stone should cost more to hold');
  const game = island(1000000);
  const plain = new Game({ random: () => 0.5, level: LEVELS[0] });
  plain.tokens = 1000000;
  assert.equal(plain.wallUpkeep, 1);

  ring(game, 90);
  ring(plain, 90);
  const islandBill = game.incomeBreakdown.wallUpkeep;
  const plainBill = plain.incomeBreakdown.wallUpkeep;
  assert.ok(islandBill > plainBill, `${islandBill} should exceed ${plainBill}`);
  assert.equal(islandBill / plainBill, ISLAND.wallUpkeep);
  assert.equal(game.incomeBreakdown.upkeepPerWall, WALL.upkeepPerSection * ISLAND.wallUpkeep);
});

test('a wall still bars the way, so raiders go round it as they always have', () => {
  const game = island(1000000);
  ring(game, 90);
  const navigation = game.navigation();
  assert.ok(navigation.barriers.length > 0, 'standing wall is what raiders route around');
  assert.equal(navigation.barriers.length, game.walls.filter((wall) => !wall.isPlanned).length);
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

test('unraising leaves the wild ground exactly as it was', () => {
  const terrain = islandTerrain();
  const before = terrain.heightAt(90, 0);
  terrain.raise('m', 90, 0, 9, 12, 3);
  assert.notEqual(terrain.heightAt(90, 0), before);
  terrain.unraise('m');
  assert.equal(terrain.heightAt(90, 0), before);
});
