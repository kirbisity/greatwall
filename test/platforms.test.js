import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { Terrain } from '../src/terrain.js';
import { LEVELS } from '../src/levels.js';
import { PLATFORM } from '../src/config.js';

const ISLAND = LEVELS.find((level) => level.tools?.build === 'raise');

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

/** Run a game until every platform has finished climbing. */
function settle(game) {
  for (let frame = 0; frame < 60 * PLATFORM.growSeconds * PLATFORM.maxSteps + 120; frame += 1) {
    game.step();
  }
}

test('the island is the level that raises ground instead of laying wall', () => {
  assert.ok(ISLAND, 'expected a level whose build tool raises ground');
  for (const level of LEVELS) {
    if (level !== ISLAND) {
      assert.ok(!level.tools, `${level.id} should still build walls`);
    }
  }
});

test('raising snaps to a grid, so the same square grows one platform', () => {
  const game = island();
  const first = game.raiseGround({ x: 91, y: 4 });
  const again = game.raiseGround({ x: 98, y: 11 });
  assert.equal(game.platforms.size, 1, 'two orders in one square should be one platform');
  assert.equal(first.platform, again.platform);
  assert.equal(again.platform.steps, 2);

  // And a neighbouring square is its own platform.
  game.raiseGround({ x: 91 + PLATFORM.size, y: 4 });
  assert.equal(game.platforms.size, 2);
});

test('ground climbs over seconds rather than jumping, and stops where paid for', () => {
  const game = island();
  const { platform } = game.raiseGround({ x: 91, y: 4 });
  assert.equal(platform.lift, 0, 'nothing has risen the instant it is ordered');

  for (let frame = 0; frame < 60 * PLATFORM.growSeconds / 2; frame += 1) {
    game.step();
  }
  const halfway = platform.lift;
  assert.ok(halfway > 0 && halfway < PLATFORM.step, `half a step in, expected part-risen, got ${halfway}`);

  settle(game);
  assert.ok(Math.abs(platform.lift - PLATFORM.step) < 1e-9, 'one order buys exactly one step');
  assert.ok(
    Math.abs(game.terrain.liftAt(platform.x, platform.y) - PLATFORM.step) < 0.01,
    'and the ground under it actually stands that high',
  );
});

test('a platform tops out, and every step costs more than the last', () => {
  const game = island(1000000);
  const costs = [];
  for (let order = 0; order < PLATFORM.maxSteps; order += 1) {
    costs.push(game.platformCost(order));
    assert.equal(game.raiseGround({ x: 91, y: 4 }).status, 'raising');
  }
  assert.equal(game.raiseGround({ x: 91, y: 4 }).status, 'highest');
  for (let i = 1; i < costs.length; i += 1) {
    assert.ok(costs[i] > costs[i - 1], `step ${i} should cost more than step ${i - 1}`);
  }
});

test('nothing is raised out of the sea, or without the money', () => {
  const game = island(0);
  assert.equal(game.raiseGround({ x: 400, y: 0 }).status, 'water');
  assert.equal(game.raiseGround({ x: 91, y: 4 }).status, 'poor');
  assert.equal(game.platforms.size, 0, 'a refused order leaves no platform behind');

  game.tokens = 100000;
  assert.equal(game.raiseGround({ x: 91, y: 4 }).status, 'raising');
});

test('the square under the cursor says whether it could be raised', () => {
  const game = island();
  const open = game.squareUnder({ x: 91, y: 4 });
  assert.equal(open.steps, 0);
  assert.ok(open.allowed);
  // It names the square, not the point asked about.
  assert.equal(open.x % PLATFORM.size, PLATFORM.size / 2);

  game.raiseGround({ x: 91, y: 4 });
  assert.equal(game.squareUnder({ x: 91, y: 4 }).steps, 1, 'the outline follows what has been ordered');
  assert.equal(game.squareUnder({ x: 400, y: 0 }).allowed, false, 'the sea is never allowed');
});

test('the face of a platform is a climb for raiders, and the top is not', () => {
  const game = island(1000000);
  // Sampled at the square's own centre, since woodland drag varies from
  // point to point and would otherwise be what the comparison measured.
  const centre = game.squareUnder({ x: 91, y: 4 });
  const flat = game.paceOn(centre, { avoidsWalls: true });
  for (let order = 0; order < PLATFORM.maxSteps; order += 1) {
    game.raiseGround({ x: 91, y: 4 });
  }
  settle(game);
  const platform = [...game.platforms.values()][0];
  const half = PLATFORM.size / 2;

  const top = { x: platform.x, y: platform.y };
  const face = { x: platform.x + half + 1, y: platform.y };
  assert.equal(game.paceOn(top, { avoidsWalls: true }), flat, 'the top of a platform is flat ground');

  // Measured against the same point as the garrison crosses it, since
  // woodland drag varies from point to point and is not what this is about.
  const walked = game.paceOn(face, { avoidsWalls: false });
  const climbed = game.paceOn(face, { avoidsWalls: true });
  assert.ok(climbed < walked * 0.5, `the face should be a crawl, got ${(climbed / walked).toFixed(2)} of pace`);
  assert.ok(
    Math.abs(climbed / walked - PLATFORM.climbPace) < 1e-9,
    'and a crawl of exactly the pace the config asks for',
  );
});

