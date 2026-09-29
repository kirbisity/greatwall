import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { Castle, Raider, Wall } from '../src/entities.js';
import {
  BREACH,
  CASTLE_GUARD_TIERS,
  CASTLE_TYPES,
  FPS,
  GUARD_TYPES,
  RAIDER_SPAWN_INTERVAL_SECONDS,
  RAIDER_TYPES,
  STARTING_TOKENS,
  WALL,
} from '../src/config.js';

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

test('income arrives on odd seconds, with no harvest bonus in a level\'s opening spring', () => {
  const game = new Game({ random: fixedRandom() });
  const wealth = game.castles[0].type.wealth;
  stepSeconds(game, 1);
  assert.equal(game.tokens, STARTING_TOKENS + wealth, 'spring carries no harvest bonus');
  stepSeconds(game, 1);
  assert.equal(game.tokens, STARTING_TOKENS + wealth, 'no payout on even seconds');
});

test('the autumn harvest doubles income once the year actually turns to it', () => {
  const game = new Game({ random: fixedRandom() });
  const wealth = game.castles[0].type.wealth;
  game.season = 2; // Autumn, two seasons on from the spring a level opens in
  stepSeconds(game, 1);
  assert.equal(game.tokens, STARTING_TOKENS + wealth * 2);
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

test('seasonPhase climbs smoothly, with no jump where the season itself turns', () => {
  const game = new Game({ random: fixedRandom() });
  // A level opens exactly on spring's own midpoint, the extra half-season
  // seasonPhase carries for exactly that reason (see Game#seasonPhase).
  assert.ok(Math.abs(game.seasonPhase - 0.5) < 1e-9, `expected 0.5 at the very start, got ${game.seasonPhase}`);
  stepSeconds(game, 30);
  assert.ok(Math.abs(game.seasonPhase - 1) < 1e-9, `expected ~1, got ${game.seasonPhase}`);

  // this.season turns a second early relative to this.seconds completing a
  // season (see onSecondElapsed), which is exactly the gap seasonPhase is
  // built to paper over: it should keep climbing steadily through that
  // second rather than jumping to match this.season's own step.
  stepSeconds(game, 28);
  const before = game.seasonPhase;
  assert.equal(game.season, 0, 'still spring one second before the turn');
  stepSeconds(game, 1);
  assert.equal(game.season, 1, 'summer now, by this.season');
  const after = game.seasonPhase;
  assert.ok(after - before < 0.05, `expected a single second's step, got ${before} -> ${after}`);
  assert.ok(Math.abs(game.seasonPhase - (59 / 60 + 0.5)) < 1e-9, `expected ~1.483, got ${game.seasonPhase}`);

  stepSeconds(game, 1);
  assert.ok(Math.abs(game.seasonPhase - 1.5) < 1e-9, `expected exactly 1.5 a full season in, got ${game.seasonPhase}`);
});

test('winter multiplies build cost and autumn multiplies income', () => {
  const game = new Game({ random: fixedRandom() });
  // Spring, the season a level opens in, carries neither bonus.
  assert.equal(game.harvestMultiplier, 1);
  assert.equal(game.buildMultiplier, 1);
  game.season = 2; // Autumn
  assert.equal(game.harvestMultiplier, 2);
  assert.equal(game.buildMultiplier, 1);
  game.season = 3; // Winter
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

test('a junction takes no more than WALL.maxEdgesPerNode sections', () => {
  const game = new Game({ random: fixedRandom() });
  game.tokens = 100000;
  const node = { x: 300, y: 0 };
  // Three spokes into the same point, each from a different direction so
  // none of them snap to one another instead.
  for (let i = 0; i < WALL.maxEdgesPerNode; i += 1) {
    const angle = (i / WALL.maxEdgesPerNode) * 2 * Math.PI;
    const far = { x: node.x + 150 * Math.cos(angle), y: node.y + 150 * Math.sin(angle) };
    assert.equal(game.buildWall(far, node).status, 'built', `spoke ${i}`);
  }
  assert.equal(game.nodeDegree(game.walls[0].end), WALL.maxEdgesPerNode);

  // A fourth is refused outright, quietly -- no wall, no message, no charge.
  const before = game.tokens;
  const wallsBefore = game.walls.length;
  const angle = WALL.maxEdgesPerNode / (WALL.maxEdgesPerNode + 1) * 2 * Math.PI;
  const far = { x: node.x + 150 * Math.cos(angle), y: node.y + 150 * Math.sin(angle) };
  const result = game.buildWall(far, node);
  assert.equal(result.status, 'crowded');
  assert.equal(game.walls.length, wallsBefore, 'no fourth section');
  assert.equal(game.tokens, before, 'nothing charged');
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

// --- the breach: the city burns before the game actually ends -------------

test('game over is held off for BREACH.collapseSeconds after the last castle falls', () => {
  const game = new Game({ random: fixedRandom() });
  game.castles[0].health = -1;
  assert.equal(game.breachComplete, false, 'not yet');
  stepSeconds(game, BREACH.collapseSeconds - 0.5);
  assert.equal(game.breachComplete, false, 'still burning');
  assert.ok(game.breachFraction > 0 && game.breachFraction < 1);
  stepSeconds(game, 1);
  assert.equal(game.breachComplete, true, 'burnt out');
  assert.equal(game.breachFraction, 1);
});

// --- dispatching the imperial army in tiers --------------------------------

test('a level 1 city can only field its light company', () => {
  const game = new Game({ random: fixedRandom() });
  const options = game.dispatchOptions();
  assert.deepEqual(options.map((option) => option.id), CASTLE_GUARD_TIERS.CC0);
});

test('each upgrade unlocks the next guard tier without losing the ones below it', () => {
  const game = new Game({ random: fixedRandom() });
  game.tokens = 100000;
  const seenAtEachLevel = [game.dispatchOptions().map((option) => option.id)];
  game.upgradeCastle(0);
  seenAtEachLevel.push(game.dispatchOptions().map((option) => option.id));
  game.upgradeCastle(0);
  seenAtEachLevel.push(game.dispatchOptions().map((option) => option.id));
  assert.deepEqual(seenAtEachLevel, [
    CASTLE_GUARD_TIERS.CC0,
    CASTLE_GUARD_TIERS.CC1,
    CASTLE_GUARD_TIERS.CC2,
  ]);
});

test('sendGuard charges the tier it was asked for, not a flat rate', () => {
  const game = new Game({ random: fixedRandom() });
  game.tokens = 100000;
  for (const [typeId, type] of Object.entries(GUARD_TYPES)) {
    const before = game.tokens;
    const result = game.sendGuard(typeId);
    assert.equal(result.sent, true, typeId);
    assert.equal(before - game.tokens, type.cost, `${typeId} should cost $${type.cost}`);
    assert.equal(result.guard.typeId, typeId);
  }
});

test('sendGuard refuses a company the treasury cannot afford', () => {
  const game = new Game({ random: fixedRandom() });
  game.tokens = 0;
  const result = game.sendGuard('IG0');
  assert.equal(result.sent, false);
  assert.equal(result.status, 'poor');
  assert.equal(game.guards.length, 0);
});

// --- mustering stands idle until selected and sent ------------------------

test('a mustered company stands at home rather than marching anywhere', () => {
  const game = new Game({ random: fixedRandom() });
  game.tokens = 100000;
  const { guard } = game.sendGuard('IG0');
  assert.deepEqual(guard.orders, guard.home);
  assert.deepEqual(guard.position, guard.home);
});

test('selectGuardsNear picks out only the companies within range, and marks them', () => {
  const game = new Game({ random: fixedRandom() });
  game.tokens = 100000;
  const near = game.sendGuard('IG0').guard;
  const far = game.sendGuard('IG0').guard;
  far.position = { x: 900, y: 900 };
  far.home = { x: 900, y: 900 };

  const found = game.selectGuardsNear(near.position);

  assert.deepEqual(found, [near]);
  assert.equal(near.selected, true);
  assert.equal(far.selected, false);
});

test('deselectGuards clears every company\'s own selected flag', () => {
  const game = new Game({ random: fixedRandom() });
  game.tokens = 100000;
  const guard = game.sendGuard('IG0').guard;
  game.selectGuardsNear(guard.position);
  assert.equal(guard.selected, true);

  game.deselectGuards();
  assert.equal(guard.selected, false);
});

test('orderGuards sends a single company exactly where aimed', () => {
  const game = new Game({ random: fixedRandom() });
  game.tokens = 100000;
  const guard = game.sendGuard('IG0').guard;
  game.orderGuards([guard], { x: 300, y: 40 });
  assert.deepEqual(guard.orders, { x: 300, y: 40 });
  assert.equal(guard.selected, false, 'commanding a company deselects it');
});

test('orderGuards spreads a group around the shared destination rather than stacking them', () => {
  const game = new Game({ random: fixedRandom() });
  game.tokens = 100000;
  const guards = [game.sendGuard('IG0').guard, game.sendGuard('IG0').guard, game.sendGuard('IG0').guard];
  const target = { x: 300, y: 40 };

  game.orderGuards(guards, target);

  const distinctOrders = new Set(guards.map((guard) => `${guard.orders.x},${guard.orders.y}`));
  assert.equal(distinctOrders.size, guards.length, 'each company should land somewhere different');
  for (const guard of guards) {
    const distance = Math.hypot(guard.orders.x - target.x, guard.orders.y - target.y);
    assert.ok(distance > 0 && distance < 30, `order should stay near the target, was ${distance}`);
  }
});

test('a company left idle at home still hunts a raider that strays close, on its own', () => {
  const game = new Game({ random: fixedRandom() });
  game.tokens = 100000;
  const guard = game.sendGuard('IG0').guard;
  game.raiders = [new Raider('CR0', { x: guard.home.x + 50, y: guard.home.y })];

  const destination = game.guardDestination(guard);

  assert.deepEqual(destination, game.raiders[0].position, 'never ordered anywhere, but a raider is close enough to chase');
});

// --- affordability, for Hud's own greying of the Build and Attack tools ---

test('canAffordToBuild wants coin for a few sections, not just one', () => {
  const game = new Game({ random: fixedRandom() });
  const oneSection = game.wallCost(WALL.minLength);

  game.tokens = oneSection;
  assert.equal(game.canAffordToBuild, false, 'one section worth is not enough to read as affordable');

  game.tokens = oneSection * 3;
  assert.equal(game.canAffordToBuild, true);
});

test('canAffordToAttack looks at the cheapest company this castle can field', () => {
  const game = new Game({ random: fixedRandom() });
  const cheapest = Math.min(...game.dispatchOptions().map((option) => option.cost));

  game.tokens = cheapest - 1;
  assert.equal(game.canAffordToAttack, false);

  game.tokens = cheapest;
  assert.equal(game.canAffordToAttack, true);
});

test('canAffordToAttack is false with no castle left to field a company', () => {
  const game = new Game({ random: fixedRandom() });
  game.tokens = 100000;
  game.castles = [];
  assert.equal(game.canAffordToAttack, false);
});

test('canAffordToUpgrade looks at the castle\'s own next tier', () => {
  const game = new Game({ random: fixedRandom() });
  const nextCost = CASTLE_TYPES[game.castles[0].type.upgradesTo].cost;

  game.tokens = nextCost - 1;
  assert.equal(game.canAffordToUpgrade, false);

  game.tokens = nextCost;
  assert.equal(game.canAffordToUpgrade, true);
});

test('canAffordToUpgrade is false once the castle is already at its final tier', () => {
  const game = new Game({ random: fixedRandom() });
  game.castles = [new Castle('CC2')];
  game.tokens = 100000;
  assert.equal(game.canAffordToUpgrade, false);
});

test('a section too cheap on its own to trip canAffordToBuild still will not go up', () => {
  const game = new Game({ random: fixedRandom() });
  // Enough for one short section, but not the three canAffordToBuild wants.
  game.tokens = game.wallCost(WALL.minLength) + 5;
  assert.equal(game.canAffordToBuild, false, 'the gate should already be closed');

  const result = game.buildWall({ x: 200, y: 0 }, { x: 240, y: 0 });
  assert.equal(result.status, 'poor', 'building is refused even though this one section was affordable');
});

// --- upgrading rebuilds gradually, keeping the old stats meanwhile ---------

test('the wall planning phase now takes twice as long as it used to', () => {
  assert.equal(WALL.planSeconds, 6);
});

test('a castle mid-rebuild still fights and earns at its old strength', () => {
  const game = new Game({ random: fixedRandom() });
  game.tokens = 100000;
  const before = game.castles[0];
  const oldMaxHealth = before.type.maxHealth;
  const oldWealth = before.type.wealth;

  game.upgradeCastle(0);
  const castle = game.castles[0];
  assert.equal(castle.typeId, 'CC1', 'the shape changes at once');
  assert.equal(castle.type.maxHealth, CASTLE_TYPES.CC1.maxHealth, 'the new tier is already set');
  // But what actually governs play is still the old numbers.
  assert.equal(castle.effectiveType.maxHealth, oldMaxHealth);
  assert.equal(castle.healthFraction, castle.health / oldMaxHealth);

  const tokensBeforeIncome = game.tokens;
  game.collectIncome();
  assert.equal(game.tokens, tokensBeforeIncome + oldWealth * game.harvestMultiplier,
    'income is still the old tier\'s, not the new one\'s');
});

test('advanceRebuild moves through demolish then build, then clears itself', () => {
  const game = new Game({ random: fixedRandom() });
  game.tokens = 100000;
  game.upgradeCastle(0);
  const castle = game.castles[0];
  const demolishSeconds = castle.rebuild.demolishTotal;
  const buildSeconds = castle.rebuild.buildTotal;

  stepSeconds(game, demolishSeconds - 0.5);
  assert.ok(castle.rebuild, 'still demolishing');
  assert.equal(castle.buildProgress, 0, 'nothing rises until the old one is clear');

  stepSeconds(game, 1);
  assert.ok(castle.buildProgress > 0, 'now rising');

  stepSeconds(game, buildSeconds);
  assert.equal(castle.rebuild, null, 'construction finished');
  assert.equal(castle.effectiveType.maxHealth, castle.type.maxHealth, 'now on the new stats');
});
