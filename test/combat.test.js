import test from 'node:test';
import assert from 'node:assert/strict';
import { Raider, Wall } from '../src/entities.js';
import { steerRaider } from '../src/pathfinding.js';
import { FPS, WALL } from '../src/config.js';

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
  { typeId: 'CR1', name: 'Spear Cavalry', survived: false, wallDamage: 105 },
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

test('a wall beyond line of sight does not divert a raider yet', () => {
  const raider = new Raider('CR0', { x: 100, y: 0 });
  raider.aimAt({ x: 0, y: 0 });
  const distant = new Wall({ x: 20, y: -30 }, { x: 20, y: 30 });
  steerRaider(raider, [distant]);
  assert.deepEqual(raider.waypoint, { x: 0, y: 0 });
});

test('a raider with a clear path heads straight for its destination', () => {
  const raider = new Raider('CR0', { x: 100, y: 0 });
  raider.aimAt({ x: 0, y: 0 });
  steerRaider(raider, []);
  assert.deepEqual(raider.waypoint, { x: 0, y: 0 });
  assert.ok(raider.velocity.x < 0, 'moving towards the origin');
});

test('a raider steers off the direct line when a wall comes into sight', () => {
  const raider = new Raider('CR0', { x: 100, y: 0 });
  raider.aimAt({ x: 0, y: 0 });
  const wall = new Wall({ x: 75, y: -30 }, { x: 75, y: 30 });
  steerRaider(raider, [wall]);
  assert.notDeepEqual(raider.waypoint, { x: 0, y: 0 });
  assert.notEqual(raider.velocity.y, 0, 'turned away from the straight line');
});

test('a raider that has circled a full turn gives up and charges', () => {
  const raider = new Raider('CR0', { x: 100, y: 0 });
  raider.aimAt({ x: 0, y: 0 });
  raider.turnedRadians = 7;
  const wall = new Wall({ x: 75, y: -30 }, { x: 75, y: 30 });
  steerRaider(raider, [wall]);
  assert.deepEqual(raider.waypoint, { x: 0, y: 0 });
});

test('a breached wall no longer diverts raiders on its own', () => {
  const wall = new Wall({ x: 50, y: -30 }, { x: 50, y: 30 });
  assert.equal(wall.isIntact, true);
  wall.health = WALL.intactHealth;
  assert.equal(wall.isIntact, false);
});
