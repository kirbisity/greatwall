import { TERRAIN } from './config.js';

/**
 * The ground: rolling height and patchy woodland, both generated rather than
 * stored.
 *
 * Nothing about the landscape is kept in memory. Height and forest cover are
 * read from noise, and trees are hashed out of their own position, so any
 * patch of ground can be asked about without the rest existing. The only state
 * is the list of places the ground has been levelled — under a city — which is
 * short.
 *
 * The simulation stays flat: height is scenery that things are drawn sitting
 * on, not something they climb. Forest is the one part of it companies feel.
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
    return (broad - 0.5) * TERRAIN.hillHeight + (fine - 0.5) * TERRAIN.detailHeight;
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
   * The ground colour here, in `'#rrggbb'` -- grass, dirt or bare rock. Read
   * from its own noise, so the same patch always comes back the same colour,
   * independent of season, lighting or anything else that changes over time.
   */
  groundColorAt(x, y) {
    const grain = valueNoise(x / TERRAIN.groundScale, y / TERRAIN.groundScale, this.seed + 149);
    if (grain > TERRAIN.rockThreshold) {
      return TERRAIN.rockColor;
    }
    if (grain > TERRAIN.dirtThreshold) {
      return TERRAIN.dirtColor;
    }
    return TERRAIN.grassColor;
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
