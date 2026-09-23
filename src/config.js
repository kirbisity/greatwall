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
  maxHealth: 100,
  // A new section is a foundation course that rises to full strength over
  // `buildSeconds`. It can be attacked the whole time.
  buildSeconds: 10,
  initialFraction: 0.2,
  // How close a wall end must come to a city edge before it snaps onto it.
  brimSnapRadius: 26,
  attack: 1,
  defense: 2,
  costPerUnit: 2,
  minLength: 30,
  maxLength: 200,
  snapRadius: 20,
  reachMargin: 2,
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
  patienceSeconds: 8,
  progressEpsilon: 8,
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

/** How the imperial army behaves once ordered out. */
export const IMPERIAL = {
  cost: 450,
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

  // Imperial companies walk through walls rather than round them. Within
  // `crossDistance` of one they file into a column and slow to `crossSpeed`
  // of their pace, then spread back out on the far side.
  crossDistance: 38,
  crossSpeed: 0.4,
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
    name: 'Small Castle', cost: 300, maxHealth: 100, wealth: 40,
    attack: 2, defense: 3, hitbox: 20, footprint: 28, upgradesTo: 'CC1',
  },
  CC1: {
    name: 'Medium Castle', cost: 1000, maxHealth: 200, wealth: 80,
    attack: 2, defense: 3, hitbox: 40, footprint: 58, upgradesTo: 'CC2',
  },
  CC2: {
    name: 'Fortified City', cost: 3000, maxHealth: 400, wealth: 160,
    attack: 2, defense: 3, hitbox: 60, footprint: 88, upgradesTo: null,
  },
};

export const RAIDER_TYPES = {
  CR0: {
    name: 'Steppe Saber Cavalry', speed: 18, maxHealth: 10, attack: 5,
    defense: 2, range: 5, lineOfSight: 40,
  },
  IR0: {
    name: 'Steppe Light Infantry', speed: 7, maxHealth: 20, attack: 2,
    defense: 3, range: 2, lineOfSight: 30,
  },
  IR1: {
    name: 'Steppe Heavy Infantry', speed: 7, maxHealth: 20, attack: 3,
    defense: 5, range: 2, lineOfSight: 30,
  },
  CR1: {
    name: 'Steppe Spear Cavalry', speed: 20, maxHealth: 10, attack: 10,
    defense: 2, range: 6, lineOfSight: 50,
  },
};

export const STARTING_CASTLE_TYPE = 'CC0';

/** The one company the player can field. Slow, but it can take a beating. */
export const GUARD_TYPES = {
  IG0: {
    name: 'Imperial Guardsman', speed: 11, maxHealth: 46, attack: 7,
    defense: 4, range: 4,
  },
};

export const GUARD_TYPE = 'IG0';

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
export const SEASONS = [
  { name: 'Autumn', light: '#9a7c4b', dark: '#5f4a2a', accent: '#d9a441', haze: '198, 176, 138' },
  { name: 'Winter', light: '#8d8a83', dark: '#4f4e4b', accent: '#cfd8dc', haze: '198, 202, 206' },
  { name: 'Spring', light: '#7f8f52', dark: '#4a5530', accent: '#9ccc65', haze: '178, 190, 154' },
  { name: 'Summer', light: '#948a46', dark: '#5a5228', accent: '#e0c341', haze: '206, 194, 142' },
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

export const WALL_THICKNESS_UNITS = 3;
export const WALL_HEIGHT_UNITS = 6;
export const TOWER_RADIUS_UNITS = 2.6;
export const TOWER_HEIGHT_UNITS = 8.5;

/** Direction the sun comes from, used to shade each face by its normal. */
export const SUN = { x: -0.60, y: 0.40, z: 0.69 };
export const AMBIENT_LIGHT = 0.34;

export const AUDIO_VOLUME_STEP = 0.01;
export const INITIAL_SOUND_LEVEL = 40;
