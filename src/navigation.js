import { distance, distanceSquared, scaleSegment, segmentsIntersect } from './geometry.js';
import { AVOIDANCE, NAVIGATION } from './config.js';

/**
 * Whether a straight run between two points is cut by any standing wall.
 * Walls are treated as longer than they are, so a route that would shave past
 * an end is rejected and the company aims properly clear instead.
 */
export function isBlocked(from, to, barriers) {
  for (const wall of barriers) {
    const margin = 1 + AVOIDANCE.wallStandoff / Math.max(wall.length, 1);
    const wide = scaleSegment(wall.start, wall.end, margin);
    if (segmentsIntersect(from, to, wide.start, wide.end)) {
      return true;
    }
  }
  return false;
}

/**
 * Ends of the wall network that continue into open ground. Snapping hands back
 * the existing point object, so two joined sections share one, and an end is
 * open exactly when a single wall refers to it.
 */
export function openWallEnds(barriers) {
  const owners = new Map();
  for (const wall of barriers) {
    for (const end of [wall.start, wall.end]) {
      const seen = owners.get(end);
      owners.set(end, seen ? { wall, shared: true } : { wall, shared: false });
    }
  }
  const ends = [];
  for (const [point, owner] of owners) {
    if (!owner.shared) {
      ends.push({ point, wall: owner.wall });
    }
  }
  return ends;
}

/** A standing spot just past a wall's tip, clear of the damage it deals. */
function gatewayBeyond(point, wall) {
  const other = wall.start === point ? wall.end : wall.start;
  const dx = point.x - other.x;
  const dy = point.y - other.y;
  const length = Math.hypot(dx, dy) || 1;
  return {
    x: point.x + dx / length * NAVIGATION.gatewayClearance,
    y: point.y + dy / length * NAVIGATION.gatewayClearance,
  };
}

/** Shortest distance from every gateway back to the castle, or Infinity. */
function routeDistances(gateways, castle, barriers) {
  const count = gateways.length;
  const reaches = [];
  for (let i = 0; i < count; i += 1) {
    reaches.push(gateways.map((other, j) => i !== j && !isBlocked(gateways[i], other, barriers)));
  }

  const distances = gateways.map((gateway) => (
    isBlocked(gateway, castle, barriers) ? Infinity : distance(gateway, castle)
  ));
  const settled = new Array(count).fill(false);

  for (let step = 0; step < count; step += 1) {
    let nearest = -1;
    for (let i = 0; i < count; i += 1) {
      if (!settled[i] && distances[i] < Infinity && (nearest === -1 || distances[i] < distances[nearest])) {
        nearest = i;
      }
    }
    if (nearest === -1) {
      break;
    }
    settled[nearest] = true;
    for (let j = 0; j < count; j += 1) {
      if (settled[j] || !reaches[nearest][j]) {
        continue;
      }
      const through = distances[nearest] + distance(gateways[nearest], gateways[j]);
      if (through < distances[j]) {
        distances[j] = through;
      }
    }
  }
  return distances;
}

/**
 * The map raiders navigate by: every way past the wall network, each labelled
 * with how far it still is to the castle. Depends only on wall layout, so it
 * is rebuilt when walls change rather than every frame.
 */
export function buildNavigation(walls, castle, version) {
  // Every standing section blocks, so the wall list is the barrier list.
  const barriers = walls;
  if (!castle) {
    return { version, barriers: [], grid: new Map(), gateways: [], distances: [] };
  }

  // Keep the nearest ends when a sprawling network would make the graph large.
  const ends = openWallEnds(barriers)
    .sort((a, b) => distanceSquared(a.point, castle) - distanceSquared(b.point, castle))
    .slice(0, NAVIGATION.maxGateways);

  const gateways = ends.map((end) => gatewayBeyond(end.point, end.wall));
  return {
    version,
    barriers,
    grid: buildWallGrid(barriers),
    gateways,
    distances: routeDistances(gateways, castle, barriers),
  };
}

/** Cheapest gateway a raider can head straight for, or null if walled in. */
export function routeFrom(navigation, from) {
  let best = null;
  for (let i = 0; i < navigation.gateways.length; i += 1) {
    const toCastle = navigation.distances[i];
    if (!Number.isFinite(toCastle)) {
      continue;
    }
    const gateway = navigation.gateways[i];
    const cost = distance(from, gateway) + toCastle;
    if (best && cost >= best.cost) {
      continue;
    }
    if (isBlocked(from, gateway, navigation.barriers)) {
      continue;
    }
    best = { cost, waypoint: gateway };
  }
  return best;
}

/**
 * With no way through, batter the wall standing in the way. Weakest first, so
 * raiders on the same approach concentrate and eventually open a breach.
 */
export function siegeTarget(navigation, from, castle) {
  let chosen = null;
  let chosenRange = Infinity;
  for (const wall of navigation.barriers) {
    if (!segmentsIntersect(from, castle, wall.start, wall.end)) {
      continue;
    }
    const range = distanceSquared(from, wall.start);
    if (!chosen || wall.health < chosen.health || (wall.health === chosen.health && range < chosenRange)) {
      chosen = wall;
      chosenRange = range;
    }
  }
  return chosen;
}

/**
 * A coarse bucket grid over the walls.
 *
 * Steering, collision and combat each need "which walls are near me", and
 * doing that by scanning every wall for every company is three passes over the
 * whole network every frame. The grid is rebuilt with the route graph, so it
 * costs nothing on a frame where no wall changed.
 */
const CELL = 64;

function cellKey(x, y) {
  return `${Math.floor(x / CELL)}:${Math.floor(y / CELL)}`;
}

export function buildWallGrid(walls) {
  const cells = new Map();
  for (const wall of walls) {
    const minX = Math.min(wall.start.x, wall.end.x);
    const maxX = Math.max(wall.start.x, wall.end.x);
    const minY = Math.min(wall.start.y, wall.end.y);
    const maxY = Math.max(wall.start.y, wall.end.y);
    for (let x = Math.floor(minX / CELL); x <= Math.floor(maxX / CELL); x += 1) {
      for (let y = Math.floor(minY / CELL); y <= Math.floor(maxY / CELL); y += 1) {
        const key = `${x}:${y}`;
        const bucket = cells.get(key);
        if (bucket) {
          bucket.push(wall);
        } else {
          cells.set(key, [wall]);
        }
      }
    }
  }
  return cells;
}

/** Every wall whose cell is within `radius` of a point, without duplicates. */
export function wallsNear(grid, point, radius) {
  const found = new Set();
  const minX = Math.floor((point.x - radius) / CELL);
  const maxX = Math.floor((point.x + radius) / CELL);
  const minY = Math.floor((point.y - radius) / CELL);
  const maxY = Math.floor((point.y + radius) / CELL);
  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      const bucket = grid.get(`${x}:${y}`);
      if (bucket) {
        for (const wall of bucket) {
          found.add(wall);
        }
      }
    }
  }
  return found;
}
