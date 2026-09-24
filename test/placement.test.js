import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { Castle, Wall } from '../src/entities.js';
import { CASTLE_TYPES, WALL } from '../src/config.js';
import { BUILDINGS } from '../src/buildings/index.js';
import { closestPointOnSquare, distanceToSquare, segmentEntersSquare } from '../src/geometry.js';

const TIERS = Object.keys(CASTLE_TYPES);

function gameWith(typeId, tokens = 100000) {
  const game = new Game({ random: () => 0 });
  game.castles = [new Castle(typeId)];
  game.tokens = tokens;
  return game;
}

test('the footprint that blocks walls matches the structure that is drawn', () => {
  for (const [typeId, type] of Object.entries(CASTLE_TYPES)) {
    assert.equal(type.footprint, BUILDINGS[typeId].radius,
      `${typeId} blocks ${type.footprint} but draws ${BUILDINGS[typeId].radius}`);
  }
});

// --- walls may not cross a city -------------------------------------------

for (const typeId of TIERS) {
  const half = CASTLE_TYPES[typeId].footprint;

  test(`${typeId}: a wall drawn straight through the city is refused`, () => {
    const game = gameWith(typeId);
    const reach = half + 80;
    for (const [from, to] of [
      [{ x: -reach, y: 0 }, { x: reach, y: 0 }],
      [{ x: 0, y: -reach }, { x: 0, y: reach }],
      [{ x: -reach, y: -reach }, { x: reach, y: reach }],
    ]) {
      assert.equal(game.buildWall(from, to).status, 'blocked');
    }
    assert.equal(game.walls.length, 0, 'nothing was built');
  });

  test(`${typeId}: a wall clear of the city is allowed`, () => {
    const game = gameWith(typeId);
    const outside = half + 120;
    const result = game.buildWall({ x: -80, y: outside }, { x: 80, y: outside });
    assert.equal(result.status, 'built');
  });

  test(`${typeId}: a wall end near the city snaps onto its edge`, () => {
    const game = gameWith(typeId);
    const justOutside = { x: half + 10, y: 0 };
    const snapped = game.snapPoint(justOutside);
    assert.ok(distanceToSquare(snapped, game.castles[0].position, half) < 1e-9,
      'the snapped end sits on the city edge');
    assert.deepEqual(snapped, closestPointOnSquare(justOutside, game.castles[0].position, half));
  });

  test(`${typeId}: a wall meeting the city edge is not treated as crossing it`, () => {
    const game = gameWith(typeId);
    const result = game.buildWall({ x: half + 120, y: 0 }, { x: half + 10, y: 0 });
    assert.equal(result.status, 'built', 'a wall may touch the brim');
    assert.ok(distanceToSquare(result.end, game.castles[0].position, half) < 1e-9);
  });
}

test('a point inside the city is pushed out to the nearest edge', () => {
  const game = gameWith('CC1');
  const half = CASTLE_TYPES.CC1.footprint;
  const snapped = game.snapPoint({ x: half - 4, y: 0 });
  assert.ok(Math.abs(snapped.x - half) < 1e-9, 'pushed to the eastern edge');
});

test('existing wall ends still win over the city brim', () => {
  const game = gameWith('CC0');
  const half = CASTLE_TYPES.CC0.footprint;
  const node = { x: half + 8, y: 0 };
  game.walls.push(new Wall(node, { x: half + 200, y: 0 }));
  assert.equal(game.snapPoint({ x: half + 9, y: 1 }), node, 'shares the existing node');
});

// --- redrawing a wall repairs it ------------------------------------------

/**
 * Lay a section and see its planning phase out, so it is stone a redraw can
 * actually work on rather than a line of pegs.
 */
function laySection(game, from, to) {
  const result = game.buildWall(from, to);
  if (result.wall) {
    result.wall.raise(WALL.planSeconds);
  }
  return result;
}

test('a section still pegged out cannot be repaired into existence', () => {
  const game = gameWith('CC0');
  const from = { x: 200, y: -60 };
  const to = { x: 200, y: 60 };
  const wall = game.buildWall(from, to).wall;
  const before = game.tokens;

  const result = game.buildWall(from, to);
  assert.equal(result.status, 'planning');
  assert.equal(game.tokens, before, 'nothing charged');
  assert.equal(wall.isPlanned, true, 'still only pegs');
  assert.equal(wall.isComplete, false, 'the three seconds cannot be bought back');
  assert.equal(game.walls.length, 1, 'no duplicate section');
});

