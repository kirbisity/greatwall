export const FPS = 60;
export const PIXELS_PER_WORLD_UNIT = 50;

/**
 * The camera orbits a focus point on the ground. Elevation is the angle above
 * the ground plane, so 90 degrees looks straight down. The lower bound keeps the
 * horizon off screen; below roughly 23 degrees it creeps into view and the
 * ground plane stops filling the canvas.
 */
export const CAMERA = {
  focalLength: 900,
  initialDistance: 380,
  minDistance: 110,
  maxDistance: 800,
  initialElevation: 52,
  minElevation: 35,
  maxElevation: 55,
  elevationStep: 4,
  nearPlane: 1,

  // Zoom and tilt ease towards their target rather than snapping; higher is
  // snappier. A drag becomes momentum that decays at `driftDamping`.
  smoothing: 5.5,
  driftDamping: 1.9,
  driftCutoff: 3,
  focusCutoff: 0.05,

  // The map is unbounded, so the view is. Past `softLimit` the ground starts
  // resisting and compresses asymptotically towards `hardLimit`, which means
  // the further out you push the less ground each drag covers.
  softLimit: 700,
  hardLimit: 1400,
};

export const ZOOM_STEP = 0.045;

// The top menu and any side chrome overlay the canvas; pointer events inside
// these bands belong to the UI, not the map.
export const TOP_BAR_HEIGHT = 0;
export const SIDE_BAR_WIDTH = 0;

export const STARTING_TOKENS = 100;
export const INCOME_INTERVAL_SECONDS = 2;
export const REGEN_FRACTION_PER_PAYOUT = 0.0005;
export const RAIDER_SPAWN_INTERVAL_SECONDS = 2;
export const SEASON_LENGTH_SECONDS = 60;

export const HARVEST_MULTIPLIER = 2;
export const WINTER_BUILD_MULTIPLIER = 8;

export const WALL = {
  maxHealth: 300,
  // A section is pegged out for `planSeconds` before any stone is laid. While
  // it is only marked out it is not a wall at all: nothing is blocked by it,
  // nothing routes around it, and it cannot be attacked. That stops a wall
  // being thrown up in the face of a breach.
  planSeconds: 6,
  // Once building starts it rises to full strength over `buildSeconds`, and
  // can be attacked the whole way up.
  buildSeconds: 10,
  initialFraction: 0.2,
  // The Repair tool pays to bring a section back, but not at once: it heals
  // over this many seconds instead, the same way it went up in the first
  // place, and the tool icon that marks the work stays over it meanwhile.
  // See Wall#beginRepair.
  repairSeconds: 10,
  // How close a wall end must come to a city edge before it snaps onto it.
  brimSnapRadius: 26,
  attack: 1,
  defense: 2,
  costPerUnit: 2,
  minLength: 30,
  maxLength: 200,
  snapRadius: 20,
  // How close the cursor must come to a section for Raze, Repair or Fortify
  // to count it as the one being pointed at.
  pickRadius: 20,
  reachMargin: 2,
  // Coin per standing section, charged with the rest of the income each
  // payout — a wall is upkeep, not just a one-off purchase.
  upkeepPerSection: 1,
  // A junction may not gather more than this many sections. Past it, a
  // build attempt is simply refused — see Game#buildWall.
  maxEdgesPerNode: 3,
};

/* ==========================================================================
 * AI TUNING
 * Everything that governs how the two sides move and fight. Nothing here is
 * referenced by name outside this block, so it can all be moved freely.
 * ========================================================================== */

/** Most a company may turn in one frame. Higher turns tighter. */
export const RAIDER_STEERING_RADIANS = 0.032;

/**
 * How much of the remaining turn is taken each frame, before the cap above.
 * Low values ease into a new heading instead of snapping onto it, which is
 * what keeps a company from sawing back and forth around its aim.
 */
export const TURN_EASE = 0.1;

