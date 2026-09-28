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

test('no mountain stands in the river', () => {
  const level = LEVELS[0];
  const terrain = new Terrain(1, level.land, level.river);
  const mountains = terrain.mountainsWithin(-1200, -1200, 1200, 1200);
  assert.ok(mountains.length > 0, 'expected some mountains to survive the filter');
  for (const mountain of mountains) {
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
      const x = mountain.x + Math.cos(angle) * mountain.radius;
      const y = mountain.y + Math.sin(angle) * mountain.radius;
      assert.equal(terrain.riverAt(x, y), 0,
        `a peak at ${Math.round(mountain.x)}, ${Math.round(mountain.y)} reaches the water`);
    }
  }
});

test('dropping the river back in leaves more mountains standing', () => {
  const level = LEVELS[0];
  const withWater = new Terrain(1, level.land, level.river).mountainsWithin(-1200, -1200, 1200, 1200);
  const without = new Terrain(1, level.land, null).mountainsWithin(-1200, -1200, 1200, 1200);
  assert.ok(without.length > withWater.length, 'the water should have displaced some peaks');
});

test('the first level keeps its hills lower than the default', () => {
  assert.ok(LEVELS[0].land.mountainMaxHeight < TERRAIN.mountainMaxHeight);
  const terrain = new Terrain(1, LEVELS[0].land, LEVELS[0].river);
  for (const mountain of terrain.mountainsWithin(-900, -900, 900, 900)) {
    assert.ok(mountain.height <= LEVELS[0].land.mountainMaxHeight,
      `a peak stood ${mountain.height.toFixed(0)} high`);
  }
});

test('the dust sea hangs its own mist, and the season still thickens it', async () => {
  const { seasonBlend, mixChannels } = await import('../src/season.js');
  const mist = LEVELS[1].mist;
  assert.ok(mist, 'expected the desert to carry a mist');
  assert.ok(mist.density > 1, 'and for it to be thicker than a temperate sky');

  // Its colour pulls the season's haze towards the dust, without replacing it.
  const summer = seasonBlend(3.5);
  const dusty = mixChannels(summer.haze, mist.color, mist.blend);
  assert.notEqual(dusty, summer.haze);
  const channels = dusty.split(',').map(Number);
  assert.ok(channels[0] > channels[2], 'dust should read warm, not blue');

  // Winter is still the densest month of a dusty year.
  assert.ok(seasonBlend(1.5).hazeDensity * mist.density > seasonBlend(3.5).hazeDensity * mist.density);
});

// --- level three: the island of the keep --------------------------------

test('the island is ringed by open water, and dry in the middle', () => {
  const level = LEVELS[2];
  assert.ok(level.sea, 'expected a sea');
  const terrain = new Terrain(1, level.land, null, level.sea);
  assert.equal(terrain.seaAt(0, 0), 0, 'the city stands on dry land');
  for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
    const far = level.sea.shore + level.sea.coast + level.sea.shelf + 50;
    assert.equal(terrain.seaAt(Math.cos(angle) * far, Math.sin(angle) * far), 1,
      `the water should be open at bearing ${Math.round(angle * 180 / Math.PI)}`);
  }
});

test('the coast wanders rather than being a drawn circle', () => {
  const level = LEVELS[2];
  const terrain = new Terrain(1, level.land, null, level.sea);
  const reaches = Array.from({ length: 24 }, (unused, i) => terrain.shoreAt(i / 24 * Math.PI * 2));
  const spread = Math.max(...reaches) - Math.min(...reaches);
  assert.ok(spread > level.sea.coast, `the coastline only varied by ${spread.toFixed(0)} units`);
  // And it closes: a walk right round meets where it started.
  assert.ok(Math.abs(terrain.shoreAt(0) - terrain.shoreAt(Math.PI * 2)) < 0.001, 'the coast has a seam');
});

test('the sea cuts a shelf, and nothing grows or stands on it', () => {
  const level = LEVELS[2];
  const terrain = new Terrain(1, level.land, null, level.sea);
  // The same ground, with and without the water over it: hills vary too
  // much from place to place for two different points to say anything.
  const dry = new Terrain(1, level.land, null, null);
  const offshore = { x: level.sea.shore + level.sea.coast + 120, y: 0 };
  assert.equal(terrain.seaAt(offshore.x, offshore.y), 1, 'expected open water out there');
  assert.ok(dry.heightAt(offshore.x, offshore.y) - terrain.heightAt(offshore.x, offshore.y) > 10,
    'the seabed should be cut well below the land it replaces');
  assert.equal(dry.heightAt(0, 0), terrain.heightAt(0, 0), 'and the island itself left alone');
  const reach = level.sea.shore + level.sea.coast + level.sea.shelf;
  for (const tree of terrain.treesWithin(-reach, -reach, reach, reach)) {
    assert.equal(terrain.seaAt(tree.x, tree.y), 0, `a tree grew offshore at ${tree.x}, ${tree.y}`);
  }
  for (const mountain of terrain.mountainsWithin(-reach, -reach, reach, reach)) {
    assert.ok(Math.hypot(mountain.x, mountain.y) + mountain.radius < level.sea.shore,
      'a peak waded off the island');
  }
});

