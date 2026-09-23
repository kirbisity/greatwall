import { distance } from './geometry.js';
import { CASTLE_TYPES, RAIDER_TYPES, WALL } from './config.js';

export class Wall {
  /**
   * `built` is how much of the section stands, from a foundation course to a
   * finished rampart. Health is capped by it, so a wall under construction is
   * both shorter and weaker, and can be attacked the whole way up.
   */
  constructor(start, end, built = 1) {
    this.start = start;
    this.end = end;
    this.length = distance(start, end);
    this.built = built;
    this.health = WALL.maxHealth * built;
  }

  get isComplete() {
    return this.built >= 1;
  }

  /** Raise the section, making good any damage taken while it went up. */
  raise(seconds) {
    if (this.built >= 1) {
      return;
    }
    // buildSeconds is the time from foundation to finished, not from nothing.
    const added = seconds * (1 - WALL.initialFraction) / WALL.buildSeconds;
    this.built = Math.min(1, this.built + added);
    this.health = Math.min(WALL.maxHealth * this.built, this.health + WALL.maxHealth * added);
  }

  /** Pay off the remaining construction as well as the damage. */
  finish() {
    this.built = 1;
    this.health = WALL.maxHealth;
  }

  get isIntact() {
    return this.health > WALL.intactHealth;
  }

  /** Half the build price, scaled by how much of the wall is left standing. */
  get refundValue() {
    return Math.trunc(this.length * WALL.costPerUnit * this.health / WALL.maxHealth / 2);
  }

  takeHit(attackPower) {
    this.health -= attackPower / WALL.defense;
  }
}

export class Castle {
  constructor(typeId, position = { x: 0, y: 0 }) {
    const type = CASTLE_TYPES[typeId];
    if (!type) {
      throw new Error(`Unknown castle type: ${typeId}`);
    }
    this.typeId = typeId;
    this.type = type;
    this.position = { ...position };
    this.health = type.maxHealth;
  }

  get healthFraction() {
    return this.health / this.type.maxHealth;
  }

  takeHit(attackPower) {
    this.health -= attackPower / this.type.defense;
  }

  regenerate(fraction) {
    this.health = Math.min(this.type.maxHealth, this.health + fraction * this.type.maxHealth);
  }
}

export class Raider {
  constructor(typeId, position = { x: 0, y: 0 }) {
    const type = RAIDER_TYPES[typeId];
    if (!type) {
      throw new Error(`Unknown raider type: ${typeId}`);
    }
    this.typeId = typeId;
    this.type = type;
    this.position = { ...position };
    this.velocity = { x: 0, y: 0 };
    this.destination = { x: 0, y: 0 };
    this.waypoint = { x: 0, y: 0 };
    this.health = type.maxHealth;
    // Navigation state: which section to batter when walled in, and when to
    // think again rather than re-planning every frame.
    this.siegeTarget = null;
    this.planVersion = null;
    this.replanCountdown = 0;
  }

  get isAlive() {
    return this.health >= 0;
  }

  get heading() {
    return Math.atan2(this.velocity.y, this.velocity.x);
  }

  takeHit(attackPower) {
    this.health -= attackPower / this.type.defense;
  }

  aimAt(target) {
    this.destination = { ...target };
    this.waypoint = { ...target };
    const dx = target.x - this.position.x;
    const dy = target.y - this.position.y;
    const length = Math.hypot(dx, dy) || 1;
    this.velocity.x = this.type.speed * dx / length;
    this.velocity.y = this.type.speed * dy / length;
  }

  advance(seconds) {
    this.position.x += this.velocity.x * seconds;
    this.position.y += this.velocity.y * seconds;
  }
}