test('redrawing over a damaged wall starts a repair instead of stacking a new one', () => {
  const game = gameWith('CC0');
  const from = { x: 200, y: -60 };
  const to = { x: 200, y: 60 };
  assert.equal(laySection(game, from, to).status, 'built');
  const wall = game.walls[0];
  wall.health = WALL.maxHealth * 0.25;

  const before = game.tokens;
  const result = game.buildWall(from, to);
  assert.equal(result.status, 'repairing');
  assert.equal(game.walls.length, 1, 'no duplicate section');
  assert.equal(wall.isRepairing, true);
  assert.equal(wall.health, WALL.maxHealth * 0.25, 'paid for, but not yet made good');

  // Three quarters were missing, so three quarters of the build price.
  const expected = Math.trunc(game.wallCost(wall.length) * 0.75);
  assert.equal(before - game.tokens, expected);

  // It climbs to full over the repair window, same as it went up originally.
  wall.raise(WALL.repairSeconds);
  assert.equal(wall.health, WALL.maxHealth);
  assert.equal(wall.isRepairing, false);
});

test('repair is charged in proportion to the damage', () => {
  const game = gameWith('CC0');
  laySection(game, { x: 200, y: -60 }, { x: 200, y: 60 });
  const wall = game.walls[0];
  const full = game.wallCost(wall.length);

  const costFor = (fraction) => {
    wall.health = WALL.maxHealth * (1 - fraction);
    const before = game.tokens;
    game.buildWall({ x: 200, y: -60 }, { x: 200, y: 60 });
    wall.raise(WALL.repairSeconds); // let this order finish before the next one starts
    return before - game.tokens;
  };
  assert.equal(costFor(0.5), Math.trunc(full * 0.5));
  assert.equal(costFor(0.1), Math.trunc(full * 0.1));
});

test('redrawing over a wall already being repaired charges nothing more', () => {
  const game = gameWith('CC0');
  laySection(game, { x: 200, y: -60 }, { x: 200, y: 60 });
  const wall = game.walls[0];
  wall.health = WALL.maxHealth * 0.5;
  game.buildWall({ x: 200, y: -60 }, { x: 200, y: 60 });

  const before = game.tokens;
  const result = game.buildWall({ x: 200, y: -60 }, { x: 200, y: 60 });
  assert.equal(result.status, 'repairing', 'a drag chain sweeping back over it still carries on');
  assert.equal(game.tokens, before, 'no second charge for the same order');
});

test('redrawing a finished, undamaged wall is free and changes nothing', () => {
  const game = gameWith('CC0');
  game.buildWall({ x: 200, y: -60 }, { x: 200, y: 60 }).wall.finish();
  const before = game.tokens;
  const result = game.buildWall({ x: 200, y: -60 }, { x: 200, y: 60 });
  assert.equal(result.status, 'intact');
  assert.equal(game.walls.length, 1);
  assert.equal(game.tokens, before);
});

test('redrawing an unfinished wall pays to finish it, health climbing rather than snapping', () => {
  const game = gameWith('CC0');
  const wall = laySection(game, { x: 200, y: -60 }, { x: 200, y: 60 }).wall;
  const result = game.buildWall({ x: 200, y: -60 }, { x: 200, y: 60 });
  assert.equal(result.status, 'repairing');
  // The shape is whole at once -- only its condition still has to heal.
  assert.equal(wall.isComplete, true);
  assert.ok(wall.health < WALL.maxHealth, 'not full yet');
  assert.equal(game.walls.length, 1, 'still one section');

  wall.raise(WALL.repairSeconds);
  assert.equal(wall.health, WALL.maxHealth);
});

test('a wall drawn in the reverse direction still repairs rather than stacks', () => {
  const game = gameWith('CC0');
  laySection(game, { x: 200, y: -60 }, { x: 200, y: 60 });
  game.walls[0].health = 10;
  assert.equal(game.buildWall({ x: 200, y: 60 }, { x: 200, y: -60 }).status, 'repairing');
  assert.equal(game.walls.length, 1);
});

test('a repair the treasury cannot cover is refused', () => {
  const game = gameWith('CC0');
  laySection(game, { x: 200, y: -60 }, { x: 200, y: 60 });
  game.walls[0].health = 1;
  game.tokens = 0;
  assert.equal(game.buildWall({ x: 200, y: -60 }, { x: 200, y: 60 }).status, 'poor');
  assert.equal(game.walls[0].health, 1, 'left damaged');
});

