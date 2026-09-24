import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { Castle, Wall } from '../src/entities.js';
import { CASTLE_TYPES, FPS, WALL, WALL_TIERS } from '../src/config.js';

function gameWith(tokens = 100000) {
  const game = new Game({ random: () => 0 });
  game.castles = [new Castle('CC0')];
  game.tokens = tokens;
  return game;
}

/** A finished section out beyond the city, and the point that aims at it. */
function standing(game) {
  const wall = game.buildWall({ x: 200, y: -60 }, { x: 200, y: 60 }).wall;
  wall.finish();
  return wall;
}

const AT = { x: 200, y: 0 };

function stepSeconds(game, seconds) {
  for (let frame = 0; frame < Math.round(seconds * FPS); frame += 1) {
    game.step();
  }
}

// --- the same section grows; nothing new is spawned ----------------------

test('fortifying grows the section already there rather than adding one', () => {
  const game = gameWith();
  const wall = standing(game);
  game.upgradeWallAt(AT);
  stepSeconds(game, WALL_TIERS[1].seconds);

  assert.equal(game.walls.length, 1, 'still one section on the field');
  assert.equal(game.walls[0], wall, 'and it is the same entity, grown');
  assert.equal(wall.tier, 1);
});

test('a plain section stands one wide and one tall', () => {
  const wall = new Wall({ x: 0, y: 0 }, { x: 100, y: 0 });
  assert.equal(wall.heightScale, 1);
  assert.equal(wall.widthScale, 1);
});

// --- first tier: twice the height ----------------------------------------

test('the first upgrade doubles the height over its full ten seconds', () => {
  const game = gameWith();
  const wall = standing(game);
  assert.equal(game.upgradeWallAt(AT).status, 'working');

  assert.equal(wall.heightScale, 1, 'nothing has grown on the first frame');
  stepSeconds(game, WALL_TIERS[1].seconds / 2);
  assert.ok(wall.heightScale > 1.4 && wall.heightScale < 1.6, `half risen, got ${wall.heightScale}`);
  assert.equal(wall.widthScale, 1, 'height first, width is the next tier');

  stepSeconds(game, WALL_TIERS[1].seconds / 2);
  assert.equal(wall.heightScale, 2, 'fully raised');
  assert.equal(wall.tier, 1);
});

test('the raised section holds its old strength until it has finished rising', () => {
  const game = gameWith();
  const wall = standing(game);
  const plain = wall.maxHealth;
  game.upgradeWallAt(AT);

  stepSeconds(game, WALL_TIERS[1].seconds - 1);
  assert.equal(wall.maxHealth, plain, 'still only as strong as the stone that stands');
  assert.equal(wall.upkeep, WALL.upkeepPerSection, 'and still on the old bill');

  stepSeconds(game, 1);
  assert.equal(wall.maxHealth, plain * 2, 'twice the health once risen');
  assert.equal(wall.upkeep, WALL.upkeepPerSection * 2, 'and twice the upkeep');
  assert.equal(wall.health, wall.maxHealth, 'a whole wall comes out whole');
});

// --- second tier: twice the width ----------------------------------------

test('the second upgrade doubles the width over twenty seconds, health again', () => {
  const game = gameWith();
  const wall = standing(game);
  game.upgradeWallAt(AT);
  stepSeconds(game, WALL_TIERS[1].seconds);

  assert.equal(game.upgradeWallAt(AT).status, 'working');
  stepSeconds(game, WALL_TIERS[2].seconds / 2);
  assert.ok(wall.widthScale > 1.4 && wall.widthScale < 1.6, `half widened, got ${wall.widthScale}`);
  assert.equal(wall.heightScale, 2, 'it keeps the height it already earned');

  stepSeconds(game, WALL_TIERS[2].seconds / 2);
  assert.equal(wall.widthScale, 2);
  assert.equal(wall.tier, 2);
  assert.equal(wall.maxHealth, WALL.maxHealth * 4, 'four times a plain section');
  assert.equal(wall.upkeep, WALL.upkeepPerSection * 4);
});

test('a reinforced section cannot be fortified any further', () => {
  const game = gameWith();
  const wall = standing(game);
  game.upgradeWallAt(AT);
  stepSeconds(game, WALL_TIERS[1].seconds);
  game.upgradeWallAt(AT);
  stepSeconds(game, WALL_TIERS[2].seconds);

  const before = game.tokens;
  assert.equal(game.upgradeWallAt(AT).status, 'max');
  assert.equal(game.tokens, before, 'and nothing is charged for asking');
  assert.equal(wall.canUpgrade, false);
});

// --- what it costs -------------------------------------------------------

test('a reinforced section costs four times what the plain one did', () => {
  const game = gameWith();
  const wall = standing(game);
  const plain = game.wallCost(wall.length);

  let spent = 0;
  let before = game.tokens;
  game.upgradeWallAt(AT);
  spent += before - game.tokens;
  stepSeconds(game, WALL_TIERS[1].seconds);

  before = game.tokens;
  game.upgradeWallAt(AT);
  spent += before - game.tokens;
  stepSeconds(game, WALL_TIERS[2].seconds);

  // The build price plus both upgrades: 1 + 1 + 2.
  assert.equal(plain + spent, plain * 4);
});

test('an upgrade the treasury cannot cover is refused', () => {
  const game = gameWith();
  const wall = standing(game);
  game.tokens = 0;
  assert.equal(game.upgradeWallAt(AT).status, 'poor');
  assert.equal(wall.isUpgrading, false, 'no work started');
  assert.equal(wall.tier, 0);
});

