import { distance } from './geometry.js';
import { CASTLE_REBUILD, CASTLE_TYPES, GUARD_TYPES, HOUSES, RAIDER_TYPES, WALL } from './config.js';

export class Wall {
  /**
   * `built` is how much of the section stands, from a foundation course to a
   * finished rampart. Health is capped by it, so a wall under construction is
   * both shorter and weaker, and can be attacked the whole way up.
   */
  constructor(start, end, built = 1, planSeconds = 0) {
    this.start = start;
    this.end = end;
    this.length = distance(start, end);
    this.built = built;
    this.health = WALL.maxHealth * built;
    // Pegged out but not yet begun. Until this runs down the section is not a
    // wall: it blocks nothing, diverts nothing, and cannot be attacked.
    this.planSeconds = planSeconds;
    // >0 while a paid repair is working its way back up. The wall stays
    // exactly what it was standing there the whole time — repair only
    // affects how fast health climbs, never built, isPlanned or collision.
    this.repairSeconds = 0;
    this.repairMissing = 0;
  }

  get isPlanned() {
    return this.planSeconds > 0;
  }

  get isRepairing() {
    return this.repairSeconds > 0;
  }

  get isComplete() {
    return this.built >= 1;
  }

  /** Raise the section, making good any damage taken while it went up. */
  raise(seconds) {
    if (this.planSeconds > 0) {
      this.planSeconds = Math.max(0, this.planSeconds - seconds);
      return;
    }
    if (this.repairSeconds > 0) {
      // A steady climb back to full over WALL.repairSeconds, not tied to
      // how much was missing at any given instant — so the same order
      // always takes the same time, whether it caught the wall at 90% or 10%.
      const rate = this.repairMissing / WALL.repairSeconds;
      this.health = Math.min(WALL.maxHealth, this.health + rate * seconds);
      this.repairSeconds = Math.max(0, this.repairSeconds - seconds);
      return;
    }
    if (this.built >= 1) {
      return;
    }
    // buildSeconds is the time from foundation to finished, not from nothing.
    const added = seconds * (1 - WALL.initialFraction) / WALL.buildSeconds;
    this.built = Math.min(1, this.built + added);
    this.health = Math.min(WALL.maxHealth * this.built, this.health + WALL.maxHealth * added);
  }

  /** Pay off the remaining construction as well as the damage, right away. */
  finish() {
    this.planSeconds = 0;
    this.repairSeconds = 0;
    this.built = 1;
    this.health = WALL.maxHealth;
  }

  /**
   * Start a paid repair. The masonry is whole again at once — built jumps
   * to 1 if a section still mid-construction is what got redrawn over — but
   * its condition, and the tint that reads off it, only heals gradually.
   */
  beginRepair() {
    this.built = 1;
    this.repairMissing = WALL.maxHealth - this.health;
    this.repairSeconds = WALL.repairSeconds;
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
  /**
   * `options.previousTypeId`/`previousType` start a rebuild: the shape on the
   * ground changes at once, but combat and income keep running off the old
   * stats until the new structure has actually finished rising.
   */
  constructor(typeId, position = { x: 0, y: 0 }, options = {}) {
    const type = CASTLE_TYPES[typeId];
    if (!type) {
      throw new Error(`Unknown castle type: ${typeId}`);
    }
    this.typeId = typeId;
    this.type = type;
    this.position = { ...position };
    this.health = options.health ?? type.maxHealth;
    this.rebuild = options.previousTypeId ? {
      fromTypeId: options.previousTypeId,
      fromType: options.previousType ?? CASTLE_TYPES[options.previousTypeId],
      demolishSeconds: CASTLE_REBUILD.demolishSeconds,
      demolishTotal: CASTLE_REBUILD.demolishSeconds,
      buildElapsed: 0,
      buildTotal: CASTLE_REBUILD.buildSeconds,
    } : null;
  }

  /** The stats in effect right now: the old tier's, while still under construction. */
  get effectiveType() {
    return this.rebuild ? this.rebuild.fromType : this.type;
  }

  get healthFraction() {
    return this.health / this.effectiveType.maxHealth;
  }

  takeHit(attackPower) {
    this.health -= attackPower / this.effectiveType.defense;
  }

  regenerate(fraction) {
    this.health = Math.min(this.effectiveType.maxHealth, this.health + fraction * this.effectiveType.maxHealth);
  }

  /** 1 while the old structure still stands, falling to 0 as it is cleared away. */
  get demolishProgress() {
    return this.rebuild ? this.rebuild.demolishSeconds / this.rebuild.demolishTotal : 0;
  }

  /** 0 before the new structure has broken ground, 1 once it has fully risen. */
  get buildProgress() {
    if (!this.rebuild || this.rebuild.demolishSeconds > 0) {
      return 0;
    }
    return this.rebuild.buildElapsed / this.rebuild.buildTotal;
  }

  /** Advance the demolish-then-rise sequence, clearing it once complete. */
  advanceRebuild(seconds) {
    if (!this.rebuild) {
      return;
    }
    if (this.rebuild.demolishSeconds > 0) {
      this.rebuild.demolishSeconds = Math.max(0, this.rebuild.demolishSeconds - seconds);
      return;
    }
    this.rebuild.buildElapsed = Math.min(this.rebuild.buildTotal, this.rebuild.buildElapsed + seconds);
    if (this.rebuild.buildElapsed >= this.rebuild.buildTotal) {
      this.rebuild = null;
    }
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
    // 0 in the clear, 1 astride a wall and slowed to a crawl by it.
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

/**
 * A dwelling that fills in behind the walls on its own. It has no fight in
 * it: a raider that reaches one does not battle it, it just burns.
 */
export class House {
  constructor(position) {
    this.position = { ...position };
    // Seconds since it broke ground, driving the rise; frozen once alight.
    this.age = 0;
    this.burning = false;
    this.burnElapsed = 0;
  }

  /** 0 the moment it breaks ground, 1 once fully risen. */
  get growth() {
    return Math.min(1, this.age / HOUSES.riseSeconds);
  }

  get isGone() {
    return this.burning && this.burnElapsed >= HOUSES.burnSeconds;
  }

  advance(seconds) {
    if (this.burning) {
      this.burnElapsed += seconds;
      return;
    }
    this.age += seconds;
  }

  ignite() {
    this.burning = true;
    this.burnElapsed = 0;
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
