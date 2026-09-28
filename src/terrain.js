import { hexChannels } from './color.js';
import { TERRAIN } from './config.js';

/**
 * The ground: rolling height and patchy woodland, both generated rather than
 * stored.
 *
 * None of the landscape is stored as such. Height, forest cover and mountains
 * are all read from noise, and trees are hashed out of their own position, so
 * any patch of ground can be asked about without the rest existing. The only
 * state is the list of places the ground has been levelled — under a city —
 * and a cache of which mountains sit near which lattice cell, both short.
 *
 * The simulation stays flat: height is scenery that things are drawn sitting
 * on, not something they climb. Forest slows a company down; a mountain
 * peak steers it wide instead, on the strength of its location alone (see
 * pathfinding.js) rather than the shape rendered here.
 */

function hash(x, y, seed) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smoothstep, so lattice cells meet without a crease. */
function ease(t) {
  return t * t * (3 - 2 * t);
}

function toChannel(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function hexByte(value) {
  return value.toString(16).padStart(2, '0');
}

/**
 * Each band both ways round, worked out once per landscape. Their colours
 * never change while a level is being played, and the mesh asks for a
 * tile's colour thousands of times a repaint -- parsing '#rrggbb' that
 * often is pure waste. `turns` marks the ones autumn takes gold, which a
 * desert has none of.
 */
function bandsFor(land) {
  const band = (hex, turns = false) => ({ hex, channels: hexChannels(hex), turns });
  return {
    grass: band(land.grassColor, land.turnsInAutumn),
    moss: band(land.mossColor, land.turnsInAutumn),
    dirt: band(land.dirtColor),
    rock: band(land.rockColor),
    gold: hexChannels(land.autumnGold),
    pond: hexChannels(land.pondColor),
    pondBank: hexChannels(land.pondBankColor),
    oasis: hexChannels(land.oasisColor),
    snow: hexChannels(land.snowColor),
  };
}

function valueNoise(x, y, seed) {
  const cellX = Math.floor(x);
  const cellY = Math.floor(y);
  const fadeX = ease(x - cellX);
  const fadeY = ease(y - cellY);
  const topLeft = hash(cellX, cellY, seed);
  const topRight = hash(cellX + 1, cellY, seed);
  const bottomLeft = hash(cellX, cellY + 1, seed);
  const bottomRight = hash(cellX + 1, cellY + 1, seed);
  const top = topLeft + (topRight - topLeft) * fadeX;
  const bottom = bottomLeft + (bottomRight - bottomLeft) * fadeX;
  return top + (bottom - top) * fadeY;
}

/**
 * The mountain standing in this lattice cell, or null if the cell rolled
 * empty. A coarse cell (TERRAIN.mountainSpacing) with a low chance per cell
 * is what makes mountains rare without keeping a list of them anywhere --
 * the same trick as a tree's own cell, just a size up and much sparser.
 */
function mountainAt(cellX, cellY, seed, land) {
  if (hash(cellX, cellY, seed + 401) > land.mountainChance) {
    return null;
  }
  const cell = land.mountainSpacing;
  return {
    x: (cellX + hash(cellX, cellY, seed + 419)) * cell,
    y: (cellY + hash(cellX, cellY, seed + 433)) * cell,
    radius: land.mountainMinRadius
      + hash(cellX, cellY, seed + 449) * (land.mountainMaxRadius - land.mountainMinRadius),
    height: land.mountainMinHeight
      + hash(cellX, cellY, seed + 461) * (land.mountainMaxHeight - land.mountainMinHeight),
    // A seed of its own for the shape noise, so two mountains never wobble
    // in lockstep.
    shapeSeed: Math.floor(hash(cellX, cellY, seed + 479) * 0x7fffffff),
  };
}

// Mountains never move, so a cell's neighbourhood is worth keeping once it
// has been worked out: heights are asked for thousands of times a repaint,
// almost always about ground a cell or two across. Cells are 300 units and
// the view is held inside CAMERA's own pan limits, so this settles at a few
// dozen entries rather than growing without end.
const EMPTY = [];
// Room for cells either side of the origin, which at mountainSpacing across
// reaches far past anywhere CAMERA's pan limits let the view go.
const CELL_LIMIT = 4096;

// Reshaped ground is scanned straight through up to this many zones -- a few
// settlements never justify an index -- and bucketed past it. The bucket is
// comfortably wider than a platform's whole reach, so a lookup lands in one.
const ZONE_SCAN_LIMIT = 8;
const ZONE_BUCKET = 120;
const EMPTY_ZONES = [];

/**
 * Every mountain whose cell could possibly reach this point. Bounded to the
 * cell's own neighbours because mountainMaxRadius is kept well under
 * mountainSpacing -- anything two cells over is already too far away to
 * matter, so nine cells is always enough.
 */
function neighbourhoodAt(cellX, cellY, seed, cache, land, standsClear) {
  const key = (cellX + CELL_LIMIT) * CELL_LIMIT * 2 + (cellY + CELL_LIMIT);
  const known = cache.get(key);
  if (known) {
    return known;
  }
  let found = EMPTY;
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      const mountain = mountainAt(cellX + dx, cellY + dy, seed, land);
      if (mountain && standsClear(mountain)) {
        found = found === EMPTY ? [mountain] : [...found, mountain];
      }
    }
  }
  cache.set(key, found);
  return found;
}

