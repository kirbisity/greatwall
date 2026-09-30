import { distance } from './geometry.js';
import {
  CASTLE_REBUILD, CASTLE_TYPES, HOUSES, MOMENTUM, ROUT, UNIT_TYPES, WALL, WALL_TIERS,
} from './config.js';
import { blowDamage } from './damage.js';

export class Wall {
  /**
   * `built` is how much of the section stands, from a foundation course to a
   * finished rampart. Health is capped by it, so a wall under construction is
   * both shorter and weaker, and can be attacked the whole way up.
   */
  constructor(start, end, built = 1, planSeconds = 0, healthScale = 1) {
    this.start = start;
    this.end = end;
    this.length = distance(start, end);
    this.built = built;
    // A level may build sturdier stone than the game's usual -- see levels.js.
    this.healthScale = healthScale;
    // Pegged out but not yet begun. Until this runs down the section is not a
    // wall: it blocks nothing, diverts nothing, and cannot be attacked.
    this.planSeconds = planSeconds;
    // >0 while a paid repair is working its way back up. The wall stays
    // exactly what it was standing there the whole time — repair only
    // affects how fast health climbs, never built, isPlanned or collision.
    this.repairSeconds = 0;
    this.repairMissing = 0;
    // How far the Fortify tool has taken this section, and the growth still
    // under way. The same Wall carries every tier, so fortifying adds no
    // entity to the scene -- only scale to the one already there.
    this.tier = 0;
    this.upgrade = null;
    // >0 for a moment after an order lands -- see flash. Purely cosmetic:
    // the renderer reads it, nothing else does.
    this.flashSeconds = 0;
    // Last, because maxHealth reads the tier this section is standing at.
    this.health = this.maxHealth * built;
  }

  get isPlanned() {
    return this.planSeconds > 0;
  }

  get isFlashing() {
    return this.flashSeconds > 0;
  }

  /** A brief blink to confirm an order actually landed on this section. */
  flash() {
    this.flashSeconds = WALL.flashSeconds;
  }

  get isRepairing() {
    return this.repairSeconds > 0;
  }

  get isUpgrading() {
    return this.upgrade !== null;
  }

  get isComplete() {
    return this.built >= 1;
  }

  /**
   * The tier this section actually fights and costs at. Stone that is still
   * growing has not earned the new strength yet, so the old one holds until
   * the work finishes -- the same bargain a castle mid-rebuild makes.
   */
  get effectiveTier() {
    return WALL_TIERS[this.tier];
  }

  get maxHealth() {
    return WALL.maxHealth * this.healthScale * this.effectiveTier.health;
  }

  get upkeep() {
    return WALL.upkeepPerSection * this.effectiveTier.upkeep;
  }

  get canUpgrade() {
    return !this.isUpgrading && this.tier + 1 < WALL_TIERS.length;
  }

  /** Scales the renderer draws at, easing from the old shape into the new. */
  get heightScale() {
    return this.growingScale('heightScale');
  }

  get widthScale() {
    return this.growingScale('widthScale');
  }

  growingScale(key) {
    const from = this.effectiveTier[key];
    if (!this.upgrade) {
      return from;
    }
    const to = WALL_TIERS[this.upgrade.toTier][key];
    return from + (to - from) * (this.upgrade.elapsed / this.upgrade.total);
  }

  /** Raise the section, making good any damage taken while it went up. */
  raise(seconds) {
    this.flashSeconds = Math.max(0, this.flashSeconds - seconds);
    if (this.planSeconds > 0) {
      this.planSeconds = Math.max(0, this.planSeconds - seconds);
      return;
    }
    if (this.repairSeconds > 0) {
      // A steady climb back to full over WALL.repairSeconds, not tied to
      // how much was missing at any given instant — so the same order
      // always takes the same time, whether it caught the wall at 90% or 10%.
      const rate = this.repairMissing / WALL.repairSeconds;
      this.health = Math.min(this.maxHealth, this.health + rate * seconds);
      this.repairSeconds = Math.max(0, this.repairSeconds - seconds);
      return;
    }
    if (this.built >= 1) {
      return;
    }
    // buildSeconds is the time from foundation to finished, not from nothing.
    const added = seconds * (1 - WALL.initialFraction) / WALL.buildSeconds;
    this.built = Math.min(1, this.built + added);
    this.health = Math.min(this.maxHealth * this.built, this.health + this.maxHealth * added);
  }

  /** Pay off the remaining construction as well as the damage, right away. */
  finish() {
    this.planSeconds = 0;
    this.repairSeconds = 0;
    this.built = 1;
    this.health = this.maxHealth;
  }

