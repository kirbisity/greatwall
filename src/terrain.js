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

/** A '#rrggbb' colour as [r, g, b]. */
function channelsOf(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
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
  const band = (hex, turns = false) => ({ hex, channels: channelsOf(hex), turns });
  return {
    grass: band(land.grassColor, land.turnsInAutumn),
    moss: band(land.mossColor, land.turnsInAutumn),
    dirt: band(land.dirtColor),
    rock: band(land.rockColor),
    gold: channelsOf(land.autumnGold),
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
  constructor(seed = 1, land = {}, river = null) {
    this.seed = seed;
    this.land = { ...TERRAIN, ...land };
    this.river = river;
    this.bands = bandsFor(this.land);
    if (river) {
      this.bands.water = channelsOf(river.color);
      this.bands.bank = channelsOf(river.bankColor);
    }
    // Ground levelled flat, one entry per settlement.
    this.levelled = [];
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
   * Whether a mountain stands far enough from the water to belong here.
   *
   * A peak rising out of the middle of a river reads as a mistake, and the
   * two are generated from noise that knows nothing of each other -- so
   * where they would meet, the water wins and the mountain is simply never
   * placed. Measured against its whole footprint, skirt included, so the
   * slope stops short of the bank rather than wading into it.
   */
  standsClearOfWater(mountain) {
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
    const mountains = this.mountainsNear(x, y);
    for (let i = 0; i < mountains.length; i += 1) {
      height += mountainBumpAt(mountains[i], x, y, this.land);
    }
    const channel = this.riverAt(x, y);
    if (channel > 0) {
      height -= this.river.depth * ease(channel);
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
    let height = this.wildHeightAt(x, y);
    for (const zone of this.levelled) {
      const gap = Math.hypot(x - zone.x, y - zone.y);
      if (gap >= zone.radius + this.land.levelSkirt) {
        continue;
      }
      const blend = gap <= zone.radius
        ? 1
        : 1 - (gap - zone.radius) / this.land.levelSkirt;
      height += (zone.height - height) * ease(blend);
    }
    return height;
  }

  /** Level the ground under a settlement, replacing any earlier entry. */
  level(key, x, y, radius) {
    this.levelled = this.levelled.filter((zone) => zone.key !== key);
    this.levelled.push({ key, x, y, radius, height: this.wildHeightAt(x, y) });
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
   * everywhere at once.
   */
  groundTintAt(x, y, into = [0, 0, 0], gold = 0) {
    // Ground reads as bare rock once a mountain has raised it enough to
    // matter, whatever band the noise underneath would otherwise have said
    // -- the outer skirt stays whatever it was, so a mountain rises out of
    // the ground it stands on rather than starting with a hard edge.
    const channel = this.riverAt(x, y);
    if (channel > 0) {
      // Bank shading into open water, so the edge is a shore rather than a
      // painted line.
      return this.waterTint(channel, into);
    }
    const band = this.isMountainSlope(x, y) ? this.bands.rock : this.bandAt(x, y);
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

  /** The river's own colour at a point, banks blending into open water. */
  waterTint(channel, into) {
    const bank = this.bands.bank;
    const water = this.bands.water;
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

  /** How thick the woodland is here, 0 to 1. */
  forestAt(x, y) {
    const cover = valueNoise(x / this.land.forestScale, y / this.land.forestScale, this.seed + 91);
    if (cover <= this.land.forestThreshold) {
      return 0;
    }
    return Math.min(1, (cover - this.land.forestThreshold) / (1 - this.land.forestThreshold));
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
        // Woodland only takes root on open grass -- not moss, dirt, bare
        // rock, or a mountain's slope, which reads as rock regardless of
        // what the band underneath says.
        if (this.groundBandAt(x, y) !== this.land.grassColor
          || this.isMountainSlope(x, y) || this.riverAt(x, y) > 0) {
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