/**
 * How far a mountain's silhouette reaches in a given direction. Offsetting
 * the radius by noise sampled around a circle -- rather than a fixed
 * distance -- is what makes the outline a rough blob instead of a neat cone.
 */
function silhouetteRadius(mountain, angle, land) {
  const wobble = valueNoise(
    Math.cos(angle) * land.mountainShapeScale + 1000,
    Math.sin(angle) * land.mountainShapeScale + 1000,
    mountain.shapeSeed,
  );
  return mountain.radius * (0.65 + wobble * 0.6);
}

/** How much this mountain raises the ground at (x, y), 0 well clear of it. */
function mountainBumpAt(mountain, x, y, land) {
  const dx = x - mountain.x;
  const dy = y - mountain.y;
  const distance = Math.hypot(dx, dy);
  const reach = silhouetteRadius(mountain, Math.atan2(dy, dx), land) + land.mountainSkirt;
  if (distance >= reach) {
    return 0;
  }
  return mountain.height * ease(1 - distance / reach);
}

export class Terrain {
  /**
   * `land` is a level's patch over TERRAIN's defaults -- its palette, how
   * its ground is shaped, whether anything grows on it (see levels.js).
   * Everything downstream reads this rather than the defaults, so a desert
   * and a green valley are the same code with different numbers.
   */
  constructor(seed = 1, land = {}, river = null, sea = null) {
    this.seed = seed;
    this.land = { ...TERRAIN, ...land };
    this.river = river;
    this.sea = sea;
    this.bands = bandsFor(this.land);
    const water = river ?? sea;
    if (water) {
      this.bands.water = hexChannels(water.color);
      this.bands.bank = hexChannels(water.bankColor);
    }
    // Ground the player or the game has reshaped: one entry per settlement
    // levelled flat, plus any platform raised on top of the wild ground. Both
    // are the same kind of thing to heightAt -- a patch pulled towards a
    // height of its own, easing back into the hillside over a skirt.
    this.levelled = [];
    // Zones bucketed by ground cell, so heightAt looks at the handful that
    // could reach a point rather than every one ever made. Thrown away
    // whenever the list changes and rebuilt on the next query.
    this.zoneIndex = null;
    this.neighbourhoods = new Map();
  }

  /**
   * How far into the river's channel this point sits: 0 on dry land, 1 mid
   * stream. The centre line wanders with a noise of its own along its
   * length, so it reads as a river rather than a ruled canal.
   */
  riverAt(x, y) {
    const river = this.river;
    if (!river) {
      return 0;
    }
    const wander = (valueNoise(x / river.meanderScale, 0.5, this.seed + 577) - 0.5) * 2 * river.meander;
    const gap = Math.abs(y - (river.y + wander));
    if (gap >= river.halfWidth) {
      return 0;
    }
    return 1 - gap / river.halfWidth;
  }

