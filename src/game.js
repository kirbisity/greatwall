import { Castle, Raider, Wall } from './entities.js';
import {
  closestPointOnSquare,
  distance,
  distanceSquared,
  distanceToSquare,
  isWithinSegmentBand,
  segmentEntersSquare,
} from './geometry.js';
import { steerRaider } from './pathfinding.js';
import { buildNavigation } from './navigation.js';
import {
  FPS,
  HARVEST_MULTIPLIER,
  INCOME_INTERVAL_SECONDS,
  RAIDER_SPAWN_INTERVAL_SECONDS,
  REGEN_FRACTION_PER_PAYOUT,
  SEASON_LENGTH_SECONDS,
  SEASON_MESSAGES,
  SEASON_RAIDER_MIX,
  SPAWN_MAX_DISTANCE,
  SPAWN_MIN_DISTANCE,
  STARTING_CASTLE_TYPE,
  STARTING_TOKENS,
  WALL,
  WINTER_BUILD_MULTIPLIER,
} from './config.js';

const SEASONS_PER_YEAR = 4;
const AUTUMN = 0;
const WINTER = 1;
const WALL_HINT_SECONDS = 20;
const UPGRADE_HINT_SECONDS = 40;

/** Random offset that lands outside the safe radius around the castle. */
function spawnOffset(random) {
  const value = Math.floor(random() * SPAWN_MAX_DISTANCE * 2) - SPAWN_MAX_DISTANCE;
  if (value > 0 && value < SPAWN_MIN_DISTANCE) {
    return value + SPAWN_MIN_DISTANCE;
  }
  if (value < 0 && value > -SPAWN_MIN_DISTANCE) {
    return value - SPAWN_MIN_DISTANCE;
  }
  return value;
}

/** Headless game state and rules. Knows nothing about canvases or the DOM. */
export class Game {
  constructor({ onMessage = () => {}, random = Math.random } = {}) {
    this.onMessage = onMessage;
    this.random = random;
    this.wallHintShown = false;
    this.upgradeHintShown = false;
    this.restart();
  }

  restart() {
    this.navigationCache = null;
    this.walls = [];
    this.castles = [new Castle(STARTING_CASTLE_TYPE)];
    this.raiders = [];
    this.tokens = STARTING_TOKENS;
    this.season = 0;
    this.seconds = 0;
    this.frame = 0;
  }

  get isDefeated() {
    return this.castles.some((castle) => castle.health < 0);
  }

  get buildMultiplier() {
    return this.season % SEASONS_PER_YEAR === WINTER ? WINTER_BUILD_MULTIPLIER : 1;
  }

  get harvestMultiplier() {
    return this.season % SEASONS_PER_YEAR === AUTUMN ? HARVEST_MULTIPLIER : 1;
  }

  wallCost(length) {
    return Math.trunc(length * WALL.costPerUnit * this.buildMultiplier);
  }

  // --- simulation ---------------------------------------------------------

  /** Advance one frame. Returns true on the frame a whole second elapses. */
  advanceClock() {
    this.frame += 1;
    if (this.frame % FPS !== 0) {
      return false;
    }
    this.frame = 0;
    this.seconds += 1;
    return true;
  }

  step() {
    if (this.advanceClock()) {
      this.onSecondElapsed();
    }
    for (const wall of this.walls) {
      wall.raise(1 / FPS);
    }
    this.moveRaiders();
    this.raiders = this.raiders.filter((raider) => raider.isAlive);
    this.walls = this.walls.filter((wall) => wall.health >= 0);
  }

  onSecondElapsed() {
    if (this.seconds % INCOME_INTERVAL_SECONDS === 1) {
      this.showHints();
      this.collectIncome();
    }
    if (this.seconds % SEASON_LENGTH_SECONDS === SEASON_LENGTH_SECONDS - 1) {
      this.advanceSeason();
    }
    if (this.seconds % RAIDER_SPAWN_INTERVAL_SECONDS === RAIDER_SPAWN_INTERVAL_SECONDS - 1) {
      this.spawnRaider();
    }
  }

