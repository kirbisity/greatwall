import {
  Castle, Emperor, Guard, House, Raider, Wall,
} from './entities.js';
import {
  closestPointOnSquare,
  distance,
  distanceSquared,
  distanceToSegment,
  distanceToSquare,
  isWithinSegmentBand,
  pointToLineDistance,
  segmentEntersSquare,
  segmentsIntersect,
} from './geometry.js';
import { steerCompany } from './pathfinding.js';
import { buildNavigation, wallsNear } from './navigation.js';
import { lockEngagements, resolveMelee } from './melee.js';
import { Terrain } from './terrain.js';
import { unitSize } from './units.js';
import { LEVELS } from './levels.js';
import { BUILDINGS } from './buildings/index.js';
import {
  AVOIDANCE,
  BATTLE,
  BREACH,
  CASTLE_GUARD_TIERS,
  CASTLE_TYPES,
  EARTHWORK,
  EMPEROR_TIER_MULTIPLIER,
  FEAR,
  FPS,
  TERRAIN,
  GUARD_TYPES,
  HOUSES,
  IMPERIAL,
  HARVEST_MULTIPLIER,
  INCOME_INTERVAL_SECONDS,
  RAIDER_SPAWN_INTERVAL_SECONDS,
  ROUT,
  REGEN_FRACTION_PER_PAYOUT,
  SEASON_LENGTH_SECONDS,
  SEASON_MESSAGES,
  SEASON_RAIDER_MIX,
  SPAWN_MAX_DISTANCE,
  SPAWN_MIN_DISTANCE,
  STARTING_CASTLE_TYPE,
  STARTING_TOKENS,
  WALL,
  WALL_THICKNESS_UNITS,
  WALL_TIERS,
  WINTER_BUILD_MULTIPLIER,
} from './config.js';

const SEASONS_PER_YEAR = 4;
// Positional against SEASONS, which now starts from Spring -- see config.js.
const AUTUMN = 2;
const WINTER = 3;
const WALL_HINT_SECONDS = 20;
// How many of the cheapest possible section the treasury must cover before
// the Build button stops reading as affordable -- see canAffordToBuild.
const MIN_AFFORDABLE_WALLS = 3;
const UPGRADE_HINT_SECONDS = 40;

/** Random offset that lands outside the safe radius around the castle. */
// The widest a section's own footprint can be, which is as far as anything
// need look to know whether it is standing on one.
const WALL_OVERLAP_REACH = WALL_THICKNESS_UNITS * 2 + WALL.reachMargin;

/** How quickly a company settles into or out of climbing a wall. */
const CROSSING_EASE = 0.08;

// How far astride a wall counts as being up on it, and how far clear of one
// counts as being down again, so a company is charged once for a crossing
// rather than flickering on the boundary.
const CLIMB_CHARGED_AT = 0.5;
const CLIMB_CLEAR_AT = 0.15;

/** How far along a beach raiders spread either side of the boat. */
const LANDING_SPREAD = 26;

/** How finely a planned wall is sampled when checking it for water. */
const WATER_PROBE_SPACING = 6;

/** Where a wall's own sound effect should seem to come from. */
function wallMidpoint(wall) {
  return { x: (wall.start.x + wall.end.x) / 2, y: (wall.start.y + wall.end.y) / 2 };
}

/**
 * One of `count` points evenly ringed around `target` -- a single company
 * gets the exact point, so a lone order still lands precisely where aimed.
 */
