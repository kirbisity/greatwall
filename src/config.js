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
  minDistance: 90,
  maxDistance: 3000,
  initialElevation: 52,
  minElevation: 35,
  maxElevation: 85,
  elevationStep: 4,
  nearPlane: 1,
};

export const ZOOM_STEP = 0.08;

// The top menu and any side chrome overlay the canvas; pointer events inside
// these bands belong to the UI, not the map.
export const TOP_BAR_HEIGHT = 0;
export const SIDE_BAR_WIDTH = 0;

export const STARTING_TOKENS = 100;
export const INCOME_INTERVAL_SECONDS = 2;
export const REGEN_FRACTION_PER_PAYOUT = 0.0005;
export const RAIDER_SPAWN_INTERVAL_SECONDS = 4;
export const SEASON_LENGTH_SECONDS = 60;

export const HARVEST_MULTIPLIER = 2;
export const WINTER_BUILD_MULTIPLIER = 8;

export const WALL = {
  maxHealth: 100,
  // How close a wall end must come to a city edge before it snaps onto it.
  brimSnapRadius: 26,
  attack: 1,
  defense: 2,
  costPerUnit: 2,
  minLength: 30,
  maxLength: 200,
  snapRadius: 20,
  reachMargin: 2,
  // A raider stops steering around a wall once it has been breached this far.
  intactHealth: 80,
};

export const RAIDER_STEERING_RADIANS = 0.01;

/**
 * Raiders route by a graph of the ways past the wall network. It is rebuilt
 * only when walls change, and each raider re-picks a waypoint a few times a
 * second rather than every frame.
 */
export const NAVIGATION = {
  // How far past a wall's tip a gateway sits, clear of the longest weapon reach.
  gatewayClearance: 12,
  // Rebuild cost grows with the square of this, and a build drag rebuilds per
  // section, so it is capped well below what a sane wall layout ever produces.
  maxGateways: 32,
  replanFrames: 20,
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
    name: 'Sabre Cavalry', speed: 18, maxHealth: 10, attack: 5,
    defense: 2, range: 5, lineOfSight: 40,
    sprites: ['images/units/saber_cavalry_eastern.png', 'images/units/saber_cavalry_eastern1.png'],
  },
  IR0: {
    name: 'Light Axe Infantry', speed: 7, maxHealth: 20, attack: 2,
    defense: 3, range: 2, lineOfSight: 30,
    sprites: ['images/units/light_infantry.png', 'images/units/light_infantry1.png'],
  },
  IR1: {
    name: 'Light Sword Infantry', speed: 7, maxHealth: 20, attack: 3,
    defense: 5, range: 2, lineOfSight: 30,
    sprites: ['images/units/sword_infantry.png', 'images/units/sword_infantry1.png'],
  },
  CR1: {
    name: 'Spear Cavalry', speed: 20, maxHealth: 10, attack: 10,
    defense: 2, range: 6, lineOfSight: 50,
    sprites: ['images/units/spear_cavalry.png', 'images/units/spear_cavalry1.png'],
  },
};

export const STARTING_CASTLE_TYPE = 'CC0';

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
 * Cloud layers, lowest first. Following the effect on the personal site, size,
 * opacity and parallax rise together, so larger clouds read as nearer.
 */
export const CLOUD_LAYERS = [
  { size: 340, opacity: 0.10, parallax: 0.20, drift: 9, count: 5 },
  { size: 520, opacity: 0.15, parallax: 0.34, drift: 15, count: 4 },
  { size: 760, opacity: 0.19, parallax: 0.52, drift: 24, count: 3 },
];

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

/** World units per sprite pixel, preserving the scale the flat renderer used. */
export const SPRITE_UNITS_PER_PIXEL = 0.1;

export const WALL_THICKNESS_UNITS = 3;
export const WALL_HEIGHT_UNITS = 6;
export const TOWER_RADIUS_UNITS = 2.6;
export const TOWER_HEIGHT_UNITS = 8.5;

/** Direction the sun comes from, used to shade each face by its normal. */
export const SUN = { x: -0.60, y: 0.40, z: 0.69 };
export const AMBIENT_LIGHT = 0.34;

export const AUDIO_VOLUME_STEP = 0.01;
export const INITIAL_SOUND_LEVEL = 40;
