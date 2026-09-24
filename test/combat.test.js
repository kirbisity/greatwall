import test from 'node:test';
import assert from 'node:assert/strict';
import { Raider, Wall } from '../src/entities.js';
import { steerCompany } from '../src/pathfinding.js';
import { buildNavigation, routeFrom } from '../src/navigation.js';
import { AVOIDANCE, FPS, WALL } from '../src/config.js';

/** Frames a raider spends inside a wall's damage band crossing it head-on. */
function contactFrames(raider) {
  return Math.floor(2 * raider.type.range / (raider.type.speed / FPS));
}

/** Trade blows for the whole crossing, or until the raider dies. */
function crossWall(typeId) {
  const raider = new Raider(typeId);
  const wall = new Wall({ x: 0, y: 0 }, { x: 100, y: 0 });
  const frames = contactFrames(raider);
  for (let frame = 0; frame < frames && raider.isAlive; frame += 1) {
    wall.takeHit(raider.type.attack);
    raider.takeHit(WALL.attack);
  }
  return { survived: raider.isAlive, wallDamage: WALL.maxHealth - wall.health };
}

test('damage is the attacker power divided by the defender armour', () => {
  const wall = new Wall({ x: 0, y: 0 }, { x: 10, y: 0 });
  wall.takeHit(10);
  assert.equal(wall.health, WALL.maxHealth - 10 / WALL.defense);

  const raider = new Raider('CR0');
  raider.takeHit(10);
  assert.equal(raider.health, raider.type.maxHealth - 10 / raider.type.defense);
});

// Locks in the wall counter-matrix: cavalry trade themselves for a wall,
// infantry walk through one. Rebalancing should fail this deliberately.
const CROSSING_OUTCOMES = [
  { typeId: 'CR0', name: 'Sabre Cavalry', survived: false, wallDamage: 52.5 },
  { typeId: 'CR1', name: 'Spear Cavalry', survived: false, wallDamage: 84 },
  { typeId: 'IR0', name: 'Light Axe Infantry', survived: true, wallDamage: 34 },
  { typeId: 'IR1', name: 'Light Sword Infantry', survived: true, wallDamage: 51 },
];

for (const expected of CROSSING_OUTCOMES) {
  test(`${expected.name} crossing one wall`, () => {
    const outcome = crossWall(expected.typeId);
    assert.equal(outcome.survived, expected.survived);
    assert.ok(
      Math.abs(outcome.wallDamage - expected.wallDamage) < 0.5,
      `wall damage ${outcome.wallDamage}, expected ${expected.wallDamage}`,
    );
  });
}

const CITY = { x: 0, y: 0 };

function navigate(raider, walls) {
  const navigation = buildNavigation(walls, CITY, `${walls.length}`);
  steerCompany(raider, navigation);
  return navigation;
}

function approaching(x = 160, y = 0) {
  const raider = new Raider('CR0', { x, y });
  raider.aimAt(CITY);
  return raider;
}

test('a raider with a clear path heads straight for the city', () => {
  const raider = approaching();
  navigate(raider, []);
  assert.deepEqual(raider.waypoint, CITY);
  assert.ok(raider.velocity.x < 0, 'moving towards the city');
});

test('a raider routes to the open end of a wall barring its way', () => {
  const raider = approaching();
  // A wall across the approach, open at both ends.
  const wall = new Wall({ x: 80, y: -60 }, { x: 80, y: 60 });
  navigate(raider, [wall]);
  assert.notDeepEqual(raider.waypoint, CITY, 'does not charge the wall');
  assert.ok(Math.abs(raider.waypoint.y) > 60, 'aims past one of the wall ends');
});

test('a wall that does not bar the way is ignored', () => {
  const raider = approaching();
  const aside = new Wall({ x: 80, y: 200 }, { x: 80, y: 320 });
  navigate(raider, [aside]);
  assert.deepEqual(raider.waypoint, CITY, 'no detour towards a wall off the route');
});

// A lone wall well away from the city must not pull raiders towards it: going
// via its ends is always longer than going straight, so the graph never picks it.
test('a standalone wall off to one side attracts nobody', () => {
  const raider = approaching();
  const standalone = new Wall({ x: 120, y: -400 }, { x: 240, y: -400 });
  navigate(raider, [standalone]);
  assert.deepEqual(raider.waypoint, CITY);
});

