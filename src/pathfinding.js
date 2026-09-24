import { distanceSquared, pointToLineDistance } from './geometry.js';
import { AVOIDANCE, NAVIGATION, RAIDER_STEERING_RADIANS, TURN_EASE } from './config.js';
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
  // Companies that pass through walls have nothing to route around.
  if (!raider.avoidsWalls) {
    return castle;
  }
  if (navigation.barriers.length === 0 || !isBlocked(raider.position, castle, navigation.barriers)) {
    raider.siegeTarget = null;
    raider.heldGateway = null;
    return castle;
  }

  // A company that has sworn to batter a section keeps at it. Left to think
  // again it would drop the siege at once, set off down the very route that
  // stranded it, give up again, and come back: the loop it was in to start.
  const sworn = raider.siegeSeconds > 0
    && raider.siegeTarget
    && navigation.barriers.includes(raider.siegeTarget);

  // The promise has run out. Hand its patience back, so it truly gives the
  // way round another go instead of settling in against stone it cannot
  // break. Batter, walk, batter: each stint long enough to be worth making.
  if (!sworn && raider.siegeTarget) {
    raider.stuckSeconds = 0;
    raider.closestApproach = Infinity;
  }

  if (!sworn && raider.stuckSeconds < AVOIDANCE.patienceSeconds) {
    const route = routeFrom(navigation, raider.position, raider.heldGateway);
    // A way round that far outruns the direct line is not a way round worth
    // walking; the stone is the shorter road.
    const direct = Math.hypot(castle.x - raider.position.x, castle.y - raider.position.y);
    const worthIt = route && (!raider.besieges
      || route.cost <= direct * AVOIDANCE.detourTolerance);
    if (worthIt) {
      raider.siegeTarget = null;
      raider.heldGateway = route.waypoint;
      return route.waypoint;
    }
  }
  if (!raider.besieges) {
    return castle;
  }

  // Walled in, or out of patience with the way round. Keep hitting the same
  // section so the damage adds up, and swear to it for a stint so the blows
  // land instead of being thought better of a frame later.
  if (!raider.siegeTarget || !navigation.barriers.includes(raider.siegeTarget)) {
    raider.siegeTarget = siegeTarget(navigation, raider.position, castle);
  }
  if (raider.siegeTarget && raider.siegeSeconds <= 0) {
    raider.siegeSeconds = AVOIDANCE.siegeCommitSeconds;
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
  // Hold the push below the pull of the waypoint, so it bends the approach
  // rather than replacing it and walking the company round in a circle.
  const reach = Math.hypot(waypoint.x - company.position.x, waypoint.y - company.position.y);
  const cap = reach * AVOIDANCE.maxShoveFraction;
  const shove = Math.hypot(shiftX, shiftY);
  if (shove > cap) {
    shiftX *= cap / shove;
    shiftY *= cap / shove;
  }
  return { x: waypoint.x + shiftX, y: waypoint.y + shiftY };
}

function turnTowards(raider, waypoint) {
  const desired = raider.wander
    + Math.atan2(waypoint.y - raider.position.y, waypoint.x - raider.position.x);
  let heading = raider.heading;

  // Shortest way round to the wanted heading.
  let difference = desired - heading;
  while (difference <= -Math.PI) {
    difference += FULL_TURN_RADIANS;
  }
  while (difference > Math.PI) {
    difference -= FULL_TURN_RADIANS;
  }

  // Ease into it rather than swinging at a fixed rate, which overshoots and
  // then has to come back.
  const turn = Math.max(
    -RAIDER_STEERING_RADIANS,
    Math.min(RAIDER_STEERING_RADIANS, difference * TURN_EASE),
  );
  heading += turn;

  raider.velocity.x = raider.type.speed * Math.cos(heading);
  raider.velocity.y = raider.type.speed * Math.sin(heading);
}

/** Re-plan only on arrival, on a wall change, or a few times a second. */
function needsNewWaypoint(raider, navigation) {
  return raider.planVersion !== navigation.version
    || raider.replanCountdown <= 0
    || distanceSquared(raider.position, raider.waypoint) < NAVIGATION.arriveRadius ** 2;
}

/**
 * Drift this company's private bias on its aim by a hair. Geometry alone is
 * perfectly repeatable, so a company that steers itself into a corner steers
 * itself into the same corner next time round for ever. A little noise on the
 * heading is enough to break the cycle, and stays well under the turn easing
 * so it reads as a company wavering rather than one staggering.
 */
function drift(company, random) {
  const step = (random() * 2 - 1) * AVOIDANCE.wanderStep;
  company.wander = Math.max(
    -AVOIDANCE.wanderRadians,
    Math.min(AVOIDANCE.wanderRadians, company.wander + step),
  );
}

export function steerCompany(raider, navigation, random = Math.random) {
  raider.replanCountdown -= 1;
  if (needsNewWaypoint(raider, navigation)) {
    raider.waypoint = chooseWaypoint(raider, navigation);
    raider.planVersion = navigation.version;
    raider.replanCountdown = NAVIGATION.replanFrames;
    drift(raider, random);
  }
  const aim = raider.siegeTarget || !raider.avoidsWalls
    ? raider.waypoint
    : shoveOffWalls(raider, raider.waypoint, navigation);
  turnTowards(raider, aim);
}
