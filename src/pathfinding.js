import { distanceSquared, pointToLineDistance } from './geometry.js';
import { AVOIDANCE, NAVIGATION, RAIDER_STEERING_RADIANS } from './config.js';
import { isBlocked, routeFrom, siegeTarget, wallsNear } from './navigation.js';

const FULL_TURN_RADIANS = 2 * Math.PI;

function midpointOf(wall) {
  return { x: (wall.start.x + wall.end.x) / 2, y: (wall.start.y + wall.end.y) / 2 };
}

/**
 * Where this raider should head next: straight at the city when the way is
 * open, otherwise the cheapest gateway round the walls, and failing that the
 * wall barring its path.
 */
function chooseWaypoint(raider, navigation) {
  const castle = raider.destination;
  if (navigation.barriers.length === 0 || !isBlocked(raider.position, castle, navigation.barriers)) {
    raider.siegeTarget = null;
    return castle;
  }

  const route = routeFrom(navigation, raider.position);
  if (route) {
    raider.siegeTarget = null;
    return route.waypoint;
  }
  if (!raider.besieges) {
    return castle;
  }

  // Walled in. Keep hitting the same section so the damage adds up.
  if (!raider.siegeTarget || !navigation.barriers.includes(raider.siegeTarget)) {
    raider.siegeTarget = siegeTarget(navigation, raider.position, castle);
  }
  return raider.siegeTarget ? midpointOf(raider.siegeTarget) : castle;
}

/**
 * Nudge the aim away from any wall the company is crowding. This is what turns
 * a graze along the stone into an arc around it, and it stacks with whatever
 * route the graph handed down.
 */
function shoveOffWalls(company, waypoint, navigation) {
  let shiftX = 0;
  let shiftY = 0;
  for (const wall of wallsNear(navigation.grid, company.position, AVOIDANCE.repelDistance)) {
    const gap = pointToLineDistance(company.position, wall.start, wall.end);
    if (gap >= AVOIDANCE.repelDistance || gap === 0) {
      continue;
    }
    const strength = (1 - gap / AVOIDANCE.repelDistance) ** 2 * AVOIDANCE.repelStrength;
    // Push along the perpendicular, on whichever side the company already sits.
    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    const length = Math.hypot(dx, dy) || 1;
    const side = Math.sign(
      (company.position.x - wall.start.x) * dy - (company.position.y - wall.start.y) * dx,
    ) || 1;
    shiftX += side * dy / length * strength * AVOIDANCE.repelDistance;
    shiftY += -side * dx / length * strength * AVOIDANCE.repelDistance;
  }
  if (shiftX === 0 && shiftY === 0) {
    return waypoint;
  }
  return { x: waypoint.x + shiftX, y: waypoint.y + shiftY };
}

function turnTowards(raider, waypoint) {
  const desired = Math.atan2(waypoint.y - raider.position.y, waypoint.x - raider.position.x);
  let heading = raider.heading;

  const difference = desired - heading;
  if (difference <= -Math.PI) {
    heading -= FULL_TURN_RADIANS;
  } else if (difference >= Math.PI) {
    heading += FULL_TURN_RADIANS;
  }

  const deadzone = 4 * RAIDER_STEERING_RADIANS;
  if (heading < desired - deadzone) {
    heading = Math.min(desired, heading + RAIDER_STEERING_RADIANS);
  } else if (heading > desired + deadzone) {
    heading = Math.max(desired, heading - RAIDER_STEERING_RADIANS);
  }

  raider.velocity.x = raider.type.speed * Math.cos(heading);
  raider.velocity.y = raider.type.speed * Math.sin(heading);
}

/** Re-plan only on arrival, on a wall change, or a few times a second. */
function needsNewWaypoint(raider, navigation) {
  return raider.planVersion !== navigation.version
    || raider.replanCountdown <= 0
    || distanceSquared(raider.position, raider.waypoint) < NAVIGATION.arriveRadius ** 2;
}

export function steerCompany(raider, navigation) {
  raider.replanCountdown -= 1;
  if (needsNewWaypoint(raider, navigation)) {
    raider.waypoint = chooseWaypoint(raider, navigation);
    raider.planVersion = navigation.version;
    raider.replanCountdown = NAVIGATION.replanFrames;
  }
  const aim = raider.siegeTarget
    ? raider.waypoint
    : shoveOffWalls(raider, raider.waypoint, navigation);
  turnTowards(raider, aim);
}
