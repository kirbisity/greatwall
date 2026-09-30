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
  // The screen's short side at and above which the focal length applies in
  // full. Below it the lens widens in proportion -- see focalFor -- so a
  // phone is not left looking at the world through a keyhole.
  focalReferenceSide: 720,
  initialDistance: 180,
  minDistance: 110,
  // Ground tiles are a fixed world size (TERRAIN.cellSize) drawn across the
  // whole visible ground, so the tile count -- and the cost of a repaint --
  // grows with the square of how far the camera has pulled back. Kept short
  // enough that even the worst case (pulled all the way out, tilted to its
  // shallowest) stays under ~20ms rather than the 300ms-plus a full zoom
  // range would cost.
  maxDistance: 220,
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
  // A wall's armour is total: only anti-armour blows hurt it.
  armor: 1,
  // Its counter-blow against whoever batters it: falling stone, not a sword, so armour is no help.
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
  // How long a section blinks for after a repair or fortify order lands, or
  // after it is pushed back to a newly grown city's edge -- see Wall#flash.
  flashSeconds: 0.6,
  // Coin per standing section, charged with the rest of the income each
  // payout — a wall is upkeep, not just a one-off purchase.
  upkeepPerSection: 1,
  // A junction may not gather more than this many sections. Past it, a
  // build attempt is simply refused — see Game#buildWall.
  maxEdgesPerNode: 3,
  // How near a section counts as being astride it, for anything that climbs
  // over rather than going round.
  crossDistance: 34,
};

/* ==========================================================================
 * AI TUNING
 * Everything that governs how the two sides move and fight. Nothing here is
 * referenced by name outside this block, so it can all be moved freely.
 * ========================================================================== */

/** Most a company may turn in one frame. Higher turns tighter. */
export const RAIDER_STEERING_RADIANS = 0.045;

/**
 * How much of the remaining turn is taken each frame, before the cap above.
 * Low values ease into a new heading instead of snapping onto it, which is
 * what keeps a company from sawing back and forth around its aim.
 */
export const TURN_EASE = 0.14;

/** How companies treat walls. */
export const AVOIDANCE = {
  // Walls are treated as this much wider than they are when planning, so a
  // company aims well clear of the stone instead of grazing it.
  wallStandoff: 16,
  // Inside this distance a wall actively pushes a company away, which is what
  // makes them arc around an obstacle rather than scrape along it.
  repelDistance: 26,
  repelStrength: 0.7,
  // How far clear of a mountain's own radius a route round it should pass --
  // see pathfinding.js's avoidMountains.
  mountainRepelMargin: 30,
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
  engageDistance: 20,
  // Once locked they close right up and interleave, rather than trading blows
  // at arm's length. This is the separation they settle at.
  lockedGap: 4,
  // How fast they close that last distance, in world units a second -- a
  // little brisker than a marching pace (most companies march at 5-10, the
  // fastest cavalry nearer 20), not a lurch that outpaces even a horse.
  closeRate: 12,
  // Damage is scaled so a typical pairing resolves in about five seconds.
  damageRate: 1.7,
  // A fight that has not resolved by now breaks off, so nothing locks forever.
  maxSeconds: 9,
  // Both sides are held still for this long after a fight before moving on.
  recoverySeconds: 0.6,
};

/**
 * How a company gathers pace. Nothing starts at full speed: it builds up
 * over `accelerationSeconds`, and a turn caps how much of it can be kept --
 * an about-turn to `1 - turnSlowdown` of full pace, a gentler turn
 * proportionally less -- bleeding off any excess at `brakeRate` (a share of
 * full pace a second). Pace is also what a charge hits with; see CHARGE.
 */
export const MOMENTUM = {
  accelerationSeconds: 5,
  turnSlowdown: 0.7,
  brakeRate: 1.5,
};

/**
 * The first blows of a bout carry the pace a company came in with. A head-on
 * charge at `referenceSpeed` -- the fastest cavalry -- lands at 1 + `bonus`
 * (200%) for the first `seconds`, scaled down with speed and with how
 * squarely it came on. Caught running the other way, the same speed counts
 * against it instead, down to 1 - `retreatPenalty`.
 */
export const CHARGE = {
  seconds: 1,
  referenceSpeed: 20,
  bonus: 1,
  retreatPenalty: 0.5,
};

/** A company told to hold its ground braces for the first shock of a fight. */
export const HOLD = {
  // A unit type may set its own `holdBonus` (the Chinese are steadier at it).
  defenseBonus: 0.2,
  seconds: 2,
};

/**
 * A company whose morale breaks (see each unit type's `breaksAt`) runs for
 * it: it hits at `attackMultiplier` and defends at `defenseMultiplier` of its strength, can only be pinned by
 * an enemy that gets within `catchDistance` of it, and once it is clear of
 * every enemy by `escapeDistance` it has left the field altogether. For a
 * raider, the city itself counts as an enemy -- see Game#raiderThreats.
 */