test('a platform too low to be a climb takes no toll at all', () => {
  const game = island(1000000);
  game.raiseGround({ x: 91, y: 4 });
  settle(game);
  const platform = [...game.platforms.values()][0];
  assert.ok(platform.lift < PLATFORM.climbFrom, 'one step is a kerb, not a climb');
  const face = { x: platform.x + PLATFORM.size / 2 + 1, y: platform.y };
  assert.equal(game.paceOn(face, { avoidsWalls: true }), game.paceOn(face, { avoidsWalls: false }));
});

test('a raider climbing onto a platform loses a third of its health, once', () => {
  const game = island(1000000);
  for (let order = 0; order < PLATFORM.maxSteps; order += 1) {
    game.raiseGround({ x: 91, y: 4 });
  }
  settle(game);
  const platform = [...game.platforms.values()][0];

  game.raiders.length = 0;
  game.spawnRaider();
  const raider = game.raiders[0];
  const full = raider.type.maxHealth;
  raider.health = full;

  // Off the platform to begin with, so arriving on it is a climb.
  raider.position.x = platform.x + PLATFORM.size;
  raider.position.y = platform.y;
  game.chargeClimbs();
  assert.equal(raider.health, full, 'standing beside one costs nothing');

  raider.position.x = platform.x;
  game.chargeClimbs();
  assert.ok(
    Math.abs(raider.health - full * (1 - PLATFORM.climbToll)) < 1e-9,
    `expected a third off, got ${raider.health} of ${full}`,
  );

  // Walking about on top is not another climb.
  raider.position.y = platform.y + 4;
  game.chargeClimbs();
  assert.ok(Math.abs(raider.health - full * (1 - PLATFORM.climbToll)) < 1e-9, 'the toll is charged once');
});

test('the garrison climbs its own platforms for nothing', () => {
  const game = island(1000000);
  for (let order = 0; order < PLATFORM.maxSteps; order += 1) {
    game.raiseGround({ x: 91, y: 4 });
  }
  settle(game);
  const platform = [...game.platforms.values()][0];
  game.sendGuard(game.dispatchOptions()[0].id, { x: platform.x, y: platform.y });
  const guard = game.guards[0];
  const full = guard.health;
  guard.position.x = platform.x;
  guard.position.y = platform.y;
  game.chargeClimbs();
  assert.equal(guard.health, full, 'only raiders pay the toll');
});

test('a level that raises nothing pays nothing for the check', () => {
  const plain = new Game({ random: () => 0.5, level: LEVELS[0] });
  assert.equal(plain.platforms.size, 0);
  assert.equal(plain.paceOn({ x: 40, y: 40 }), plain.paceOn({ x: 40, y: 40 }));
});

// --- the terrain underneath ---------------------------------------------