  /**
   * The level's own central rise, on top of whatever the noise is doing.
   *
   * Not another band of noise, because the island level is built around this
   * one hill: the keep stands on its summit and the walls climb it, and both
   * need a rise that is in the same place every time. But not a dome either
   * -- a perfectly round one read as a bald green scoop. Its reach varies
   * with the direction, which gives it spurs and hollows, and its surface
   * carries a grain of its own that dies away at the foot.
   */
  hillAt(x, y) {
    const hill = this.land.hill;
    if (!hill) {
      return 0;
    }
    const reach = Math.hypot(x, y);
    // Sampled on the ring rather than across the plane, so the spur on one
    // side has nothing to do with the hollow on the other and the walk right
    // round the hill meets where it started.
    const bearing = Math.atan2(y, x);
    const spur = (valueNoise(
      Math.cos(bearing) * hill.spurScale + 900,
      Math.sin(bearing) * hill.spurScale + 900,
      this.seed + 733,
    ) - 0.5) * 2 * hill.spurs;
    const radius = hill.radius + spur;
    if (reach >= radius) {
      return 0;
    }
    const climb = ease(1 - reach / radius);
    const grain = (valueNoise(x / hill.grainScale, y / hill.grainScale, this.seed + 811) - 0.5)
      * 2 * hill.grain;
    // Weighted to the flanks and fading out at both ends: the foot has to
    // meet the flat ground without a step, and the summit has to come out at
    // the height the level asked for, since that is where the keep stands.
    const flank = 4 * climb * (1 - climb);
    return Math.max(0, hill.height * climb + grain * flank);
  }

  /**
   * A ridge or dune line, on top of whatever the rolling hills are doing --
   * noise sampled mostly across one axis and only slowly along it, so the
   * land reads as parallel rises and hollows running a single direction
   * (a valley's own terraces, a dune field's own lines) rather than another
   * layer of the same isotropic bump the hills already are. Off by default;
   * a level asks for one by giving it a direction and the two scales that
   * set how far apart the lines run and how far they carry before
   * wandering.
   */
  ridgeAt(x, y) {
    const ridge = this.land.ridge;
    if (!ridge) {
      return 0;
    }
    const angle = ridge.angle * Math.PI / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const along = x * cos + y * sin;
    const across = -x * sin + y * cos;
    const wave = valueNoise(across / ridge.scale, along / ridge.alongScale, this.seed + 967);
    return (wave - 0.5) * 2 * ridge.height;
  }

  /**
   * How far out to sea this point lies: 0 ashore, 1 in open water. The
   * coastline is the shore radius pushed in and out by a noise of its own,
   * so an island has bays and headlands rather than being a drawn circle.
   */
  seaAt(x, y) {
    const sea = this.sea;
    if (!sea) {
      return 0;
    }
    const reach = Math.hypot(x, y);
    const shore = this.shoreAt(Math.atan2(y, x));
    if (reach <= shore) {
      return 0;
    }
    return Math.min(1, (reach - shore) / sea.shelf);
  }

  /**
   * How sandy this dry point reads, 0 well inland to 1 right at the
   * waterline -- a sea's own beach fading into the land beyond it rather
   * than the shoreline cutting straight from wet sand to turf. `seaAt`
   * already blends the wet side from bank colour to open water; this is
   * the same bank colour carried inland over `sea.beachWidth`, so the two
   * meet at the shore without a seam.
   */
  beachAt(x, y) {
    const sea = this.sea;
    if (!sea || !sea.beachWidth) {
      return 0;
    }
    const reach = Math.hypot(x, y);
    const shore = this.shoreAt(Math.atan2(y, x));
    const inland = shore - reach;
    if (inland < 0 || inland >= sea.beachWidth) {
      return 0;
    }
    return 1 - inland / sea.beachWidth;
  }

  /**
   * How far into a pond this point sits: 0 on dry land, 1 at its centre.
   * A level's own tiny standing water -- an oasis near the city, say --
   * entirely separate from its river or sea, so a level can carry both a
   * long watercourse and a scatter of small ponds at once (see levels.js).
   */
  pondAt(x, y) {
    let channel = 0;
    for (const pond of this.land.ponds) {
      const distance = Math.hypot(x - pond.x, y - pond.y);
      if (distance < pond.radius) {
        channel = Math.max(channel, 1 - distance / pond.radius);
      }
    }
    return channel;
  }

  /**
   * How green the ground reads this near a pond, 0 dry to 1 right at its
   * edge, fading out over the field beyond -- cultivated ground standing
   * out from whatever band the noise underneath would otherwise have
   * painted, independent of it the same way a mountain's rock is.
   */
  oasisAt(x, y) {
    let greenness = 0;
    for (const pond of this.land.ponds) {
      const distance = Math.hypot(x - pond.x, y - pond.y);
      if (distance <= pond.radius) {
        greenness = 1;
      } else if (distance < pond.fieldRadius) {
        greenness = Math.max(greenness, 1 - (distance - pond.radius) / (pond.fieldRadius - pond.radius));
      }
    }
    return greenness;
  }