export const ROUT = {
  attackMultiplier: 0.5,
  defenseMultiplier: 0.5,
  catchDistance: 8,
  escapeDistance: 160,
  // And it must have run at least this far from where it broke -- it is seen
  // to run, rather than vanishing where it stood.
  runDistance: 80,
  // How far ahead of itself a fleeing company aims.
  fleeReach: 100,
};

/**
 * Mass. Every unit type carries a `mass` (1 light, 2 medium, 3 heavy); some
 * are `cavalry`, and some carry `spears`. Heavy cavalry at the charge rides
 * light infantry down and carries on through, but a braced spear wall stops
 * any cavalry charge dead and punishes it. A charge only counts as one at
 * `chargeSpeed` or more (see melee.js's chargeSpeed) and aimed within
 * `chargeAlignment` (a cosine) of its target; spears are braced when on hold
 * or at no more than `bracedMomentum` of their pace.
 */
export const MASS = {
  heavy: 3,
  light: 1,
  chargeSpeed: 0.4,
  chargeAlignment: 0.5,
  bracedMomentum: 0.25,
  trampleMultiplier: 2,
  tramplePush: 10,
  trampleStaggerSeconds: 1,
  trampleMomentumKept: 0.7,
  counterChargeMultiplier: 4,
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
  // their formation, but they pick their way over the stone: astride a
  // section (see WALL.crossDistance) they slow to this much of their pace.
  crossSpeed: 0.45,
  // How close an Attack-tool tap must land to a company to pick it out --
  // see Game#selectGuardsNear. Shared with the renderer, which draws the
  // tap's own ping at the same radius, so what the player sees searched is
  // exactly what was searched.
  selectRadius: 28,
  // How far apart a selected group spreads around a shared destination --
  // see Game#orderGuards.
  groupSpreadRadius: 18,
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
    attack: 2, armor: 0, defense: 3, hitbox: 20, footprint: 28, upgradesTo: 'CC1',
  },
  CC1: {
    name: 'Medium Castle', cost: 1000, maxHealth: 1000, wealth: 80,
    attack: 2, armor: 0, defense: 3, hitbox: 40, footprint: 58, upgradesTo: 'CC2',
  },
  CC2: {
    name: 'Fortified City', cost: 3000, maxHealth: 2000, wealth: 160,
    attack: 2, armor: 0, defense: 3, hitbox: 60, footprint: 88, upgradesTo: null,
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
  japanLight: 'images/unit_avatar/avatar_japanese_light.png',
  japanRegular: 'images/unit_avatar/avatar_japanese_regular.png',
  japanHeavy: 'images/unit_avatar/avatar_japanese_heavy.png',
  // Not shipped yet -- the portrait quietly goes undrawn (see Renderer#drawAvatar)
  // until a real file lands here, the same as any other missing image would.
  emperor: 'images/unit_avatar/avatar_emperor.png',
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
  width: 20,
  minWidth: 12,
  maxWidth: 34,
};

/**
 * Every unit type's `breaksAt` is the share of its health at which its
 * morale breaks and it routs (see ROUT): the less disciplined, the sooner --
 * 0.7 for the lightest levies, down to 0.15 for the steadiest heavy troops.
 * The Emperor's 0 means it never does. `mass`, `cavalry` and `spears`: see MASS.
 *
 * A unit strikes with `attackAA` (anti-armour, which ignores armour) plus
 * `attackNormal` (worth only what its target's `armor`, 0 to 1, lets through);
 * the target's `defense` then blunts the total. See src/damage.js.
 */