/** How companies treat walls. */
export const AVOIDANCE = {
  // Walls are treated as this much wider than they are when planning, so a
  // company aims well clear of the stone instead of grazing it.
  wallStandoff: 16,
  // Inside this distance a wall actively pushes a company away, which is what
  // makes them arc around an obstacle rather than scrape along it.
  repelDistance: 26,
  repelStrength: 0.7,
  // The push may only bend the aim this far off the waypoint. Without a cap it
  // can overpower the waypoint entirely and walk the company round in circles.
  maxShoveFraction: 0.55,

  // Giving up: a company that has not closed on its destination by
  // `progressEpsilon` within `patienceSeconds` stops hunting for a way round
  // and attacks whatever is in its way.
  patienceSeconds: 7,
  progressEpsilon: 8,

  // A way round longer than this multiple of the direct line is not worth
  // walking. Raiders would rather put their shoulders to the stone than march
  // the length of a wall that someone has drawn right across the map.
  detourTolerance: 3,

  // Sticking to a choice. Two ways round of near-equal cost trade places as a
  // company moves, and re-picking the cheaper one every time it thinks walks
  // it back and forth between them for ever. A new way has to beat the one it
  // already holds by this much before it is worth swapping to.
  gatewaySwitchMargin: 40,
  // Having settled on a section to batter, a company stays on it this long
  // rather than dropping the siege on its very next thought, wandering back
  // towards a route it has already failed to walk, and starting over.
  siegeCommitSeconds: 3,

  // A hair of noise on each company's aim, drifting by `wanderStep` a thought
  // and held inside `wanderRadians`. Identical companies in identical spots
  // otherwise make the identical wrong choice for ever; this is what shakes a
  // deadlocked one out of the loop without it looking drunk.
  wanderRadians: 0.06,
  wanderStep: 0.02,
};

/** Melee: what happens when the two sides meet. */
export const MELEE = {
  // Companies lock together once their centres are this close.
  engageDistance: 32,
  // Once locked they close right up and interleave, rather than trading blows
  // at arm's length. This is the separation they settle at.
  lockedGap: 4,
  // How fast they close that last distance, in world units a second.
  closeRate: 26,
  // Damage is scaled so a typical pairing resolves in about five seconds.
  damageRate: 1.7,
  // A fight that has not resolved by now breaks off, so nothing locks forever.
  maxSeconds: 9,
  // Both sides are held still for this long after a fight before moving on.
  recoverySeconds: 0.6,
};

/** How the imperial army behaves once ordered out. Cost lives on each tier. */
export const IMPERIAL = {
  // A company will break off towards any raider inside this range.
  huntRadius: 320,
  // Having won, it looks this far for another fight before going home.
  rehuntRadius: 260,
  // How close to its ordered ground counts as having arrived.
  arriveRadius: 30,
  // Companies are recalled if they stray this far from the city, and will not
  // take up the hunt again until they are back inside `returnRadius`.
  leashRadius: 380,
  returnRadius: 170,

  // Imperial companies walk through walls rather than round them, holding
  // their formation, but they pick their way over the stone: within
  // `crossDistance` of a section they slow to `crossSpeed` of their pace.
  crossDistance: 34,
  crossSpeed: 0.45,
};

/**
 * How raiders react to imperial companies. Positive keeps them away, negative
 * draws them in, zero means they ignore them and press on for the city.
 */
export const FEAR = {
  weight: 0.45,
  // Only companies inside this range are noticed at all.
  noticeRadius: 220,
};

/**
 * Raiders route by a graph of the ways past the wall network. It is rebuilt
 * only when walls change, and each raider re-picks a waypoint a few times a
 * second rather than every frame.
 */
export const NAVIGATION = {
  // How far past a wall's tip a gateway sits, clear of the longest weapon reach.
  gatewayClearance: 22,
  // Rebuild cost grows with the square of this, and a build drag rebuilds per
  // section, so it is capped well below what a sane wall layout ever produces.
  maxGateways: 32,
  replanFrames: 10,
  arriveRadius: 10,
};
export const SPAWN_MIN_DISTANCE = 200;
export const SPAWN_MAX_DISTANCE = 400;

export const CASTLE_TYPES = {
  CC0: {
    name: 'Small Castle', cost: 300, maxHealth: 500, wealth: 40,
    attack: 2, defense: 3, hitbox: 20, footprint: 28, upgradesTo: 'CC1',
  },
  CC1: {
    name: 'Medium Castle', cost: 1000, maxHealth: 1000, wealth: 80,
    attack: 2, defense: 3, hitbox: 40, footprint: 58, upgradesTo: 'CC2',
  },
  CC2: {
    name: 'Fortified City', cost: 3000, maxHealth: 2000, wealth: 160,
    attack: 2, defense: 3, hitbox: 60, footprint: 88, upgradesTo: null,
  },
};

