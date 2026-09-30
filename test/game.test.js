import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import {
  Castle, Emperor, Guard, Raider, Wall,
} from '../src/entities.js';
import { LEVELS } from '../src/levels.js';
import { compileUnit, unitSize } from '../src/units.js';
import {
  BATTLE,
  BREACH,
  CASTLE_GUARD_TIERS,
  CASTLE_TYPES,
  EARTHWORK,
  EMPEROR_TIER_MULTIPLIER,
  FACTIONS,
  FEAR,
  FPS,
  GUARD_TYPES,
  RAIDER_SPAWN_INTERVAL_SECONDS,
  RAIDER_TYPES,
  STARTING_TOKENS,
  WALL,
} from '../src/config.js';

const BATTLE_LEVEL = LEVELS.find((level) => level.mode === 'battle');

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

test('a level 1 city can only field its light company (plus the Emperor, offered everywhere)', () => {
  const game = new Game({ random: fixedRandom() });
  const options = game.dispatchOptions();
  assert.deepEqual(options.map((option) => option.id), [...CASTLE_GUARD_TIERS.CC0, 'EMPEROR']);
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
    [...CASTLE_GUARD_TIERS.CC0, 'EMPEROR'],
    [...CASTLE_GUARD_TIERS.CC1, 'EMPEROR'],
    [...CASTLE_GUARD_TIERS.CC2, 'EMPEROR'],
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

// --- the Emperor: one free, unique, strictly-commanded company ------------

test('the Emperor costs nothing to muster', () => {
  const game = new Game({ random: fixedRandom() });
  const before = game.tokens;
  const result = game.sendGuard('EMPEROR');
  assert.equal(result.sent, true);
  assert.equal(game.tokens, before, 'mustering it should not have spent a thing');
});

test('the Emperor is never offered again once mustered, and a second launch is refused', () => {
  const game = new Game({ random: fixedRandom() });
  assert.ok(game.dispatchOptions().some((option) => option.id === 'EMPEROR'));

  game.sendGuard('EMPEROR');
  assert.ok(!game.dispatchOptions().some((option) => option.id === 'EMPEROR'), 'should be gone from the list');

  const second = game.sendGuard('EMPEROR');
  assert.equal(second.sent, false);
  assert.equal(second.status, 'unique');
});

test('the Emperor is about a medium company\'s own stats, but with three times the health', () => {
  const game = new Game({ random: fixedRandom() });
  const emperor = game.sendGuard('EMPEROR').guard;
  const medium = GUARD_TYPES.IG0; // the level's own medium tier, at CC0
  assert.equal(emperor.type.maxHealth, medium.maxHealth * 3);
  assert.equal(emperor.health, emperor.type.maxHealth);
});

test('the Emperor moves faster than every ordinary guard tier', () => {
  const game = new Game({ random: fixedRandom() });
  const emperor = game.sendGuard('EMPEROR').guard;
  const fastestOrdinary = Math.max(...Object.values(GUARD_TYPES)
    .filter((type) => type !== GUARD_TYPES.EMPEROR)
    .map((type) => type.speed));
  assert.ok(emperor.type.speed > fastestOrdinary, `${emperor.type.speed} should outrun ${fastestOrdinary}`);
});

test('the Emperor\'s own stats scale up with the castle\'s tier, at the moment it musters', () => {
  for (const [typeId, multiplier] of Object.entries(EMPEROR_TIER_MULTIPLIER)) {
    const game = new Game({ random: fixedRandom() });
    game.tokens = 100000;
    while (game.castles[0].typeId !== typeId) {
      game.upgradeCastle(0);
    }
    const emperor = game.sendGuard('EMPEROR').guard;
    assert.equal(emperor.type.maxHealth, Math.round(GUARD_TYPES.EMPEROR.maxHealth * multiplier), typeId);
  }
});

test('mustering the Emperor never mutates the shared base stats other games read', () => {
  const first = new Game({ random: fixedRandom() });
  first.tokens = 100000;
  first.upgradeCastle(0);
  first.upgradeCastle(0);
  first.sendGuard('EMPEROR'); // at CC2, its strongest tier

  const second = new Game({ random: fixedRandom() });
  const freshOption = second.dispatchOptions().find((option) => option.id === 'EMPEROR');
  assert.equal(freshOption.maxHealth, GUARD_TYPES.EMPEROR.maxHealth, 'a new game at CC0 should see the true base stats');
});

test('the Emperor never breaks off to hunt a raider on its own, even one right beside it', () => {
  const game = new Game({ random: fixedRandom() });
  const emperor = game.sendGuard('EMPEROR').guard;
  emperor.orders = { ...emperor.home };
  game.raiders = [new Raider('CR0', { ...emperor.position })];

  assert.deepEqual(game.guardDestination(emperor), emperor.orders, 'should hold its order, not chase the raider');
  assert.equal(emperor.quarry, null);
});

test('an ordinary guard still hunts nearby raiders exactly as before -- only the Emperor is exempt', () => {
  const game = new Game({ random: fixedRandom() });
  game.tokens = 100000;
  const guard = game.sendGuard('IG_LIGHT').guard;
  const raider = new Raider('CR0', { x: guard.position.x + 50, y: guard.position.y });
  game.raiders = [raider];
  assert.deepEqual(game.guardDestination(guard), raider.position);
});

test('losing the Emperor ends the game, even with the castle still standing', () => {
  const game = new Game({ random: fixedRandom() });
  const emperor = game.sendGuard('EMPEROR').guard;
  assert.equal(game.isDefeated, false);

  emperor.health = -1;
  assert.equal(game.castles[0].health >= 0, true, 'the castle itself is untouched');
  assert.equal(game.isDefeated, true, 'losing the Emperor alone should be enough');
});

test('the Emperor still fights back if a raider actually reaches it, despite never hunting', () => {
  const game = new Game({ random: fixedRandom() });
  const emperor = game.sendGuard('EMPEROR').guard;
  const raider = new Raider('CR0', { ...emperor.position });
  game.raiders = [raider];

  game.step();
  assert.ok(emperor.foes.size > 0 || raider.foes.size > 0, 'proximity alone should still lock them into melee');
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

test('a company under open orders beelines for them and ignores a raider that merely strays near', () => {
  const game = new Game({ random: fixedRandom() });
  game.tokens = 100000;
  const guard = game.sendGuard('IG0').guard;
  game.orderGuards([guard], { x: 300, y: 40 });
  game.raiders = [new Raider('CR0', { x: guard.position.x + 5, y: guard.position.y })];

  assert.deepEqual(game.guardDestination(guard), guard.orders, 'the order should win, not a raider a few steps away');
  assert.equal(guard.quarry, null, 'no quarry should be picked up while an order is still open');
});

test('once it reaches its order, a company goes back to hunting whatever is near, exactly as an idle one does', () => {
  const game = new Game({ random: fixedRandom() });
  game.tokens = 100000;
  const guard = game.sendGuard('IG0').guard;
  const target = { x: 300, y: 40 };
  game.orderGuards([guard], target);
  guard.position = { ...target };
  game.raiders = [new Raider('CR0', { x: target.x + 50, y: target.y })];

  assert.deepEqual(game.guardDestination(guard), game.raiders[0].position, 'arrived, and now free to run down what is close');
  assert.equal(guard.arrived, true);
});

test('the arrival flag is sticky -- chasing a raider away from the held point does not cancel the chase', () => {
  const game = new Game({ random: fixedRandom() });
  game.tokens = 100000;
  const guard = game.sendGuard('IG0').guard;
  // Kept well inside IMPERIAL.leashRadius throughout -- this test is about
  // the arrival flag, not the separate leash/recall mechanic.
  const target = { x: 150, y: 40 };
  game.orderGuards([guard], target);
  guard.position = { ...target };
  const raider = new Raider('CR0', { x: target.x + 70, y: target.y });
  game.raiders = [raider];

  // First call settles it onto the hunt and sends it well clear of `target`.
  assert.deepEqual(game.guardDestination(guard), raider.position);
  guard.position = { x: target.x + 50, y: target.y };

  // Far past IMPERIAL.arriveRadius from `target` by now, but still mid-hunt
  // -- this must still read as free to press the chase, not snap back to
  // "the order is still open" just because it has drifted from that point.
  assert.deepEqual(game.guardDestination(guard), raider.position, 'should still be free to press the chase');
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

// --- the open battleground mode --------------------------------------------

test('the open battleground mode starts with no castle, a placement budget, and the enemy line already drawn up', () => {
  const game = new Game({ random: fixedRandom(0), level: BATTLE_LEVEL });
  assert.equal(game.mode, 'battle');
  assert.equal(game.castles.length, 0, 'no castle stands on an open field');
  assert.equal(game.started, false);
  assert.equal(game.battleBudget, BATTLE.budget);
  assert.ok(game.raiders.length > 0, 'the enemy line is drawn up before Start Battle, not spawned into it');
  assert.equal(game.guards.length, 0, 'the player has placed nothing yet');
});

test('the enemy line fields infantry across the centre, up front, and cavalry behind on the flanks', () => {
  const game = new Game({ random: fixedRandom(0), level: BATTLE_LEVEL });
  const infantry = game.raiders.filter((raider) => raider.typeId.startsWith('IR'));
  const cavalry = game.raiders.filter((raider) => raider.typeId.startsWith('CR'));
  assert.ok(infantry.length >= BATTLE.infantryCountRange[0], 'a real line, not a token few');
  assert.equal(cavalry.length, 2 * BATTLE.cavalryPerSideRange[0], 'one cluster per flank');
  const infantryMaxAbsX = Math.max(...infantry.map((raider) => Math.abs(raider.position.x)));
  const infantryMaxY = Math.max(...infantry.map((raider) => raider.position.y));
  for (const raider of cavalry) {
    assert.ok(Math.abs(raider.position.x) > infantryMaxAbsX, 'cavalry stands wider than the infantry line');
    assert.ok(raider.position.y > infantryMaxY, 'cavalry stands behind the infantry line');
  }
});

test('placing a company spends its cost from the budget and stands it exactly where tapped', () => {
  const game = new Game({ random: fixedRandom(0), level: BATTLE_LEVEL });
  const point = { x: 20, y: BATTLE.baselineY - 10 };
  const result = game.placeGuard('IG_LIGHT', point);
  assert.equal(result.placed, true);
  assert.equal(game.guards.length, 1);
  assert.deepEqual(game.guards[0].position, point);
  const entry = game.battleRoster.find((one) => one.id === 'IG_LIGHT');
  assert.equal(game.battleBudget, BATTLE.budget - entry.cost);
});

test('a company too dear for what is left is refused, and the budget is untouched', () => {
  const game = new Game({ random: fixedRandom(0), level: BATTLE_LEVEL });
  game.battleBudget = 1;
  const result = game.placeGuard('IG_HEAVY', { x: 0, y: BATTLE.baselineY - 10 });
  assert.equal(result.placed, false);
  assert.equal(result.status, 'poor');
  assert.equal(game.guards.length, 0);
  assert.equal(game.battleBudget, 1);
});

test('a company placed north of the start line, or off the sides of the field, is refused', () => {
  const game = new Game({ random: fixedRandom(0), level: BATTLE_LEVEL });
  const north = game.placeGuard('IG_LIGHT', { x: 0, y: BATTLE.baselineY + 10 });
  assert.equal(north.status, 'zone', 'past the start line is the enemy\'s ground, not a deployment zone');
  const wide = game.placeGuard('IG_LIGHT', { x: BATTLE.fieldHalfWidth + 50, y: BATTLE.baselineY - 10 });
  assert.equal(wide.status, 'zone', 'off the side of the field is not a deployment zone either');
  assert.equal(game.guards.length, 0);
  assert.equal(game.battleBudget, BATTLE.budget, 'a refused placement never spends anything');
});

test('nothing may be placed once the battle has started', () => {
  const game = new Game({ random: fixedRandom(0), level: BATTLE_LEVEL });
  game.startBattle();
  const result = game.placeGuard('IG_LIGHT', { x: 0, y: BATTLE.baselineY - 10 });
  assert.equal(result.placed, false);
  assert.equal(result.status, 'blocked');
});

test('an earthwork costs nothing, but only stands within its own length band', () => {
  const game = new Game({ random: fixedRandom(0), level: BATTLE_LEVEL });
  const start = { x: -30, y: BATTLE.baselineY - 20 };
  const tooShort = game.buildEarthwork(start, { x: start.x + 2, y: start.y });
  assert.equal(tooShort.status, 'short');
  assert.equal(game.earthworks.length, 0);
  const end = { x: start.x + 30, y: start.y };
  const built = game.buildEarthwork(start, end);
  assert.equal(built.status, 'built');
  assert.equal(game.earthworks.length, 1);
  assert.equal(game.battleBudget, BATTLE.budget, 'earthworks are free -- there is no treasury to spend');
});

test('undo hands a placed company\'s points back, and tears up an earthwork the same way', () => {
  const game = new Game({ random: fixedRandom(0), level: BATTLE_LEVEL });
  game.placeGuard('IG0', { x: 0, y: BATTLE.baselineY - 10 });
  const afterPlacing = game.battleBudget;
  assert.equal(game.undoLastPlacement(), true);
  assert.equal(game.guards.length, 0);
  assert.equal(game.battleBudget, BATTLE.budget);
  assert.ok(game.battleBudget > afterPlacing);

  game.buildEarthwork({ x: -30, y: BATTLE.baselineY - 20 }, { x: 0, y: BATTLE.baselineY - 20 });
  assert.equal(game.undoLastPlacement(), true);
  assert.equal(game.earthworks.length, 0);

  assert.equal(game.undoLastPlacement(), false, 'nothing left to take back');
});

test('an earthwork slows whatever crosses it, but is never a barrier to route around', () => {
  const game = new Game({ random: fixedRandom(0), level: BATTLE_LEVEL });
  game.buildEarthwork({ x: -25, y: 0 }, { x: 25, y: 0 });
  const onIt = { position: { x: 0, y: 0 }, velocity: { x: 0, y: 1 } };
  const clearOfIt = { position: { x: 0, y: 200 }, velocity: { x: 0, y: 1 } };
  assert.ok(game.paceOn(onIt) < game.paceOn(clearOfIt), 'standing astride it is slower than clear ground');
  assert.equal(game.onEarthwork(onIt.position), true);
  assert.equal(game.onEarthwork(clearOfIt.position), false);
  // Not a wall: it never enters the wall list the route graph is built from.
  assert.equal(game.navigation().barriers.length, 0);
});

test('isDefeated waits for the battle to start, then falls the moment the last company does', () => {
  const game = new Game({ random: fixedRandom(0), level: BATTLE_LEVEL });
  assert.equal(game.isDefeated, false, 'an empty field before Start Battle is not a loss');
  game.placeGuard('IG_LIGHT', { x: 0, y: BATTLE.baselineY - 10 });
  game.startBattle();
  assert.equal(game.isDefeated, false, 'the one company placed is still standing');
  game.guards[0].health = -1;
  game.guards = game.guards.filter((guard) => guard.isAlive);
  assert.equal(game.isDefeated, true, 'the last company fell');
});

test('isVictorious fires once every raider on the field is down, and never before the battle starts', () => {
  const game = new Game({ random: fixedRandom(0), level: BATTLE_LEVEL });
  game.raiders = [];
  assert.equal(game.isVictorious, false, 'a field with nothing on it yet is not a win');
  game.startBattle();
  assert.equal(game.isVictorious, true, 'nothing left standing against an already-started battle');
});

test('the open battleground mode never touches the treasury, seasons or the raider spawn timer', () => {
  const game = new Game({ random: fixedRandom(0), level: BATTLE_LEVEL });
  game.startBattle();
  const tokensBefore = game.tokens;
  const raidersBefore = game.raiders.length;
  stepSeconds(game, RAIDER_SPAWN_INTERVAL_SECONDS * 3);
  assert.equal(game.tokens, tokensBefore, 'no income to collect');
  assert.equal(game.season, 0, 'no season to turn');
  assert.equal(game.raiders.length, raidersBefore, 'the line was drawn up once, not trickled in');
});

test('the Emperor is on the open battleground roster too: free, unique, and its own model', () => {
  const game = new Game({ random: fixedRandom(0), level: BATTLE_LEVEL });
  const entry = game.battleRoster.find((one) => one.id === 'EMPEROR');
  assert.ok(entry, 'expected the Emperor on the battle roster');
  assert.equal(entry.cost, 0);

  const point = { x: 0, y: BATTLE.baselineY - 10 };
  const result = game.placeGuard('EMPEROR', point);
  assert.equal(result.placed, true);
  assert.ok(result.guard instanceof Emperor);
  assert.equal(game.emperor, result.guard);
  assert.equal(game.battleBudget, BATTLE.budget, 'free -- placing it should not touch the budget');

  const again = game.placeGuard('EMPEROR', { x: 20, y: BATTLE.baselineY - 10 });
  assert.equal(again.placed, false);
  assert.equal(again.status, 'unique', 'only one Emperor, the same as a siege');
});

test('undoing the Emperor\'s placement frees it up to be fielded again', () => {
  const game = new Game({ random: fixedRandom(0), level: BATTLE_LEVEL });
  game.placeGuard('EMPEROR', { x: 0, y: BATTLE.baselineY - 10 });
  assert.equal(game.emperorMustered, true);

  game.undoLastPlacement();
  assert.equal(game.emperor, null);
  assert.equal(game.emperorMustered, false);
  assert.equal(game.guards.length, 0);

  const result = game.placeGuard('EMPEROR', { x: 0, y: BATTLE.baselineY - 10 });
  assert.equal(result.placed, true, 'undone, so it should be free to place again');
});

test('losing the Emperor ends an open battleground fight too, even with other companies still standing', () => {
  const game = new Game({ random: fixedRandom(0), level: BATTLE_LEVEL });
  game.placeGuard('EMPEROR', { x: 0, y: BATTLE.baselineY - 10 });
  game.placeGuard('IG_LIGHT', { x: 40, y: BATTLE.baselineY - 10 });
  game.startBattle();
  assert.equal(game.isDefeated, false);

  game.emperor.health = -1;
  assert.equal(game.guards.length, 2, 'the other company is still standing');
  assert.equal(game.isDefeated, true, 'losing the Emperor alone should be enough');
});

test('a raider with a company nearby runs it down rather than making for the Emperor', () => {
  const game = new Game({ random: fixedRandom(0), level: BATTLE_LEVEL });
  // Placed within the deployment zone, then moved -- placeGuard's own zone
  // check is not what this test is about.
  const emperor = game.placeGuard('EMPEROR', { x: 0, y: BATTLE.baselineY - 10 }).guard;
  emperor.position = { x: 0, y: -300 };
  const nearGuard = game.placeGuard('IG_LIGHT', { x: 0, y: BATTLE.baselineY - 10 }).guard;
  const raider = { position: { x: 0, y: BATTLE.baselineY - 10 + 50 } };
  game.raiders = [raider];

  assert.deepEqual(game.raiderDestination(raider), nearGuard.position);
  assert.notDeepEqual(game.raiderDestination(raider), emperor.position);
});

test('with nothing nearby, a raider makes for the Emperor instead of just charging south blind', () => {
  const game = new Game({ random: fixedRandom(0), level: BATTLE_LEVEL });
  const emperor = game.placeGuard('EMPEROR', { x: 15, y: BATTLE.baselineY - 10 }).guard;
  emperor.position = { x: 15, y: -300 };
  const raider = { position: { x: 0, y: 0 } };
  game.raiders = [raider];

  assert.ok(distanceBetween(raider.position, emperor.position) > FEAR.noticeRadius, 'sanity: too far to just be a nearby company');
  assert.deepEqual(game.raiderDestination(raider), emperor.position);
});

test('with no Emperor fielded and nothing nearby, a raider falls back to charging its own lane south', () => {
  const game = new Game({ random: fixedRandom(0), level: BATTLE_LEVEL });
  const raider = { position: { x: 30, y: 0 } };
  game.raiders = [raider];

  assert.deepEqual(game.raiderDestination(raider), { x: 30, y: -BATTLE.fieldHalfDepth });
});

function distanceBetween(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// --- battle stats -----------------------------------------------------------

test('unitSize counts the figures a type\'s own formation actually musters', () => {
  assert.equal(unitSize('EMPEROR'), 1, 'the Emperor rides alone');
  assert.equal(unitSize('IG_LIGHT'), 20);
  assert.equal(unitSize('IR0'), 14);
});

test('a fresh battle starts with every stat at zero', () => {
  const game = new Game({ random: fixedRandom(0), level: BATTLE_LEVEL });
  assert.deepEqual(game.battleStats, {
    kills: 0, deaths: 0, enemyLoss: 0, playerLoss: 0, enemyLossByType: {}, playerLossByType: {},
  });
});

test('trackBattleLosses tallies kills, deaths, and each side\'s individual soldiers lost, by type', () => {
  const game = new Game({ random: fixedRandom(0), level: BATTLE_LEVEL });
  const raider = new Raider('IR0', { x: 0, y: 100 });
  const guard = game.placeGuard('IG_LIGHT', { x: 0, y: BATTLE.baselineY - 10 }).guard;
  game.raiders = [raider];

  const before = new Map([[raider, raider.health], [guard, guard.health]]);
  raider.health -= 4; // wounded, still standing
  guard.health = -1; // this one falls

  game.trackBattleLosses(before);

  assert.equal(game.battleStats.kills, 0, 'the raider is only wounded');
  assert.equal(game.battleStats.deaths, 1, 'the guard fell');
  const enemyIndividuals = (4 / RAIDER_TYPES.IR0.maxHealth) * unitSize('IR0');
  assert.equal(game.battleStats.enemyLoss, enemyIndividuals);
  assert.equal(game.battleStats.enemyLossByType.IR0, enemyIndividuals);
  // Capped at the guard's own max health -- the killing blow drove it well
  // past zero, but none of that overkill is a soldier it never had.
  const guardHealthLost = before.get(guard) - Math.max(guard.health, 0);
  const playerIndividuals = (guardHealthLost / GUARD_TYPES.IG_LIGHT.maxHealth) * unitSize('IG_LIGHT');
  assert.equal(game.battleStats.playerLoss, playerIndividuals);
  assert.equal(game.battleStats.playerLossByType.IG_LIGHT, playerIndividuals);
});

test('a company wiped out entirely loses exactly its own full headcount, not a fraction of it', () => {
  const game = new Game({ random: fixedRandom(0), level: BATTLE_LEVEL });
  const raider = new Raider('CR0', { x: 0, y: 100 });
  game.raiders = [raider];
  const before = new Map([[raider, raider.health]]);
  raider.health = -3; // however far past zero, the company is entirely gone

  game.trackBattleLosses(before);

  assert.equal(game.battleStats.kills, 1);
  const fullLoss = (before.get(raider) / RAIDER_TYPES.CR0.maxHealth) * unitSize('CR0');
  assert.ok(game.battleStats.enemyLoss >= unitSize('CR0') - 0.001, 'overkill should not undercount the headcount lost');
  assert.equal(game.battleStats.enemyLoss, fullLoss);
});

test('losses accumulate across several frames, and split cleanly between types that both took losses', () => {
  const game = new Game({ random: fixedRandom(0), level: BATTLE_LEVEL });
  const swordsman = new Raider('IR0', { x: 0, y: 100 });
  const spearman = new Raider('IR1', { x: 40, y: 100 });
  game.raiders = [swordsman, spearman];

  let before = game.snapshotHealth();
  swordsman.health -= 3;
  game.trackBattleLosses(before);

  before = game.snapshotHealth();
  swordsman.health -= 5;
  spearman.health -= 2;
  game.trackBattleLosses(before);

  const swordsmanLoss = (8 / RAIDER_TYPES.IR0.maxHealth) * unitSize('IR0');
  const spearmanLoss = (2 / RAIDER_TYPES.IR1.maxHealth) * unitSize('IR1');
  const close = (actual, expected) => assert.ok(
    Math.abs(actual - expected) < 1e-9,
    `expected close to ${expected}, got ${actual}`,
  );
  close(game.battleStats.enemyLossByType.IR0, swordsmanLoss);
  close(game.battleStats.enemyLossByType.IR1, spearmanLoss);
  close(game.battleStats.enemyLoss, swordsmanLoss + spearmanLoss);
  assert.equal(game.battleStats.kills, 0);
});

// --- factions in the open battleground mode ---------------------------------

test('unless told otherwise the imperial army meets the steppe horde', () => {
  const game = new Game({ random: fixedRandom(0), level: BATTLE_LEVEL });
  assert.deepEqual(game.factions, { player: 'imperial', enemy: 'steppe' });
});

test('the player is offered only the roster of the faction they chose', () => {
  const game = new Game({
    random: fixedRandom(0), level: BATTLE_LEVEL, factions: { player: 'japan', enemy: 'steppe' },
  });
  const point = { x: 0, y: BATTLE.baselineY - 10 };
  assert.equal(game.placeGuard('IG0', point).status, 'unknown', 'an imperial company is not on offer');
  const placed = game.placeGuard('JG_SAMURAI', point);
  assert.equal(placed.placed, true);
  const cost = FACTIONS.japan.roster.find((entry) => entry.id === 'JG_SAMURAI').cost;
  assert.equal(game.battleBudget, BATTLE.budget - cost);
});

test('the steppe horde can be fielded by the player, cavalry and all', () => {
  const game = new Game({
    random: fixedRandom(0), level: BATTLE_LEVEL, factions: { player: 'steppe', enemy: 'imperial' },
  });
  const result = game.placeGuard('CR0', { x: 0, y: BATTLE.baselineY - 10 });
  assert.equal(result.placed, true);
  assert.equal(result.guard.type.cavalry, true);
});

test('the enemy draws up its line from the faction it was given', () => {
  for (const [enemy, allowed] of [
    ['imperial', ['IG_LIGHT', 'IG0', 'IG_HEAVY']],
    ['japan', ['JG_ASHIGARU', 'JG_SAMURAI', 'JG_SOHEI']],
    ['steppe', ['IR0', 'IR1', 'CR0', 'CR1']],
  ]) {
    const game = new Game({
      random: fixedRandom(0.5), level: BATTLE_LEVEL, factions: { player: 'imperial', enemy },
    });
    assert.ok(game.raiders.length > 0);
    for (const raider of game.raiders) {
      assert.ok(allowed.includes(raider.typeId), `${enemy} should not field ${raider.typeId}`);
    }
  }
});

test('both sides may choose the same faction', () => {
  const game = new Game({
    random: fixedRandom(0), level: BATTLE_LEVEL, factions: { player: 'japan', enemy: 'japan' },
  });
  assert.equal(game.placeGuard('JG_SOHEI', { x: 0, y: BATTLE.baselineY - 10 }).placed, true);
  assert.ok(game.raiders.every((raider) => raider.typeId.startsWith('JG_')));
});

test('an unknown faction falls back to the default for its side', () => {
  const game = new Game({
    random: fixedRandom(0), level: BATTLE_LEVEL, factions: { player: 'atlantis', enemy: 'japan' },
  });
  assert.deepEqual(game.factions, { player: 'imperial', enemy: 'japan' });
});

test('the Emperor answers to the imperial army alone', () => {
  for (const [id, faction] of Object.entries(FACTIONS)) {
    const offered = faction.roster.some((entry) => entry.id === 'EMPEROR');
    assert.equal(offered, id === 'imperial', `${id} and the Emperor`);
  }
});

test('every faction is fully playable: known types, portraits and models, on either side', () => {
  for (const [id, faction] of Object.entries(FACTIONS)) {
    const types = [...faction.roster.map((entry) => entry.id), ...faction.line.infantry, ...faction.line.flank];
    assert.ok(faction.name && faction.blurb, `${id} needs a name and a description`);
    assert.ok(faction.line.infantry.length > 0 && faction.line.flank.length > 0, `${id} needs a full line`);
    for (const typeId of types) {
      assert.doesNotThrow(() => new Raider(typeId), `${typeId} as an enemy`);
      assert.doesNotThrow(() => new Guard(typeId), `${typeId} as a player company`);
      assert.ok(compileUnit(typeId), `${typeId} needs a model`);
    }
  }
});