export const RAIDER_TYPES = {
  CR0: {
    name: 'Steppe Saber Cavalry', speed: 18, maxHealth: 10,
    attackAA: 2.5, attackNormal: 2.5, armor: 0.1, defense: 2, range: 5, lineOfSight: 40,
    mass: 2, cavalry: true, breaksAt: 0.6, avatar: AVATARS.steppeRegular,
  },
  IR0: {
    name: 'Steppe Light Infantry', speed: 7, maxHealth: 20,
    attackAA: 1, attackNormal: 1, armor: 0.1, defense: 3, range: 2, lineOfSight: 30,
    mass: 1, breaksAt: 0.7, avatar: AVATARS.steppeLight,
  },
  IR1: {
    name: 'Steppe Heavy Infantry', speed: 7, maxHealth: 20,
    attackAA: 2, attackNormal: 1.5, armor: 0.4, defense: 5, range: 2, lineOfSight: 30,
    mass: 2, breaksAt: 0.45, avatar: AVATARS.steppeHeavy,
  },
  CR1: {
    name: 'Steppe Spear Cavalry', speed: 20, maxHealth: 10,
    attackAA: 5, attackNormal: 3, armor: 0.7, defense: 2, range: 6, lineOfSight: 50,
    mass: 3, cavalry: true, breaksAt: 0.5, avatar: AVATARS.steppeHeavy,
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
    name: 'Imperial Light Guard', speed: 7, maxHealth: 25,
    attackAA: 1.5, attackNormal: 1.5, armor: 0.1, defense: 4, range: 2, cost: 260,
    holdBonus: 0.3, mass: 1, breaksAt: 0.6, avatar: AVATARS.imperialLight,
  },
  IG0: {
    name: 'Imperial Guardsman', speed: 6, maxHealth: 30,
    attackAA: 1.75, attackNormal: 1.5, armor: 0.6, defense: 5, range: 2, cost: 450,
    holdBonus: 0.3, mass: 2, breaksAt: 0.45, avatar: AVATARS.imperialRegular,
  },
  IG_HEAVY: {
    name: 'Imperial Heavy Guard', speed: 5, maxHealth: 40,
    attackAA: 2, attackNormal: 1.5, armor: 0.8, defense: 7, range: 2, cost: 680,
    holdBonus: 0.3, mass: 3, spears: true, breaksAt: 0.3, avatar: AVATARS.imperialHeavy,
  },
  // The island garrison. Same three rungs at the same prices as the imperial
  // army, so a level can swap the defenders it fields without also changing
  // what the player can afford: the ashigaru trade a little armour for pace,
  // and the sohei a little pace for reach off the wall.
  JG_ASHIGARU: {
    name: 'Ashigaru Spearman', speed: 8, maxHealth: 24,
    attackAA: 0.75, attackNormal: 1.75, armor: 0.2, defense: 3, range: 3, cost: 260,
    mass: 1, spears: true, breaksAt: 0.4, avatar: AVATARS.japanLight,
  },
  JG_SAMURAI: {
    name: 'Samurai Retainer', speed: 6, maxHealth: 30,
    attackAA: 1.5, attackNormal: 3, armor: 0.6, defense: 4, range: 2, cost: 450,
    mass: 2, breaksAt: 0.2, avatar: AVATARS.japanRegular,
  },
  JG_SOHEI: {
    name: 'Sohei Warrior Monk', speed: 5, maxHealth: 42,
    attackAA: 2, attackNormal: 3.5, armor: 0.7, defense: 6, range: 3, cost: 680,
    mass: 3, spears: true, breaksAt: 0.15, avatar: AVATARS.japanHeavy,
  },
  // The one company every level fields the same way -- see Game#dispatchOptions
  // and #spawnEmperor. About a regular guard's own stats, but with three
  // times the health, and free to muster since only one is ever on offer.
  // These are its stats at a castle's first tier; EMPEROR_TIER_MULTIPLIER
  // scales attack, defense and health up as the city grows.
  EMPEROR: {
    name: 'The Emperor', speed: 10, maxHealth: 90,
    attackAA: 2, attackNormal: 1.5, armor: 0.8, defense: 7, range: 2, cost: 0,
    holdBonus: 0.3, mass: 3, breaksAt: 0, avatar: AVATARS.emperor,
  },
};

/** Which guard tiers a castle can field, unlocked as it grows. */
export const CASTLE_GUARD_TIERS = {
  CC0: ['IG_LIGHT'],
  CC1: ['IG_LIGHT', 'IG0'],
  CC2: ['IG_LIGHT', 'IG0', 'IG_HEAVY'],
};

/** How much stronger the Emperor's own base stats grow at each castle tier. */
export const EMPEROR_TIER_MULTIPLIER = { CC0: 1, CC1: 1.3, CC2: 1.6 };

/**
 * The open battleground mode: no castle, no economy. The player spends a
 * fixed budget of points placing companies south of the start line before
 * clicking Start, at which point the enemy line -- already drawn up to the
 * north, freshly randomised every time -- advances. See Game#restart,
 * Game#placeGuard and Game#spawnBattleLine.
 */
export const BATTLE = {
  budget: 32,
  // North is +y (see Game#spawnPoint's own bearing convention); the player
  // deploys south of the start line, the enemy is drawn up north of it.
  fieldHalfWidth: 220,
  baselineY: -60,
  placementDepth: 90,
  enemyBaselineY: 90,
  // How far past the enemy's own baseline the field runs -- also how deep
  // into the player's own ground a raider's marching order aims, so it
  // always has ground to charge across rather than stopping at y 0.
  fieldHalfDepth: 260,
  // What a line is made of -- which infantry across the centre, which
  // companies on the flanks -- is the faction's own: see FACTIONS.
  infantryCountRange: [6, 9],
  infantrySpacing: 24,
  cavalryPerSideRange: [1, 3],
  cavalrySpacing: 22,
  cavalryFlankOffset: 90,
  cavalryDepthOffset: 40,
  // Random jitter applied to every spawn point, so the line never lines up
  // in a perfect row -- see Game#spawnBattleLine.
  formationJitter: 18,
};

