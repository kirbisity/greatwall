import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { Castle, Raider, Wall } from '../src/entities.js';
import { FPS, RAIDER_SPAWN_INTERVAL_SECONDS, RAIDER_TYPES, STARTING_TOKENS, WALL } from '../src/config.js';

function fixedRandom(value = 0) {
  return () => value;
}

function stepSeconds(game, seconds) {
  for (let frame = 0; frame < seconds * FPS; frame += 1) {
    game.step();
  }
}

test('a new game starts with one castle and the starting purse', () => {
  const game = new Game({ random: fixedRandom() });
  assert.equal(game.castles.length, 1);
  assert.equal(game.tokens, STARTING_TOKENS);
  assert.equal(game.raiders.length, 0);
  assert.equal(game.season, 0);
});

test('the clock rolls over to a new second every FPS frames', () => {
  const game = new Game({ random: fixedRandom() });
  stepSeconds(game, 1);
  assert.equal(game.seconds, 1);
  assert.equal(game.frame, 0);
});

test('income arrives on odd seconds and applies the autumn harvest bonus', () => {
  const game = new Game({ random: fixedRandom() });
  const wealth = game.castles[0].type.wealth;
  stepSeconds(game, 1);
  assert.equal(game.tokens, STARTING_TOKENS + wealth * 2);
  stepSeconds(game, 1);
  assert.equal(game.tokens, STARTING_TOKENS + wealth * 2, 'no payout on even seconds');
});

test('a raider spawns every spawn interval, outside the safe radius', () => {
  const game = new Game({ random: fixedRandom(0.99) });
  stepSeconds(game, RAIDER_SPAWN_INTERVAL_SECONDS);
  assert.equal(game.raiders.length, 1);
  const raider = game.raiders[0];
  assert.ok(Math.abs(raider.position.x) >= 200 || Math.abs(raider.position.y) >= 200);
});

test('the season turns at 59 seconds even though spawning is on its own cadence', () => {
  const game = new Game({ random: fixedRandom() });
  stepSeconds(game, 58);
  assert.equal(game.season, 0);
  stepSeconds(game, 1);
  assert.equal(game.season, 1);
});

test('winter multiplies build cost and autumn multiplies income', () => {
  const game = new Game({ random: fixedRandom() });
  assert.equal(game.harvestMultiplier, 2);
  assert.equal(game.buildMultiplier, 1);
  game.season = 1;
  assert.equal(game.harvestMultiplier, 1);
  assert.equal(game.buildMultiplier, 8);
});

test('building a wall charges for its length and refunds half when removed', () => {
  const game = new Game({ random: fixedRandom() });
  game.tokens = 1000;
  const result = game.buildWall({ x: 100, y: 0 }, { x: 200, y: 0 });
  assert.equal(result.status, 'built');
  assert.equal(game.tokens, 1000 - 100 * WALL.costPerUnit);

  result.wall.finish();
  game.removeWallAt({ x: 150, y: 0 });
  assert.equal(game.walls.length, 0);
  assert.equal(game.tokens, 1000 - 100 * WALL.costPerUnit + 100);
});

test('a new section is only pegged out at first, and is no wall at all', () => {
  const game = new Game({ random: fixedRandom() });
  game.tokens = 1000;
  const wall = game.buildWall({ x: 100, y: 0 }, { x: 200, y: 0 }).wall;
  assert.equal(wall.isPlanned, true);

  // Nothing is laid while it is only marked out.
  stepSeconds(game, WALL.planSeconds - 1);
  assert.equal(wall.built, WALL.initialFraction, 'no stone yet');
  assert.equal(wall.isPlanned, true);
  assert.equal(game.navigation().barriers.length, 0, 'and it blocks nothing');

  stepSeconds(game, 2);
  assert.equal(wall.isPlanned, false, 'building has begun');
  assert.equal(game.navigation().barriers.length, 1, 'and now it is a wall');
});

