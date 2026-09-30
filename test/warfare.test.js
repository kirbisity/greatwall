import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { Guard, Raider } from '../src/entities.js';
import { blowDamage, blowOf } from '../src/damage.js';
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

test('a company on hold takes its hold bonus less damage for the first HOLD.seconds of a bout', () => {
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
  close((1000 - loose.health) / (1000 - held.health), 1 + GUARD_TYPES.IG0.holdBonus);
  for (let frame = 0; frame < (HOLD.seconds + 0.5) * FPS; frame += 1) {
    resolveMelee([held, loose, ...attackers], FRAME);
  }
  const before = [held.health, loose.health];
  resolveMelee([held, loose, ...attackers], FRAME);
  close(before[0] - held.health, before[1] - loose.health, 'no bonus once the window closes');
});

// --- morale --------------------------------------------------------------------

test('every unit type breaks somewhere between 15% and 100% health, the Emperor aside', () => {
  for (const [id, type] of Object.entries({ ...GUARD_TYPES, ...RAIDER_TYPES })) {
    if (id === 'EMPEROR') {
      assert.equal(type.breaksAt, 0, 'the Emperor never runs');
      continue;
    }
    assert.ok(type.breaksAt >= 0.15 && type.breaksAt < 1, `${id} breaks at ${type.breaksAt}`);
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
  assert.equal(guard.selected, false, 'a company that breaks is dropped from the selection');
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
  guard.routedAt = { x: ROUT.runDistance + 1, y: 0 };
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

test('a routed company can be selected and ordered, and still runs on its own account after', () => {
  const game = new Game({ random: fixedRandom() });
  const guard = new Guard('IG0', { x: 0, y: 0 });
  guard.routed = true;
  const raider = new Raider('IR0', { x: 200, y: 0 });
  game.guards.push(guard);
  game.raiders.push(raider);
  assert.deepEqual(game.selectGuardsNear(guard.position), [guard]);
  game.orderGuards([guard], { x: 60, y: 0 });
  assert.equal(guard.routed, true, 'still routed, so still half strength and still unwilling to hold');
  for (let frame = 0; frame < 8 * FPS; frame += 1) {
    game.moveGuards();
  }
  assert.ok(guard.position.x > 20, 'it went where it was sent, towards the enemy');
  assert.equal(guard.routed, true);
  assert.equal(guard.arrived, true);
  assert.ok(game.routedDestination(guard).x < guard.position.x, 'then it goes back to running');
});

test('an engaged company ordered elsewhere breaks off and marches', () => {
  const game = new Game({ random: fixedRandom() });
  const guard = new Guard('IG0', { x: 0, y: 0 });
  const raider = new Raider('IR0', { x: 5, y: 0 });
  game.guards.push(guard);
  game.raiders.push(raider);
  lockEngagements([guard], [raider]);
  assert.equal(guard.inMelee, true);
  game.orderGuards([guard], { x: -100, y: 0 });
  assert.equal(guard.inMelee, false);
  assert.equal(raider.foes.has(guard), false);
  assert.ok(raider.recoverySeconds > 0, 'the foe is a beat slow to follow');
  for (let frame = 0; frame < 20 * FPS; frame += 1) {
    game.moveGuards();
  }
  assert.ok(guard.position.x < -5, 'it has actually moved off');
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
  assert.deepEqual(light.position, { x: 15, y: 0 }, 'the shove plays out over the next frames rather than jumping');
  assert.ok(light.knock.x > 0 && Math.abs(light.knock.y) > 0, 'flung ahead of the riders and off to one side');
  close(lancers.momentum, MASS.trampleMomentumKept, 'and the ride-through costs some pace');
});

test('a knocked company slides and slows to a stop, covering about its speed over the decay rate', () => {
  const lancers = moving(new Raider('CR1', { x: 0, y: 0 }), 1, 1, 0);
  const light = new Guard('IG_LIGHT', { x: 15, y: 0 });
  lockEngagements([light], [lancers]);
  const start = { ...light.position };
  const launch = Math.hypot(light.knock.x, light.knock.y);
  let last = 0;
  resolveMelee([light], FRAME);
  const first = Math.hypot(light.position.x - start.x, light.position.y - start.y);
  assert.ok(first > 0 && first < launch * FRAME * 1.01, 'it starts fast, a frame at a time');
  for (let frame = 0; frame < 3 * FPS; frame += 1) {
    resolveMelee([light], FRAME);
    const slid = Math.hypot(light.position.x - start.x, light.position.y - start.y);
    assert.ok(slid >= last, 'never slides back');
    last = slid;
  }
  assert.deepEqual(light.knock, { x: 0, y: 0 }, 'and it comes to rest');
  assert.ok(last > launch / MASS.knockDecay * 0.85 && last < launch / MASS.knockDecay * 1.05);
});

test('cavalry that hits set spears is thrown back, and the spears give a little', () => {
  const lancers = moving(new Raider('CR1', { x: 0, y: 0 }), 1, 1, 0);
  const spears = new Guard('IG_HEAVY', { x: 15, y: 0 });
  lockEngagements([spears], [lancers]);
  assert.ok(lancers.knock.x < 0, 'rebounds off the points');
  assert.ok(spears.knock.x > 0 && spears.knock.x < -lancers.knock.x, 'the wall shifts far less than the riders');
});

test('a fast charge shoves the company it strikes back along its line', () => {
  const sabres = moving(new Raider('CR0', { x: 0, y: 0 }), 1, 1, 0);
  const light = new Guard('IG_LIGHT', { x: 15, y: 0 });
  light.holding = true;
  lockEngagements([light], [sabres]);
  assert.equal(sabres.inMelee, true, 'a fair fight, not a trample');
  assert.ok(light.knock.x > 0, 'the struck company gives ground');
  assert.equal(sabres.knock.x, 0, 'the standing company does not shove back');
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
  const blow = blowOf(spears.type, MASS.counterChargeMultiplier);
  const expected = lancers.type.maxHealth - blowDamage(blow, lancers.type.armor) / lancers.type.defense;
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

test('a raider battering a wall can rout from the blows the wall gives back', () => {
  const game = new Game({ random: fixedRandom() });
  game.tokens = 100000;
  const wall = game.buildWall({ x: 120, y: -60 }, { x: 120, y: 60 }).wall;
  wall.finish();
  const raider = new Raider('IR0', { x: 121, y: 0 });
  raider.health = raider.type.maxHealth * raider.type.breaksAt + 0.001;
  game.raiders.push(raider);
  game.resolveWallContact(game.navigation(), raider);
  assert.equal(raider.routed, true);
});

test('a raider still well above its breaking point keeps battering', () => {
  const game = new Game({ random: fixedRandom() });
  game.tokens = 100000;
  const wall = game.buildWall({ x: 120, y: -60 }, { x: 120, y: 60 }).wall;
  wall.finish();
  const raider = new Raider('IR0', { x: 121, y: 0 });
  game.raiders.push(raider);
  game.resolveWallContact(game.navigation(), raider);
  assert.equal(raider.routed, false);
});

test('a raider routed at the walls runs from the city, not on into it', () => {
  const game = new Game({ random: fixedRandom() });
  const raider = moving(new Raider('IR0', { x: 120, y: 0 }), 1, -1, 0);
  raider.routed = true;
  const away = game.fleeDestination(raider, game.raiderThreats());
  assert.ok(away.x > raider.position.x, 'heads back out, away from the castle');
});

test('a routed company has to actually run for it before it leaves the field', () => {
  const game = new Game({ random: fixedRandom() });
  const guard = new Guard('IG0', { x: 0, y: 0 });
  guard.routed = true;
  guard.routedAt = { x: 0, y: 0 };
  game.checkEscape(guard, []);
  assert.equal(guard.fled, false, 'no enemies about, but it has not got anywhere yet');
  guard.position = { x: ROUT.runDistance + 1, y: 0 };
  game.checkEscape(guard, []);
  assert.equal(guard.fled, true);
});

const total = (type) => type.attackAA + type.attackNormal;
const armors = (...ids) => ids.map((id) => ({ ...GUARD_TYPES, ...RAIDER_TYPES }[id].armor));

test('each faction\'s three tiers carry its armour ratings', () => {
  assert.deepEqual(armors('IR0', 'IR1', 'CR1'), [0.1, 0.4, 0.7]);
  assert.deepEqual(armors('IG_LIGHT', 'IG0', 'IG_HEAVY'), [0.1, 0.6, 0.8]);
  assert.deepEqual(armors('JG_ASHIGARU', 'JG_SAMURAI', 'JG_SOHEI'), [0.2, 0.6, 0.7]);
});

test('the Chinese tiers hit about alike; the sohei out-hit the samurai', () => {
  const [light, regular, heavy] = ['IG_LIGHT', 'IG0', 'IG_HEAVY'].map((id) => total(GUARD_TYPES[id]));
  assert.ok(Math.max(light, regular, heavy) - Math.min(light, regular, heavy) <= 0.75);
  assert.ok(total(GUARD_TYPES.JG_SOHEI) > total(GUARD_TYPES.JG_SAMURAI));
});

test('Japanese units favour ordinary attack; Chinese and Mongol lean anti-armour, most at the top', () => {
  for (const id of ['JG_ASHIGARU', 'JG_SAMURAI', 'JG_SOHEI']) {
    assert.ok(GUARD_TYPES[id].attackNormal > GUARD_TYPES[id].attackAA, id);
  }
  for (const type of [GUARD_TYPES.IG_HEAVY, RAIDER_TYPES.IR1, RAIDER_TYPES.CR1]) {
    assert.ok(type.attackAA > type.attackNormal, type.name);
  }
  assert.ok(RAIDER_TYPES.CR1.attackAA - RAIDER_TYPES.CR1.attackNormal
    > RAIDER_TYPES.IR0.attackAA - RAIDER_TYPES.IR0.attackNormal);
});

test('the Emperor stands about a top-tier guard', () => {
  const emperor = GUARD_TYPES.EMPEROR;
  const heavy = GUARD_TYPES.IG_HEAVY;
  assert.equal(emperor.armor, heavy.armor);
  assert.equal(emperor.defense, heavy.defense);
  assert.equal(total(emperor), total(heavy));
});

test('the Emperor\'s attack scales with the castle without collapsing to whole numbers', () => {
  const game = new Game({ random: fixedRandom() });
  const stats = game.emperorStats({ typeId: 'CC2' });
  close(stats.attackAA, 3.2);
  close(stats.attackNormal, 2.4);
});

test('Japanese samurai and sohei are the steadiest under fire', () => {
  assert.ok(GUARD_TYPES.JG_SAMURAI.breaksAt <= 0.2);
  assert.ok(GUARD_TYPES.JG_SOHEI.breaksAt <= 0.2);
  assert.ok(GUARD_TYPES.JG_ASHIGARU.breaksAt < GUARD_TYPES.IG_LIGHT.breaksAt);
});

test('the Chinese hold with a 30% boost, everyone else 20%', () => {
  for (const id of ['IG_LIGHT', 'IG0', 'IG_HEAVY', 'EMPEROR']) {
    assert.equal(GUARD_TYPES[id].holdBonus, 0.3, id);
  }
  assert.equal(HOLD.defenseBonus, 0.2);
  for (const id of ['JG_ASHIGARU', 'JG_SAMURAI', 'JG_SOHEI']) {
    assert.equal(GUARD_TYPES[id].holdBonus, undefined, id);
  }
});

test('a Japanese company on hold gets the ordinary 20% boost', () => {
  const held = new Guard('JG_SAMURAI', { x: 0, y: 0 });
  const loose = new Guard('JG_SAMURAI', { x: 0, y: 40 });
  held.holding = true;
  const attackers = [new Raider('IR0', { x: 10, y: 0 }), new Raider('IR0', { x: 10, y: 40 })];
  for (const company of [held, loose, ...attackers]) {
    company.type = { ...company.type, maxHealth: 1000, breaksAt: 0 };
    company.health = 1000;
  }
  lockEngagements([held, loose], attackers);
  resolveMelee([held, loose, ...attackers], FRAME);
  close((1000 - loose.health) / (1000 - held.health), 1 + HOLD.defenseBonus);
});

test('armour blunts an ordinary-attack army but not an anti-armour one', () => {
  const armoured = () => {
    const guard = new Guard('IG_HEAVY', { x: 0, y: 0 });
    guard.type = { ...guard.type, maxHealth: 1000, breaksAt: 0 };
    guard.health = 1000;
    return guard;
  };
  const fightWith = (attackType) => {
    const guard = armoured();
    const raider = new Raider('IR0', { x: 10, y: 0 });
    raider.type = { ...raider.type, ...attackType };
    lockEngagements([guard], [raider]);
    resolveMelee([guard, raider], FRAME);
    return 1000 - guard.health;
  };
  const plain = fightWith({ attackAA: 0, attackNormal: 4 });
  const piercing = fightWith({ attackAA: 4, attackNormal: 0 });
  close(plain / piercing, 1 - GUARD_TYPES.IG_HEAVY.armor);
});
