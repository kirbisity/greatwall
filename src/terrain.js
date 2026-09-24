import { TERRAIN } from './config.js';

/**
 * The ground: rolling height and patchy woodland, both generated rather than
 * stored.
 *
 * Nothing about the landscape is kept in memory. Height, forest cover and
 * mountains are all read from noise, and trees are hashed out of their own
 * position, so any patch of ground can be asked about without the rest
 * existing. The only state is the list of places the ground has been
 * levelled — under a city — which is short.
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

/** Scale a '#rrggbb' colour's channels by `1 + amount`, clamped to a byte. */
function mottled(hex, amount) {
  const scale = 1 + amount;
  const channel = (start) => Math.max(0, Math.min(255, Math.round(parseInt(hex.slice(start, start + 2), 16) * scale)))
    .toString(16).padStart(2, '0');
  return `#${channel(1)}${channel(3)}${channel(5)}`;
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
function mountainAt(cellX, cellY, seed) {
  if (hash(cellX, cellY, seed + 401) > TERRAIN.mountainChance) {
    return null;
  }
  const cell = TERRAIN.mountainSpacing;
  return {
    x: (cellX + hash(cellX, cellY, seed + 419)) * cell,
    y: (cellY + hash(cellX, cellY, seed + 433)) * cell,
    radius: TERRAIN.mountainMinRadius
      + hash(cellX, cellY, seed + 449) * (TERRAIN.mountainMaxRadius - TERRAIN.mountainMinRadius),
    height: TERRAIN.mountainMinHeight
      + hash(cellX, cellY, seed + 461) * (TERRAIN.mountainMaxHeight - TERRAIN.mountainMinHeight),
    // A seed of its own for the shape noise, so two mountains never wobble
    // in lockstep.
    shapeSeed: Math.floor(hash(cellX, cellY, seed + 479) * 0x7fffffff),
  };
}

/**
 * Every mountain whose cell could possibly reach this point. Bounded to the
 * cell's own neighbours because mountainMaxRadius is kept well under
 * mountainSpacing -- anything two cells over is already too far away to
 * matter, so nine hashes is always enough.
 */
function mountainsNear(x, y, seed) {
  const cell = TERRAIN.mountainSpacing;
  const cellX = Math.floor(x / cell);
  const cellY = Math.floor(y / cell);
  const found = [];
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      const mountain = mountainAt(cellX + dx, cellY + dy, seed);
      if (mountain) {
        found.push(mountain);
      }
    }
  }
  return found;
}

/**
 * How far a mountain's silhouette reaches in a given direction. Offsetting
 * the radius by noise sampled around a circle -- rather than a fixed
 * distance -- is what makes the outline a rough blob instead of a neat cone.
 */
function silhouetteRadius(mountain, angle) {
  const wobble = valueNoise(
    Math.cos(angle) * TERRAIN.mountainShapeScale + 1000,
    Math.sin(angle) * TERRAIN.mountainShapeScale + 1000,
    mountain.shapeSeed,
  );
  return mountain.radius * (0.65 + wobble * 0.6);
}

/** How much this mountain raises the ground at (x, y), 0 well clear of it. */
function mountainBumpAt(mountain, x, y) {
  const dx = x - mountain.x;
  const dy = y - mountain.y;
  const distance = Math.hypot(dx, dy);
  const reach = silhouetteRadius(mountain, Math.atan2(dy, dx)) + TERRAIN.mountainSkirt;
  if (distance >= reach) {
    return 0;
  }
  return mountain.height * ease(1 - distance / reach);
}

/**
 * Whether a mountain has raised this point enough to count as its slope --
 * bare rock underfoot, and no woodland, whatever the band noise underneath
 * would otherwise have said.
 */
function isMountainSlope(x, y, seed) {
  return mountainsNear(x, y, seed).some((mountain) => mountainBumpAt(mountain, x, y) > TERRAIN.mountainRockBump);
}