  /**
   * How far the coast reaches along a bearing, in world units.
   *
   * Sampled on the ring itself rather than across the plane, so the headland
   * north of the city has nothing to do with the bay to its south, and the
   * two ends of the walk round the island meet without a seam.
   */
  shoreAt(bearing) {
    const sea = this.sea;
    if (!sea) {
      return Infinity;
    }
    const wander = (valueNoise(
      Math.cos(bearing) * sea.coastScale + 500,
      Math.sin(bearing) * sea.coastScale + 500,
      this.seed + 631,
    ) - 0.5) * 2 * sea.coast;
    return sea.shore + wander;
  }

  /**
   * Where a fleet can put ashore: `count` beaches spaced round the island,
   * each nudged off its even bearing so the ring does not read as a compass
   * rose. Derived from the coastline alone, so the same island always lands
   * boats in the same coves.
   *
   * `bearing` is the heading from the city, which is also the way a beached
   * hull points -- bow up the sand, stern in the water.
   */
  landings(count, inset = 0) {
    if (!this.sea) {
      return [];
    }
    const places = [];
    for (let i = 0; i < count; i += 1) {
      const even = (i / count) * Math.PI * 2;
      const jitter = (valueNoise(i * 3.7, 0.5, this.seed + 811) - 0.5) * (Math.PI * 2 / count) * 0.7;
      const bearing = even + jitter;
      const reach = this.shoreAt(bearing) - inset;
      places.push({
        x: Math.cos(bearing) * reach,
        y: Math.sin(bearing) * reach,
        bearing,
      });
    }
    return places;
  }

  /** Whether dry land is anywhere within `radius` of this point. */
  isAshore(x, y) {
    return this.seaAt(x, y) === 0 && this.riverAt(x, y) === 0;
  }

  /**
   * Whether a mountain stands far enough from the water to belong here.
   *
   * A peak rising out of the middle of a river reads as a mistake, and the
   * two are generated from noise that knows nothing of each other -- so
   * where they would meet, the water wins and the mountain is simply never
   * placed. Measured against its whole footprint, skirt included, so the
   * slope stops short of the bank rather than wading into it.
   */
  standsClearOfWater(mountain) {
    if (this.sea) {
      // A peak that would wade off the island's edge is never placed.
      const edge = Math.hypot(mountain.x, mountain.y) + mountain.radius + this.land.mountainSkirt;
      if (edge > this.sea.shore - this.sea.coast) {
        return false;
      }
    }
    const river = this.river;
    if (!river) {
      return true;
    }
    const wander = (valueNoise(mountain.x / river.meanderScale, 0.5, this.seed + 577) - 0.5)
      * 2 * river.meander;
    const gap = Math.abs(mountain.y - (river.y + wander));
    return gap > river.halfWidth + mountain.radius + this.land.mountainSkirt;
  }

  /**
   * The river as a chain of circles, for whatever needs to keep out of it
   * rather than draw it -- companies route round these exactly as they
   * route round a peak (see pathfinding's avoidMountains).
   */
  riverCirclesWithin(minX, maxX) {
    const river = this.river;
    if (!river) {
      return [];
    }
    const step = river.halfWidth;
    const circles = [];
    for (let x = Math.floor(minX / step) * step; x <= maxX + step; x += step) {
      const wander = (valueNoise(x / river.meanderScale, 0.5, this.seed + 577) - 0.5) * 2 * river.meander;
      circles.push({ x, y: river.y + wander, radius: river.halfWidth });
    }
    return circles;
  }

  /** Every mountain whose cell could possibly reach this point. */
  mountainsNear(x, y) {
    const cell = this.land.mountainSpacing;
    return neighbourhoodAt(
      Math.floor(x / cell), Math.floor(y / cell), this.seed, this.neighbourhoods, this.land,
      (mountain) => this.standsClearOfWater(mountain),
    );
  }

  /**
   * Whether a mountain has raised this point enough to count as its slope --
   * bare rock underfoot, and no woodland, whatever the band noise underneath
   * would otherwise have said.
   */
  isMountainSlope(x, y) {
    const mountains = this.mountainsNear(x, y);
    for (let i = 0; i < mountains.length; i += 1) {
      if (mountainBumpAt(mountains[i], x, y, this.land) > this.land.mountainRockBump) {
        return true;
      }
    }
    return false;
  }