/**
 * How long an upgrade takes to show up on the ground. The old structure sinks
 * away over `demolishSeconds`, then the new one rises over `buildSeconds` —
 * near the centre first, the rim last. Until it has finished rising, the
 * castle still fights and earns at its old strength: only the shape changes
 * early, not the substance.
 */
export const CASTLE_REBUILD = {
  demolishSeconds: 2,
  buildSeconds: 20,
  // The fraction of the build phase spent waiting before the outermost part
  // so much as stirs, so the centre is well up before the rim starts.
  staggerFraction: 0.6,
};

/** Portraits shown over a company, one tier of one per faction. */
export const AVATARS = {
  steppeLight: 'images/unit_avatar/avatar_mongol_light.png',
  steppeRegular: 'images/unit_avatar/avatar_mongol_regular.png',
  steppeHeavy: 'images/unit_avatar/avatar_mongol_heavy.png',
  imperialLight: 'images/unit_avatar/avatar_chinese_light.png',
  imperialRegular: 'images/unit_avatar/avatar_chinese_regular.png',
  imperialHeavy: 'images/unit_avatar/avatar_chinese_heavy.png',
};

export const AVATAR = {
  // Drawn at this many pixels wide, within these bounds as the view zooms.
  width: 38,
  minWidth: 22,
  maxWidth: 64,
  // Clear of the health bar beneath it.
  gap: 5,
};

/** The banner flown over a city, planted above the tallest roof. */
/**
 * What the Fortify tool buys. A section keeps its identity all the way up —
 * the same Wall grows rather than being replaced — so a fortified stretch
 * costs the scene no more geometry than a plain one.
 *
 * `cost`, `health` and `upkeep` are multiples of the plain section's own, and
 * `paid` is everything spent to reach this tier, which is what Raze gives a
 * share of back:
 * building plain and fortifying twice comes to 1 + 1 + 2 = four times the
 * original price, and leaves a section with four times the health and four
 * times the upkeep. `seconds` is how long the stone takes to grow into its
 * new shape, during which the section still fights at its old strength.
 */
export const WALL_TIERS = [
  { name: 'Wall', heightScale: 1, widthScale: 1, health: 1, upkeep: 1, cost: 0, paid: 1, seconds: 0 },
  { name: 'Raised Wall', heightScale: 2, widthScale: 1, health: 2, upkeep: 2, cost: 1, paid: 2, seconds: 10 },
  { name: 'Reinforced Wall', heightScale: 2, widthScale: 2, health: 4, upkeep: 4, cost: 2, paid: 4, seconds: 20 },
];

export const FLAG = {
  sprite: 'images/flags/flag_song.png',
  // Planted this far above the ground per world unit of the castle's own
  // footprint radius — a rough stand-in for how tall its central hall is,
  // without needing the roof height off every building definition.
  heightPerFootprint: 0.7,
  width: 20,
  minWidth: 12,
  maxWidth: 34,
};

export const RAIDER_TYPES = {
  CR0: {
    name: 'Steppe Saber Cavalry', speed: 18, maxHealth: 10, attack: 5,
    defense: 2, range: 5, lineOfSight: 40, avatar: AVATARS.steppeRegular,
  },
  IR0: {
    name: 'Steppe Light Infantry', speed: 7, maxHealth: 20, attack: 2,
    defense: 3, range: 2, lineOfSight: 30, avatar: AVATARS.steppeLight,
  },
  IR1: {
    name: 'Steppe Heavy Infantry', speed: 7, maxHealth: 20, attack: 3,
    defense: 5, range: 2, lineOfSight: 30, avatar: AVATARS.steppeHeavy,
  },
  CR1: {
    name: 'Steppe Spear Cavalry', speed: 20, maxHealth: 10, attack: 8,
    defense: 2, range: 6, lineOfSight: 50, avatar: AVATARS.steppeHeavy,
  },
};

export const STARTING_CASTLE_TYPE = 'CC0';

/**
 * The imperial army comes in three tiers, unlocked as the city grows — see
 * `CASTLE_GUARD_TIERS`. Each carries its own cost, so a heavier company is a
 * heavier purchase.
 */