  showHints() {
    if (this.seconds > UPGRADE_HINT_SECONDS && !this.upgradeHintShown) {
      this.upgradeHintShown = true;
      this.onMessage('Try clicking the ♜ button, then click on the castle to upgrade!');
    }
    if (this.seconds > WALL_HINT_SECONDS && !this.wallHintShown) {
      this.wallHintShown = true;
      this.onMessage('Try clicking the first button to build some walls');
    }
  }

  collectIncome() {
    let productivity = 0;
    for (const castle of this.castles) {
      castle.regenerate(REGEN_FRACTION_PER_PAYOUT);
      productivity += castle.type.wealth;
    }
    this.tokens += productivity * this.harvestMultiplier;
  }

  advanceSeason() {
    this.season += 1;
    if (this.season < SEASON_MESSAGES.length) {
      this.onMessage(SEASON_MESSAGES[this.season]);
    }
  }

  spawnRaider() {
    const target = this.castles[0];
    if (!target) {
      return;
    }
    const mix = SEASON_RAIDER_MIX[Math.min(this.season, SEASON_RAIDER_MIX.length - 1)];
    const typeId = mix[Math.floor(this.random() * mix.length)];
    const raider = new Raider(typeId, {
      x: Math.trunc(target.position.x + spawnOffset(this.random)),
      y: Math.trunc(target.position.y + spawnOffset(this.random)),
    });
    raider.aimAt(target.position);
    this.raiders.push(raider);
  }

  /**
   * Wall layout drives the route graph, and a breach opens a way through, so
   * the signature counts both the sections standing and those still intact.
   */
  navigation() {
    let intact = 0;
    for (const wall of this.walls) {
      if (wall.isIntact) {
        intact += 1;
      }
    }
    const version = `${this.walls.length}:${intact}`;
    if (this.navigationCache?.version !== version) {
      this.navigationCache = buildNavigation(this.walls, this.castles[0]?.position, version);
    }
    return this.navigationCache;
  }

  moveRaiders() {
    const target = this.castles[0];
    const navigation = this.navigation();
    for (const raider of this.raiders) {
      steerRaider(raider, navigation);
      raider.advance(1 / FPS);
      this.resolveWallContact(raider);
      if (raider.isAlive && target) {
        this.resolveCastleContact(raider, target);
      }
    }
  }

  resolveWallContact(raider) {
    const reachMargin = WALL.reachMargin;
    for (const wall of this.walls) {
      const reach = wall.length + reachMargin;
      if (isWithinSegmentBand(raider.position, wall.start, wall.end, raider.type.range, reach)) {
        wall.takeHit(raider.type.attack);
        raider.takeHit(WALL.attack);
        if (!raider.isAlive) {
          return;
        }
      }
    }
  }

  resolveCastleContact(raider, castle) {
    const reach = castle.type.hitbox + raider.type.range;
    if (distanceSquared(castle.position, raider.position) < reach * reach) {
      castle.takeHit(raider.type.attack);
      raider.takeHit(castle.type.attack);
    }
  }

  // --- player actions -----------------------------------------------------

  /** Snap to an existing wall end so junctions share a node. */
  snapToWallEnds(point) {
    for (const wall of this.walls) {
      if (distance(wall.start, point) < WALL.snapRadius) {
        return wall.start;
      }
      if (distance(wall.end, point) < WALL.snapRadius) {
        return wall.end;
      }
    }
    return null;
  }

  /** Snap onto a city's edge so walls meet the settlement flush. */
  snapToCityBrim(point) {
    for (const castle of this.castles) {
      const brim = closestPointOnSquare(point, castle.position, castle.type.footprint);
      if (distance(brim, point) < WALL.brimSnapRadius) {
        return brim;
      }
    }
    return null;
  }

  /** Wall ends take precedence, so chaining sections still shares nodes. */
  snapPoint(point) {
    return this.snapToWallEnds(point) ?? this.snapToCityBrim(point) ?? point;
  }

