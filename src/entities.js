import { distance } from './geometry.js';
import { CASTLE_TYPES, GUARD_TYPES, RAIDER_TYPES, WALL } from './config.js';

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

/**
 * A body of troops on the map: raiders coming for the city, or the imperial
 * companies sent out to meet them. Both move the same way and fight the same
 * way, so both are this.
 */
class Company {
  constructor(typeId, type, position) {
    this.typeId = typeId;
    this.type = type;
    this.position = { ...position };
    this.velocity = { x: 0, y: 0 };
    this.destination = { x: 0, y: 0 };
    this.waypoint = { x: 0, y: 0 };
    this.health = type.maxHealth;
    // Melee state: who this company is locked with, and how long it has been.
    this.foes = new Set();
    this.meleeSeconds = 0;
    this.recoverySeconds = 0;
    // Only raiders are stopped by walls: they batter them or find a way
    // round. Imperial companies file through their own stonework.
    this.besieges = false;
    this.avoidsWalls = false;
    // Progress watch, so a company that is going nowhere can give up.
    this.closestApproach = Infinity;
    this.stuckSeconds = 0;
    // 0 in open order, 1 filed into a column to squeeze past a wall.
    this.crossing = 0;
    // Navigation state, so a company thinks a few times a second rather than
    // every frame.
    this.planVersion = null;
    this.replanCountdown = 0;
  }

  get isAlive() {
    return this.health >= 0;
  }

  get healthFraction() {
    return this.health / this.type.maxHealth;
  }

  get heading() {
    return Math.atan2(this.velocity.y, this.velocity.x);
  }

  get inMelee() {
    return this.foes.size > 0;
  }

  /** Locked in a fight, or catching its breath after one. */
  get isHeld() {
    return this.inMelee || this.recoverySeconds > 0;
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

export class Raider extends Company {
  constructor(typeId, position = { x: 0, y: 0 }) {
    const type = RAIDER_TYPES[typeId];
    if (!type) {
      throw new Error(`Unknown raider type: ${typeId}`);
    }
    super(typeId, type, position);
    this.besieges = true;
    this.avoidsWalls = true;
    // Which section to batter when walled in.
    this.siegeTarget = null;
  }
}

export class Guard extends Company {
  constructor(typeId, position = { x: 0, y: 0 }) {
    const type = GUARD_TYPES[typeId];
    if (!type) {
      throw new Error(`Unknown guard type: ${typeId}`);
    }
    super(typeId, type, position);
    // Where it was ordered, who it is running down, and where home is.
    this.orders = { ...position };
    this.quarry = null;
    this.home = { ...position };
    // Set once it has wandered past its leash, cleared once it is back.
    this.recalled = false;
  }
}
