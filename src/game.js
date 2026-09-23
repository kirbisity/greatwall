import { Castle, Guard, House, Raider, Wall } from './entities.js';
import {
  closestPointOnSquare,
  distance,
  pointToLineDistance,
  distanceSquared,
  distanceToSquare,
  isWithinSegmentBand,
  segmentEntersSquare,
  segmentsIntersect,
} from './geometry.js';
import { steerCompany } from './pathfinding.js';
import { buildNavigation, wallsNear } from './navigation.js';
import { lockEngagements, resolveMelee } from './melee.js';
import { Terrain } from './terrain.js';
import {
  AVOIDANCE,
  BREACH,
  CASTLE_GUARD_TIERS,
  FEAR,
  FPS,
  TERRAIN,
  GUARD_TYPES,
  HOUSES,
  IMPERIAL,
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
  constructor({ onMessage = () => {}, random = Math.random, seed = 1 } = {}) {
    this.onMessage = onMessage;
    this.random = random;
    this.terrain = new Terrain(seed);
    this.wallHintShown = false;
    this.upgradeHintShown = false;
    this.restart();
  }

  restart() {
    this.navigationCache = null;
    this.terrain.levelled = [];
    this.guards = [];
    this.walls = [];
    this.houses = [];
    this.houseSpawnCountdown = HOUSES.spawnIntervalSeconds;
    this.castles = [new Castle(STARTING_CASTLE_TYPE)];
    this.levelUnderCities();
    this.raiders = [];
    this.tokens = STARTING_TOKENS;
    this.season = 0;
    this.seconds = 0;
    this.frame = 0;
    // Set once the last castle falls; counts up to BREACH.collapseSeconds
    // while the city burns, before the game actually ends.
    this.breachSeconds = null;
  }

  /** Settlements stand on levelled ground, and clear the wood around them. */
  levelUnderCities() {
    for (const [index, castle] of this.castles.entries()) {
      this.terrain.level(index, castle.position.x, castle.position.y, castle.type.footprint);
    }
  }

  /**
   * Woodland in a patch of ground, minus whatever has been felled. Trees go
   * where a wall runs and wherever a city stands.
   */
  treesWithin(minX, minY, maxX, maxY) {
    const navigation = this.navigation();
    return this.terrain.treesWithin(minX, minY, maxX, maxY, (x, y) => {
      for (const castle of this.castles) {
        if (distanceToSquare({ x, y }, castle.position, castle.type.footprint) < TERRAIN.clearOfWall) {
          return true;
        }
      }
      const point = { x, y };
      for (const wall of wallsNear(navigation.grid, point, TERRAIN.clearOfWall)) {
        if (pointToLineDistance(point, wall.start, wall.end) < TERRAIN.clearOfWall) {
          return true;
        }
      }
      return false;
    });
  }

  /** What a company's pace is multiplied by for the ground it is crossing. */
  paceOn(position) {
    return 1 - this.terrain.forestAt(position.x, position.y) * TERRAIN.forestDrag;
  }

  get isDefeated() {
    return this.castles.some((castle) => castle.health < 0);
  }

  /** How far through its burning the city is, 0 to 1. */
  get breachFraction() {
    return this.breachSeconds === null ? 0 : this.breachSeconds / BREACH.collapseSeconds;
  }

  /** Once true, the game is actually over — the burn has run its course. */
  get breachComplete() {
    return this.breachSeconds !== null && this.breachSeconds >= BREACH.collapseSeconds;
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
    for (const castle of this.castles) {
      castle.advanceRebuild(1 / FPS);
    }
    for (const wall of this.walls) {
      wall.raise(1 / FPS);
    }
    for (const house of this.houses) {
      house.advance(1 / FPS);
    }
    lockEngagements(this.guards, this.raiders);
    resolveMelee([...this.guards, ...this.raiders], 1 / FPS);
    this.moveRaiders();
    this.moveGuards();
    this.resolveHouseContact();
    this.raiders = this.raiders.filter((raider) => raider.isAlive);
    this.guards = this.guards.filter((guard) => guard.isAlive);
    this.walls = this.walls.filter((wall) => wall.health >= 0);
    this.houses = this.houses.filter((house) => !house.isGone);
    // Once the city is lost the field keeps animating, but this is the clock
    // the game-over screen actually waits on: see BREACH.collapseSeconds.
    if (this.isDefeated) {
      this.breachSeconds = Math.min(BREACH.collapseSeconds, (this.breachSeconds ?? 0) + 1 / FPS);
    }
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
    this.houseSpawnCountdown -= 1;
    if (this.houseSpawnCountdown <= 0) {
      this.houseSpawnCountdown = HOUSES.spawnIntervalSeconds;
      this.trySpawnHouse();
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

  /**
   * city_income * num_city + house_income * num_houses, before the seasonal
   * multiplier. num_city is just the castle count today, but the formula is
   * written to hold once there is more than one.
   */
  get incomeBreakdown() {
    let cityIncome = 0;
    for (const castle of this.castles) {
      cityIncome += castle.effectiveType.wealth;
    }
    const houseCount = this.houses.length;
    const housePerHouse = HOUSES.income;
    const houseIncome = houseCount * housePerHouse;
    return { cityIncome, houseCount, housePerHouse, houseIncome, total: cityIncome + houseIncome };
  }

  collectIncome() {
    for (const castle of this.castles) {
      // A castle under construction still earns at its old rate — the new
      // income only starts once the new buildings have actually risen.
      castle.regenerate(REGEN_FRACTION_PER_PAYOUT);
    }
    this.tokens += this.incomeBreakdown.total * this.harvestMultiplier;
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
   * Wall layout drives the route graph. Sections are solid until destroyed, so
   * the only thing that opens a new way through is one of them falling.
   */
  navigation() {
    // Only sections that have actually been begun are walls, so the count of
    // those is what the route graph turns on.
    let standing = 0;
    for (const wall of this.walls) {
      if (!wall.isPlanned) {
        standing += 1;
      }
    }
    const version = `${this.walls.length}:${standing}`;
    if (this.navigationCache?.version !== version) {
      this.navigationCache = buildNavigation(
        this.walls.filter((wall) => !wall.isPlanned),
        this.castles[0]?.position,
        version,
      );
    }
    return this.navigationCache;
  }

  /**
   * Watch whether a company is actually closing on where it is going. A
   * company weaving around an obstacle makes no headway, and this is what
   * eventually tells it to stop trying and attack.
   */
  trackProgress(company, seconds) {
    const reach = Math.sqrt(distanceSquared(company.position, company.destination));
    if (reach < company.closestApproach - AVOIDANCE.progressEpsilon) {
      company.closestApproach = reach;
      company.stuckSeconds = 0;
      return;
    }
    company.stuckSeconds += seconds;
  }

  moveRaiders() {
    const target = this.castles[0];
    const navigation = this.navigation();
    for (const raider of this.raiders) {
      if (raider.isHeld) {
        continue;
      }
      raider.destination = this.raiderDestination(raider, target);
      this.trackProgress(raider, 1 / FPS);
      steerCompany(raider, navigation);
      this.advanceAgainstWalls(navigation, raider);
      this.resolveWallContact(navigation, raider);
      if (raider.isAlive && target) {
        this.resolveCastleContact(raider, target);
      }
    }
  }

  /**
   * Raiders make for the city, but lean away from imperial companies they can
   * see. A negative FEAR.weight draws them in instead.
   */
  raiderDestination(raider, castle) {
    const city = castle ? castle.position : { x: 0, y: 0 };
    if (FEAR.weight === 0 || this.guards.length === 0) {
      return city;
    }
    const notice = FEAR.noticeRadius * FEAR.noticeRadius;
    let shiftX = 0;
    let shiftY = 0;
    for (const guard of this.guards) {
      const gap = distanceSquared(raider.position, guard.position);
      if (gap > notice || gap === 0) {
        continue;
      }
      // Nearer companies pull harder, falling off with distance.
      const pull = 1 - Math.sqrt(gap) / FEAR.noticeRadius;
      shiftX += (raider.position.x - guard.position.x) * pull;
      shiftY += (raider.position.y - guard.position.y) * pull;
    }
    if (shiftX === 0 && shiftY === 0) {
      return city;
    }
    return {
      x: city.x + shiftX * FEAR.weight,
      y: city.y + shiftY * FEAR.weight,
    };
  }

  // --- the imperial army --------------------------------------------------

  /**
   * The guard tiers this castle can currently field, richest last. A city
   * fields only its light company until it has grown enough to unlock more.
   */
  dispatchOptions() {
    const castle = this.castles[0];
    if (!castle) {
      return [];
    }
    const tierIds = CASTLE_GUARD_TIERS[castle.typeId] ?? [];
    return tierIds.map((id) => ({ id, ...GUARD_TYPES[id] }));
  }

  /** Send a company of the given tier to hold a patch of ground. */
  sendGuard(typeId, target) {
    const home = this.castles[0];
    if (!home) {
      return { sent: false, status: 'nocity' };
    }
    const type = GUARD_TYPES[typeId];
    if (!type) {
      return { sent: false, status: 'unknown' };
    }
    if (this.tokens < type.cost) {
      return { sent: false, status: 'poor' };
    }
    this.tokens -= type.cost;
    const guard = new Guard(typeId, home.position);
    guard.home = { ...home.position };
    guard.orders = { ...target };
    guard.aimAt(target);
    this.guards.push(guard);
    return { sent: true, guard };
  }

  /** The nearest live raider within `radius`, or null. */
  nearestRaider(from, radius, ignore = null) {
    const reach = radius * radius;
    let closest = null;
    let closestGap = Infinity;
    for (const raider of this.raiders) {
      if (raider === ignore) {
        continue;
      }
      const gap = distanceSquared(from, raider.position);
      if (gap < reach && gap < closestGap) {
        closest = raider;
        closestGap = gap;
      }
    }
    return closest;
  }

  /**
   * A company runs down the nearest raider it can see, falls back on its
   * ordered ground, and goes home when there is nothing left to do.
   */
  guardDestination(guard) {
    if (guard.quarry && !guard.quarry.isAlive) {
      guard.quarry = null;
    }
    // A company that cannot reach what it is chasing picks something else.
    if (guard.stuckSeconds >= AVOIDANCE.patienceSeconds) {
      guard.quarry = null;
      guard.stuckSeconds = 0;
      guard.closestApproach = Infinity;
    }

    // Once past the leash it heads home and stays deaf to the hunt until it
    // is well back, otherwise it turns round the moment it clears the line
    // and yo-yos on the spot.
    const fromHome = distanceSquared(guard.position, guard.home);
    if (fromHome > IMPERIAL.leashRadius ** 2) {
      guard.recalled = true;
    } else if (guard.recalled && fromHome < IMPERIAL.returnRadius ** 2) {
      guard.recalled = false;
    }
    if (guard.recalled) {
      guard.quarry = null;
      return guard.home;
    }
    // Re-check every plan, so it switches to a nearer threat as one appears.
    const hunting = guard.quarry
      ? IMPERIAL.rehuntRadius
      : IMPERIAL.huntRadius;
    guard.quarry = this.nearestRaider(guard.position, hunting) ?? guard.quarry;
    if (guard.quarry) {
      return guard.quarry.position;
    }
    const arrived = distanceSquared(guard.position, guard.orders) < IMPERIAL.arriveRadius ** 2;
    return arrived ? guard.home : guard.orders;
  }

  /**
   * Imperial companies go through walls rather than round them. They hold
   * their formation doing it, but squeezing over the stone slows them; clear
   * of the wall they pick their pace back up.
   */
  updateCrossing(navigation, guard) {
    let nearest = Infinity;
    for (const wall of wallsNear(navigation.grid, guard.position, IMPERIAL.crossDistance)) {
      nearest = Math.min(nearest, pointToLineDistance(guard.position, wall.start, wall.end));
    }
    const target = nearest >= IMPERIAL.crossDistance
      ? 0
      : 1 - nearest / IMPERIAL.crossDistance;
    // Ease, so the ranks flow into line instead of snapping into it.
    guard.crossing += (target - guard.crossing) * 0.08;
  }

  moveGuards() {
    const navigation = this.navigation();
    for (const guard of this.guards) {
      if (guard.isHeld) {
        continue;
      }
      guard.destination = this.guardDestination(guard);
      this.trackProgress(guard, 1 / FPS);
      steerCompany(guard, navigation);
      this.updateCrossing(navigation, guard);
      // Walls do not stop them, but squeezing past one does slow them.
      const squeeze = 1 - guard.crossing * (1 - IMPERIAL.crossSpeed);
      guard.advance(squeeze * this.paceOn(guard.position) / FPS);
    }
  }

  /** The first standing section a step would cross, or null if the way is clear. */
  wallAcross(navigation, from, to) {
    const reach = Math.hypot(to.x - from.x, to.y - from.y) + WALL.reachMargin;
    for (const wall of wallsNear(navigation.grid, from, reach)) {
      if (segmentsIntersect(from, to, wall.start, wall.end)) {
        return wall;
      }
    }
    return null;
  }

  /**
   * Walls are solid. A raider still looking for a way round slides along the
   * face it meets, which is what carries it to the nearest gap; one that has
   * given up and is besieging plants itself and swings instead.
   */
  advanceAgainstWalls(navigation, raider) {
    const pace = this.paceOn(raider.position);
    if (!raider.avoidsWalls) {
      raider.advance(pace / FPS);
      return;
    }
    const step = { x: raider.velocity.x * pace / FPS, y: raider.velocity.y * pace / FPS };
    const ahead = { x: raider.position.x + step.x, y: raider.position.y + step.y };
    const blocking = this.wallAcross(navigation, raider.position, ahead);
    if (!blocking) {
      raider.position = ahead;
      return;
    }
    if (raider.besieges && raider.siegeTarget) {
      return;
    }

    // Keep whatever part of the step runs along the wall, drop the rest.
    const dx = blocking.end.x - blocking.start.x;
    const dy = blocking.end.y - blocking.start.y;
    const length = Math.hypot(dx, dy) || 1;
    const along = (step.x * dx + step.y * dy) / length;
    const slid = {
      x: raider.position.x + dx / length * along,
      y: raider.position.y + dy / length * along,
    };
    if (!this.wallAcross(navigation, raider.position, slid)) {
      raider.position = slid;
    }
  }

  resolveWallContact(navigation, raider) {
    const reachMargin = WALL.reachMargin;
    for (const wall of wallsNear(navigation.grid, raider.position, raider.type.range + reachMargin)) {
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

  // --- houses ---------------------------------------------------------------

  /**
   * How far out the walls sit, on average, from the castle. Zero with no
   * standing wall, which is what keeps houses off the ground until there is
   * something to shelter behind.
   */
  settlementRadius() {
    const castle = this.castles[0];
    if (!castle) {
      return 0;
    }
    let total = 0;
    let count = 0;
    for (const wall of this.walls) {
      if (wall.isPlanned) {
        continue;
      }
      const midpoint = { x: (wall.start.x + wall.end.x) / 2, y: (wall.start.y + wall.end.y) / 2 };
      total += distance(midpoint, castle.position);
      count += 1;
    }
    return count > 0 ? total / count : 0;
  }

  /** How many houses the current wall ring can support. */
  houseCapacity() {
    const castle = this.castles[0];
    if (!castle) {
      return 0;
    }
    const usable = this.settlementRadius() - castle.type.footprint - HOUSES.innerMargin;
    if (usable <= 0) {
      return 0;
    }
    return Math.min(HOUSES.maxHouses, Math.floor(usable / HOUSES.radialSpacing));
  }

  /** A point clear of every house and every standing wall, or null if none was found. */
  pickHouseSite() {
    const castle = this.castles[0];
    if (!castle) {
      return null;
    }
    const radius = this.settlementRadius();
    const inner = castle.type.footprint + HOUSES.innerMargin;
    if (radius <= inner) {
      return null;
    }
    for (let attempt = 0; attempt < HOUSES.placementAttempts; attempt += 1) {
      const angle = this.random() * 2 * Math.PI;
      const reach = inner + this.random() * (radius - inner);
      const point = {
        x: castle.position.x + Math.cos(angle) * reach,
        y: castle.position.y + Math.sin(angle) * reach,
      };
      if (this.houseSiteIsClear(point)) {
        return point;
      }
    }
    return null;
  }

  houseSiteIsClear(point) {
    for (const house of this.houses) {
      if (distance(point, house.position) < HOUSES.radialSpacing * 0.5) {
        return false;
      }
    }
    for (const wall of this.walls) {
      if (wall.isPlanned) {
        continue;
      }
      if (pointToLineDistance(point, wall.start, wall.end) < HOUSES.wallClearance) {
        return false;
      }
    }
    return true;
  }

  /** Add one house if the wall ring has room for it and a clear site turns up. */
  trySpawnHouse() {
    if (this.houses.length >= this.houseCapacity()) {
      return false;
    }
    const site = this.pickHouseSite();
    if (!site) {
      return false;
    }
    this.houses.push(new House(site));
    return true;
  }

  /** A raider that reaches a house sets it alight; nothing puts it back out. */
  resolveHouseContact() {
    for (const house of this.houses) {
      if (house.burning) {
        continue;
      }
      for (const raider of this.raiders) {
        const reach = HOUSES.contactRadius + raider.type.range;
        if (distanceSquared(house.position, raider.position) < reach * reach) {
          house.ignite();
          break;
        }
      }
    }
  }

  /** Demolish any house standing where a bigger castle now does. */
  clearHousesUnder(castle) {
    const remaining = [];
    let cleared = 0;
    for (const house of this.houses) {
      if (distanceToSquare(house.position, castle.position, castle.type.footprint) <= 0) {
        cleared += 1;
      } else {
        remaining.push(house);
      }
    }
    this.houses = remaining;
    return cleared;
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
    // A section still pegged out has nothing to repair, and letting a redraw
    // finish it would be a way to buy back the three seconds it is meant to
    // cost. The masons have to mark it out first.
    if (wall.isPlanned) {
      return { status: 'planning', wall };
    }
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
    const wall = new Wall(start, end, WALL.initialFraction, WALL.planSeconds);
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
      if (!wall.isPlanned
        && segmentEntersSquare(wall.start, wall.end, castle.position, castle.type.footprint)) {
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
    // The footprint changes at once — walls under it are cleared immediately
    // — but combat and income keep running off the old stats (and the health
    // bar keeps its old scale) until the new structure has actually risen.
    const upgraded = new Castle(nextTypeId, current.position, {
      health: current.health,
      previousTypeId: current.typeId,
      previousType: current.effectiveType,
    });
    if (this.tokens < upgraded.type.cost) {
      this.onMessage(`You need $${upgraded.type.cost} to upgrade the castle.`);
      return false;
    }
    this.tokens -= upgraded.type.cost;
    this.castles[index] = upgraded;
    this.levelUnderCities();
    this.clearHousesUnder(upgraded);
    const cleared = this.clearWallsUnder(upgraded);
    const razed = cleared > 0
      ? ` ${cleared} wall section${cleared === 1 ? '' : 's'} cleared for it.`
      : '';
    this.onMessage(`Upgraded to ${upgraded.type.name}.${razed}`);
    return true;
  }
}