  /** Raw landscape height, before anything has been built on it. */
  wildHeightAt(x, y) {
    const broad = valueNoise(x / this.land.hillScale, y / this.land.hillScale, this.seed);
    const fine = valueNoise(x / this.land.detailScale, y / this.land.detailScale, this.seed + 17);
    let height = (broad - 0.5) * this.land.hillHeight + (fine - 0.5) * this.land.detailHeight;
    height += this.hillAt(x, y);
    height += this.ridgeAt(x, y);
    const mountains = this.mountainsNear(x, y);
    for (let i = 0; i < mountains.length; i += 1) {
      height += mountainBumpAt(mountains[i], x, y, this.land);
    }
    const channel = this.riverAt(x, y);
    if (channel > 0) {
      height -= this.river.depth * ease(channel);
    }
    const offshore = this.seaAt(x, y);
    if (offshore > 0) {
      height -= this.sea.depth * ease(offshore);
    }
    const pond = this.pondAt(x, y);
    if (pond > 0) {
      height -= this.land.pondDepth * ease(pond);
    }
    return height;
  }

  /**
   * Every mountain that could stand anywhere in this patch of ground, for
   * whatever wants the full list rather than a single point's height --
   * raiders steering clear of one, or the ground painting itself as rock
   * beneath it.
   */
  mountainsWithin(minX, minY, maxX, maxY) {
    const cell = this.land.mountainSpacing;
    const pad = this.land.mountainMaxRadius;
    const mountains = [];
    for (let cellX = Math.floor((minX - pad) / cell); cellX <= Math.floor((maxX + pad) / cell); cellX += 1) {
      for (let cellY = Math.floor((minY - pad) / cell); cellY <= Math.floor((maxY + pad) / cell); cellY += 1) {
        const mountain = mountainAt(cellX, cellY, this.seed, this.land);
        if (mountain && this.standsClearOfWater(mountain)) {
          mountains.push(mountain);
        }
      }
    }
    return mountains;
  }

  /**
   * Height with settlements taken into account. A city sits on levelled
   * ground, easing back into the hillside over a short skirt so it does not
   * end in a cliff.
   */
  heightAt(x, y) {
    return this.reshape(this.wildHeightAt(x, y), x, y);
  }

  /**
   * How far the ground here has been reshaped -- raised into a platform or cut
   * flat for a settlement -- above the wild ground underneath it. What the
   * pace of anything crossing it turns on, so it is worth having without
   * paying for the noise twice.
   */
  liftAt(x, y) {
    const wild = this.wildHeightAt(x, y);
    return this.reshape(wild, x, y) - wild;
  }

  /** The zones' pull on a height already sampled from the wild ground. */
  reshape(wild, x, y) {
    let height = wild;
    const zones = this.zonesNear(x, y);
    for (let i = 0; i < zones.length; i += 1) {
      const zone = zones[i];
      const skirt = zone.skirt ?? this.land.levelSkirt;
      // A settlement eases out of a circle; a platform is a square, and has
      // to be measured as one or its four corners fall through the gap
      // between the circle and the tile the player actually picked.
      const gap = zone.square
        ? Math.max(Math.abs(x - zone.x), Math.abs(y - zone.y))
        : Math.hypot(x - zone.x, y - zone.y);
      if (gap >= zone.radius + skirt) {
        continue;
      }
      const blend = gap <= zone.radius ? 1 : 1 - (gap - zone.radius) / skirt;
      height += (zone.height - height) * ease(blend);
    }
    return height;
  }