  /**
   * Start a paid repair. The masonry is whole again at once — built jumps
   * to 1 if a section still mid-construction is what got redrawn over — but
   * its condition, and the tint that reads off it, only heals gradually.
   */
  beginRepair() {
    this.built = 1;
    this.repairMissing = this.maxHealth - this.health;
    this.repairSeconds = WALL.repairSeconds;
  }

  /**
   * Order the next tier. The stone starts growing at once, but the section
   * holds its old health and old upkeep until it has finished -- see
   * `effectiveTier`.
   */
  beginUpgrade() {
    this.upgrade = {
      toTier: this.tier + 1,
      elapsed: 0,
      total: WALL_TIERS[this.tier + 1].seconds,
    };
  }

  /** Advance the growth, taking on the new tier once it has fully risen. */
  advanceUpgrade(seconds) {
    if (!this.upgrade) {
      return;
    }
    this.upgrade.elapsed = Math.min(this.upgrade.total, this.upgrade.elapsed + seconds);
    if (this.upgrade.elapsed < this.upgrade.total) {
      return;
    }
    // Carry the section's condition across: a wall that was whole comes out
    // of the work whole, and one that was battered is still battered.
    const condition = this.health / this.maxHealth;
    this.tier = this.upgrade.toTier;
    this.upgrade = null;
    this.health = condition * this.maxHealth;
  }

  /**
   * Half of everything spent on the section, scaled by how much of it is
   * left standing. A fortified wall cost more to raise, so razing it gives
   * back more; a plain one is unchanged, since its `paid` is 1.
   */
  get refundValue() {
    const spent = this.length * WALL.costPerUnit * this.effectiveTier.paid;
    return Math.trunc(spent * this.health / this.maxHealth / 2);
  }

  takeHit(blow) {
    this.health -= blowDamage(blow, WALL.armor) / WALL.defense;
  }
}