test('a raider walled in picks a section to batter', () => {
  const raider = approaching();
  // A closed box round the city leaves no open end to route through.
  const r = 70;
  const corners = [{ x: -r, y: -r }, { x: r, y: -r }, { x: r, y: r }, { x: -r, y: r }];
  const ring = corners.map((corner, index) => new Wall(corner, corners[(index + 1) % 4]));
  navigate(raider, ring);
  assert.ok(raider.siegeTarget, 'chose a wall to attack');
  assert.ok(ring.includes(raider.siegeTarget));
});

test('destroying a section reopens a route and calls off the siege', () => {
  const raider = approaching();
  const r = 70;
  const corners = [{ x: -r, y: -r }, { x: r, y: -r }, { x: r, y: r }, { x: -r, y: r }];
  const ring = corners.map((corner, index) => new Wall(corner, corners[(index + 1) % 4]));
  navigate(raider, ring);
  assert.ok(raider.siegeTarget, 'besieging to begin with');

  // A section only stops blocking once it is gone, not merely damaged.
  const battered = ring.filter((wall, index) => index !== 1);
  raider.replanCountdown = 0;
  navigate(raider, battered);
  assert.equal(raider.siegeTarget, null, 'walks through the gap instead');
});

test('a badly damaged section still blocks until it is destroyed', () => {
  const raider = approaching();
  const wall = new Wall({ x: 80, y: -60 }, { x: 80, y: 60 });
  wall.health = 1;
  navigate(raider, [wall]);
  assert.notDeepEqual(raider.waypoint, CITY, 'a wall on its last legs is still a wall');
});

// --- not walking in circles ----------------------------------------------
//
// Every test below pins a rule that exists only to stop a company looping.
// They are the cheapest place to catch a raider that has started pacing.

test('a company keeps the way round it already holds through a near tie', () => {
  const wall = new Wall({ x: 80, y: -60 }, { x: 80, y: 60 });
  const navigation = buildNavigation([wall], CITY, 'ties');
  const below = navigation.gateways.find((gateway) => gateway.y < 0);
  const above = navigation.gateways.find((gateway) => gateway.y > 0);

  // Just off centre. The lower way round is the cheaper of the two now, but
  // only barely, and swapping on that would swap back a moment later.
  const offCentre = { x: 160, y: -10 };
  assert.equal(routeFrom(navigation, offCentre).waypoint, below, 'cheaper on the merits');
  assert.equal(routeFrom(navigation, offCentre, above).waypoint, above, 'holds its line');

  // Far enough over and the saving is worth the swap after all.
  const wellOver = { x: 160, y: -60 };
  assert.equal(routeFrom(navigation, wellOver, above).waypoint, below, 'worth swapping for');
});

test('a company that turns on a wall keeps swinging at it', () => {
  const raider = approaching();
  const wall = new Wall({ x: 80, y: -60 }, { x: 80, y: 60 });
  raider.stuckSeconds = AVOIDANCE.patienceSeconds;
  navigate(raider, [wall]);
  assert.equal(raider.siegeTarget, wall, 'out of patience, so it picked the wall');

  // Thinking again straight away must not undo that: the way round it would
  // go back to is the one that stranded it in the first place.
  raider.replanCountdown = 0;
  navigate(raider, [wall]);
  assert.equal(raider.siegeTarget, wall, 'still on the wall');

  // Once that promise runs out it is free to look for a way round again.
  raider.siegeSeconds = 0;
  raider.replanCountdown = 0;
  navigate(raider, [wall]);
  assert.equal(raider.siegeTarget, null, 'free to try the way round again');
});

test('a way round far longer than the direct line is not worth walking', () => {
  const raider = approaching();
  // Drawn right across the map: both ends are open, but reaching one and
  // coming back is an order of magnitude further than the city itself.
  const sprawl = new Wall({ x: 80, y: -2000 }, { x: 80, y: 2000 });
  navigate(raider, [sprawl]);
  assert.equal(raider.siegeTarget, sprawl, 'goes through it rather than round it');
});

test('the wander on a company aim stays a hair either side of its route', () => {
  const raider = approaching();
  const open = buildNavigation([], CITY, 'open');
  // The hardest one-sided push the drift can be given, over and over.
  for (let thought = 0; thought < 50; thought += 1) {
    raider.replanCountdown = 0;
    steerCompany(raider, open, () => 1);
  }
  assert.ok(raider.wander > 0, 'it does drift');
  assert.ok(raider.wander <= AVOIDANCE.wanderRadians, 'but never past its bound');
});