export const GUARD_TYPES = {
  IG_LIGHT: {
    name: 'Imperial Light Guard', speed: 7, maxHealth: 25, attack: 2,
    defense: 3, range: 2, cost: 260, avatar: AVATARS.imperialLight,
  },
  IG0: {
    name: 'Imperial Guardsman', speed: 6, maxHealth: 30, attack: 3,
    defense: 4, range: 2, cost: 450, avatar: AVATARS.imperialRegular,
  },
  IG_HEAVY: {
    name: 'Imperial Heavy Guard', speed: 5, maxHealth: 40, attack: 3,
    defense: 6, range: 2, cost: 680, avatar: AVATARS.imperialHeavy,
  },
};

/** Which guard tiers a castle can field, unlocked as it grows. */
export const CASTLE_GUARD_TIERS = {
  CC0: ['IG_LIGHT'],
  CC1: ['IG_LIGHT', 'IG0'],
  CC2: ['IG_LIGHT', 'IG0', 'IG_HEAVY'],
};

// One row per season; the last row repeats once the seasons run past it.
export const SEASON_RAIDER_MIX = [
  ['CR0', 'CR0', 'IR0', 'IR0', 'IR0'],
  ['CR0', 'CR0', 'IR0', 'IR0', 'IR1'],
  ['CR0', 'CR1', 'IR0', 'IR1', 'IR1'],
  ['CR0', 'CR1', 'CR1', 'IR1', 'IR1'],
  ['CR1', 'CR1', 'CR1', 'IR1', 'IR1'],
];

export const SEASON_MESSAGES = [
  'Its autumn now',
  'Freezing Winter comes, cost of wall construction doubles.',
  'Spring comes, a new type of raider occurs.',
  'Summer comes, a new type of raider occurs.',
  'Autumn comes, a good harvest doubles the income of the castle',
];

/** Terrain is painted as a radial wash so the map reads as lit from above. */
/**
 * The landscape. Height is scenery only — companies walk a flat plane and are
 * drawn sitting on the ground — but woodland does slow them down.
 */
export const TERRAIN = {
  // Rolling hills, plus a finer grain on top of them.
  hillScale: 300,
  hillHeight: 44,
  detailScale: 130,
  detailHeight: 4,
  // Slopes are gentle in world terms, so the shading is exaggerated or the
  // hills read as a flat plain.
  slopeRelief: 4,

  // Ground under a settlement is levelled, easing back into the hillside.
  levelSkirt: 60,

  // Woodland. Cover above the threshold grows trees, thicker towards 1.
  forestScale: 240,
  forestThreshold: 0.62,
  treeSpacing: 26,
  treeSize: 5.4,

  // Trees are felled this near a wall, and anywhere a city stands.
  clearOfWall: 16,

  // Companies lose this much of their pace in the thickest wood.
  forestDrag: 0.45,

  // Mesh drawn for the ground: a fixed-size tile in world units, a quarter
  // the size of the old zoom-compensated cell. It is not resized for the
  // camera, so a tile genuinely grows and shrinks on screen as the camera
  // zooms rather than being held at a constant apparent size.
  cellSize: 9,

  // Fine tiles are only drawn within this radius of the camera's focus; the
  // wash gradient underneath shows through past it. A canvas fill costs
  // about the same regardless of a tile's size, so a fixed radius keeps the
  // tile count -- and so the repaint cost -- flat no matter how far the
  // camera has zoomed out, instead of growing with the visible ground area.
  // Tiles fade out approaching the radius, past detailFadeFraction of it, so
  // the patch reads as a soft island over the wash rather than a hard box.
  detailRadius: 100,
  detailFadeFraction: 0.7,

  // Ground colour reads as patches of grass, dirt and bare rock, picked per
  // cell from its own noise rather than tinted by season -- the year now
  // shows through the fog, not the dirt underfoot.
  groundScale: 200,
  dirtThreshold: 0.55,
  rockThreshold: 0.78,
  grassColor: '#6f8a49',
  dirtColor: '#8a7350',
  rockColor: '#8c887c',
};

export const SEASONS = [
  { name: 'Autumn', haze: '198, 176, 138' },
  { name: 'Winter', haze: '198, 202, 206' },
  { name: 'Spring', haze: '178, 190, 154' },
  { name: 'Summer', haze: '206, 194, 142' },
];

/**
 * Aerial perspective. Ground depth is sampled down the screen and turned into
 * one vertical gradient, so distance haze costs a single fill per frame.
 */