  /**
   * The zones that could possibly reach this point.
   *
   * A settlement or two was worth walking the whole list for; a map a player
   * has been raising platforms across all game is not -- the scan showed up as
   * whole milliseconds per ground repaint once there were a hundred of them.
   * Each zone is dropped into every bucket its reach covers, so a lookup is
   * one hash and a handful of candidates however many have been made.
   */
  zonesNear(x, y) {
    if (this.levelled.length <= ZONE_SCAN_LIMIT) {
      return this.levelled;
    }
    if (!this.zoneIndex) {
      this.zoneIndex = new Map();
      for (const zone of this.levelled) {
        const reach = zone.radius + (zone.skirt ?? this.land.levelSkirt);
        const minX = Math.floor((zone.x - reach) / ZONE_BUCKET);
        const maxX = Math.floor((zone.x + reach) / ZONE_BUCKET);
        const minY = Math.floor((zone.y - reach) / ZONE_BUCKET);
        const maxY = Math.floor((zone.y + reach) / ZONE_BUCKET);
        for (let cellX = minX; cellX <= maxX; cellX += 1) {
          for (let cellY = minY; cellY <= maxY; cellY += 1) {
            const key = `${cellX}|${cellY}`;
            const bucket = this.zoneIndex.get(key);
            if (bucket) {
              bucket.push(zone);
            } else {
              this.zoneIndex.set(key, [zone]);
            }
          }
        }
      }
    }
    const bucket = this.zoneIndex.get(
      `${Math.floor(x / ZONE_BUCKET)}|${Math.floor(y / ZONE_BUCKET)}`,
    );
    return bucket ?? EMPTY_ZONES;
  }

  /** Level the ground under a settlement, replacing any earlier entry. */
  level(key, x, y, radius) {
    this.levelled = this.levelled.filter((zone) => zone.key !== key);
    // Flat at whatever the ground already is here, platforms included, so a
    // city raised onto one is levelled at the top rather than dragged back
    // down to the wild ground underneath it.
    this.levelled.push({ key, x, y, radius, kind: 'settlement', height: this.heightAt(x, y) });
    this.sortZones();
  }

  /**
   * Raise a patch of ground `lift` above the wild ground beneath it, or
   * change how far an existing platform stands. Same machinery as levelling a
   * settlement, pulled up instead of flat and with a skirt of its own --
   * the settlement's is sixty units, which on a platform this size would spread
   * the slope halfway across the island.
   */
  raise(key, x, y, radius, lift, skirt) {
    this.levelled = this.levelled.filter((zone) => zone.key !== key);
    // `base` is the wild ground under the platform, kept so a caller growing
    // one can move its height without asking the noise again -- and without
    // the zone index, which is built from where zones sit rather than how
    // tall they are, needing to be thrown away every frame.
    const base = this.wildHeightAt(x, y);
    const zone = { key, x, y, radius, skirt, base, kind: 'platform', square: true, height: base + lift };
    this.levelled.push(zone);
    this.sortZones();
    return zone;
  }

  /**
   * Settlements first, platforms last.
   *
   * Zones are applied in order, each pulling the height it has reached so
   * far towards its own, so the last one to touch a point is the one that
   * decides it. A platform raised under a city has to be the one that
   * decides, or the city's own levelling would hold it down at the ground
   * it was founded on and the keep would sit inside the earth beneath it.
   */
  sortZones() {
    this.levelled.sort((a, b) => (a.kind === 'platform' ? 1 : 0) - (b.kind === 'platform' ? 1 : 0));
    this.zoneIndex = null;
  }

  /** Forget a platform entirely, leaving the wild ground it stood on. */
  unraise(key) {
    this.levelled = this.levelled.filter((zone) => zone.key !== key);
    this.zoneIndex = null;
  }

  /** Every platform standing, for whatever wants to know where they are. */
  get platformZones() {
    return this.levelled.filter((zone) => zone.kind === 'platform');
  }

  /**
   * Which colour band this point falls in -- grass, moss, dirt or bare rock
   * -- before a mountain or the mottle noise touch it. Read from its own
   * noise, so the same patch always comes back the same band, independent
   * of season, lighting or anything else that changes over time.
   */
  groundBandAt(x, y) {
    return this.bandAt(x, y).hex;
  }

  /** The band itself, for a caller that wants its channels rather than hex. */
  bandAt(x, y) {
    const grain = valueNoise(x / this.land.groundScale, y / this.land.groundScale, this.seed + 149);
    const bands = this.bands;
    return grain > this.land.rockThreshold ? bands.rock
      : grain > this.land.dirtThreshold ? bands.dirt
        : grain > this.land.mossThreshold ? bands.moss
          : bands.grass;
  }