export class Terrain {
  constructor(seed = 1) {
    this.seed = seed;
    // Ground levelled flat, one entry per settlement.
    this.levelled = [];
  }

  /** Raw landscape height, before anything has been built on it. */
  wildHeightAt(x, y) {
    const broad = valueNoise(x / TERRAIN.hillScale, y / TERRAIN.hillScale, this.seed);
    const fine = valueNoise(x / TERRAIN.detailScale, y / TERRAIN.detailScale, this.seed + 17);
    let height = (broad - 0.5) * TERRAIN.hillHeight + (fine - 0.5) * TERRAIN.detailHeight;
    for (const mountain of mountainsNear(x, y, this.seed)) {
      height += mountainBumpAt(mountain, x, y);
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
    const cell = TERRAIN.mountainSpacing;
    const pad = TERRAIN.mountainMaxRadius;
    const mountains = [];
    for (let cellX = Math.floor((minX - pad) / cell); cellX <= Math.floor((maxX + pad) / cell); cellX += 1) {
      for (let cellY = Math.floor((minY - pad) / cell); cellY <= Math.floor((maxY + pad) / cell); cellY += 1) {
        const mountain = mountainAt(cellX, cellY, this.seed);
        if (mountain) {
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
      if (gap >= zone.radius + TERRAIN.levelSkirt) {
        continue;
      }
      const blend = gap <= zone.radius
        ? 1
        : 1 - (gap - zone.radius) / TERRAIN.levelSkirt;
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
    const grain = valueNoise(x / TERRAIN.groundScale, y / TERRAIN.groundScale, this.seed + 149);
    return grain > TERRAIN.rockThreshold ? TERRAIN.rockColor
      : grain > TERRAIN.dirtThreshold ? TERRAIN.dirtColor
        : grain > TERRAIN.mossThreshold ? TERRAIN.mossColor
          : TERRAIN.grassColor;
  }

  /** The ground colour here, in `'#rrggbb'`, mottled for texture. */
  groundColorAt(x, y) {
    // Ground reads as bare rock once a mountain has raised it enough to
    // matter, whatever band the noise underneath would otherwise have said
    // -- the outer skirt stays whatever it was, so a mountain rises out of
    // the ground it stands on rather than starting with a hard edge.
    const base = isMountainSlope(x, y, this.seed) ? TERRAIN.rockColor : this.groundBandAt(x, y);
    // A finer noise mottles the band's colour, so a patch reads as textured
    // rather than a flat fill -- the same trick as the band itself, one size
    // down.
    const fleck = valueNoise(x / TERRAIN.mottleScale, y / TERRAIN.mottleScale, this.seed + 227);
    return mottled(base, (fleck - 0.5) * TERRAIN.mottleStrength);
  }

  /** How thick the woodland is here, 0 to 1. */
  forestAt(x, y) {
    const cover = valueNoise(x / TERRAIN.forestScale, y / TERRAIN.forestScale, this.seed + 91);
    if (cover <= TERRAIN.forestThreshold) {
      return 0;
    }
    return Math.min(1, (cover - TERRAIN.forestThreshold) / (1 - TERRAIN.forestThreshold));
  }

  /**
   * Trees standing in a patch of ground. Each is hashed out of its own cell,
   * so the same ground always grows the same wood, and `isCleared` drops the
   * ones that have been felled for a wall or a city.
   */
  treesWithin(minX, minY, maxX, maxY, isCleared) {
    const cell = TERRAIN.treeSpacing;
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
        if (this.groundBandAt(x, y) !== TERRAIN.grassColor || isMountainSlope(x, y, this.seed)) {
          continue;
        }
        if (isCleared && isCleared(x, y)) {
          continue;
        }
        trees.push({
          x,
          y,
          z: this.heightAt(x, y),
          size: TERRAIN.treeSize * (0.7 + hash(cellX, cellY, this.seed + 53) * 0.6),
        });
      }
    }
    return trees;
  }
}
