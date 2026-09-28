import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { LEVELS } from '../src/levels.js';
import { TERRAIN } from '../src/config.js';

/** A game whose ground is a ramp climbing towards +x, and nothing else. */
function onARamp(gradient = 0.4) {
  const game = new Game({ random: () => 0.5, level: LEVELS[0] });
  game.terrain.heightAt = (x) => x * gradient;
  game.terrain.forestAt = () => 0;
  return game;
}

/** A company standing at the origin, heading the way given. */
function heading(x, y) {
  return { position: { x: 0, y: 0 }, velocity: { x, y } };
}

test('climbing is slow, holding a contour is not, and descending is free', () => {
  const game = onARamp();
  const uphill = game.paceOn(heading(1, 0));
  const downhill = game.paceOn(heading(-1, 0));
  const across = game.paceOn(heading(0, 1));

  assert.ok(uphill < across, `uphill ${uphill.toFixed(2)} should cost more than across ${across.toFixed(2)}`);
  assert.equal(across, 1, 'holding a contour is ordinary going');
  assert.equal(downhill, 1, 'and coming down costs nothing');
});

test('the steeper the climb the slower the company, down to a floor', () => {
  const gentle = onARamp(0.1).paceOn(heading(1, 0));
  const steep = onARamp(0.6).paceOn(heading(1, 0));
  const cliff = onARamp(20).paceOn(heading(1, 0));

  assert.ok(gentle > steep, 'a steeper slope should cost more');
  assert.ok(gentle > 0.75, `gentle ground should barely tell, it gave ${gentle.toFixed(2)}`);
  assert.equal(cliff, TERRAIN.minClimbPace, 'nothing is ever slowed past the floor');
});

test('level ground and a standing company are left alone', () => {
  const flat = new Game({ random: () => 0.5, level: LEVELS[0] });
  flat.terrain.heightAt = () => 12;
  flat.terrain.forestAt = () => 0;
  assert.equal(flat.paceOn(heading(1, 0)), 1);

  const ramp = onARamp();
  assert.equal(ramp.paceOn(heading(0, 0)), 1, 'a company going nowhere is climbing nothing');
});

test('woodland and the climb both tell, together', () => {
  const game = onARamp();
  game.terrain.forestAt = () => 1;
  const inTheOpen = onARamp().paceOn(heading(1, 0));
  const inTheWoods = game.paceOn(heading(1, 0));
  assert.ok(inTheWoods < inTheOpen, 'a wooded hillside is worse than a bare one');
  assert.ok(
    Math.abs(inTheWoods - inTheOpen * (1 - TERRAIN.forestDrag)) < 1e-9,
    'and the two multiply rather than one replacing the other',
  );
});

test('it applies on every level, to raiders and defenders alike', () => {
  for (const level of LEVELS) {
    const game = new Game({ random: () => 0.5, level });
    game.terrain.heightAt = (x) => x * 0.5;
    game.terrain.forestAt = () => 0;
    assert.ok(game.paceOn(heading(1, 0)) < game.paceOn(heading(-1, 0)),
      `${level.id} should slow a climb`);
  }

  // Both sides are moved through the same rule.
  const game = onARamp();
  game.tokens = 100000;
  game.spawnRaider();
  const sent = game.sendGuard(game.dispatchOptions()[0].id, { x: 200, y: 0 });
  assert.equal(sent.sent, true, 'the company should have been mustered');
  const raider = game.raiders[0];
  const guard = game.guards[0];
  for (const company of [raider, guard]) {
    company.position = { x: 0, y: 0 };
    company.velocity = { x: 1, y: 0 };
    const up = game.paceOn(company);
    company.velocity = { x: -1, y: 0 };
    assert.ok(up < game.paceOn(company), 'both sides should feel the hill');
  }
});

test('a real hillside slows a company by a real amount', () => {
  const game = new Game({ random: () => 0.5, level: LEVELS.find((one) => one.land.hill) });
  const hill = game.terrain.land.hill;
  // Part way up the island's own hill, heading for the summit.
  const at = { x: hill.radius * 0.5, y: 0 };
  const climbing = game.paceOn({ position: at, velocity: { x: -1, y: 0 } });
  const descending = game.paceOn({ position: at, velocity: { x: 1, y: 0 } });
  assert.ok(climbing < descending * 0.8,
    `climbing the hill gave ${climbing.toFixed(2)} against ${descending.toFixed(2)} coming down`);
});