test('sweeping the tool back over work already in hand charges nothing more', () => {
  const game = gameWith();
  standing(game);
  game.upgradeWallAt(AT);
  const before = game.tokens;
  assert.equal(game.upgradeWallAt(AT).status, 'working');
  assert.equal(game.tokens, before);
});

test('a section still pegged out cannot be fortified', () => {
  const game = gameWith();
  game.buildWall({ x: 200, y: -60 }, { x: 200, y: 60 });
  const before = game.tokens;
  assert.equal(game.upgradeWallAt(AT).status, 'planning');
  assert.equal(game.tokens, before);
});

test('pointing the fortify tool at open ground does nothing', () => {
  const game = gameWith();
  standing(game);
  const before = game.tokens;
  assert.equal(game.upgradeWallAt({ x: -900, y: -900 }).status, 'none');
  assert.equal(game.tokens, before);
});

// --- the bill ------------------------------------------------------------

test('upkeep is counted in units, so a fortified section costs its multiple', () => {
  const game = gameWith();
  const wall = standing(game);
  assert.equal(game.incomeBreakdown.upkeepUnits, 1);

  game.upgradeWallAt(AT);
  stepSeconds(game, WALL_TIERS[1].seconds);
  assert.equal(game.incomeBreakdown.upkeepUnits, 2, 'a raised section is two units');
  assert.equal(game.incomeBreakdown.wallCount, 1, 'but it is still one section');

  game.upgradeWallAt(AT);
  stepSeconds(game, WALL_TIERS[2].seconds);
  const breakdown = game.incomeBreakdown;
  assert.equal(breakdown.upkeepUnits, 4);
  assert.equal(breakdown.wallUpkeep, WALL.upkeepPerSection * 4);
  // Houses fill in on their own while the work runs, so read the rest of the
  // total off the breakdown and pin only what upkeep takes out of it.
  assert.equal(breakdown.cityIncome, CASTLE_TYPES.CC0.wealth);
  assert.equal(
    breakdown.total,
    breakdown.cityIncome + breakdown.houseIncome - WALL.upkeepPerSection * 4,
  );
  assert.equal(wall.tier, 2);
});

// --- damage carries across the work --------------------------------------

test('a battered section comes out of the work just as battered', () => {
  const game = gameWith();
  const wall = standing(game);
  wall.health = wall.maxHealth * 0.5;
  game.upgradeWallAt(AT);
  stepSeconds(game, WALL_TIERS[1].seconds);
  assert.equal(wall.health, wall.maxHealth * 0.5, 'still half gone, of a bigger whole');
});

test('repairing a raised section fills it to its own, larger ceiling', () => {
  const game = gameWith();
  const wall = standing(game);
  game.upgradeWallAt(AT);
  stepSeconds(game, WALL_TIERS[1].seconds);

  wall.health = wall.maxHealth * 0.5;
  assert.equal(game.repairWallAt(AT).status, 'repairing');
  wall.raise(WALL.repairSeconds);
  assert.equal(wall.health, WALL.maxHealth * 2);
});

test('razing a reinforced section gives back a share of all that was spent', () => {
  const game = gameWith();
  const wall = standing(game);
  const plainRefund = wall.refundValue;

  game.upgradeWallAt(AT);
  stepSeconds(game, WALL_TIERS[1].seconds);
  game.upgradeWallAt(AT);
  stepSeconds(game, WALL_TIERS[2].seconds);

  // It cost four times as much to raise, so it is worth four times as much
  // to pull down — the plain section's refund is unchanged by any of this.
  assert.equal(wall.refundValue, plainRefund * WALL_TIERS[2].paid);
});

// --- aiming at the right section ------------------------------------------
//
// Raze, Repair and Fortify all pick their target the same way, and all three
// spend money on whatever they pick, so picking the neighbour is not a
// cosmetic slip. Parallel runs a short way apart are the case that catches it.

test('the tool fortifies the run under the cursor, not its neighbour', () => {
  const game = gameWith();
  const rows = [160, 230, 300].map((y) => {
    const wall = game.buildWall({ x: -60, y }, { x: 60, y }).wall;
    wall.finish();
    return wall;
  });

  game.upgradeWallAt({ x: 0, y: 230 });
  stepSeconds(game, WALL_TIERS[1].seconds);
  assert.deepEqual(rows.map((wall) => wall.tier), [0, 1, 0], 'only the middle run grew');
});

test('the repair tool mends the run under the cursor, not its neighbour', () => {
  const game = gameWith();
  const rows = [160, 230].map((y) => {
    const wall = game.buildWall({ x: -60, y }, { x: 60, y }).wall;
    wall.finish();
    return wall;
  });
  for (const wall of rows) {
    wall.health = wall.maxHealth * 0.5;
  }

  game.repairWallAt({ x: 0, y: 230 });
  assert.equal(rows[1].isRepairing, true, 'the one pointed at');
  assert.equal(rows[0].isRepairing, false, 'and not the one beside it');
});

test('a tool aimed between two runs, well clear of both, takes neither', () => {
  const game = gameWith();
  const rows = [160, 560].map((y) => {
    const wall = game.buildWall({ x: -60, y }, { x: 60, y }).wall;
    wall.finish();
    return wall;
  });
  assert.equal(game.upgradeWallAt({ x: 0, y: 360 }).status, 'none');
  assert.deepEqual(rows.map((wall) => wall.tier), [0, 0]);
});
