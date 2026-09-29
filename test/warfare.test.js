import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { Guard, Raider } from '../src/entities.js';
import {
  chargeImpact, isBraced, lockEngagements, resolveMelee,
} from '../src/melee.js';
import {
  CHARGE, FPS, GUARD_TYPES, HOLD, MASS, MELEE, MOMENTUM, RAIDER_TYPES, ROUT,
} from '../src/config.js';

const FRAME = 1 / FPS;

function fixedRandom(value = 0) {
  return () => value;
}

/** A company already moving at `momentum` of its own pace, heading along (dx, dy). */
function moving(company, momentum, dx, dy) {
  const length = Math.hypot(dx, dy);
  company.velocity = { x: company.type.speed * dx / length, y: company.type.speed * dy / length };
  company.momentum = momentum;
  return company;
}

function close(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${message ?? ''} expected ${expected}, got ${actual}`);
}

// --- momentum ------------------------------------------------------------------

test('a company starts from a standstill and takes MOMENTUM.accelerationSeconds to reach full pace', () => {
  const raider = new Raider('IR0');
  assert.equal(raider.momentum, 0);
  for (let frame = 0; frame < (MOMENTUM.accelerationSeconds / 2) * FPS; frame += 1) {
    raider.gatherPace(FRAME);
  }
  close(raider.momentum, 0.5, 'halfway through the ramp');
  for (let frame = 0; frame < MOMENTUM.accelerationSeconds * FPS; frame += 1) {
    raider.gatherPace(FRAME);
  }
  assert.equal(raider.momentum, 1);
});

test('a company moves only as fast as the pace it has gathered', () => {
  const raider = moving(new Raider('IR0', { x: 0, y: 0 }), 0.25, 1, 0);
  raider.advance(1);
  close(raider.position.x, raider.type.speed * 0.25);
});

test('turning bleeds pace off, and a sharper turn bleeds off more', () => {
  const gentle = moving(new Raider('CR0'), 1, 1, 0);
  const sharp = moving(new Raider('CR0'), 1, 1, 0);
  gentle.turnAngle = Math.PI / 6;
  sharp.turnAngle = Math.PI;
  for (let frame = 0; frame < FPS; frame += 1) {
    gentle.gatherPace(FRAME);
    sharp.gatherPace(FRAME);
  }
  assert.ok(gentle.momentum < 1, 'even a gentle turn costs something');
  assert.ok(sharp.momentum < gentle.momentum, 'an about-turn costs more than a gentle one');
  close(sharp.momentum, 1 - MOMENTUM.turnSlowdown, 'an about-turn holds it down to its cap');
});

test('a company locked in melee stands still, its pace gone', () => {
  const game = new Game({ random: fixedRandom() });
  const raider = new Raider('IR0', { x: 300, y: 300 });
  raider.momentum = 0.8;
  raider.foes.add(new Guard('IG0', { x: 300, y: 300 }));
  game.raiders.push(raider);
  const before = { ...raider.position };
  game.moveRaiders();
  assert.equal(raider.momentum, 0);
  assert.deepEqual(raider.position, before);
});

// --- the charge ----------------------------------------------------------------

test('a standing company meets a fight at plain strength', () => {
  const guard = new Guard('IG0', { x: 0, y: 0 });
  const raider = new Raider('IR0', { x: 10, y: 0 });
  assert.equal(chargeImpact(guard, raider), 1);
});

test('a head-on charge at full cavalry speed lands at 200% for its first blows', () => {
  const cavalry = moving(new Raider('CR1', { x: 0, y: 0 }), 1, 1, 0);
  const target = new Guard('IG0', { x: 15, y: 0 });
  close(chargeImpact(cavalry, target), 1 + CHARGE.bonus);
  assert.equal(1 + CHARGE.bonus, 2);
});

test('the faster the company, the harder the first blows land', () => {
  const target = new Guard('IG0', { x: 15, y: 0 });
  const infantry = moving(new Raider('IR0', { x: 0, y: 0 }), 1, 1, 0);
  const cavalry = moving(new Raider('CR0', { x: 0, y: 0 }), 1, 1, 0);
  const slowCavalry = moving(new Raider('CR0', { x: 0, y: 0 }), 0.3, 1, 0);
  assert.ok(chargeImpact(infantry, target) > 1);
  assert.ok(chargeImpact(cavalry, target) > chargeImpact(infantry, target));
  assert.ok(chargeImpact(slowCavalry, target) < chargeImpact(cavalry, target));
});

test('a company caught running the other way hits weaker, not harder', () => {
  const fleeing = moving(new Raider('CR1', { x: 0, y: 0 }), 1, -1, 0);
  const pursuer = new Guard('IG0', { x: 15, y: 0 });
  close(chargeImpact(fleeing, pursuer), 1 - CHARGE.retreatPenalty);
});

test('the charge bonus lasts only CHARGE.seconds into the bout', () => {
  const cavalry = moving(new Raider('CR0', { x: 0, y: 0 }), 1, 1, 0);
  const plain = new Raider('CR0', { x: 0, y: 40 });
  const first = new Guard('IG0', { x: 15, y: 0 });
  const second = new Guard('IG0', { x: 15, y: 40 });
  // Healthy enough to survive past the window on both sides.
  for (const company of [cavalry, plain, first, second]) {
    company.type = { ...company.type, maxHealth: 1000, breaksAt: 0 };
    company.health = 1000;
  }
  lockEngagements([first, second], [cavalry, plain]);
  const chargeDamage = [];
  for (let frame = 0; frame < 2 * FPS; frame += 1) {
    const before = [first.health, second.health];
    resolveMelee([first, second, cavalry, plain], FRAME);
    chargeDamage.push((before[0] - first.health) / (before[1] - second.health));
  }
  assert.ok(chargeDamage[0] > 1.5, 'charging cavalry out-hits a standing twin at first');
  close(chargeDamage[2 * FPS - 1], 1, 'and is back to plain strength after the window');
});

// --- hold ----------------------------------------------------------------------

test('a company on hold does not move, not even to hunt a raider in plain sight', () => {
  const game = new Game({ random: fixedRandom() });
  game.tokens = 100000;
  const guard = game.sendGuard('IG0').guard;
  game.toggleHold([guard]);
  const before = { ...guard.position };
  game.raiders.push(new Raider('IR0', { x: guard.position.x + 100, y: guard.position.y }));
  for (let frame = 0; frame < FPS; frame += 1) {
    game.moveGuards();
  }
  assert.deepEqual(guard.position, before);
});

test('toggleHold holds a mixed group, and releases one already all on hold', () => {
  const game = new Game({ random: fixedRandom() });
  const held = new Guard('IG0', { x: 0, y: 0 });
  const free = new Guard('IG0', { x: 10, y: 0 });
  held.holding = true;
  assert.equal(game.toggleHold([held, free]), true);
  assert.equal(held.holding && free.holding, true);
  assert.equal(game.toggleHold([held, free]), false);
  assert.equal(held.holding || free.holding, false);
});

test('a fresh order takes a company off hold', () => {
  const game = new Game({ random: fixedRandom() });
  const guard = new Guard('IG0', { x: 0, y: 0 });
  game.toggleHold([guard]);
  game.orderGuards([guard], { x: 100, y: 0 });
  assert.equal(guard.holding, false);
});

test('a company on hold takes HOLD.defenseBonus less damage for the first HOLD.seconds of a bout', () => {
  const held = new Guard('IG0', { x: 0, y: 0 });
  const loose = new Guard('IG0', { x: 0, y: 40 });
  held.holding = true;
  const attackers = [new Raider('IR0', { x: 10, y: 0 }), new Raider('IR0', { x: 10, y: 40 })];
  for (const company of [held, loose, ...attackers]) {
    company.type = { ...company.type, maxHealth: 1000, breaksAt: 0 };
    company.health = 1000;
  }
  lockEngagements([held, loose], attackers);
  resolveMelee([held, loose, ...attackers], FRAME);
  close((1000 - loose.health) / (1000 - held.health), 1 + HOLD.defenseBonus);
  for (let frame = 0; frame < (HOLD.seconds + 0.5) * FPS; frame += 1) {
    resolveMelee([held, loose, ...attackers], FRAME);
  }
  const before = [held.health, loose.health];
  resolveMelee([held, loose, ...attackers], FRAME);
  close(before[0] - held.health, before[1] - loose.health, 'no bonus once the window closes');
});

// --- morale --------------------------------------------------------------------

test('every unit type breaks somewhere between 30% and 100% health, the Emperor aside', () => {
  for (const [id, type] of Object.entries({ ...GUARD_TYPES, ...RAIDER_TYPES })) {
    if (id === 'EMPEROR') {
      assert.equal(type.breaksAt, 0, 'the Emperor never runs');
      continue;
    }
    assert.ok(type.breaksAt >= 0.3 && type.breaksAt < 1, `${id} breaks at ${type.breaksAt}`);
  }
  assert.ok(GUARD_TYPES.IG_HEAVY.breaksAt < GUARD_TYPES.IG_LIGHT.breaksAt, 'discipline comes with the tier');
});

test('a company whose health falls past its breaking point routs and breaks off the fight', () => {
  const guard = new Guard('IG_LIGHT', { x: 0, y: 0 });
  const raider = new Raider('CR1', { x: 5, y: 0 });
  lockEngagements([guard], [raider]);
  guard.health = guard.type.maxHealth * guard.type.breaksAt + 0.01;
  guard.selected = true;
  guard.holding = true;
  while (!guard.routed && guard.isAlive) {
    resolveMelee([guard, raider], FRAME);
  }
  assert.equal(guard.routed, true);
  assert.equal(guard.inMelee, false);
  assert.equal(raider.foes.has(guard), false);
  assert.equal(guard.selected, false, 'a routed company cannot be commanded');
  assert.equal(guard.holding, false);
  assert.ok(raider.recoverySeconds > 0, 'its old foes are a beat slow to give chase');
});

test('a routed company hits for ROUT.attackMultiplier of its strength', () => {
  const routed = new Raider('IR0', { x: 0, y: 0 });
  const steady = new Raider('IR0', { x: 0, y: 40 });
  const first = new Guard('IG0', { x: 3, y: 0 });
  const second = new Guard('IG0', { x: 3, y: 40 });
  for (const company of [routed, steady, first, second]) {
    company.type = { ...company.type, maxHealth: 1000, breaksAt: 0 };
    company.health = 1000;
  }
  routed.routed = true;
  lockEngagements([first, second], [routed, steady]);
  resolveMelee([first, second, routed, steady], FRAME);
  close((1000 - first.health) / (1000 - second.health), ROUT.attackMultiplier);
});

test('a routed company flees the nearest enemy and never hunts', () => {
  const game = new Game({ random: fixedRandom() });
  const guard = new Guard('IG0', { x: 0, y: 0 });
  guard.routed = true;
  const raider = new Raider('IR0', { x: 30, y: 0 });
  game.guards.push(guard);
  game.raiders.push(raider);
  const away = game.fleeDestination(guard, game.raiders);
  assert.ok(away.x < guard.position.x, 'runs away from the raider, not at it');
});

test('a routed company that gets clear of every enemy leaves the field', () => {
  const game = new Game({ random: fixedRandom() });
  const guard = new Guard('IG0', { x: 0, y: 0 });
  guard.routed = true;
  game.guards.push(guard);
  game.raiders.push(new Raider('IR0', { x: ROUT.escapeDistance + 50, y: 0 }));
  game.moveGuards();
  assert.equal(guard.fled, true);
  game.step();
  assert.equal(game.guards.includes(guard), false);
});

test('only a routed enemy caught close up is engaged, not one merely within the usual reach', () => {
  const guard = new Guard('IG0', { x: 0, y: 0 });
  const routed = new Raider('IR0', { x: ROUT.catchDistance + 2, y: 0 });
  routed.routed = true;
  assert.ok(ROUT.catchDistance + 2 < MELEE.engageDistance);
  lockEngagements([guard], [routed]);
  assert.equal(guard.inMelee, false);
  routed.position.x = ROUT.catchDistance - 1;
  lockEngagements([guard], [routed]);
  assert.equal(guard.inMelee, true);
});

test('a routed company cannot be selected', () => {
  const game = new Game({ random: fixedRandom() });
  const guard = new Guard('IG0', { x: 0, y: 0 });
  guard.routed = true;
  game.guards.push(guard);
  assert.deepEqual(game.selectGuardsNear(guard.position), []);
});

// --- mass ----------------------------------------------------------------------

test('heavy cavalry at the charge tramples straight through light infantry', () => {
  const lancers = moving(new Raider('CR1', { x: 0, y: 0 }), 1, 1, 0);
  const light = new Guard('IG_LIGHT', { x: 15, y: 0 });
  light.momentum = 1;
  light.velocity = { x: 0, y: light.type.speed };
  lockEngagements([light], [lancers]);
  assert.equal(lancers.inMelee, false, 'not stopped');
  assert.ok(light.health < light.type.maxHealth, 'ridden down');
  assert.ok(light.recoverySeconds > 0, 'knocked off its feet');
  assert.notEqual(light.position.y, 0, 'shoved aside, off the lancers\' line');
  close(lancers.momentum, MASS.trampleMomentumKept, 'and the ride-through costs some pace');
});

test('light cavalry does not trample -- it takes the fight like anyone else', () => {
  const sabres = moving(new Raider('CR0', { x: 0, y: 0 }), 1, 1, 0);
  const light = moving(new Guard('IG_LIGHT', { x: 15, y: 0 }), 1, 0, 1);
  lockEngagements([light], [sabres]);
  assert.equal(sabres.inMelee, true);
});

test('heavy cavalry charging a braced spear wall is stopped dead and punished', () => {
  const lancers = moving(new Raider('CR1', { x: 0, y: 0 }), 1, 1, 0);
  const spears = new Guard('IG_HEAVY', { x: 15, y: 0 });
  assert.equal(isBraced(spears), true, 'standing spears are braced');
  lockEngagements([spears], [lancers]);
  assert.equal(lancers.inMelee, true, 'locked in, not through');
  assert.equal(lancers.momentum, 0, 'stopped dead');
  assert.equal(lancers.impact, 1, 'its charge bonus is wasted on the points');
  const expected = lancers.type.maxHealth
    - (spears.type.attack * MASS.counterChargeMultiplier) / lancers.type.defense;
  close(lancers.health, expected);
});

test('spears on the march are not braced, and are no wall against a charge', () => {
  const spears = moving(new Guard('IG_HEAVY', { x: 15, y: 0 }), 1, 0, 1);
  assert.equal(isBraced(spears), false);
  const held = moving(new Guard('IG_HEAVY', { x: 15, y: 0 }), 1, 0, 1);
  held.holding = true;
  assert.equal(isBraced(held), true, 'a company on hold is braced whatever its pace');
});

test('heavier companies give less ground when two blocks close up', () => {
  const heavy = new Guard('IG_HEAVY', { x: 0, y: 0 });
  const light = new Raider('IR0', { x: 20, y: 0 });
  for (const company of [heavy, light]) {
    company.type = { ...company.type, maxHealth: 1000, breaksAt: 0 };
    company.health = 1000;
  }
  heavy.foes.add(light);
  light.foes.add(heavy);
  resolveMelee([heavy, light], FRAME);
  assert.ok(Math.abs(heavy.position.x) < Math.abs(light.position.x - 20));
});