  /**
   * The ground colour here as `[r, g, b]`, mottled for texture.
   *
   * The mesh asks for this once per tile and wants numbers, so this is the
   * form that does the work; '#rrggbb' is built from it rather than the
   * other way about, which used to mean formatting a string per tile purely
   * for the renderer to parse it straight back. `into` lets a caller drawing
   * thousands of tiles hand over one array rather than be given thousands.
   *
   * `gold` is how far through autumn the year has got (see season.js). It
   * only takes the green bands, and only where its own patch noise runs
   * high, so the turn comes on in drifts across the map rather than
   * everywhere at once. `snowCover` is the same idea for a hard winter --
   * see Season#snowCoverAt -- but reaches every band, mountain rock
   * included, since a real peak catches the first snow of the year rather
   * than standing bare while the ground around it turns white.
   */
  groundTintAt(x, y, into = [0, 0, 0], gold = 0, snowCover = 0) {
    // A pond is its own small body of water, checked ahead of a level's
    // river or sea since the two never mean to overlap but nothing stops a
    // level carrying both at once.
    const pond = this.pondAt(x, y);
    const riverSea = Math.max(this.riverAt(x, y), this.seaAt(x, y));
    if (pond > 0 && pond >= riverSea) {
      return this.waterTint(pond, into, this.bands.pond, this.bands.pondBank);
    }
    if (riverSea > 0) {
      // Shore shading into open water, so the edge is a beach rather than a
      // painted line.
      return this.waterTint(riverSea, into, this.bands.water, this.bands.bank);
    }
    // Ground reads as bare rock once a mountain has raised it enough to
    // matter, whatever band the noise underneath would otherwise have said
    // -- the outer skirt stays whatever it was, so a mountain rises out of
    // the ground it stands on rather than starting with a hard edge.
    const onSlope = this.isMountainSlope(x, y);
    const band = onSlope ? this.bands.rock : this.bandAt(x, y);
    const base = band.channels;
    // A finer noise mottles the band's colour, so a patch reads as textured
    // rather than a flat fill -- the same trick as the band itself, one size
    // down.
    const fleck = valueNoise(x / this.land.mottleScale, y / this.land.mottleScale, this.seed + 227);
    const scale = 1 + (fleck - 0.5) * this.land.mottleStrength;
    let red = base[0] * scale;
    let green = base[1] * scale;
    let blue = base[2] * scale;
    const turning = gold > 0 && band.turns ? gold * this.autumnPatchAt(x, y) : 0;
    if (turning > 0) {
      const gold = this.bands.gold;
      red += (gold[0] - red) * turning;
      green += (gold[1] - green) * turning;
      blue += (gold[2] - blue) * turning;
    }
    // Cultivated ground around a pond, standing out the same way a
    // mountain's rock does -- independent of whatever band and turn the
    // noise underneath would otherwise have painted.
    const oasis = onSlope ? 0 : this.oasisAt(x, y);
    if (oasis > 0) {
      const field = this.bands.oasis;
      red += (field[0] - red) * oasis;
      green += (field[1] - green) * oasis;
      blue += (field[2] - blue) * oasis;
    }
    // A sea's own beach, carried inland from the shore -- see beachAt.
    const beach = onSlope ? 0 : this.beachAt(x, y);
    if (beach > 0) {
      const sand = this.bands.bank;
      red += (sand[0] - red) * beach;
      green += (sand[1] - green) * beach;
      blue += (sand[2] - blue) * beach;
    }
    // Snow settles last, over whatever the ground already shows -- see the
    // docstring above for why a mountain's rock does not sit this out.
    const snow = snowCover > 0 ? snowCover * this.snowPatchAt(x, y) : 0;
    if (snow > 0) {
      const white = this.bands.snow;
      red += (white[0] - red) * snow;
      green += (white[1] - green) * snow;
      blue += (white[2] - blue) * snow;
    }
    into[0] = toChannel(red);
    into[1] = toChannel(green);
    into[2] = toChannel(blue);
    return into;
  }

  /** The ground colour here, in `'#rrggbb'`, mottled for texture. */
  groundColorAt(x, y) {
    const tint = this.groundTintAt(x, y);
    return `#${hexByte(tint[0])}${hexByte(tint[1])}${hexByte(tint[2])}`;
  }

  /** A body of water's own colour at a point, banks blending into open water. */
  waterTint(channel, into, water = this.bands.water, bank = this.bands.bank) {
    const depth = ease(Math.min(1, channel * 1.6));
    into[0] = toChannel(bank[0] + (water[0] - bank[0]) * depth);
    into[1] = toChannel(bank[1] + (water[1] - bank[1]) * depth);
    into[2] = toChannel(bank[2] + (water[2] - bank[2]) * depth);
    return into;
  }