test('the zone index answers exactly what a full scan would', () => {
  const terrain = new Terrain(1, ISLAND.land, null, ISLAND.sea);
  for (let i = 0; i < 200; i += 1) {
    terrain.raise(`z${i}`, (i % 20) * 18 - 180, Math.floor(i / 20) * 18 - 90, 9, 3, 9);
  }
  const scanned = new Terrain(1, ISLAND.land, null, ISLAND.sea);
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

test('a platform keeps its slope to itself', () => {
  const terrain = new Terrain(1, ISLAND.land, null, ISLAND.sea);
  terrain.raise('m', 90, 0, PLATFORM.size / 2, PLATFORM.step * PLATFORM.maxSteps, PLATFORM.skirt);
  const reach = PLATFORM.size / 2 + PLATFORM.skirt;
  assert.ok(terrain.liftAt(90, 0) > PLATFORM.step * PLATFORM.maxSteps - 0.01, 'full height on top');
  assert.equal(terrain.liftAt(90 + reach + 1, 0), 0, 'and none at all past its skirt');
  // The settlement skirt is far wider; a platform borrowing it would smear.
  assert.ok(reach < terrain.land.levelSkirt, 'a platform should not use the settlement skirt');
});

test('unraising leaves the wild ground exactly as it was', () => {
  const terrain = new Terrain(1, ISLAND.land, null, ISLAND.sea);
  const before = terrain.heightAt(90, 0);
  terrain.raise('m', 90, 0, PLATFORM.size / 2, 12, PLATFORM.skirt);
  assert.notEqual(terrain.heightAt(90, 0), before);
  terrain.unraise('m');
  assert.equal(terrain.heightAt(90, 0), before);
});

// --- what platforms carry -----------------------------------------------

test('a platform raised under the city carries the city up with it', () => {
  const game = island(1000000);
  const keep = game.castles[0].position;
  const before = game.terrain.heightAt(keep.x, keep.y);
  for (const [dx, dy] of [[-9, -9], [9, -9], [9, 9], [-9, 9]]) {
    for (let order = 0; order < PLATFORM.maxSteps; order += 1) {
      game.raiseGround({ x: keep.x + dx, y: keep.y + dy });
    }
  }
  settle(game);
  const lifted = game.terrain.heightAt(keep.x, keep.y) - before;
  assert.ok(
    Math.abs(lifted - PLATFORM.step * PLATFORM.maxSteps) < 0.5,
    `the keep should stand a full platform higher, got ${lifted.toFixed(2)}`,
  );
});

test('a platform is a square with a cliff for an edge, not a hill', () => {
  const game = island(1000000);
  for (let order = 0; order < PLATFORM.maxSteps; order += 1) {
    game.raiseGround({ x: 91, y: 4 });
  }
  settle(game);
  const platform = [...game.platforms.values()][0];
  const half = PLATFORM.size / 2;
  const full = PLATFORM.step * PLATFORM.maxSteps;

  // Flat right out to the rim, corners included -- a circular zone would
  // have let the corners sag back to the wild ground.
  for (const [dx, dy] of [[0, 0], [half - 0.5, 0], [0, half - 0.5], [half - 0.5, half - 0.5]]) {
    const lift = game.terrain.liftAt(platform.x + dx, platform.y + dy);
    assert.ok(lift > full - 0.6, `the top sagged to ${lift.toFixed(2)} at ${dx}, ${dy}`);
  }
  // And down to nothing within the skirt.
  assert.equal(game.terrain.liftAt(platform.x + half + PLATFORM.skirt + 0.5, platform.y), 0);
  const drop = full / PLATFORM.skirt;
  assert.ok(drop > 4, `the face should be near vertical, it falls ${drop.toFixed(1)} units per unit out`);
});

test('the island settlement grows on the platforms, and nowhere else', () => {
  const game = island(10000000);
  assert.equal(game.houseCapacity(), 0, 'no platforms, nowhere to build');

  for (let i = -2; i <= 2; i += 1) {
    for (let j = -2; j <= 2; j += 1) {
      game.raiseGround({ x: i * PLATFORM.size, y: j * PLATFORM.size });
    }
  }
  settle(game);
  assert.ok(game.houseCapacity() > 0, 'raised ground should support a settlement');

  for (let frame = 0; frame < 60 * 200; frame += 1) {
    game.step();
  }
  assert.ok(game.houses.length > 0, 'expected the settlement to fill in');
  for (const house of game.houses) {
    assert.ok(game.platformUnder(house.position), 'a building went up off the platforms');
  }
});

test('levels without platforms still read their walls for capacity', () => {
  const game = new Game({ random: () => 0.5, level: LEVELS[0] });
  game.tokens = 100000;
  assert.equal(game.houseCapacity(), 0);
  const home = game.castles[0].position;
  const sides = 8;
  for (let i = 0; i < sides; i += 1) {
    const at = (n) => ({
      x: home.x + 120 * Math.cos((n / sides) * 2 * Math.PI),
      y: home.y + 120 * Math.sin((n / sides) * 2 * Math.PI),
    });
    game.buildWall(at(i), at((i + 1) % sides)).wall.finish();
  }
  assert.ok(game.houseCapacity() > 0, 'a wall ring should still support houses');
});

test('the island keeps are one building apiece, with nothing around them', async () => {
  const { JAPAN_BUILDINGS, JAPAN_HOUSE } = await import('../src/buildings/index.js');
  const tiers = Object.values(JAPAN_BUILDINGS);
  for (const keep of [...tiers, JAPAN_HOUSE]) {
    for (const part of keep.parts) {
      assert.equal(part.type, 'building', `${keep.name} has a ${part.type} part`);
      assert.equal(part.x, 0, `${keep.name} has a part off the centre line`);
      assert.equal(part.y, 0, `${keep.name} has a part off the centre line`);
    }
  }
  // And each tier is taller and broader than the one below it.
  for (let i = 1; i < tiers.length; i += 1) {
    assert.ok(tiers[i].parts.length >= tiers[i - 1].parts.length, 'a bigger keep has at least as many storeys');
    assert.ok(tiers[i].radius > tiers[i - 1].radius, 'and a bigger footprint');
  }
  assert.ok(JAPAN_HOUSE.radius < tiers[0].radius, 'the settlement buildings are smaller than the keep');
});