/** Every unit type by id, whichever side of a field it is fielded for. */
export const UNIT_TYPES = { ...RAIDER_TYPES, ...GUARD_TYPES };

/**
 * The armies the open battleground mode lets either side field. A faction is
 * a roster and a battle line, not a side: the player and the enemy each pick
 * one (see Game#loadLevel), and both may pick the same.
 *
 * `roster` is what the player can buy with BATTLE.budget, priced in points.
 * `line` is what the enemy draws up when it fields the faction: `infantry`
 * is drawn from across the centre, `flank` from the companies held back
 * on either wing. The Emperor is imperial alone, free and unique (see
 * Game#placeGuard).
 */
export const FACTIONS = {
  imperial: {
    name: 'Imperial Army',
    tag: 'Drilled heavy foot',
    avatar: AVATARS.imperialRegular,
    blurb: 'Drilled and well armoured, with no horse at all. A set wall of heavy guards turns any charge -- but it must stand still to do it. The Emperor may take the field with them.',
    roster: [
      { id: 'IG_LIGHT', cost: 3 },
      { id: 'IG0', cost: 5 },
      { id: 'IG_HEAVY', cost: 8 },
      { id: 'EMPEROR', cost: 0 },
    ],
    line: { infantry: ['IG_LIGHT', 'IG_LIGHT', 'IG0'], flank: ['IG0', 'IG_HEAVY'] },
  },
  steppe: {
    name: 'Steppe Horde',
    tag: 'Fast riders',
    avatar: AVATARS.steppeRegular,
    blurb: 'Fast riders and cheap foot. Saber cavalry run down anything that flees; heavy lancers ride through light infantry, but break on a braced spear wall.',
    roster: [
      { id: 'IR0', cost: 3 },
      { id: 'IR1', cost: 5 },
      { id: 'CR0', cost: 6 },
      { id: 'CR1', cost: 9 },
    ],
    line: { infantry: ['IR0', 'IR0', 'IR1'], flank: ['CR0', 'CR1'] },
  },
  japan: {
    name: 'Island Clans',
    tag: 'Spears and samurai',
    avatar: AVATARS.japanRegular,
    blurb: 'Ashigaru and sohei carry spears and turn a charge when they stand set; samurai retainers hit hardest of any foot. The heavier ranks are slow to break.',
    roster: [
      { id: 'JG_ASHIGARU', cost: 3 },
      { id: 'JG_SAMURAI', cost: 5 },
      { id: 'JG_SOHEI', cost: 8 },
    ],
    line: { infantry: ['JG_ASHIGARU', 'JG_ASHIGARU', 'JG_SAMURAI'], flank: ['JG_SAMURAI', 'JG_SOHEI'] },
  },
};

/**
 * The grounds the open battleground can be fought over: each patches the
 * level's own flat field (see levels.js) with hills, woodland or mountains,
 * and sets the weather over it. Hills tire whoever climbs them, trees slow
 * whoever pushes through, and a peak has to be marched round, so the ground
 * decides who gains from a charge. `land` is read by Terrain like a level's.
 *
 * `weather` is fixed for the whole fight: `season` pins the sky and the
 * ground's colour to one of SEASONS (by index) so a map looks the same from
 * first frame to last, `mist` and `climate` are a level's own (see
 * levels.js), and `rain` (0 to 1) is how hard it falls. `label` and `icon`
 * are only for the setup page. `tag` is that page's short caption.
 */
const MOUNTAIN_FLANKS = { halfWidth: 150, minY: -170, maxY: 280 };