  /**
   * How readily this patch turns in autumn, 0 to 1. Ground below the
   * threshold never turns at all, which is what leaves green among the gold.
   */
  autumnPatchAt(x, y) {
    const patch = valueNoise(x / this.land.autumnPatchScale, y / this.land.autumnPatchScale, this.seed + 331);
    if (patch <= this.land.autumnPatchThreshold) {
      return 0;
    }
    return (patch - this.land.autumnPatchThreshold) / (1 - this.land.autumnPatchThreshold);
  }

  /**
   * How readily this patch settles white in winter, 0 to 1 -- picked by its
   * own noise the same way autumn's gold is, so snow gathers in drifts
   * rather than an even wash, and on its own patch of ground independent
   * of wherever autumn's own gold happened to catch.
   */
  snowPatchAt(x, y) {
    const patch = valueNoise(x / this.land.snowPatchScale, y / this.land.snowPatchScale, this.seed + 941);
    if (patch <= this.land.snowPatchThreshold) {
      return 0;
    }
    return (patch - this.land.snowPatchThreshold) / (1 - this.land.snowPatchThreshold);
  }

  /** How thick the woodland is here, 0 to 1. */
  forestAt(x, y) {
    const cover = valueNoise(x / this.land.forestScale, y / this.land.forestScale, this.seed + 91);
    const density = cover <= this.land.forestThreshold
      ? 0
      : Math.min(1, (cover - this.land.forestThreshold) / (1 - this.land.forestThreshold));
    const scaled = Math.min(1, density * this.treeDensityScaleAt(x, y));
    const radius = this.land.cityClearRadius;
    if (radius <= 0) {
      return scaled;
    }
    // The castle always stands at the origin, so the clearing is centred
    // there rather than needing a level to say where its own city is.
    const distance = Math.hypot(x, y);
    if (distance <= radius) {
      return 0;
    }
    const feather = this.land.cityClearFeather;
    if (feather <= 0 || distance >= radius + feather) {
      return scaled;
    }
    return scaled * (distance - radius) / feather;
  }

  /**
   * How much a point's own ground band thins or thickens whatever wood
   * would otherwise stand on it -- the lighter of the two greens (grass)
   * reads as open ground even where the noise says a wood belongs, the
   * darker (moss) as a proper thicket. Ground that carries no wood at all
   * regardless (dirt, rock) never asks, so its own scale here is moot.
   */
  treeDensityScaleAt(x, y) {
    return this.groundBandAt(x, y) === this.land.mossColor
      ? this.land.mossTreeDensity
      : this.land.grassTreeDensity;
  }

  /**
   * Trees standing in a patch of ground. Each is hashed out of its own cell,
   * so the same ground always grows the same wood, and `isCleared` drops the
   * ones that have been felled for a wall or a city.
   */
  treesWithin(minX, minY, maxX, maxY, isCleared) {
    const cell = this.land.treeSpacing;
    const trees = [];
    for (let cellX = Math.floor(minX / cell); cellX <= Math.floor(maxX / cell); cellX += 1) {
      for (let cellY = Math.floor(minY / cell); cellY <= Math.floor(maxY / cell); cellY += 1) {
        const roll = hash(cellX, cellY, this.seed + 303);
        const x = (cellX + hash(cellX, cellY, this.seed + 7)) * cell;
        const y = (cellY + hash(cellX, cellY, this.seed + 29)) * cell;
        if (roll > this.forestAt(x, y)) {
          continue;
        }
        // Woodland only takes root on the ground's two greens -- not dirt,
        // bare rock, or a mountain's slope, which reads as rock regardless
        // of what the band underneath says. Which of the two it is only
        // says how much wood grows there, already folded into forestAt's
        // own density above -- see Terrain#treeDensityScaleAt.
        const band = this.groundBandAt(x, y);
        if ((band !== this.land.grassColor && band !== this.land.mossColor)
          || this.isMountainSlope(x, y) || this.riverAt(x, y) > 0 || this.seaAt(x, y) > 0
          || this.pondAt(x, y) > 0 || this.beachAt(x, y) > 0) {
          continue;
        }
        if (isCleared && isCleared(x, y)) {
          continue;
        }
        trees.push({
          x,
          y,
          z: this.heightAt(x, y),
          size: this.land.treeSize * (0.7 + hash(cellX, cellY, this.seed + 53) * 0.6),
        });
      }
    }
    return trees;
  }
}
