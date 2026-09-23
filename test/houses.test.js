import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { Castle, House, Raider } from '../src/entities.js';
import { CASTLE_TYPES, FPS, HOUSES } from '../src/config.js';

function fixedRandom(value = 0.5) {
  return () => value;
}

function stepSeconds(game, seconds) {
  for (let frame = 0; frame < seconds * FPS; frame += 1) {
    game.step();
  }
}

/** A ring of finished wall sections a given distance out from the castle. */
function ring(game, radius, sides = 8) {
  const home = game.castles[0].position;
  const points = Array.from({ length: sides }, (unused, i) => ({
    x: home.x + radius * Math.cos((i / sides) * 2 * Math.PI),
    y: home.y + radius * Math.sin((i / sides) * 2 * Math.PI),
  }));
  for (let i = 0; i < sides; i += 1) {
    game.buildWall(points[i], points[(i + 1) % sides]).wall.finish();
  }
}

// --- capacity tracks how far out the walls sit ------------------------

test('no standing wall means no capacity, whatever is pegged out', () => {
  const game = new Game({ random: fixedRandom() });
  game.tokens = 100000;
  assert.equal(game.settlementRadius(), 0);
  assert.equal(game.houseCapacity(), 0);

  // Pegged but not yet built does not count either.
  game.buildWall({ x: 0, y: 150 }, { x: 80, y: 150 });
  assert.equal(game.houseCapacity(), 0);
});

test('a wider ring supports more houses than a tight one', () => {
  const near = new Game({ random: fixedRandom() });
  near.tokens = 100000;
  ring(near, 80);

  const far = new Game({ random: fixedRandom() });
  far.tokens = 100000;
  ring(far, 260);

  assert.ok(far.houseCapacity() > near.houseCapacity(),
    `expected a farther ring to support more houses (${far.houseCapacity()} vs ${near.houseCapacity()})`);
});

test('capacity never exceeds HOUSES.maxHouses', () => {
  const game = new Game({ random: fixedRandom() });
  game.tokens = 1000000;
  ring(game, 5000);
  assert.ok(game.houseCapacity() <= HOUSES.maxHouses);
});

// --- houses fill in on their own, up to capacity -----------------------

test('houses spawn over time up to capacity and then stop', () => {
  // A fixed random would place every attempt at the same point, so only the
  // first house could ever find a clear site; this needs real spread.
  const game = new Game({ random: Math.random });
  game.tokens = 100000;
  ring(game, 200);
  const capacity = game.houseCapacity();
  assert.ok(capacity > 0, 'the ring should support at least one house');

  stepSeconds(game, HOUSES.spawnIntervalSeconds * (capacity + 6));
  assert.equal(game.houses.length, capacity);

  // Waiting longer does not overshoot it.
  stepSeconds(game, HOUSES.spawnIntervalSeconds * 5);
  assert.equal(game.houses.length, capacity);
});

test('a house takes HOUSES.riseSeconds to fully rise', () => {
  const house = new House({ x: 0, y: 0 });
  assert.equal(house.growth, 0);
  house.advance(HOUSES.riseSeconds / 2);
  assert.ok(house.growth > 0 && house.growth < 1);
  house.advance(HOUSES.riseSeconds);
  assert.equal(house.growth, 1, 'growth clamps at fully risen');
});

// --- a raider that reaches one burns it down -----------------------------

test('a raider that touches a house sets it alight, and it is gone a second later', () => {
  const game = new Game({ random: fixedRandom() });
  game.houses.push(new House({ x: 0, y: 0 }));
  const house = game.houses[0];
  const raider = new Raider('CR0', { x: 2, y: 2 });
  game.raiders.push(raider);

  game.step();
  assert.equal(house.burning, true, 'contact ignites it immediately');

  stepSeconds(game, HOUSES.burnSeconds - 0.1);
  assert.equal(game.houses.includes(house), true, 'still burning, not yet gone');

  stepSeconds(game, 0.2);
  assert.equal(game.houses.includes(house), false, 'gone once its burn time is up');
});

test('a house well clear of every raider is left alone', () => {
  const game = new Game({ random: fixedRandom() });
  game.houses.push(new House({ x: 0, y: 0 }));
  game.raiders.push(new Raider('CR0', { x: 500, y: 500 }));
  game.step();
  assert.equal(game.houses[0].burning, false);
});

// --- income folds houses into the payout ---------------------------------

test('incomeBreakdown is city_income * num_city + house_income * num_houses', () => {
  const game = new Game({ random: fixedRandom() });
  for (let i = 0; i < 5; i += 1) {
    game.houses.push(new House({ x: i, y: 0 }));
  }
  const breakdown = game.incomeBreakdown;
  assert.equal(breakdown.cityIncome, CASTLE_TYPES.CC0.wealth);
  assert.equal(breakdown.houseCount, 5);
  assert.equal(breakdown.housePerHouse, HOUSES.income);
  assert.equal(breakdown.total, CASTLE_TYPES.CC0.wealth + 5 * HOUSES.income);
});

test('collectIncome pays out the full breakdown, houses included', () => {
  const game = new Game({ random: fixedRandom() });
  for (let i = 0; i < 3; i += 1) {
    game.houses.push(new House({ x: i, y: 0 }));
  }
  const before = game.tokens;
  const expected = game.incomeBreakdown.total * game.harvestMultiplier;
  game.collectIncome();
  assert.equal(game.tokens, before + expected);
});

// --- upgrading a castle over a house clears it ----------------------------

test('a house standing where a bigger castle now does is cleared on upgrade', () => {
  const game = new Game({ random: fixedRandom() });
  game.tokens = 100000;
  // Sits inside CC1's larger footprint but outside CC0's.
  const half = CASTLE_TYPES.CC1.footprint - 2;
  game.houses.push(new House({ x: half, y: 0 }));
  game.upgradeCastle(0);
  assert.equal(game.houses.length, 0);
});
