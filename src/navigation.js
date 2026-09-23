import { distance, distanceSquared, segmentsIntersect } from './geometry.js';
import { NAVIGATION } from './config.js';

/** Whether a straight run between two points is cut by any standing wall. */
export function isBlocked(from, to, barriers) {
  for (const wall of barriers) {
    if (segmentsIntersect(from, to, wall.start, wall.end)) {
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
  const barriers = walls.filter((wall) => wall.isIntact);
  if (!castle) {
    return { version, barriers: [], gateways: [], distances: [] };
  }

  // Keep the nearest ends when a sprawling network would make the graph large.
  const ends = openWallEnds(barriers)
    .sort((a, b) => distanceSquared(a.point, castle) - distanceSquared(b.point, castle))
    .slice(0, NAVIGATION.maxGateways);

  const gateways = ends.map((end) => gatewayBeyond(end.point, end.wall));
  return {
    version,
    barriers,
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