export class Castle {
  /**
   * `options.previousTypeId`/`previousType` start a rebuild: the shape on the
   * ground changes at once, but combat and income keep running off the old
   * stats until the new structure has actually finished rising.
   */
  constructor(typeId, position = { x: 0, y: 0 }, options = {}) {
    // A level may field castles of its own size -- the island's keeps are a
    // fraction of the imperial city's, and a footprint meant for the latter
    // would fence walls out of half the hill (see levels.js).
    const types = options.types ?? CASTLE_TYPES;
    this.types = types;
    const type = types[typeId];
    if (!type) {
      throw new Error(`Unknown castle type: ${typeId}`);
    }
    this.typeId = typeId;
    this.type = type;
    this.position = { ...position };
    this.health = options.health ?? type.maxHealth;
    this.rebuild = options.previousTypeId ? {
      fromTypeId: options.previousTypeId,
      fromType: options.previousType ?? types[options.previousTypeId],
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

  takeHit(blow) {
    const { armor, defense } = this.effectiveType;
    this.health -= blowDamage(blow, armor) / defense;
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
    // Full-pace heading; how much of that pace it actually has is momentum,
    // from 0 at a standstill to 1 -- see gatherPace.
    this.velocity = { x: 0, y: 0 };
    this.momentum = 0;
    // Quickening from coming down a slope (1 on the level) -- see Game#climbPace.
    this.descent = 1;
    this.knock = { x: 0, y: 0 };
    // How far off its wanted heading it was this frame, which is what caps
    // the pace it can hold through a turn. Set by pathfinding's turnTowards.
    this.turnAngle = 0;
    this.destination = { x: 0, y: 0 };
    this.waypoint = { x: 0, y: 0 };
    this.health = type.maxHealth;
    // Melee state: who this company is locked with, and how long it has been.
    this.foes = new Set();
    this.meleeSeconds = 0;
    this.recoverySeconds = 0;
    // What this bout's first blows are multiplied by, fixed the moment it
    // began -- see melee.js's chargeImpact.
    this.impact = 1;
    // Morale broken: running for it rather than fighting (see melee.js's
    // rout), and gone for good once clear of every enemy -- see
    // Game#fleeDestination.
    this.routed = false;
    this.routedSeconds = 0;
    this.fled = false;
    // Only raiders are stopped by walls: they batter them or find a way
    // round. Imperial companies file through their own stonework.
    this.besieges = false;
    this.avoidsWalls = false;
    // Progress watch, so a company that is going nowhere can give up.
    this.closestApproach = Infinity;
    this.stuckSeconds = 0;
    // A hair of bias on its aim, its own and drifting, so two companies in
    // the same fix do not make the same wrong choice for ever.
    this.wander = 0;
    // 0 in the clear, 1 astride a wall and slowed to a crawl by it.
    this.crossing = 0;
    // Whether this company has already been charged for the wall it is on,
    // so one crossing costs once -- see Game#chargeWallClimb.
    this.climbing = false;
    // Whether this company is up on the platforms, so climbing onto them
    // can be told from walking about up there -- see Game#chargeClimbs.
    this.standingOn = false;
    // Navigation state, so a company thinks a few times a second rather than
    // every frame.
    this.planVersion = null;
    this.replanCountdown = 0;
    // Whether this company's current bout of contact -- battering a wall or
    // the castle, or trading blows in melee -- has already played its sound
    // effect, so a long engagement sounds once rather than every frame it
    // continues. See Game#moveRaiders and Game#step.
    this.touchedThisFrame = false;
    this.soundedEngage = false;
    this.soundedFight = false;
  }

  get isAlive() {
    return this.health >= 0;
  }

  /** 0 while it holds together, rising to 1 as a routed company scatters and fades. */
  get dissolve() {
    return Math.min(1, this.routedSeconds / ROUT.dissolveSeconds);
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

  /**
   * `guard` multiplies its defence for this blow (bracing). A routed company
   * has lost its nerve for defence as much as for attack.
   */
  takeHit(blow, guard = 1) {
    const morale = this.routed ? ROUT.defenseMultiplier : 1;
    this.health -= blowDamage(blow, this.type.armor) / (this.type.defense * morale * guard);
  }

  /**
   * Build pace toward full over MOMENTUM.accelerationSeconds -- but never
   * past what the turn it is making allows, bleeding off whatever it had
   * above that.
   */
  gatherPace(seconds) {
    const turnCap = 1 - MOMENTUM.turnSlowdown * Math.min(1, this.turnAngle / Math.PI);
    if (this.momentum > turnCap) {
      this.momentum = Math.max(turnCap, this.momentum - MOMENTUM.brakeRate * seconds);
      return;
    }
    this.momentum = Math.min(turnCap, this.momentum + seconds / MOMENTUM.accelerationSeconds);
  }

  /** Stopped where it stands: whatever pace it had has to be built up again. */
  halt() {
    this.momentum = 0;
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
    this.position.x += this.velocity.x * this.momentum * seconds;
    this.position.y += this.velocity.y * this.momentum * seconds;
  }
}

export class Raider extends Company {
  constructor(typeId, position = { x: 0, y: 0 }) {
    const type = UNIT_TYPES[typeId];
    if (!type) {
      throw new Error(`Unknown raider type: ${typeId}`);
    }
    super(typeId, type, position);
    this.besieges = true;
    this.avoidsWalls = true;
    // Which section to batter when walled in, the way round it is currently
    // holding to, and how long it has sworn to keep swinging.
    this.siegeTarget = null;
    this.heldGateway = null;
    this.siegeSeconds = 0;
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
    const type = UNIT_TYPES[typeId];
    if (!type) {
      throw new Error(`Unknown guard type: ${typeId}`);
    }
    super(typeId, type, position);
    // Where it was ordered, who it is running down, and where home is.
    this.orders = { ...position };
    this.quarry = null;
    this.home = { ...position };
    // Starts true -- a fresh company's orders are just its own spawn point,
    // so it is already there. Game#orderGuards clears this on a real order,
    // and it stays clear until the company actually gets there: see
    // Game#guardDestination for why this is a sticky flag rather than a
    // distance check redone every frame.
    this.arrived = true;
    // Set once it has wandered past its leash, cleared once it is back.
    this.recalled = false;
    // Picked out by a tap on the map -- see Game#selectGuardsNear -- so the
    // next tap knows to command it rather than pick out something new.
    this.selected = false;
    // Told to stand its ground: it will not move for anything short of
    // being attacked where it stands -- see Game#toggleHold.
    this.holding = false;
    // True only for the Emperor: never breaks off to hunt a raider on its
    // own, and never auto-recalled home -- see Game#guardDestination.
    this.followsOrdersOnly = false;
  }
}

/**
 * The one company every level fields the same way -- mustered free, its
 * stats scaled to the castle's current tier at the moment it musters (see
 * Game#spawnEmperor), strictly commanded rather than hunting on its own,
 * and fatal to lose: see Game#isDefeated.
 */
export class Emperor extends Guard {
  constructor(position = { x: 0, y: 0 }) {
    super('EMPEROR', position);
    this.followsOrdersOnly = true;
  }
}