export const BATTLE_MAPS = {
  plains: {
    name: 'Open Plains',
    tag: 'Flat and bare',
    blurb: 'Flat, bare ground. Nothing but the enemy between the lines.',
    land: {},
    weather: { label: 'Clear', icon: 'sun', season: 0 },
  },
  downs: {
    name: 'Rolling Downs',
    tag: 'Long slopes',
    blurb: 'Long slopes. Whoever holds the rise is fresh; whoever climbs it is not.',
    land: {
      hillScale: 380, hillHeight: 36, detailHeight: 2, slopeRelief: 3,
    },
    weather: { label: 'Autumn', icon: 'leaf', season: 2 },
  },
  greenwood: {
    name: 'The Greenwood',
    tag: 'Thick woods',
    blurb: 'Thick stands of trees that drag at any company pushing through them.',
    land: { forestThreshold: 0.42, forestScale: 200 },
    weather: {
      label: 'Morning mist',
      icon: 'fog',
      season: 0,
      mist: { color: '186, 206, 190', blend: 0.55, density: 1.7, start: 0.45 },
    },
  },
  highlands: {
    name: 'Windswept Highlands',
    tag: 'Steep, windy hills',
    blurb: 'Steep, broken hills with woods in the hollows. Hard going for everyone.',
    land: {
      hillScale: 320, hillHeight: 52, detailHeight: 3, slopeRelief: 4, forestThreshold: 0.68,
    },
    weather: {
      label: 'High wind',
      icon: 'wind',
      season: 0,
      mist: { color: '208, 216, 224', blend: 0.3, density: 1.1, start: 0.8, windSpeed: 4.5 },
    },
  },
  pass: {
    name: 'Mountain Pass',
    tag: 'Peaks on both flanks',
    blurb: 'A road between two ranges. Bare rock, sudden slopes, and nowhere to go but forward.',
    land: {
      hillScale: 360,
      hillHeight: 18,
      slopeRelief: 3,
      mountainChance: 0.9,
      mountainSpacing: 250,
      mountainMinRadius: 55,
      mountainMaxRadius: 105,
      mountainMinHeight: 60,
      mountainMaxHeight: 105,
      mountainClearing: MOUNTAIN_FLANKS,
      rockThreshold: 0.6,
      dirtThreshold: 0.5,
      forestThreshold: 0.75,
    },
    weather: {
      label: 'Overcast',
      icon: 'cloud',
      season: 0,
      mist: { color: '168, 178, 192', blend: 0.6, density: 1.9, start: 0.4, windSpeed: 2 },
    },
  },
  frost: {
    name: 'Frozen Peaks',
    tag: 'Snowbound mountains',
    blurb: 'Snow on every ridge and more falling. The cold does not care who holds the high ground.',
    land: {
      hillScale: 340,
      hillHeight: 22,
      slopeRelief: 3.2,
      mountainChance: 0.9,
      mountainSpacing: 250,
      mountainMinRadius: 60,
      mountainMaxRadius: 110,
      mountainMinHeight: 70,
      mountainMaxHeight: 115,
      mountainClearing: MOUNTAIN_FLANKS,
      snowPatchThreshold: -0.5,
      rockThreshold: 0.66,
      forestThreshold: 0.72,
    },
    weather: {
      label: 'Snowfall',
      icon: 'snow',
      season: 3,
      climate: { offset: -8 },
      mist: { color: '226, 232, 240', blend: 0.5, density: 1.4, start: 0.5, windSpeed: 2.5 },
    },
  },
  badlands: {
    name: 'Scorched Badlands',
    tag: 'Dry mesas and heat',
    blurb: 'Cracked clay and broad mesas under a white sun. No shade, no water, no mercy.',
    land: {
      grassColor: '#c9b078',
      mossColor: '#b8975c',
      dirtColor: '#a07a48',
      rockColor: '#9a8570',
      hillScale: 420,
      hillHeight: 20,
      detailHeight: 1.5,
      slopeRelief: 2.4,
      mountainChance: 0.8,
      mountainSpacing: 260,
      mountainMinRadius: 60,
      mountainMaxRadius: 120,
      mountainMinHeight: 35,
      mountainMaxHeight: 70,
      mountainShapeScale: 1.3,
      mountainSkirt: 50,
      mountainClearing: MOUNTAIN_FLANKS,
      ridge: { angle: 35, scale: 90, alongScale: 420, height: 9 },
      forestThreshold: 1,
      turnsInAutumn: false,
    },
    weather: {
      label: 'Scorching heat',
      icon: 'heat',
      season: 1,
      climate: { offset: 20 },
      mist: { color: '232, 204, 140', blend: 0.6, density: 1.8, start: 0.35, windSpeed: 2.5 },
    },
  },
  moor: {
    name: 'Stormy Moor',
    tag: 'Rain and mud',
    blurb: 'Rough heath under a low, dark sky. The rain will not let up.',
    land: {
      grassColor: '#66714a',
      mossColor: '#4b5a42',
      dirtColor: '#6b5b45',
      rockColor: '#7d7a72',
      hillScale: 300,
      hillHeight: 26,
      detailHeight: 3,
      slopeRelief: 3.4,
      forestThreshold: 0.86,
    },
    weather: {
      label: 'Heavy rain',
      icon: 'rain',
      season: 0,
      rain: 1,
      mist: { color: '118, 132, 146', blend: 0.65, density: 2.1, start: 0.35, windSpeed: 3.5 },
    },
  },
};
export const DEFAULT_BATTLE_MAP = 'plains';

/** Who fights whom until the player says otherwise. */
export const DEFAULT_FACTIONS = { player: 'imperial', enemy: 'steppe' };

/**
 * Earthworks: the low ramps the Build tool throws up in the open battleground
 * mode instead of stone. They are not barriers at all -- nothing routes
 * around one, and nothing may batter it -- they only slow whatever crosses
 * them (see Game#paceOn), which is what keeps them a tactic rather than a
 * wall by another name.
 */