// --- upgrading clears what it builds over ---------------------------------

test('upgrading demolishes the walls its larger footprint covers', () => {
  const game = gameWith('CC0');
  const smallHalf = CASTLE_TYPES.CC0.footprint;
  const mediumHalf = CASTLE_TYPES.CC1.footprint;

  // One ring inside the coming compound, one safely beyond it.
  const doomed = new Wall({ x: -40, y: smallHalf + 12 }, { x: 40, y: smallHalf + 12 });
  const spared = new Wall({ x: -40, y: mediumHalf + 60 }, { x: 40, y: mediumHalf + 60 });
  game.walls.push(doomed, spared);

  const messages = [];
  game.onMessage = (text) => messages.push(text);
  assert.equal(game.upgradeCastle(0), true);

  assert.deepEqual(game.walls, [spared], 'only the covered wall went');
  assert.match(messages.at(-1), /1 wall section cleared/);
});

test('cleared walls are refunded, so upgrading never quietly costs extra', () => {
  const game = gameWith('CC0');
  const doomed = new Wall({ x: -40, y: 34 }, { x: 40, y: 34 });
  doomed.health = WALL.maxHealth;
  game.walls.push(doomed);

  const before = game.tokens;
  game.upgradeCastle(0);
  assert.equal(game.tokens, before - CASTLE_TYPES.CC1.cost + doomed.refundValue);
});

test('an upgrade that covers nothing says nothing about clearing', () => {
  const game = gameWith('CC0');
  game.walls.push(new Wall({ x: -40, y: 400 }, { x: 40, y: 400 }));
  const messages = [];
  game.onMessage = (text) => messages.push(text);
  game.upgradeCastle(0);
  assert.equal(game.walls.length, 1);
  assert.doesNotMatch(messages.at(-1), /cleared/);
});

test('every tier clears the walls its own footprint covers', () => {
  for (const [typeId, type] of Object.entries(CASTLE_TYPES)) {
    const game = gameWith(typeId);
    const inside = new Wall({ x: -5, y: 0 }, { x: 5, y: 0 });
    game.walls.push(inside);
    assert.equal(game.clearWallsUnder(game.castles[0]), 1, `${typeId} should clear it`);
    assert.ok(segmentEntersSquare(inside.start, inside.end, game.castles[0].position, type.footprint));
  }
});

test('clicking anywhere on a city upgrades it, including dead centre', () => {
  for (const typeId of ['CC0', 'CC1']) {
    const game = gameWith(typeId);
    const half = CASTLE_TYPES[typeId].footprint;
    assert.equal(game.upgradeCastleAt({ x: 0, y: 0 }), true, `${typeId} centre`);

    const other = gameWith(typeId);
    assert.equal(other.upgradeCastleAt({ x: half - 2, y: 0 }), true, `${typeId} edge`);

    const far = gameWith(typeId);
    assert.equal(far.upgradeCastleAt({ x: half + 200, y: 0 }), false, `${typeId} miss`);
  }
});

// A diagonal meeting only the two opposite corners touches each edge at a
// vertex, which an edge-crossing test misses. It must still count as crossing.
test('a diagonal through opposite corners counts as crossing', () => {
  for (const [typeId, type] of Object.entries(CASTLE_TYPES)) {
    const game = gameWith(typeId);
    const reach = type.footprint + 80;
    assert.equal(game.buildWall({ x: -reach, y: -reach }, { x: reach, y: reach }).status, 'blocked',
      `${typeId} diagonal`);
    assert.equal(game.buildWall({ x: -reach, y: reach }, { x: reach, y: -reach }).status, 'blocked',
      `${typeId} anti-diagonal`);
  }
});

test('a wall running flush along a city edge is allowed', () => {
  const game = gameWith('CC1');
  const half = CASTLE_TYPES.CC1.footprint;
  assert.equal(segmentEntersSquare({ x: half, y: -80 }, { x: half, y: 80 }, { x: 0, y: 0 }, half), false);
});

test('a wall clear of the city on every side is allowed', () => {
  const game = gameWith('CC2');
  const beyond = CASTLE_TYPES.CC2.footprint + 60;
  assert.equal(segmentEntersSquare({ x: -200, y: beyond }, { x: 200, y: beyond }, { x: 0, y: 0 }, CASTLE_TYPES.CC2.footprint), false);
});