export const FOG = {
  samples: 6,
  startDistance: 260,
  falloff: 0.00085,
  maxAlpha: 0.5,
};

/**
 * Cloud layers, lowest first. Clouds sit at a real altitude and are projected
 * like anything else, so a higher deck is nearer the camera and slides past
 * faster than the ground when the view pans — no parallax constant needed.
 * Sizes and drift are world units.
 */
export const CLOUD_LAYERS = [
  { altitude: 55, worldSize: 85, opacity: 0.10, drift: 3.5, count: 12 },
  { altitude: 95, worldSize: 125, opacity: 0.13, drift: 5.5, count: 9 },
  { altitude: 150, worldSize: 185, opacity: 0.16, drift: 8.5, count: 7 },
];

/**
 * Clouds tile over this square of world, recentred on wherever the view is.
 * Sized against the ground a default view takes in, so a handful are always
 * overhead; off-screen decks cost one projection each and are then dropped.
 */
export const CLOUD_FIELD = 900;
/** A deck fades out over this last stretch as the camera descends onto it. */
export const CLOUD_FADE_HEIGHT = 90;
/**
 * A cloud this much wider than the viewport is one the camera has all but
 * flown into, so it thins out rather than smothering the map.
 */
export const CLOUD_ENGULF_WIDTH = 0.8;

export const CLOUD_SPRITE = 'images/cloud.png';

export const HEALTH_COLORS = [
  { above: 0.66, color: '#7fb069' },
  { above: 0.33, color: '#e0b84c' },
  { above: -Infinity, color: '#c2453c' },
];

export const PALETTE = {
  wallCore: '#d6cbb2',
  wallEdge: '#7d7362',
  towerFill: '#b3a98f',
  towerEdge: '#5f5748',
  barFill: '#15110c',
  barEdge: '#c9a227',
};

/**
 * Smoke and fire on a battered structure. Both scale up as health falls, so a
 * wall or city reads as more urgently ablaze the closer it is to falling.
 */
export const DAMAGE_EFFECTS = {
  smokeThreshold: 0.6,
  fireThreshold: 0.3,
  maxSmokePuffs: 4,
  maxFirePuffs: 3,
  puffLifeSeconds: 2.4,
  smokeRadius: 5,
  fireRadius: 3,
};

/** How long the city burns before the game-over screen shows. */
export const BREACH = {
  collapseSeconds: 5,
};

/**
 * Houses fill in behind the walls on their own, between the castle and the
 * ring the walls describe — the bigger that ring, the more of them fit.
 * They add to income but add nothing to defence: a raider that reaches one
 * burns it down in a moment.
 */
export const HOUSES = {
  // Capacity is read off how far out the walls sit (the average distance
  // from the castle to each standing wall's midpoint), one house per this
  // many units past the castle's own footprint, up to maxHouses.
  radialSpacing: 8,
  maxHouses: 40,
  // Kept clear of the castle itself and of any wall, so a house never
  // crowds either.
  innerMargin: 8,
  wallClearance: 10,
  // How close two houses may sit centre to centre. Kept separate from
  // radialSpacing — that governs capacity, this just keeps the (now
  // bigger) models from overlapping each other.
  minSpacing: 10,
  // Denser packing means a random point is more often too close to an
  // existing house, so it gets more tries to find a clear one.
  placementAttempts: 16,

  spawnIntervalSeconds: 3,
  riseSeconds: 5,
  // Coin per house, added to the base city income each payout.
  income: 5,

  // How close a raider must come to set one alight, and how long the fire
  // and smoke play out before it is gone for good.
  contactRadius: 10,
  burnSeconds: 3,

  footprint: { width: 5.2, depth: 4.6, height: 3.4, roofHeight: 2.6, overhang: 0.85 },
};

export const WALL_THICKNESS_UNITS = 3;
export const WALL_HEIGHT_UNITS = 6;
export const TOWER_RADIUS_UNITS = 2.6;
export const TOWER_HEIGHT_UNITS = 8.5;

/** Direction the sun comes from, used to shade each face by its normal. */
export const SUN = { x: -0.60, y: 0.40, z: 0.69 };
export const AMBIENT_LIGHT = 0.34;

export const AUDIO_VOLUME_STEP = 0.01;
export const INITIAL_SOUND_LEVEL = 40;
