import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { DEBUG, FPS, GAME_SPEEDS } from '../src/config.js';
import { simulationSteps } from '../src/clock.js';

const fixedRandom = () => () => 0;

function stepSeconds(game, seconds) {
  for (let frame = 0; frame < seconds * FPS; frame += 1) {
    game.step();
  }
}

function distanceFrom(start, position) {
  return Math.hypot(position.x - start.x, position.y - start.y);
}

function marchedDistance(raiderSpeed) {
  const game = new Game({ random: fixedRandom() });
  game.debug.raiderSpeed = raiderSpeed;
  game.spawnRaider();
  const start = { ...game.raiders[0].position };
  stepSeconds(game, 1);
  return distanceFrom(start, game.raiders[0].position);
}

test('infinite money keeps the purse topped up however much is spent', () => {
  const game = new Game({ random: fixedRandom() });
  game.debug.infiniteMoney = true;
  game.tokens = 0;
  game.step();
  assert.ok(game.tokens >= DEBUG.moneyFloor);
});

test('granting money adds to the purse', () => {
  const game = new Game({ random: fixedRandom() });
  const before = game.tokens;
  game.grantMoney(DEBUG.grantAmount);
  assert.equal(game.tokens, before + DEBUG.grantAmount);
});

test('attackers march in proportion to the attacker speed and stand still at zero', () => {
  const normal = marchedDistance(1);
  assert.ok(normal > 0, 'a raider marches at all');
  assert.ok(marchedDistance(2) > normal * 1.6, 'double speed goes about twice as far');
  assert.ok(marchedDistance(0.5) < normal * 0.7, 'half speed goes about half as far');
  assert.equal(marchedDistance(0), 0, 'frozen attackers do not move');
});

test('switching raider spawns off stops new raiders arriving', () => {
  const on = new Game({ random: fixedRandom() });
  stepSeconds(on, 30);
  assert.ok(on.raiders.length > 0, 'raiders arrive by default');

  const off = new Game({ random: fixedRandom() });
  off.debug.spawnRaiders = false;
  stepSeconds(off, 30);
  assert.equal(off.raiders.length, 0);
});

test('an invulnerable city and walls stand however hard they are hit', () => {
  const game = new Game({ random: fixedRandom() });
  game.debug.invulnerable = true;
  const castle = game.castles[0];
  castle.health = 1;
  game.step();
  assert.equal(castle.health, castle.effectiveType.maxHealth);
  assert.equal(game.isDefeated, false);
});

test('debug settings outlive a restart, so a level change does not undo them', () => {
  const game = new Game({ random: fixedRandom() });
  game.debug.raiderSpeed = 2;
  game.restart();
  assert.equal(game.debug.raiderSpeed, 2);
});

test('the debug settings begin neutral', () => {
  const game = new Game({ random: fixedRandom() });
  assert.deepEqual(game.debug, {
    infiniteMoney: false, invulnerable: false, spawnRaiders: true, raiderSpeed: 1,
  });
});

test('the simulation runs one step per frame at medium speed, whatever the frame jitter', () => {
  let carry = 0;
  for (const seconds of [0.0165, 0.0170, 0.0162, 0.0171, 0.0166]) {
    const result = simulationSteps(carry, seconds, 1);
    assert.equal(result.steps, 1);
    carry = result.carry;
  }
});

test('game speed scales how many steps the same time buys', () => {
  const stepsOver = (speed) => {
    let carry = 0;
    let total = 0;
    for (let frame = 0; frame < 120; frame += 1) {
      const result = simulationSteps(carry, 1 / 60, speed);
      total += result.steps;
      carry = result.carry;
    }
    return total;
  };
  assert.equal(stepsOver(1), 120);
  assert.equal(stepsOver(2), 240);
  assert.equal(stepsOver(0.5), 60);
});

test('a long stall does not buy a burst of steps that freezes the page', () => {
  const { steps } = simulationSteps(0, 30, GAME_SPEEDS[GAME_SPEEDS.length - 1].factor);
  assert.ok(steps <= DEBUG.maxStepsPerFrame);
});

test('the game speeds run slow, medium, fast around a medium of one', () => {
  assert.deepEqual(GAME_SPEEDS.map((speed) => speed.name), ['Slow', 'Medium', 'Fast']);
  assert.equal(GAME_SPEEDS[1].factor, 1);
  assert.ok(GAME_SPEEDS[0].factor < 1 && GAME_SPEEDS[2].factor > 1);
});
