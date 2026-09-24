import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { Terrain } from '../src/terrain.js';
import { LEVELS, levelAt } from '../src/levels.js';
import { TERRAIN } from '../src/config.js';

function fixedRandom(value = 0.5) {
  return () => value;
}

/** Bearings, in degrees, of where a level musters its raiders. */
function spawnBearings(level, count = 300) {
  let state = 7;
  const random = () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
  const game = new Game({ random, level });
  return Array.from({ length: count }, () => {
    const point = game.spawnPoint({ x: 0, y: 0 });
    return Math.atan2(point.y, point.x) * 180 / Math.PI;
  });
}

test('every level is a complete, distinct config', () => {
  assert.ok(LEVELS.length >= 2, 'expected at least two levels to choose between');
  const ids = new Set();
  for (const level of LEVELS) {
    assert.ok(level.id && level.name && level.blurb, `level ${level.id} is missing its labels`);
    assert.ok(!ids.has(level.id), `duplicate level id ${level.id}`);
    ids.add(level.id);
  }
});

test('levelAt holds inside the campaign whatever it is asked for', () => {
  assert.equal(levelAt(0), LEVELS[0]);
  assert.equal(levelAt(-5), LEVELS[0]);
  assert.equal(levelAt(999), LEVELS[LEVELS.length - 1]);
});

// --- level one: the northern march -------------------------------------

test('the first level musters raiders along the northern skyline only', () => {
  const bearings = spawnBearings(LEVELS[0]);
  // North is +y, which is 90 degrees.
  for (const bearing of bearings) {
    assert.ok(bearing > 20 && bearing < 160, `a raider rode in from bearing ${bearing.toFixed(0)}`);
  }
});

test('the first level lays a river across the south', () => {
  const level = LEVELS[0];
  assert.ok(level.river, 'expected a river');
  const terrain = new Terrain(1, level.land, level.river);
  assert.ok(level.river.y < 0, 'the river should lie south of the city');

  // Water mid-channel, dry ground well clear of it.
  assert.ok(terrain.riverAt(0, level.river.y) > 0.5, 'the centre line should be open water');
  assert.equal(terrain.riverAt(0, level.river.y + 400), 0, 'ground well north of it is dry');
});

test('the river cuts a channel and carries no woodland', () => {
  const level = LEVELS[0];
  const wet = new Terrain(1, level.land, level.river);
  const dry = new Terrain(1, level.land, null);
  const centre = { x: 0, y: level.river.y };
  assert.ok(dry.heightAt(centre.x, centre.y) - wet.heightAt(centre.x, centre.y) > 5,
    'the channel should sit well below the ground it cuts through');

  const trees = wet.treesWithin(-200, level.river.y - 10, 200, level.river.y + 10);
  for (const tree of trees) {
    assert.equal(wet.riverAt(tree.x, tree.y), 0, `a tree grew in the water at ${tree.x}, ${tree.y}`);
  }
});

test('the river is offered to companies as ground to route around', () => {
  const level = LEVELS[0];
  const terrain = new Terrain(1, level.land, level.river);
  const circles = terrain.riverCirclesWithin(-300, 300);
  assert.ok(circles.length > 3, 'expected the channel to be covered by several circles');
  for (const circle of circles) {
    assert.ok(circle.radius > 0);
    assert.ok(terrain.riverAt(circle.x, circle.y) > 0.5, 'each circle should sit on the water');
  }
});

// --- level two: the dust sea -------------------------------------------

test('the second level comes at the city from every side, as the game always has', () => {
  const bearings = spawnBearings(LEVELS[1]);
  const north = bearings.filter((b) => b > 20 && b < 160).length;
  const south = bearings.filter((b) => b < -20 && b > -160).length;
  assert.ok(north > 30 && south > 30, `expected raiders all round, saw ${north} north and ${south} south`);
});

test('the desert has its own ground, and nothing grows on it', () => {
  const desert = new Terrain(1, LEVELS[1].land, null);
  const green = new Terrain(1, LEVELS[0].land, null);
  assert.notEqual(desert.land.grassColor, green.land.grassColor, 'the desert should not be green');
  assert.equal(desert.treesWithin(-600, -600, 600, 600).length, 0, 'nothing grows in the dust sea');
  assert.ok(green.treesWithin(-600, -600, 600, 600).length > 0, 'the green land still has its woods');
});

test('the desert does not turn gold in autumn', () => {
  const desert = new Terrain(1, LEVELS[1].land, null);
  for (let x = -300; x < 300; x += 37) {
    assert.deepEqual(
      desert.groundTintAt(x, x * 0.7, [0, 0, 0], 1),
      desert.groundTintAt(x, x * 0.7, [0, 0, 0], 0),
      `sand turned at ${x}`,
    );
  }
});

test('the desert is shaped differently from the green land', () => {
  const desert = new Terrain(1, LEVELS[1].land, null);
  const green = new Terrain(1, LEVELS[0].land, null);
  let differs = 0;
  for (let x = -400; x < 400; x += 29) {
    if (Math.abs(desert.heightAt(x, 120) - green.heightAt(x, 120)) > 1) {
      differs += 1;
    }
  }
  assert.ok(differs > 20, 'dunes should not follow the same ground as the hills');
});

// --- switching between them --------------------------------------------

test('loading a level rebuilds the ground and starts it over', () => {
  const game = new Game({ random: fixedRandom(), level: LEVELS[0] });
  game.tokens = 5000;
  game.buildWall({ x: 60, y: -45 }, { x: 60, y: 45 });
  assert.ok(game.walls.length > 0, 'a wall to lose');
  const greenGround = game.terrain.land.grassColor;

  game.loadLevel(LEVELS[1]);
  assert.equal(game.level, LEVELS[1]);
  assert.equal(game.walls.length, 0, 'the new level starts clean');
  assert.notEqual(game.terrain.land.grassColor, greenGround, 'and on its own ground');
  assert.ok(!game.terrain.river, 'the dust sea has no river');
});

test('a level that asks for nothing gets the defaults', () => {
  const plain = new Terrain(1, {}, null);
  assert.equal(plain.land.grassColor, TERRAIN.grassColor);
  assert.equal(plain.land.hillHeight, TERRAIN.hillHeight);
});
