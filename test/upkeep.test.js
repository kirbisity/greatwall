import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { Emperor, Guard, House } from '../src/entities.js';
import { CORRUPTION, FLOATERS, GUARD_TYPES, HOUSES, UPKEEP } from '../src/config.js';
import { LEVELS } from '../src/levels.js';

const DRY = LEVELS.find((level) => !level.river && !level.sea && level.mode !== 'battle');

function newGame() {
  return new Game({ level: DRY, random: () => 0.5 });
}

function muster(game, typeId, x = 0, y = 0) {
  const guard = new Guard(typeId, { x, y });
  game.guards.push(guard);
  return guard;
}

const LIGHT = Object.keys(GUARD_TYPES).find((id) => GUARD_TYPES[id].cost > 0);

test('a company costs a share of its price to keep, free of distance charges near the castle', () => {
  const game = newGame();
  const guard = muster(game, LIGHT, 20, 0);
  const expected = Math.max(1, Math.round(GUARD_TYPES[LIGHT].cost * UPKEEP.costShare));
  assert.equal(game.guardUpkeep(guard), expected);
  assert.equal(game.incomeBreakdown.guardUpkeep, expected);
  assert.equal(game.incomeBreakdown.guardCount, 1);
});

test('upkeep climbs with distance from the castle and stops at the cap', () => {
  const game = newGame();
  const near = muster(game, LIGHT, 0, 0);
  const far = muster(game, LIGHT, UPKEEP.freeRadius + 200, 0);
  const remote = muster(game, LIGHT, 5000, 0);
  assert.ok(game.guardUpkeep(far) > game.guardUpkeep(near), 'further out costs more');
  const base = GUARD_TYPES[LIGHT].cost * UPKEEP.costShare;
  assert.equal(game.guardUpkeep(remote), Math.round(base * UPKEEP.maxMultiplier));
});

test('routed companies and the Emperor cost nothing', () => {
  const game = newGame();
  const guard = muster(game, LIGHT, 300, 0);
  assert.ok(game.guardUpkeep(guard) > 0);
  guard.routed = true;
  assert.equal(game.guardUpkeep(guard), 0);
  const emperor = new Emperor({ x: 0, y: 0 });
  game.guards.push(emperor);
  assert.equal(game.guardUpkeep(emperor), 0);
  assert.equal(game.incomeBreakdown.guardCount, 0);
});

test('company upkeep comes out of the payout', () => {
  const game = newGame();
  const before = game.incomeBreakdown.total;
  const guard = muster(game, LIGHT, 0, 0);
  assert.equal(game.incomeBreakdown.total, before - game.guardUpkeep(guard));
});

test('corruption: none for eight seasons, then 0.9 a year on gross income', () => {
  const game = newGame();
  const gross = game.incomeBreakdown.cityIncome + game.incomeBreakdown.houseIncome;
  const factors = [];
  for (const season of [0, 7, 8, 11, 12, 16]) {
    game.season = season;
    factors.push(game.corruptionFactor);
  }
  assert.deepEqual(factors.slice(0, 2), [1, 1]);
  assert.ok(Math.abs(factors[2] - 0.9) < 1e-9);
  assert.ok(Math.abs(factors[3] - 0.9) < 1e-9);
  assert.ok(Math.abs(factors[4] - 0.81) < 1e-9);
  assert.ok(Math.abs(factors[5] - 0.729) < 1e-9);
  game.season = CORRUPTION.graceSeasons;
  assert.ok(Math.abs(game.incomeBreakdown.total - gross * 0.9) < 1e-9);
});

test('corruption spares the upkeep bills', () => {
  const game = newGame();
  const guard = muster(game, LIGHT, 0, 0);
  game.season = 12;
  const breakdown = game.incomeBreakdown;
  const gross = breakdown.cityIncome + breakdown.houseIncome;
  assert.ok(Math.abs(breakdown.total - (gross * 0.81 - breakdown.wallUpkeep - game.guardUpkeep(guard))) < 1e-9);
});

test('a payout floats gains off the castle and houses and costs off companies', () => {
  const game = newGame();
  game.trySpawnHouse?.();
  muster(game, LIGHT, 0, 0);
  game.collectIncome();
  const texts = game.floaters.map((floater) => floater.text);
  assert.ok(texts.some((text) => text.startsWith('+')), 'a gain is shown');
  assert.ok(texts.some((text) => text.startsWith('-')), 'a cost is shown');
  assert.ok(game.floaters.every((floater) => floater.isGain === floater.text.startsWith('+')));
});

test('floaters are capped, age out, and clear on restart', () => {
  const game = newGame();
  for (let i = 0; i < 30; i += 1) {
    game.houses.push(new House({ x: i * 3, y: 40 }));
  }
  game.collectIncome();
  const houseFigures = game.floaters.filter((floater) => floater.lift === FLOATERS.houseLift);
  assert.equal(houseFigures.length, FLOATERS.maxHouses);
  assert.equal(new Set(houseFigures.map((floater) => floater.x)).size, FLOATERS.maxHouses, 'distinct houses');
  game.ageFloaters(FLOATERS.lifetimeSeconds + 0.1);
  assert.equal(game.floaters.length, 0);
  game.collectIncome();
  game.restart();
  assert.equal(game.floaters.length, 0);
  assert.ok(HOUSES.income > 0);
});