test('a new section starts as a foundation and rises to full strength', () => {
  const game = new Game({ random: fixedRandom() });
  game.tokens = 1000;
  const wall = game.buildWall({ x: 100, y: 0 }, { x: 200, y: 0 }).wall;
  assert.equal(wall.built, WALL.initialFraction);
  assert.equal(wall.isComplete, false);

  stepSeconds(game, WALL.planSeconds + WALL.buildSeconds / 2);
  assert.ok(wall.built > 0.5 && wall.built < 0.7, `half way up, got ${wall.built}`);

  // A frame of slack: the per-frame increments do not land exactly on 1.
  stepSeconds(game, WALL.buildSeconds / 2 + 1);
  assert.equal(wall.isComplete, true);
  assert.equal(wall.health, WALL.maxHealth);
});

test('an unfinished wall keeps rising after being attacked', () => {
  const game = new Game({ random: fixedRandom() });
  game.tokens = 1000;
  const wall = game.buildWall({ x: 100, y: 0 }, { x: 200, y: 0 }).wall;
  stepSeconds(game, WALL.planSeconds + 1);
  wall.takeHit(20);
  const wounded = wall.health;
  stepSeconds(game, 1);
  assert.ok(wall.health > wounded, 'construction makes good the damage');
});

test('a damaged wall refunds less than an intact one', () => {
  const wall = new Wall({ x: 0, y: 0 }, { x: 100, y: 0 });
  const intactRefund = wall.refundValue;
  wall.health = WALL.maxHealth / 2;
  assert.equal(wall.refundValue, Math.trunc(intactRefund / 2));
});

test('a wall cannot be built across the city or without funds', () => {
  const game = new Game({ random: fixedRandom() });
  game.tokens = 1000;
  assert.equal(game.buildWall({ x: 100, y: 0 }, { x: -100, y: 0 }).status, 'blocked');
  game.tokens = 1;
  assert.equal(game.buildWall({ x: 100, y: 0 }, { x: 200, y: 0 }).status, 'poor');
});

test('wall ends snap onto a nearby node so junctions share a point', () => {
  const game = new Game({ random: fixedRandom() });
  game.tokens = 10000;
  game.buildWall({ x: 100, y: 0 }, { x: 200, y: 0 });
  game.buildWall({ x: 205, y: 2 }, { x: 300, y: 0 });
  assert.equal(game.walls[0].end, game.walls[1].start, 'shared node reference');
});

test('undo returns the last wall and its refund', () => {
  const game = new Game({ random: fixedRandom() });
  game.tokens = 1000;
  game.buildWall({ x: 100, y: 0 }, { x: 200, y: 0 }).wall.finish();
  const before = game.tokens;
  assert.equal(game.undoLastWall(), true);
  assert.equal(game.walls.length, 0);
  assert.equal(game.tokens, before + 100);
  assert.equal(game.undoLastWall(), false, 'undo on an empty board is a no-op');
});

test('upgrading swaps the castle in place and charges its cost', () => {
  const messages = [];
  const game = new Game({ random: fixedRandom(), onMessage: (text) => messages.push(text) });
  game.tokens = 5000;
  assert.equal(game.upgradeCastleAt({ x: 0, y: 0 }), true);
  assert.equal(game.castles[0].typeId, 'CC1');
  assert.equal(game.tokens, 5000 - 1000);
  assert.match(messages.at(-1), /Upgraded to Medium Castle/);
});

test('a fully upgraded castle reports that it cannot go further', () => {
  const messages = [];
  const game = new Game({ random: fixedRandom(), onMessage: (text) => messages.push(text) });
  game.castles = [new Castle('CC2')];
  assert.equal(game.upgradeCastle(0), false);
  assert.equal(messages.at(-1), 'Cannot upgrade further');
});

test('every dead raider is cleared in the same frame, including adjacent ones', () => {
  const game = new Game({ random: fixedRandom() });
  game.raiders = [
    new Raider('CR0', { x: 500, y: 0 }),
    new Raider('CR0', { x: 510, y: 0 }),
    new Raider('CR0', { x: 520, y: 0 }),
  ];
  game.raiders[0].health = -1;
  game.raiders[1].health = -1;
  game.step();
  assert.equal(game.raiders.length, 1);
});

test('the game is lost once the castle health goes negative', () => {
  const game = new Game({ random: fixedRandom() });
  assert.equal(game.isDefeated, false);
  game.castles[0].health = -1;
  assert.equal(game.isDefeated, true);
});