export const EARTHWORK = {
  minLength: 12,
  maxLength: 70,
  // How close a company must stand to a run's own line to be slowed by it.
  thickness: 8,
  slowFactor: 0.5,
};

// One row per season; the last row repeats once the seasons run past it.
export const SEASON_RAIDER_MIX = [
  ['CR0', 'CR0', 'IR0', 'IR0', 'IR0'],
  ['CR0', 'CR0', 'IR0', 'IR0', 'IR1'],
  ['CR0', 'CR1', 'IR0', 'IR1', 'IR1'],
  ['CR0', 'CR1', 'CR1', 'IR1', 'IR1'],
  ['CR1', 'CR1', 'CR1', 'IR1', 'IR1'],
];

// Positional against SEASONS, now starting from Spring -- index 0 is never
// shown (a level opens already in spring, with nothing to announce), so it
// stands in for the season the game begins in rather than being dead space.
export const SEASON_MESSAGES = [
  'Spring',
  'Summer comes, a new type of raider occurs.',
  'Autumn comes, a good harvest doubles the income of the castle',
  'Freezing Winter comes, cost of wall construction doubles.',
  'Spring comes, a new type of raider occurs.',
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
  // A deliberate rise at the middle of the map, on top of whatever the noise
  // is doing. Null everywhere but the island, which is built around one --
  // see Terrain#hillAt and the contours walls terrace up it.
  hill: null,
  // A ridge or dune line running a level's own direction, on top of the
  // rolling hills -- `{ angle, scale, alongScale, height }`, see
  // Terrain#ridgeAt. Null by default: rolling hills alone already suit a
  // level that never asks for one.
  ridge: null,

  // Tiny standing water a level can scatter near its city -- an oasis in a
  // desert, say -- entirely apart from its river or sea. Empty by default,
  // so only a level that asks for one pays for it. Each is `{ x, y, radius,
  // fieldRadius }`: dry outside fieldRadius, a cultivated green fading in
  // from there, open water inside radius -- see Terrain#pondAt/oasisAt.
  ponds: [],
  pondColor: '#2f6f86',
  pondBankColor: '#cbb98d',
  pondDepth: 5,
  oasisColor: '#4a7c3a',

  // Woodland. Cover above the threshold grows trees, thicker towards 1,
  // over whichever of the ground's two greens a point falls on -- see
  // Terrain.treesWithin. Dirt and rock carry none regardless.
  forestScale: 240,
  forestThreshold: 0.50,
  treeSpacing: 18,
  treeSize: 5.4,
  // The lighter of the two greens (grass) reads as open, scarcely wooded
  // ground; the darker (moss) as a proper thicket, its own reach capped
  // at the noise's own density rather than made to exceed it -- see
  // Terrain#treeDensityScaleAt. Applies everywhere the same, so every
  // level's own wood reads the same way without a level having to say so.
  grassTreeDensity: 0.3,
  mossTreeDensity: 1.5,
  // A deliberate clearing around the city, since the castle always stands
  // at the origin (see Game#castles): forest is held off entirely within
  // the radius, then fades back in to the noise's own density over the
  // feather beyond it, so the tree line reads as a made clearing rather
  // than an edge the noise happened to draw. Zero leaves forest to grow
  // wherever the noise says, right up to the walls -- see Terrain#forestAt.
  cityClearRadius: 0,
  cityClearFeather: 0,
  // What a tree is drawn in. The trunk is fixed; the canopy turns with the
  // year, held exactly at each season's own midpoint and blended gradually
  // across the boundary between two -- see Season#seasonalColorMix, which
  // this is read through rather than read directly, and the key order must
  // match SEASONS's own names. A level overrides only the seasons where its
  // own wood differs (see the island's cherry blossoms in levels.js) --
  // the object is replaced wholesale by a patch, not merged key by key, so
  // an override gives every season a colour rather than leaving the rest to
  // fall through from here.
  trunkColor: '#543e2a',
  canopySeasons: {
    Autumn: '#d9b23a', Winter: '#eef2f5', Spring: '#4a603a', Summer: '#4a603a',
  },

  // Trees are felled this near a wall, and anywhere a city stands.
  clearOfWall: 16,

  // Companies lose this much of their pace in the thickest wood.
  forestDrag: 0.45,
  // What climbing costs. A company is slowed by the gradient of the ground
  // along the way it is actually heading, so the same hillside is hard work
  // going up, ordinary going along, and no trouble coming down. Most ground
  // is nearly level -- measured, the median gradient on every level is
  // around 0.05 -- so this barely touches the open field and tells heavily
  // on a hillside: pace 0.82 at a gradient of 0.1, 0.56 at 0.35, 0.31 at 1.
  climbDrag: 2.2,
  // Nothing is ever slowed past this, so no slope can leave a company
  // looking stuck.
  minClimbPace: 0.25,
  // How far ahead the ground is sampled to work out that gradient. Short
  // enough to feel the slope underfoot rather than the hill as a whole.
  climbSample: 6,

  // Mountains: a few, rough-shaped, standing well above the rolling hills.
  // One lattice cell (mountainSpacing across) has mountainChance of holding
  // one at all, so most cells are empty and the ones that aren't are spread
  // out -- see Terrain's mountainAt. Kept comfortably under mountainSpacing
  // so a point only ever needs to check its own cell's neighbours.
  mountainSpacing: 300,
  mountainChance: 0.35,
  mountainMinRadius: 45,
  mountainMaxRadius: 100,
  mountainMinHeight: 45,
  mountainMaxHeight: 75,
  // How far past its silhouette a mountain's slope keeps easing down to the
  // surrounding ground, rather than ending at a cliff.
  mountainSkirt: 40,
  // Noise scale for the wobble on a mountain's outline -- how many bumps a
  // trip around it passes through, roughly.
  mountainShapeScale: 2.2,
  // Ground reads as bare rock once a mountain has raised it by this much.
  mountainRockBump: 14,
  // How far out from a settlement mountains are worth asking about at all --
  // comfortably past where a raider could ever spawn.
  mountainFieldRadius: 500,
  // A rectangle -- `{ halfWidth, minY, maxY }` -- no mountain may reach into.
  // Null leaves them wherever the lattice puts them; the open battleground's
  // mountain maps use it to keep the ground between the lines passable.
  mountainClearing: null,

  // Mesh drawn for the ground: a fixed-size tile in world units, a quarter
  // the size of the old zoom-compensated cell. It is not resized for the
  // camera, so a tile genuinely grows and shrinks on screen as the camera
  // zooms rather than being held at a constant apparent size. Drawn across
  // the whole visible ground -- see CAMERA.maxDistance for how the zoom
  // range is kept short enough that this stays cheap at any distance.
  cellSize: 9,

  // Ground colour reads as patches of grass, moss, dirt and bare rock, picked
  // per cell from its own noise rather than tinted by season -- the year now
  // shows through the fog, not the dirt underfoot.
  groundScale: 200,
  mossThreshold: 0.40,
  dirtThreshold: 0.60,
  rockThreshold: 0.78,
  grassColor: '#6f8a49',
  mossColor: '#546b39',
  dirtColor: '#8a7350',
  rockColor: '#8c887c',
  // A second, finer noise mottles each band's colour a little, so a patch
  // of grass reads as textured turf rather than one flat fill.
  mottleScale: 30,
  mottleStrength: 0.18,

  // Autumn turns the green bands gold -- but only in patches, picked by a
  // noise of their own, so the map reads as woodland colour coming on
  // unevenly rather than the whole field being repainted at once. Ground
  // above the threshold turns, the more so the further above it sits.
  autumnPatchScale: 55,
  autumnPatchThreshold: 0.45,
  autumnGold: '#c98f2c',
  // Winter settles the ground white the same uneven way -- see
  // Terrain#snowPatchAt/groundTintAt and Season#snowCoverAt for how far
  // through a hard winter the year has got. A finer scale than autumn's
  // own patches, since a snow drift reads smaller than a whole stand of
  // wood turning.
  snowPatchScale: 34,
  snowPatchThreshold: 0.4,
  snowColor: '#eef2f5',
};

