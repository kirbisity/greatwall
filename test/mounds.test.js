import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { Terrain } from '../src/terrain.js';
import { LEVELS } from '../src/levels.js';
import { MOUND } from '../src/config.js';

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

/** Run a game until every mound has finished climbing. */
function settle(game) {
  for (let frame = 0; frame < 60 * MOUND.growSeconds * MOUND.maxSteps + 120; frame += 1) {
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

test('raising snaps to a grid, so the same square grows one mound', () => {
  const game = island();
  const first = game.raiseGround({ x: 91, y: 4 });
  const again = game.raiseGround({ x: 98, y: 11 });
  assert.equal(game.mounds.size, 1, 'two orders in one square should be one mound');
  assert.equal(first.mound, again.mound);
  assert.equal(again.mound.steps, 2);

  // And a neighbouring square is its own mound.
  game.raiseGround({ x: 91 + MOUND.size, y: 4 });
  assert.equal(game.mounds.size, 2);
});

test('ground climbs over seconds rather than jumping, and stops where paid for', () => {
  const game = island();
  const { mound } = game.raiseGround({ x: 91, y: 4 });
  assert.equal(mound.lift, 0, 'nothing has risen the instant it is ordered');

  for (let frame = 0; frame < 60 * MOUND.growSeconds / 2; frame += 1) {
    game.step();
  }
  const halfway = mound.lift;
  assert.ok(halfway > 0 && halfway < MOUND.step, `half a step in, expected part-risen, got ${halfway}`);

  settle(game);
  assert.ok(Math.abs(mound.lift - MOUND.step) < 1e-9, 'one order buys exactly one step');
  assert.ok(
    Math.abs(game.terrain.liftAt(mound.x, mound.y) - MOUND.step) < 0.01,
    'and the ground under it actually stands that high',
  );
});

test('a mound tops out, and every step costs more than the last', () => {
  const game = island(1000000);
  const costs = [];
  for (let order = 0; order < MOUND.maxSteps; order += 1) {
    costs.push(game.moundCost(order));
    assert.equal(game.raiseGround({ x: 91, y: 4 }).status, 'raising');
  }
  assert.equal(game.raiseGround({ x: 91, y: 4 }).status, 'highest');
  for (let i = 1; i < costs.length; i += 1) {
    assert.ok(costs[i] > costs[i - 1], `step ${i} should cost more than step ${i - 1}`);
  }
});

test('nothing is raised out of the sea, on the city, or without the money', () => {
  const game = island(0);
  assert.equal(game.raiseGround({ x: 400, y: 0 }).status, 'water');
  assert.equal(game.raiseGround({ x: 0, y: 0 }).status, 'blocked');
  assert.equal(game.raiseGround({ x: 91, y: 4 }).status, 'poor');
  assert.equal(game.mounds.size, 0, 'a refused order leaves no mound behind');

  game.tokens = 100000;
  assert.equal(game.raiseGround({ x: 91, y: 4 }).status, 'raising');
});

test('the square under the cursor says whether it could be raised', () => {
  const game = island();
  const open = game.squareUnder({ x: 91, y: 4 });
  assert.equal(open.steps, 0);
  assert.ok(open.allowed);
  // It names the square, not the point asked about.
  assert.equal(open.x % MOUND.size, MOUND.size / 2);

  game.raiseGround({ x: 91, y: 4 });
  assert.equal(game.squareUnder({ x: 91, y: 4 }).steps, 1, 'the outline follows what has been ordered');
  assert.equal(game.squareUnder({ x: 400, y: 0 }).allowed, false, 'the sea is never allowed');
});

test('raised ground is heavy going, and flat ground is not', () => {
  const game = island(1000000);
  const flat = game.paceOn({ x: 91, y: 4 });
  for (let order = 0; order < MOUND.maxSteps; order += 1) {
    game.raiseGround({ x: 91, y: 4 });
  }
  settle(game);
  const mound = [...game.mounds.values()][0];
  const climbing = game.paceOn({ x: mound.x, y: mound.y });
  assert.ok(climbing < flat, `expected a mound to slow a company, ${climbing} vs ${flat}`);
  assert.ok(
    Math.abs(climbing / flat - (1 - MOUND.climbDrag)) < 0.02,
    `a full mound should cost about ${MOUND.climbDrag} of pace, got ${(1 - climbing / flat).toFixed(2)}`,
  );
  // Well clear of it, the going is as it was.
  assert.equal(game.paceOn({ x: mound.x + 200, y: mound.y }), game.paceOn({ x: mound.x + 200, y: mound.y }));
});

test('a level that raises nothing pays nothing for the check', () => {
  const plain = new Game({ random: () => 0.5, level: LEVELS[0] });
  assert.equal(plain.mounds.size, 0);
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

test('a mound keeps its slope to itself', () => {
  const terrain = new Terrain(1, ISLAND.land, null, ISLAND.sea);
  terrain.raise('m', 90, 0, MOUND.size / 2, MOUND.step * MOUND.maxSteps, MOUND.skirt);
  const reach = MOUND.size / 2 + MOUND.skirt;
  assert.ok(terrain.liftAt(90, 0) > MOUND.step * MOUND.maxSteps - 0.01, 'full height on top');
  assert.equal(terrain.liftAt(90 + reach + 1, 0), 0, 'and none at all past its skirt');
  // The settlement skirt is far wider; a mound borrowing it would smear.
  assert.ok(reach < terrain.land.levelSkirt, 'a mound should not use the settlement skirt');
});

test('unraising leaves the wild ground exactly as it was', () => {
  const terrain = new Terrain(1, ISLAND.land, null, ISLAND.sea);
  const before = terrain.heightAt(90, 0);
  terrain.raise('m', 90, 0, MOUND.size / 2, 12, MOUND.skirt);
  assert.notEqual(terrain.heightAt(90, 0), before);
  terrain.unraise('m');
  assert.equal(terrain.heightAt(90, 0), before);
});