  /** A wall already spanning these two ends, in either direction. */
  findWallBetween(start, end) {
    const reach = WALL.snapRadius * WALL.snapRadius;
    return this.walls.find((wall) => (
      (distanceSquared(wall.start, start) < reach && distanceSquared(wall.end, end) < reach)
      || (distanceSquared(wall.start, end) < reach && distanceSquared(wall.end, start) < reach)
    )) ?? null;
  }

  crossesCity(start, end) {
    return this.castles.some((castle) => (
      segmentEntersSquare(start, end, castle.position, castle.type.footprint)
    ));
  }

  /** Restore a damaged wall, charging only for the stonework replaced. */
  repairWall(wall) {
    const missing = WALL.maxHealth - wall.health;
    if (missing <= 0) {
      return { status: 'intact', wall };
    }
    const cost = Math.trunc(this.wallCost(wall.length) * missing / WALL.maxHealth);
    if (this.tokens < cost) {
      return { status: 'poor' };
    }
    this.tokens -= cost;
    wall.finish();
    return { status: 'repaired', wall, cost };
  }

  /**
   * Lay a section between two points. Redrawing over an existing wall repairs
   * it rather than stacking a second one, and nothing may cross a city.
   */
  buildWall(from, to) {
    const start = this.snapPoint(from);
    const end = this.snapPoint(to);

    const existing = this.findWallBetween(start, end);
    if (existing) {
      return { ...this.repairWall(existing), start, end };
    }
    if (this.crossesCity(start, end)) {
      return { status: 'blocked', start, end };
    }
    const wall = new Wall(start, end, WALL.initialFraction);
    if (wall.length <= 1) {
      return { status: 'short', start, end };
    }
    const cost = this.wallCost(wall.length);
    if (this.tokens < cost) {
      return { status: 'poor', start, end };
    }
    this.tokens -= cost;
    this.walls.push(wall);
    return { status: 'built', wall, start, end };
  }

  /** Demolish anything standing where a structure now does, refunding it. */
  clearWallsUnder(castle) {
    const standing = [];
    let cleared = 0;
    for (const wall of this.walls) {
      if (segmentEntersSquare(wall.start, wall.end, castle.position, castle.type.footprint)) {
        this.tokens += wall.refundValue;
        cleared += 1;
      } else {
        standing.push(wall);
      }
    }
    this.walls = standing;
    return cleared;
  }

  removeWallAt(point) {
    for (let index = 0; index < this.walls.length; index += 1) {
      const wall = this.walls[index];
      const reach = wall.length + WALL.reachMargin;
      const reachSquared = reach * reach;
      if (distanceSquared(point, wall.start) < reachSquared && distanceSquared(point, wall.end) < reachSquared) {
        this.tokens += wall.refundValue;
        this.walls.splice(index, 1);
        return true;
      }
    }
    return false;
  }

  undoLastWall() {
    const wall = this.walls.pop();
    if (!wall) {
      return false;
    }
    this.tokens += wall.refundValue;
    return true;
  }

  upgradeCastleAt(point) {
    const index = this.castles.findIndex((castle) => (
      distanceToSquare(point, castle.position, castle.type.footprint) < WALL.snapRadius
    ));
    if (index === -1) {
      return false;
    }
    this.upgradeCastle(index);
    return true;
  }

  upgradeCastle(index) {
    this.upgradeHintShown = true;
    const current = this.castles[index];
    const nextTypeId = current.type.upgradesTo;
    if (!nextTypeId) {
      this.onMessage('Cannot upgrade further');
      return false;
    }
    const upgraded = new Castle(nextTypeId, current.position);
    if (this.tokens < upgraded.type.cost) {
      this.onMessage(`You need $${upgraded.type.cost} to upgrade the castle.`);
      return false;
    }
    this.tokens -= upgraded.type.cost;
    this.castles[index] = upgraded;
    const cleared = this.clearWallsUnder(upgraded);
    const razed = cleared > 0
      ? ` ${cleared} wall section${cleared === 1 ? '' : 's'} cleared for it.`
      : '';
    this.onMessage(`Upgraded to ${upgraded.type.name}.${razed}`);
    return true;
  }
}