test('the island lands its boats in coves all round, on dry sand', () => {
  const level = LEVELS[2];
  const terrain = new Terrain(1, level.land, null, level.sea);
  const landings = terrain.landings(level.landings.count, level.landings.inset);
  assert.equal(landings.length, level.landings.count);
  const quadrants = new Set();
  for (const landing of landings) {
    assert.ok(terrain.isAshore(landing.x, landing.y), 'a boat beached in open water');
    quadrants.add(Math.floor(((landing.bearing * 180 / Math.PI) + 360) % 360 / 90));
  }
  assert.equal(quadrants.size, 4, 'boats should land on every side of the island');
  // The same island always lands them in the same coves.
  assert.deepEqual(
    new Terrain(1, level.land, null, level.sea).landings(level.landings.count, level.landings.inset),
    landings,
  );
});

test('the third level puts its raiders ashore at the landings, from every side', () => {
  const level = LEVELS[2];
  const bearings = spawnBearings(level);
  const quadrants = new Set(bearings.map((b) => Math.floor(((b + 360) % 360) / 90)));
  assert.equal(quadrants.size, 4, 'raiders should come ashore all round');
  const terrain = new Terrain(1, level.land, null, level.sea);
  for (const bearing of bearings) {
    const radians = bearing * Math.PI / 180;
    // Every raider starts near the waterline, not out at the usual muster
    // distance and not in the middle of the island.
    const shore = terrain.shoreAt(radians);
    assert.ok(shore > 100, 'the island should have a coast at every bearing');
  }
});

test('the island raises its own castle and fields its own companies', () => {
  const game = new Game({ random: fixedRandom(), level: LEVELS[2] });
  assert.match(game.buildings.CC0.name, /Island/, 'the island should raise a keep of its own');
  assert.notEqual(game.buildings.CC0, LEVELS[0].buildings?.CC0 ?? null);
  const names = game.dispatchOptions().map((option) => option.name);
  assert.ok(names.length > 0 && names.every((name) => !name.startsWith('Imperial')),
    `the island fielded ${names.join(', ')}`);

  // And going back to a level that asks for neither gets the defaults.
  game.loadLevel(LEVELS[0]);
  assert.match(game.dispatchOptions()[0].name, /Imperial/);
  assert.equal(game.landings.length, 0, 'no boats on a landward map');
});

test('every guard a level can field is a real company with a portrait and a model', async () => {
  const { GUARD_TYPES } = await import('../src/config.js');
  const { compileUnit } = await import('../src/units.js');
  for (const level of LEVELS) {
    for (const ids of Object.values(level.guardTiers ?? {})) {
      for (const id of ids) {
        const type = GUARD_TYPES[id];
        assert.ok(type, `${level.id} fields an unknown company ${id}`);
        assert.ok(type.avatar && type.cost > 0, `${id} is missing its portrait or price`);
        // Without a formation a company is dispatched, paid for, and never
        // drawn -- which is exactly how the island's garrison first shipped.
        assert.ok(compileUnit(id), `${id} has no formation to muster`);
      }
    }
  }
});

test('no wall can be laid in the water, on either water level', () => {
  for (const level of LEVELS.filter((one) => one.river || one.sea)) {
    const game = new Game({ random: fixedRandom(), level });
    game.tokens = 100000;
    const terrain = game.terrain;

    // A run straight out into open water, and one that only clips it mid-span.
    const wet = level.sea
      ? [{ x: 200, y: 0 }, { x: 340, y: 0 }]
      : [{ x: 0, y: level.river.y - 90 }, { x: 0, y: level.river.y + 90 }];
    assert.equal(game.buildWall(wet[0], wet[1]).status, 'water', `${level.id} let a wall into the water`);
    assert.equal(game.walls.length, 0);

    // And dry ground beside the city still takes one.
    const dry = game.buildWall({ x: 70, y: -50 }, { x: 70, y: 40 });
    assert.equal(dry.status, 'built', `${level.id} refused a wall on dry ground: ${dry.status}`);
    assert.ok(terrain.isAshore(70, -50));
  }
});

test('a level with no water refuses nothing for being wet', () => {
  const dry = LEVELS.find((level) => !level.river && !level.sea);
  const game = new Game({ random: fixedRandom(), level: dry });
  game.tokens = 100000;
  assert.equal(game.entersWater({ x: -900, y: -900 }, { x: 900, y: 900 }), false);
});