// Each season's own haze colour, how much it thickens the fog (1 is the
// baseline in FOG.maxAlpha) and how much it swells the cloud deck (1 is the
// year-round count in CLOUD_LAYERS). Atmosphere.seasonBlend holds these
// exactly at a season's midpoint and blends across the turn on either side,
// so nothing here is ever a hard cut in play.
// `tint` is a wash laid over the whole view at `tintStrength`, and
// `groundGold` how far the green bands have turned (see Terrain's
// groundTintAt). Only the season that owns a look carries it: season.js
// blends between neighbours, so summer's orange is already fading as autumn
// arrives and autumn's gold is already creeping in before it.
// Spring first: a level begins here (see Game#seconds), so the year's own
// cycle -- Spring into Summer into Autumn into Winter and back -- runs in
// its real order rather than needing a second mapping to say so. See
// game.js's AUTUMN/WINTER constants, and SEASON_MESSAGES, which are
// positional against this same order.
// `temperature` is a plain, level-agnostic reading for the year -- how a
// season blends is what everything downstream (snowfall, a winter's own
// settling on the ground) actually reads, not the number here on its own.
// See Season#snowCoverAt, and a level's own `climate` in levels.js for how
// one place can simply run warmer than the season alone says.
export const SEASONS = [
  {
    name: 'Spring',
    haze: '196, 216, 196', hazeDensity: 1, cloudBoost: 1,
    tint: '168, 222, 168', tintStrength: 0, groundGold: 0, temperature: 12,
  },
  {
    name: 'Summer',
    haze: '218, 172, 160', hazeDensity: 1, cloudBoost: 1,
    tint: '255, 132, 40', tintStrength: 0.16, groundGold: 0, temperature: 26,
  },
  {
    name: 'Autumn',
    haze: '214, 194, 146', hazeDensity: 1, cloudBoost: 1,
    tint: '226, 150, 62', tintStrength: 0, groundGold: 1, temperature: 9,
  },
  {
    name: 'Winter',
    // Snow coming: the thickest haze of the year, and the most cloud.
    haze: '236, 239, 241', hazeDensity: 3.2, cloudBoost: 1.9,
    tint: '198, 216, 236', tintStrength: 0, groundGold: 0, temperature: -8,
  },
];