function spreadPoint(target, index, count) {
  if (count <= 1) {
    return { ...target };
  }
  const angle = (index / count) * Math.PI * 2;
  return {
    x: target.x + Math.cos(angle) * IMPERIAL.groupSpreadRadius,
    y: target.y + Math.sin(angle) * IMPERIAL.groupSpreadRadius,
  };
}

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
  constructor({
    onMessage = () => {},
    onEffect = () => {},
    random = Math.random,
    seed = 1,
    level = LEVELS[0],
  } = {}) {
    this.onMessage = onMessage;
    this.onEffect = onEffect;
    this.random = random;
    // The level says only what is different about it -- its landscape, where
    // raiders ride in from, what water lies across the map. Everything else
    // is the same game (see levels.js).
    this.seed = seed;
    this.wallHintShown = false;
    this.upgradeHintShown = false;
    this.loadLevel(level);
  }

  /**
   * Swap to another level and begin it. The landscape is built fresh, since
   * a level's ground is fixed for its whole run, but the Game itself carries
   * on -- input and the renderer hold onto this object.
   */
  loadLevel(level) {
    this.level = level;
    // The one flag that turns the whole game from a siege into the open
    // battleground mode -- see restart, and every `this.mode === 'battle'`
    // branch below it.
    this.mode = level.mode === 'battle' ? 'battle' : 'siege';
    // A level may raise its own buildings and field its own companies; what
    // it leaves out it inherits (see levels.js).
    this.buildings = { ...BUILDINGS, ...level.buildings };
    // How sturdy this level's stone is, and what it costs a raider to go
    // over a section rather than round it (null where walls simply stop
    // them, which is everywhere else).
    this.wallHealthScale = level.wall?.healthScale ?? 1;
    this.wallClimb = level.wall?.climb ?? null;
    // Merged tier by tier, so a level says only what is different about its
    // castles and keeps the costs, health and upgrade chain as they are.
    this.castleTypes = Object.fromEntries(
      Object.entries(CASTLE_TYPES).map(([id, type]) => [id, { ...type, ...level.castleTypes?.[id] }]),
    );
    this.guardTiers = { ...CASTLE_GUARD_TIERS, ...level.guardTiers };
    // Null leaves the renderer on its own default house.
    this.houseDefinition = level.house ?? null;
    this.terrain = new Terrain(this.seed, level.land, level.river, level.sea);
    // The coves a seaborne level lands its boats at, fixed for the run: the
    // renderer beaches a hull at each, and spawnPoint puts raiders ashore
    // there (see levels.js).
    this.landings = level.landings
      ? this.terrain.landings(level.landings.count, level.landings.inset)
      : [];
    this.restart();
  }

  restart() {
    this.navigationCache = null;
    this.terrain.levelled = [];
    this.terrain.zoneIndex = null;
    // Bumped whenever reshaped ground changes height, so the renderer knows
    // its cached landscape is stale -- see Renderer#drawGround.
    this.terrainRevision = 0;
    this.guards = [];
    // The one Emperor a game gets -- see dispatchOptions/spawnEmperor.
    // Mustered only stays true for the run it happened on: a fresh level
    // (or a restart) gets its own free launch back.
    this.emperor = null;
    this.emperorMustered = false;
    this.walls = [];
    // The Build tool's own low ramps in the open battleground mode -- not
    // walls at all, so they live apart from this.walls: see buildEarthwork.
    this.earthworks = [];
    this.houses = [];
    this.houseSpawnCountdown = HOUSES.spawnIntervalSeconds;
    // No castle at all in the open battleground mode -- see spawnBattleLine
    // for how the enemy is drawn up instead, and placeGuard for how the
    // player fields companies without one.
    this.castles = this.mode === 'battle'
      ? []
      : [new Castle(STARTING_CASTLE_TYPE, { x: 0, y: 0 }, { types: this.castleTypes })];
    this.levelUnderCities();
    this.raiders = [];
    this.tokens = STARTING_TOKENS;
    this.season = 0;
    this.seconds = 0;
    this.frame = 0;
    // Set once the last castle falls; counts up to BREACH.collapseSeconds
    // while the city burns, before the game actually ends.
    this.breachSeconds = null;
    // Placement phase state for the open battleground mode: budget left to
    // spend, and a log of what it went on so Undo can hand it back -- see
    // placeGuard/buildEarthwork/undoLastPlacement. `started` marks the
    // moment Start Battle is pressed: the field is drawn up before then,
    // but nothing moves and nothing more may be placed after.
    if (this.mode === 'battle') {
      this.battleBudget = BATTLE.budget;
      this.placementLog = [];
      this.started = false;
      this.spawnBattleLine();
      // Tallied live as the fight goes, since a company's own health is
      // gone the instant it dies -- see trackBattleLosses. `loss` on each
      // side is in individual soldiers, not companies: the fraction of a
      // company's health actually lost, times how many figures muster in
      // it, so a company ground down to a sliver of health reads as most
      // of its own troops down even while it is still technically standing.
      // The `ByType` maps break that same figure down by which type it
      // came from, for the end-of-round drill-down (see Hud#showBattleResult).
      this.battleStats = {
        kills: 0, deaths: 0, enemyLoss: 0, playerLoss: 0, enemyLossByType: {}, playerLossByType: {},
      };
    }
  }

  /**
   * Settlements stand on levelled ground, and clear the wood around them.
   *
   * The ground is only flattened -- a castle's own stonework is part of the
   * building (see buildings/japan-small.js), not a shelf raised under it.
   */
  levelUnderCities() {
    for (const [index, castle] of this.castles.entries()) {
      this.terrain.level(index, castle.position.x, castle.position.y, castle.type.footprint);
    }
    // The levelled ground is part of what the mesh draws, so growing a city
    // has to count as a change the renderer notices.
    this.terrainRevision += 1;
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

  /**
   * What a company's pace is multiplied by for the ground it is crossing:
   * woodland to push through, and whatever climb lies along its way.
   */
  paceOn(company) {
    const { x, y } = company.position;
    const throughWoods = 1 - this.terrain.forestAt(x, y) * TERRAIN.forestDrag;
    const throughEarthworks = this.onEarthwork(company.position) ? EARTHWORK.slowFactor : 1;
    return throughWoods * throughEarthworks * this.climbPace(company);
  }

  /** Whether a point stands astride one of the open battleground's earthworks. */
  onEarthwork(position) {
    return this.earthworks.some((earthwork) => (
      distanceToSegment(position, earthwork.start, earthwork.end) <= EARTHWORK.thickness
    ));
  }

  /**
   * How much a company is slowed by the ground rising ahead of it.
   *
   * Measured along the way it is actually heading rather than by how steep
   * the ground is, so a slope is hard work going up it, ordinary going along
   * it, and no trouble at all coming down -- which is what makes holding the
   * high ground worth anything.
   */
  climbPace(company) {
    const speed = Math.hypot(company.velocity.x, company.velocity.y);
    if (speed === 0) {
      return 1;
    }
    const step = TERRAIN.climbSample;
    const { x, y } = company.position;
    const aheadX = x + (company.velocity.x / speed) * step;
    const aheadY = y + (company.velocity.y / speed) * step;
    const climb = (this.terrain.heightAt(aheadX, aheadY) - this.terrain.heightAt(x, y)) / step;
    if (climb <= 0) {
      return 1;
    }
    return Math.max(TERRAIN.minClimbPace, 1 / (1 + climb * TERRAIN.climbDrag));
  }

  get isDefeated() {
    if (this.mode === 'battle') {
      // Instant, not a slow breach -- there is no city left burning to
      // wait on. Only once the battle has actually started: an empty field
      // before Start Battle is pressed is not a loss, it is an empty field.
      if (!this.started) {
        return false;
      }
      // Losing the Emperor is fatal here too, the same as in a siege --
      // even with other companies still standing.
      return this.guards.length === 0 || (this.emperor !== null && !this.emperor.isAlive);
    }
    return this.castles.some((castle) => castle.health < 0) || (this.emperor !== null && !this.emperor.isAlive);
  }

  /** The open battleground mode's own win condition -- sieges never end. */
  get isVictorious() {
    return this.mode === 'battle' && this.started && this.raiders.length === 0;
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

  /**
   * Continuous position in the year: what the sky blends by, so a season
   * turning is never a hard cut -- see Atmosphere's seasonBlend.
   *
   * Deliberately not `this.season` plus a fraction: advanceSeason fires a
   * second before `this.seconds` actually completes a season (see
   * onSecondElapsed), so that sum would jump by a whole season for the one
   * second in between. Dividing the clock directly stays perfectly
   * continuous instead, at the cost of reading fractionally behind
   * `this.season` for that same one second -- invisible in the sky, unlike
   * a jump would be.
   *
   * The extra half-season puts `this.seconds === 0` exactly on Spring's own
   * midpoint (see SEASONS in config.js), rather than mid-blend into it, so a
   * level opens already looking like spring instead of fading in from
   * whatever the last season of a cycle happens to be. Everything past the
   * first frame keeps exactly the same shape it always had, just shifted.
   */
  get seasonPhase() {
    return this.seconds / SEASON_LENGTH_SECONDS + 0.5;
  }

  wallCost(length) {
    return Math.trunc(length * WALL.costPerUnit * this.buildMultiplier);
  }

  /** Whether there is coin for at least a few of the cheapest possible section -- see Hud's own greying of the Build button. */
  get canAffordToBuild() {
    return this.tokens >= this.wallCost(WALL.minLength) * MIN_AFFORDABLE_WALLS;
  }

  /** Whether there is coin for the cheapest company this castle can field right now. */
  get canAffordToAttack() {
    const options = this.dispatchOptions();
    return options.length > 0 && this.tokens >= Math.min(...options.map((option) => option.cost));
  }

  /** Whether there is coin for the castle's own next tier -- false once it is maxed out. */
  get canAffordToUpgrade() {
    const nextTypeId = this.castles[0]?.type.upgradesTo;
    if (!nextTypeId) {
      return false;
    }
    return this.tokens >= this.castleTypes[nextTypeId].cost;
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
      wall.advanceUpgrade(1 / FPS);
    }
    for (const house of this.houses) {
      house.advance(1 / FPS);
    }
    // A snapshot from just before the blows land, so trackBattleLosses can
    // see what each company actually lost this frame -- health taken by a
    // company that goes on to die is gone from it by the time the filter
    // below removes it.
    const preBattleHealth = this.mode === 'battle' ? this.snapshotHealth() : null;
    lockEngagements(this.guards, this.raiders);
    resolveMelee([...this.guards, ...this.raiders], 1 / FPS);
    for (const guard of this.guards) {
      if (guard.inMelee) {
        if (!guard.soundedFight) {
          this.onEffect('fighting', guard.position);
          guard.soundedFight = true;
        }
      } else {
        // The bout ended -- the next one is a fresh engagement.
        guard.soundedFight = false;
      }
    }
    this.moveRaiders();
    this.moveGuards();
    this.resolveHouseContact();
    if (preBattleHealth) {
      this.trackBattleLosses(preBattleHealth);
    }
    this.raiders = this.raiders.filter((raider) => raider.isAlive && !raider.fled);
    this.guards = this.guards.filter((guard) => guard.isAlive && !guard.fled);
    for (const wall of this.walls) {
      if (wall.health < 0) {
        this.onEffect('destroyed', wallMidpoint(wall));
      }
    }
    this.walls = this.walls.filter((wall) => wall.health >= 0);
    this.houses = this.houses.filter((house) => !house.isGone);
    // Once the city is lost the field keeps animating, but this is the clock
    // the game-over screen actually waits on: see BREACH.collapseSeconds.
    if (this.isDefeated) {
      if (this.breachSeconds === null) {
        const fallen = this.castles.find((castle) => castle.health < 0);
        this.onEffect('destroyed', fallen?.position ?? this.emperor?.position);
      }
      this.breachSeconds = Math.min(BREACH.collapseSeconds, (this.breachSeconds ?? 0) + 1 / FPS);
    }
  }

  onSecondElapsed() {
    // No economy, no seasons, no trickle of fresh raiders -- the whole
    // enemy line was drawn up once, at Start Battle, by spawnBattleLine.
    if (this.mode === 'battle') {
      return;
    }
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
    // A fortified section costs its tier's multiple to keep, so the bill is
    // counted in upkeep units rather than in sections: a plain wall is one
    // unit, a reinforced one four. `wallCount` stays the plain section count,
    // and the two agree until something is fortified.
    let wallCount = 0;
    let wallUpkeep = 0;
    for (const wall of this.walls) {
      if (!wall.isPlanned) {
        wallCount += 1;
        wallUpkeep += wall.upkeep;
      }
    }
    const upkeepPerWall = WALL.upkeepPerSection;
    const upkeepUnits = wallUpkeep / upkeepPerWall;
    return {
      cityIncome, houseCount, housePerHouse, houseIncome,
      wallCount, upkeepPerWall, upkeepUnits, wallUpkeep,
      total: cityIncome + houseIncome - wallUpkeep,
    };
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

  /**
   * Where the next raider rides in from.
   *
   * A level with `landings` wades them up its beaches; one with a
   * `spawnArc` musters them along one stretch of horizon --
   * a bearing inside the arc, at a distance in the usual band. Without one
   * they come from anywhere, by the same offset-per-axis the game has always
   * used, so a level that asks for nothing is spawned exactly as before.
   */
  spawnPoint(centre) {
    // A level that lands boats puts its raiders ashore at one of the coves,
    // scattered along the beach rather than stacked on the hull.
    if (this.landings.length > 0) {
      const landing = this.landings[Math.floor(this.random() * this.landings.length)];
      const along = (this.random() - 0.5) * 2 * LANDING_SPREAD;
      return {
        x: Math.trunc(landing.x - Math.sin(landing.bearing) * along),
        y: Math.trunc(landing.y + Math.cos(landing.bearing) * along),
      };
    }
    const arc = this.level.spawnArc;
    if (!arc) {
      return {
        x: Math.trunc(centre.x + spawnOffset(this.random)),
        y: Math.trunc(centre.y + spawnOffset(this.random)),
      };
    }
    const bearing = (arc.centre + (this.random() - 0.5) * arc.spread) * Math.PI / 180;
    const reach = SPAWN_MIN_DISTANCE + this.random() * (SPAWN_MAX_DISTANCE - SPAWN_MIN_DISTANCE);
    return {
      x: Math.trunc(centre.x + Math.cos(bearing) * reach),
      y: Math.trunc(centre.y + Math.sin(bearing) * reach),
    };
  }

  /**
   * Compass bearings (degrees, 0 east / 90 north -- see spawnPoint) raiders
   * are expected from this level, for a warning shown once at the start --
   * see Hud#showThreats. Landing points and a spawn arc already say exactly
   * where; a level with neither spawns from anywhere, so the warning covers
   * the whole compass instead of pointing anywhere in particular.
   */
  get threatBearings() {
    if (this.landings.length > 0) {
      const rounded = this.landings.map((landing) => Math.round((landing.bearing * 180) / Math.PI / 15) * 15);
      return [...new Set(rounded)];
    }
    const arc = this.level.spawnArc;
    if (arc) {
      return [arc.centre];
    }
    return [0, 45, 90, 135, 180, 225, 270, 315];
  }

  spawnRaider() {
    const target = this.castles[0];
    if (!target) {
      return;
    }
    const mix = SEASON_RAIDER_MIX[Math.min(this.season, SEASON_RAIDER_MIX.length - 1)];
    const typeId = mix[Math.floor(this.random() * mix.length)];
    const from = this.spawnPoint(target.position);
    const raider = new Raider(typeId, from);
    raider.aimAt(target.position);
    this.raiders.push(raider);
  }

  /**
   * Draw up the enemy line for the open battleground mode: infantry across
   * the centre, up front, cavalry held behind on both flanks. Randomised a
   * little every game -- how many of each, and a jitter on every position --
   * so the line is recognisable but never quite the same shape twice.
   */
  spawnBattleLine() {
    const [infantryMin, infantryMax] = BATTLE.infantryCountRange;
    const infantryCount = infantryMin + Math.floor(this.random() * (infantryMax - infantryMin + 1));
    for (let index = 0; index < infantryCount; index += 1) {
      const spread = (index - (infantryCount - 1) / 2) * BATTLE.infantrySpacing;
      this.spawnBattleCompany(
        BATTLE.infantryTypes[Math.floor(this.random() * BATTLE.infantryTypes.length)],
        spread,
        BATTLE.enemyBaselineY,
      );
    }
    const [cavalryMin, cavalryMax] = BATTLE.cavalryPerSideRange;
    const cavalryPerSide = cavalryMin + Math.floor(this.random() * (cavalryMax - cavalryMin + 1));
    for (const side of [-1, 1]) {
      for (let index = 0; index < cavalryPerSide; index += 1) {
        const flankX = side * (BATTLE.cavalryFlankOffset + index * BATTLE.cavalrySpacing);
        this.spawnBattleCompany(
          BATTLE.cavalryTypes[Math.floor(this.random() * BATTLE.cavalryTypes.length)],
          flankX,
          BATTLE.enemyBaselineY + BATTLE.cavalryDepthOffset,
        );
      }
    }
  }

  /** One company of the enemy line, jittered off its formation slot and aimed south. */
  spawnBattleCompany(typeId, x, y) {
    const jitter = () => (this.random() - 0.5) * BATTLE.formationJitter;
    const position = { x: Math.trunc(x + jitter()), y: Math.trunc(y + jitter()) };
    const raider = new Raider(typeId, position);
    raider.aimAt({ x: position.x, y: -BATTLE.fieldHalfDepth });
    this.raiders.push(raider);
  }

  /** Every company's health right now, keyed by the company itself -- see trackBattleLosses. */
  snapshotHealth() {
    const health = new Map();
    for (const raider of this.raiders) {
      health.set(raider, raider.health);
    }
    for (const guard of this.guards) {
      health.set(guard, guard.health);
    }
    return health;
  }

  /**
   * Folds this frame's fighting into the open battleground mode's running
   * stats: a kill or death for every company that died since `before`, and
   * on each side how many individual soldiers that amounts to -- the
   * fraction of a company's own health actually lost, times how many
   * figures muster in it (see units#unitSize), so a company ground down to
   * a sliver of health reads as most of its own troops down even while it
   * is technically still standing.
   */
  trackBattleLosses(before) {
    for (const raider of this.raiders) {
      const priorHealth = before.get(raider) ?? raider.health;
      this.tallyBattleLoss(raider, priorHealth, 'enemyLoss', 'enemyLossByType');
      // Run off the field counts the same as cut down: that company is out of the fight.
      if (!raider.isAlive || raider.fled) {
        this.battleStats.kills += 1;
      }
    }
    for (const guard of this.guards) {
      const priorHealth = before.get(guard) ?? guard.health;
      this.tallyBattleLoss(guard, priorHealth, 'playerLoss', 'playerLossByType');
      if (!guard.isAlive || guard.fled) {
        this.battleStats.deaths += 1;
      }
    }
  }

  /** One company's share of a battle stat: individuals lost this frame, added to the running total and its own type's own line. */
  tallyBattleLoss(company, priorHealth, totalKey, byTypeKey) {
    // Capped at the company's own max health: a killing blow can carry a
    // company's health well past zero, and none of that overkill is a
    // soldier this company never actually had.
    const lost = Math.min(priorHealth, company.type.maxHealth) - Math.max(company.health, 0);
    if (lost <= 0) {
      return;
    }
    const individuals = (lost / company.type.maxHealth) * unitSize(company.typeId);
    this.battleStats[totalKey] += individuals;
    const byType = this.battleStats[byTypeKey];
    byType[company.typeId] = (byType[company.typeId] ?? 0) + individuals;
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
      const castle = this.castles[0]?.position;
      const reach = TERRAIN.mountainFieldRadius;
      this.navigationCache = buildNavigation(
        this.walls.filter((wall) => !wall.isPlanned),
        castle,
        version,
        castle ? [
          ...this.terrain.mountainsWithin(castle.x - reach, castle.y - reach, castle.x + reach, castle.y + reach),
          // Water is one more thing to route around, so it rides in the
          // same list the peaks do.
          ...this.terrain.riverCirclesWithin(castle.x - reach, castle.x + reach),
        ] : [],
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
        raider.halt();
        continue;
      }
      raider.destination = raider.routed
        ? this.fleeDestination(raider, this.guards)
        : this.raiderDestination(raider, target);
      this.trackProgress(raider, 1 / FPS);
      // Runs down whatever siege it has sworn to; at zero it may think again.
      raider.siegeSeconds = Math.max(0, raider.siegeSeconds - 1 / FPS);
      steerCompany(raider, navigation, this.random);
      raider.gatherPace(1 / FPS);
      if (this.wallClimb) {
        this.updateCrossing(navigation, raider, this.wallClimb.reach);
      }
      this.advanceAgainstWalls(navigation, raider);
      this.chargeWallClimb(raider);
      raider.touchedThisFrame = false;
      if (raider.routed) {
        // Running, not besieging: nothing gets battered on the way out.
        this.checkEscape(raider, this.guards);
      } else {
        this.resolveWallContact(navigation, raider);
        if (raider.isAlive && target) {
          this.resolveCastleContact(raider, target);
        }
      }
      if (!raider.touchedThisFrame) {
        // Contact broke this frame -- see it as a fresh engagement next time.
        raider.soundedEngage = false;
      }
    }
  }

  /**
   * Raiders make for the city, but lean away from imperial companies they can
   * see. A negative FEAR.weight draws them in instead.
   */
  raiderDestination(raider, castle) {
    // No city to make for, and no reason to shy off from a company it can
    // see either -- the open battleground mode is a fight both sides came
    // looking for. Whatever guard is nearest gets run down; with nothing
    // close enough to notice, the raider makes straight for the Emperor
    // instead if one is on the field, and only charges blindly south with
    // neither to aim at.
    if (this.mode === 'battle') {
      const nearby = this.nearestGuard(raider.position, FEAR.noticeRadius);
      if (nearby) {
        return nearby.position;
      }
      if (this.emperor && this.emperor.isAlive) {
        return this.emperor.position;
      }
      return { x: raider.position.x, y: -BATTLE.fieldHalfDepth };
    }
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
    const tierIds = this.guardTiers[castle.typeId] ?? [];
    const options = tierIds.map((id) => ({ id, ...GUARD_TYPES[id] }));
    // Offered the same way in every level, on top of whatever that level's
    // own tiers are -- and only for as long as this game has not already
    // spent its one launch. See spawnEmperor.
    if (!this.emperorMustered) {
      options.push({ id: 'EMPEROR', ...this.emperorStats(castle) });
    }
    return options;
  }

  /** The Emperor's own stats at a castle's current tier -- see spawnEmperor. */
  emperorStats(castle = this.castles[0]) {
    const base = GUARD_TYPES.EMPEROR;
    const multiplier = EMPEROR_TIER_MULTIPLIER[castle?.typeId] ?? 1;
    return {
      ...base,
      maxHealth: Math.round(base.maxHealth * multiplier),
      attack: Math.round(base.attack * multiplier),
      defense: Math.round(base.defense * multiplier),
    };
  }

  /** Send a company of the given tier to hold a patch of ground. */
  sendGuard(typeId) {
    if (typeId === 'EMPEROR') {
      return this.spawnEmperor();
    }
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
    // No order yet: it stands at home until selected and sent (see
    // selectGuardsNear/orderGuards), hunting anything that strays within
    // IMPERIAL.huntRadius on its own the same way any mustered company
    // already does -- see guardDestination.
    this.guards.push(guard);
    this.onEffect('attack', home.position);
    return { sent: true, guard };
  }

  /**
   * Muster the one Emperor a game gets: free, scaled to the castle's
   * current tier, and never on offer again once launched (see
   * dispatchOptions). Strictly commanded rather than hunting on its own
   * (see guardDestination), and losing it ends the game the same way
   * losing the castle does (see isDefeated).
   */
  spawnEmperor() {
    const home = this.castles[0];
    if (!home) {
      return { sent: false, status: 'nocity' };
    }
    if (this.emperorMustered) {
      return { sent: false, status: 'unique' };
    }
    const emperor = new Emperor(home.position);
    // A fresh object, scaled to this tier -- never the shared GUARD_TYPES
    // entry itself, or mustering would permanently inflate every future
    // game's own starting stats.
    emperor.type = this.emperorStats(home);
    emperor.health = emperor.type.maxHealth;
    emperor.home = { ...home.position };
    this.guards.push(emperor);
    this.emperor = emperor;
    this.emperorMustered = true;
    this.onEffect('attack', home.position);
    return { sent: true, guard: emperor };
  }

  /** This mode's roster entry for a type id, or null if it is not on offer. */
  battleRosterEntry(typeId) {
    return BATTLE.roster.find((entry) => entry.id === typeId) ?? null;
  }

  /** Whether a point falls inside the player's own deployment band, south of the start line. */
  withinDeploymentZone(point) {
    return Math.abs(point.x) <= BATTLE.fieldHalfWidth
      && point.y <= BATTLE.baselineY
      && point.y >= BATTLE.baselineY - BATTLE.placementDepth;
  }

  /**
   * Field a company of the open battleground mode's own roster, spending
   * from the placement budget rather than the treasury -- there is no
   * income here to spend it out of. Stands exactly where placed and holds
   * that ground on its own, the same autonomous "hunt anything that strays
   * near" behaviour any mustered guard already has (see guardDestination) --
   * only the Emperor opts out of it.
   */
  placeGuard(typeId, point) {
    if (this.mode !== 'battle' || this.started) {
      return { placed: false, status: 'blocked' };
    }
    const entry = this.battleRosterEntry(typeId);
    if (!entry) {
      return { placed: false, status: 'unknown' };
    }
    if (typeId === 'EMPEROR' && this.emperorMustered) {
      return { placed: false, status: 'unique' };
    }
    if (this.battleBudget < entry.cost) {
      return { placed: false, status: 'poor' };
    }
    if (!this.withinDeploymentZone(point)) {
      return { placed: false, status: 'zone' };
    }
    this.battleBudget -= entry.cost;
    const guard = typeId === 'EMPEROR' ? new Emperor(point) : new Guard(typeId, point);
    if (typeId === 'EMPEROR') {
      this.emperor = guard;
      this.emperorMustered = true;
    }
    this.guards.push(guard);
    this.placementLog.push({ type: 'guard', guard, cost: entry.cost });
    this.onEffect('attack', point);
    return { placed: true, guard };
  }

  /**
   * Lay one of the open battleground mode's own low earthworks: a slow, not
   * a barrier (see paceOn/onEarthwork), so it carries none of buildWall's
   * cost, snapping or city/water checks -- there is neither a city nor a
   * treasury here, and nothing routes around one regardless.
   */
  buildEarthwork(from, to) {
    if (this.mode !== 'battle' || this.started) {
      return { status: 'blocked' };
    }
    const start = { x: Math.trunc(from.x), y: Math.trunc(from.y) };
    const end = { x: Math.trunc(to.x), y: Math.trunc(to.y) };
    const length = distance(start, end);
    if (length <= EARTHWORK.minLength || length >= EARTHWORK.maxLength) {
      return { status: 'short', start, end };
    }
    const earthwork = { start, end };
    this.earthworks.push(earthwork);
    this.placementLog.push({ type: 'earthwork', earthwork });
    this.onEffect('build', wallMidpoint(earthwork));
    return { status: 'built', start, end };
  }

  /** Undo the last placement -- a company handed its points back, or an earthwork torn up. */
  undoLastPlacement() {
    const entry = this.placementLog.pop();
    if (!entry) {
      return false;
    }
    if (entry.type === 'guard') {
      this.guards = this.guards.filter((guard) => guard !== entry.guard);
      this.battleBudget += entry.cost;
      if (entry.guard === this.emperor) {
        this.emperor = null;
        this.emperorMustered = false;
      }
    } else {
      this.earthworks = this.earthworks.filter((earthwork) => earthwork !== entry.earthwork);
    }
    return true;
  }

  /** Close the placement phase: the line drawn up so far is what fights. */
  startBattle() {
    if (this.mode !== 'battle' || this.started) {
      return false;
    }
    this.started = true;
    return true;
  }

  /**
   * Every company within ATTACK_SELECT_RADIUS of a point -- a tap to pick
   * out whatever is nearby, whether it is still standing at home or
   * already out on the field. Marks them selected and hands the group
   * back, so Input knows who a following tap should command.
   */
  selectGuardsNear(point) {
    const reach = IMPERIAL.selectRadius * IMPERIAL.selectRadius;
    // A routed company is past taking orders -- see melee.js's rout.
    const found = this.guards.filter((guard) => (
      !guard.routed && distanceSquared(guard.position, point) <= reach
    ));
    for (const guard of this.guards) {
      guard.selected = found.includes(guard);
    }
    return found;
  }

  /** Every company currently selected -- see selectGuardsNear. */
  get selectedGuards() {
    return this.guards.filter((guard) => guard.selected);
  }

  deselectGuards() {
    for (const guard of this.guards) {
      guard.selected = false;
    }
  }

  /**
   * Send a selected group to hold new ground, spread a little around the
   * point instead of stacked on the exact same spot -- but a company
   * already trading blows stays put until it is free, the same as any
   * other order (see Company#isHeld, moveGuards).
   */
  orderGuards(guards, target) {
    guards.forEach((guard, index) => {
      guard.orders = spreadPoint(target, index, guards.length);
      guard.recalled = false;
      guard.selected = false;
      guard.holding = false;
      // A fresh order takes the company's whole attention until it gets
      // there -- see guardDestination.
      guard.arrived = false;
    });
  }

  /**
   * Put a group on hold, or take it off: a group already all holding is
   * released, anything else is told to hold. Returns whether it is now
   * holding. A company on hold stands exactly where it is -- no hunting, no
   * marching -- and only fights what comes to it (see moveGuards and
   * melee.js's bracing). Released, it takes up from where it stands.
   */
  toggleHold(guards) {
    const commandable = guards.filter((guard) => !guard.routed);
    const holding = !commandable.every((guard) => guard.holding);
    for (const guard of commandable) {
      guard.holding = holding;
      guard.quarry = null;
      guard.orders = { ...guard.position };
      guard.arrived = true;
    }
    return holding;
  }

  /**
   * Where a routed company runs: straight away from the nearest enemy, or on
   * along its own line if there is none about.
   */
  fleeDestination(company, enemies) {
    let nearest = null;
    let nearestGap = Infinity;
    for (const enemy of enemies) {
      const gap = distanceSquared(company.position, enemy.position);
      if (gap < nearestGap) {
        nearest = enemy;
        nearestGap = gap;
      }
    }
    let awayX = company.velocity.x;
    let awayY = company.velocity.y;
    if (nearest && nearestGap > 0) {
      awayX = company.position.x - nearest.position.x;
      awayY = company.position.y - nearest.position.y;
    }
    const length = Math.hypot(awayX, awayY) || 1;
    return {
      x: company.position.x + awayX / length * ROUT.fleeReach,
      y: company.position.y + awayY / length * ROUT.fleeReach,
    };
  }

  /** A routed company clear of every enemy by ROUT.escapeDistance has left the field. */
  checkEscape(company, enemies) {
    const clear = ROUT.escapeDistance * ROUT.escapeDistance;
    company.fled = enemies.every((enemy) => distanceSquared(company.position, enemy.position) > clear);
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

  /** The nearest live guard within `radius`, or null -- a raider's own mirror of nearestRaider. */
  nearestGuard(from, radius) {
    const reach = radius * radius;
    let closest = null;
    let closestGap = Infinity;
    for (const guard of this.guards) {
      const gap = distanceSquared(from, guard.position);
      if (gap < reach && gap < closestGap) {
        closest = guard;
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
    // The Emperor: no hunting, no auto-recall, no yo-yoing off a leash --
    // it goes exactly where it was last commanded and stays there until
    // ordered elsewhere (see Emperor#followsOrdersOnly). It will still
    // trade blows if a raider actually reaches it -- that is handled
    // through the same proximity-based melee every company shares, not
    // through this destination at all.
    if (guard.followsOrdersOnly) {
      return guard.orders;
    }
    if (guard.quarry && (!guard.quarry.isAlive || guard.quarry.fled)) {
      guard.quarry = null;
    }
    // A company that cannot reach what it is chasing picks something else.
    if (guard.stuckSeconds >= AVOIDANCE.patienceSeconds) {
      guard.quarry = null;
      guard.stuckSeconds = 0;
      guard.closestApproach = Infinity;
    }

    // An open order takes precedence over the hunt: the company beelines for
    // it and fights only what actually catches it in melee (see
    // lockEngagements) rather than breaking off because a raider strayed
    // near. `arrived` is sticky rather than a fresh distance check every
    // frame -- once it flips, a later hunt that carries the company back
    // away from that point must not immediately read as "order still open"
    // and snap it back.
    if (!guard.arrived) {
      if (distanceSquared(guard.position, guard.orders) < IMPERIAL.arriveRadius ** 2) {
        guard.arrived = true;
      } else {
        guard.quarry = null;
        return guard.orders;
      }
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
    return guard.home;
  }

  /**
   * How far astride a wall a company is, from 0 in the clear to 1 on top of
   * the stone. Imperial companies always cross rather than going round, and
   * on a level with climbable walls so do raiders.
   */
  updateCrossing(navigation, company, reach = WALL.crossDistance) {
    let nearest = Infinity;
    for (const wall of wallsNear(navigation.grid, company.position, reach)) {
      nearest = Math.min(nearest, pointToLineDistance(company.position, wall.start, wall.end));
    }
    const target = nearest >= reach ? 0 : 1 - nearest / reach;
    // Ease, so the ranks flow into line instead of snapping into it.
    company.crossing += (target - company.crossing) * CROSSING_EASE;
  }

  moveGuards() {
    const navigation = this.navigation();
    for (const guard of this.guards) {
      // Locked in a fight, staggered, or told to stand its ground: it does
      // not move, and whatever pace it had is gone.
      if (guard.isHeld || guard.holding) {
        guard.halt();
        continue;
      }
      guard.destination = guard.routed
        ? this.fleeDestination(guard, this.raiders)
        : this.guardDestination(guard);
      this.trackProgress(guard, 1 / FPS);
      steerCompany(guard, navigation, this.random);
      guard.gatherPace(1 / FPS);
      if (guard.routed) {
        this.checkEscape(guard, this.raiders);
      }
      this.updateCrossing(navigation, guard);
      // Walls do not stop them, but squeezing past one does slow them.
      const squeeze = 1 - guard.crossing * (1 - IMPERIAL.crossSpeed);
      guard.advance(squeeze * this.paceOn(guard) / FPS);
    }
  }

  /**
   * Whether a point sits on a wall's own footprint rather than merely near
   * one. Measured against the section's thickness, so a fortified wall --
   * which is wider -- is that much more ground to struggle across.
   */
  overlapsWall(navigation, position) {
    for (const wall of wallsNear(navigation.grid, position, WALL_OVERLAP_REACH)) {
      const halfWidth = WALL_THICKNESS_UNITS * wall.widthScale / 2 + WALL.reachMargin;
      if (pointToLineDistance(position, wall.start, wall.end) <= halfWidth) {
        return true;
      }
    }
    return false;
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
    const pace = this.paceOn(raider);
    const climb = this.wallClimb;
    // A wall that can be climbed never stops a step; it only makes the step
    // slow, the same way imperial companies pick their way over stone.
    if (climb) {
      // Two slowings, not one: the approach up onto the stone eases in over
      // the whole crossing band, and the stone itself -- the few units the
      // section actually occupies -- is where a company bogs down.
      const squeeze = 1 - raider.crossing * (1 - climb.speed);
      const onStone = this.overlapsWall(navigation, raider.position) ? climb.overlapSlow : 1;
      raider.advance((squeeze / onStone) * pace / FPS);
      return;
    }
    if (!raider.avoidsWalls) {
      raider.advance(pace / FPS);
      return;
    }
    const stride = raider.momentum * pace / FPS;
    const step = { x: raider.velocity.x * stride, y: raider.velocity.y * stride };
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

  /**
   * What getting up on a wall costs a raider in blood; the slowing is
   * applied as it moves (see advanceAgainstWalls). Between them the wall is
   * not denying the ground, it is charging for it, so a company always gets
   * across in the end.
   *
   * Charged once per crossing, as a share of the company's own strength.
   * Bleeding it per second instead -- which is what this did first -- made
   * the price depend on how long a company happened to be up there, and
   * measured, that ran from four seconds for cavalry to forty-seven for
   * infantry. The same wall would have been a scratch to one and certain
   * death to the other.
   */
  chargeWallClimb(raider) {
    const climb = this.wallClimb;
    if (!climb) {
      return;
    }
    if (raider.crossing < CLIMB_CHARGED_AT) {
      if (raider.crossing < CLIMB_CLEAR_AT) {
        raider.climbing = false;
      }
      return;
    }
    if (raider.climbing) {
      return;
    }
    raider.climbing = true;
    // Straight off its health: the stone is not an attacker, and armour is
    // no help scrambling over it.
    raider.health -= raider.type.maxHealth * climb.healthCost;
  }

  resolveWallContact(navigation, raider) {
    // Where walls are climbed rather than broken, going over is not an
    // attack on the stone. A company pays once for the crossing (see
    // chargeWallClimb) rather than trading blows the whole way, and it
    // scuffs the wall at a fraction of its strength instead of battering
    // it: at full attack a company in contact for ten seconds brings down
    // any section, and a crossing takes four times that.
    const climb = this.wallClimb;
    const wear = climb ? climb.wear : 1;
    const reachMargin = WALL.reachMargin;
    for (const wall of wallsNear(navigation.grid, raider.position, raider.type.range + reachMargin)) {
      const reach = wall.length + reachMargin;
      if (isWithinSegmentBand(raider.position, wall.start, wall.end, raider.type.range, reach)) {
        wall.takeHit(raider.type.attack * wear);
        raider.touchedThisFrame = true;
        if (!raider.soundedEngage) {
          this.onEffect('engaging', wallMidpoint(wall));
          raider.soundedEngage = true;
        }
        if (!climb) {
          raider.takeHit(WALL.attack);
          if (!raider.isAlive) {
            return;
          }
        }
      }
    }
  }

  resolveCastleContact(raider, castle) {
    const reach = castle.type.hitbox + raider.type.range;
    if (distanceSquared(castle.position, raider.position) < reach * reach) {
      castle.takeHit(raider.type.attack);
      raider.takeHit(castle.type.attack);
      raider.touchedThisFrame = true;
      if (!raider.soundedEngage) {
        this.onEffect('engaging', castle.position);
        raider.soundedEngage = true;
      }
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
      if (distance(point, house.position) < HOUSES.minSpacing) {
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

  /**
   * How many sections already meet at a shared node. Only wall-end snaps
   * share a point object at all — a city-brim snap is a fresh point every
   * time, so the city itself is never subject to this cap.
   */
  nodeDegree(point) {
    let degree = 0;
    for (const wall of this.walls) {
      if (wall.start === point) {
        degree += 1;
      }
      if (wall.end === point) {
        degree += 1;
      }
    }
    return degree;
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

  /**
   * Whether a section would stand in water.
   *
   * Sampled along the run rather than at its ends, since a short span can
   * cross a channel without either end being wet. What this is really for is
   * the island: without it a player simply walls out into the sea, and the
   * whole point of an island -- that there is only so much coast to hold --
   * goes with it.
   */
  entersWater(start, end) {
    const terrain = this.terrain;
    if (!terrain.river && !terrain.sea) {
      return false;
    }
    const span = distance(start, end);
    const steps = Math.max(2, Math.ceil(span / WATER_PROBE_SPACING));
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      const x = start.x + (end.x - start.x) * t;
      const y = start.y + (end.y - start.y) * t;
      if (!terrain.isAshore(x, y)) {
        return true;
      }
    }
    return false;
  }

  /** Restore a damaged wall, charging only for the stonework replaced. */
  /**
   * Pay for a repair, but the wall does not snap back — the order goes in
   * and health climbs over WALL.repairSeconds while a tool icon marks the
   * work in progress. See Wall#beginRepair.
   */
  repairWall(wall) {
    // A section still pegged out has nothing to repair, and letting a redraw
    // finish it would be a way to buy back the plan delay. The masons have
    // to mark it out first.
    if (wall.isPlanned) {
      return { status: 'planning', wall };
    }
    // Already under repair: nothing new to charge for, but a chained drag
    // should still carry on from here rather than stopping short.
    if (wall.isRepairing) {
      return { status: 'repairing', wall };
    }
    const missing = wall.maxHealth - wall.health;
    if (missing <= 0) {
      return { status: 'intact', wall };
    }
    const cost = Math.trunc(this.wallCost(wall.length) * missing / wall.maxHealth);
    if (this.tokens < cost) {
      return { status: 'poor' };
    }
    this.tokens -= cost;
    wall.beginRepair();
    wall.flash();
    this.onEffect('repair', wallMidpoint(wall));
    return { status: 'repairing', wall, cost };
  }

  /**
   * Lay a section between two points. Redrawing over an existing wall repairs
   * it rather than stacking a second one, and nothing may cross a city.
   */
  buildWall(from, to) {
    const start = this.snapPoint(from);
    const end = this.snapPoint(to);

    // A section already spans these ends. Repair and Fortify are their own
    // tools now, so drawing over one does nothing at all -- but the drag
    // still carries on from here, so a chain can branch off a standing wall.
    const existing = this.findWallBetween(start, end);
    if (existing) {
      return { status: 'exists', wall: existing, start, end };
    }
    if (this.crossesCity(start, end)) {
      return { status: 'blocked', start, end };
    }
    if (this.entersWater(start, end)) {
      return { status: 'water', start, end };
    }
    // A junction already at its limit takes no more sections. Quietly —
    // this is a layout rule, not something to interrupt the player over.
    if (this.nodeDegree(start) >= WALL.maxEdgesPerNode || this.nodeDegree(end) >= WALL.maxEdgesPerNode) {
      return { status: 'crowded', start, end };
    }
    const wall = new Wall(start, end, WALL.initialFraction, WALL.planSeconds, this.wallHealthScale);
    if (wall.length <= 1) {
      return { status: 'short', start, end };
    }
    const cost = this.wallCost(wall.length);
    // Ties Build's own refusal to the same threshold that greys its button
    // (see canAffordToBuild) -- a segment cheap enough to afford on its own
    // still will not go up once the treasury reads as too poor to build at all.
    if (this.tokens < cost || !this.canAffordToBuild) {
      return { status: 'poor', start, end };
    }
    this.tokens -= cost;
    this.walls.push(wall);
    this.onEffect('build', wallMidpoint(wall));
    return { status: 'built', wall, start, end };
  }

  /**
   * A section the castle's larger footprint would now stand on is not
   * demolished -- it is pushed straight back to the new edge, the same
   * offset carrying both ends so the section keeps its own length and
   * orientation, just moved. Only one a plain push cannot clear -- a corner
   * clipped rather than crossed square-on, or one so short afterwards it
   * would collapse to nothing -- falls back to being razed and refunded,
   * the way every section here used to be.
   */
  pushWallsToNewBrim(castle) {
    const standing = [];
    let moved = 0;
    let razed = 0;
    for (const wall of this.walls) {
      if (wall.isPlanned || !segmentEntersSquare(wall.start, wall.end, castle.position, castle.type.footprint)) {
        standing.push(wall);
        continue;
      }
      const midpoint = { x: (wall.start.x + wall.end.x) / 2, y: (wall.start.y + wall.end.y) / 2 };
      const brim = closestPointOnSquare(midpoint, castle.position, castle.type.footprint);
      const offset = { x: brim.x - midpoint.x, y: brim.y - midpoint.y };
      const start = { x: wall.start.x + offset.x, y: wall.start.y + offset.y };
      const end = { x: wall.end.x + offset.x, y: wall.end.y + offset.y };
      const stillCrosses = segmentEntersSquare(start, end, castle.position, castle.type.footprint);
      if (stillCrosses || distance(start, end) < WALL.minLength) {
        this.tokens += wall.refundValue;
        razed += 1;
        continue;
      }
      wall.start = start;
      wall.end = end;
      wall.length = distance(start, end);
      wall.flash();
      standing.push(wall);
      moved += 1;
    }
    this.walls = standing;
    return { moved, razed };
  }

  /**
   * The section under a point: the nearest one the point actually sits on,
   * rather than merely the first that happens to be in the neighbourhood.
   * Raze, Repair and Fortify all aim this way, so they agree on what is
   * being pointed at — and two runs side by side stay tellable apart, which
   * matters when the tool spends money on whichever one it picks.
   */
  wallAt(point) {
    let closest = null;
    let closestGap = Infinity;
    for (const wall of this.walls) {
      const reach = wall.length + WALL.reachMargin;
      if (!isWithinSegmentBand(point, wall.start, wall.end, WALL.pickRadius, reach)) {
        continue;
      }
      const gap = pointToLineDistance(point, wall.start, wall.end);
      if (gap < closestGap) {
        closest = wall;
        closestGap = gap;
      }
    }
    return closest;
  }

  removeWallAt(point) {
    const wall = this.wallAt(point);
    if (!wall) {
      return false;
    }
    this.tokens += wall.refundValue;
    this.walls.splice(this.walls.indexOf(wall), 1);
    this.onEffect('raze', wallMidpoint(wall));
    return true;
  }

  /** The Repair tool, aimed at whatever section is under the cursor. */
  repairWallAt(point) {
    const wall = this.wallAt(point);
    return wall ? this.repairWall(wall) : { status: 'none' };
  }

  /** The Fortify tool, aimed at whatever section is under the cursor. */
  upgradeWallAt(point) {
    const wall = this.wallAt(point);
    return wall ? this.upgradeWall(wall) : { status: 'none' };
  }

  /**
   * Pay to grow a section into its next tier. Nothing is replaced: the same
   * Wall takes on the new shape over WALL_TIERS[next].seconds, and only
   * counts as the stronger, dearer thing once it has finished growing.
   */
  upgradeWall(wall) {
    if (wall.isPlanned) {
      return { status: 'planning', wall };
    }
    if (wall.isUpgrading) {
      return { status: 'working', wall };
    }
    const next = WALL_TIERS[wall.tier + 1];
    if (!next) {
      return { status: 'max', wall };
    }
    const cost = Math.trunc(this.wallCost(wall.length) * next.cost);
    if (this.tokens < cost) {
      return { status: 'poor', wall, cost, name: next.name };
    }
    this.tokens -= cost;
    wall.beginUpgrade();
    wall.flash();
    this.onEffect('fortify', wallMidpoint(wall));
    return { status: 'working', wall, cost, name: next.name };
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
      types: this.castleTypes,
    });
    if (this.tokens < upgraded.type.cost) {
      this.onMessage(`You need $${upgraded.type.cost} to upgrade the castle.`);
      return false;
    }
    this.tokens -= upgraded.type.cost;
    this.onEffect('upgrade', upgraded.position);
    this.castles[index] = upgraded;
    this.levelUnderCities();
    this.clearHousesUnder(upgraded);
    const { moved, razed } = this.pushWallsToNewBrim(upgraded);
    const parts = [];
    if (moved > 0) {
      parts.push(` ${moved} wall section${moved === 1 ? '' : 's'} pushed back to the new wall line.`);
    }
    if (razed > 0) {
      parts.push(` ${razed} wall section${razed === 1 ? '' : 's'} could not be saved and ${razed === 1 ? 'was' : 'were'} cleared.`);
    }
    this.onMessage(`Upgraded to ${upgraded.type.name}.${parts.join('')}`);
    return true;
  }
}