/**
 * Aerial perspective. Ground depth is sampled down the screen and turned into
 * one vertical gradient, so distance haze costs a single fill per frame.
 */
export const FOG = {
  samples: 6,
  startDistance: 260,
  falloff: 0.00085,
  maxAlpha: 0.58,
  // Extra density per world unit of camera height, so a higher, farther-back
  // view reads as more atmosphere between the eye and the ground.
  altitudeFactor: 0.003,
  // However dense the haze and altitude multiply out to, the ground never
  // vanishes completely beneath it.
  maxOpacity: 0.92,
};

/**
 * Cloud layers, lowest first. Clouds sit at a real altitude and are projected
 * like anything else, so a higher deck is nearer the camera and slides past
 * faster than the ground when the view pans — no parallax constant needed.
 * Sizes and drift are world units.
 */
// Altitudes and the field below are sized against the camera's own reach
// (see CAMERA.maxDistance), so the sky keeps working if that reach changes.
// `winterExtra` clouds stand by beyond a layer's regular `count`, revealing
// themselves one at a time as SEASONS' cloudBoost climbs towards winter (see
// Atmosphere's constructor and placeClouds) -- a fuller sky in the cold
// months, gained gradually rather than switched on at the solstice.
export const CLOUD_LAYERS = [
  { altitude: 26, worldSize: 85, opacity: 0.10, drift: 3.5, count: 12, winterExtra: 5 },
  { altitude: 45, worldSize: 125, opacity: 0.13, drift: 5.5, count: 9, winterExtra: 4 },
  { altitude: 71, worldSize: 185, opacity: 0.16, drift: 8.5, count: 7, winterExtra: 3 },
];

/**
 * Clouds tile over this square of world, recentred on wherever the view is.
 * Sized against the ground a default view takes in, so a handful are always
 * overhead; off-screen decks cost one projection each and are then dropped.
 */
export const CLOUD_FIELD = 420;
/** A deck fades out over this last stretch as the camera descends onto it. */
export const CLOUD_FADE_HEIGHT = 90;
/**
 * A cloud this much wider than the viewport is one the camera has all but
 * flown into, so it thins out rather than smothering the map.
 */
export const CLOUD_ENGULF_WIDTH = 0.8;

export const CLOUD_SPRITE = 'images/cloud.png';

/**
 * Falling snow: world objects close over the ground, tiled and wrapped
 * around the camera's own focus exactly the way a cloud deck is (see
 * Atmosphere#placeSnow) -- so a flake slides past on a pan and swells on a
 * zoom the same way anything else nearby does, rather than sitting fixed
 * to the screen regardless of where the camera looks. Low altitude is
 * what reads as close: well under the lowest cloud layer, a flake is
 * between the camera and the ground rather than part of the sky. How many
 * fall at all is read off winter's own cloudBoost, the same value that
 * already gathers more cloud ahead of winter, so the two thicken together
 * and both fade the same gradual way everything else in the year does.
 */
export const SNOW_COUNT = 70;
export const SNOW_FIELD = 80;
export const SNOW_ALTITUDE_TOP = 18;
export const SNOW_ALTITUDE_BOTTOM = 1;
export const SNOW_MIN_SIZE = 0.15;
export const SNOW_MAX_SIZE = 0.4;
export const SNOW_MIN_FALL = 3;
export const SNOW_MAX_FALL = 7;
export const SNOW_DRIFT = 4;

/**
 * Falling rain, laid out exactly as snow is (see Atmosphere#placeRain) but
 * fast and streaked: each drop is a short vertical line in the world, so a
 * closer one draws longer on screen. Only a battle map with `rain` set in
 * BATTLE_MAPS ever shows it.
 */
export const RAIN_COUNT = 170;
export const RAIN_FIELD = 90;
export const RAIN_ALTITUDE_TOP = 24;
export const RAIN_ALTITUDE_BOTTOM = 0;
export const RAIN_FALL = 42;
export const RAIN_STREAK = 2.4;
export const RAIN_SLANT = 0.35;

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
