import { rotateAround, scaleSegment, segmentsIntersect } from './geometry.js';
import {
  RAIDER_AVOID_MAX_DEGREES,
  RAIDER_AVOID_STEP_DEGREES,
  RAIDER_STEERING_RADIANS,
} from './config.js';

const FULL_TURN_RADIANS = 2 * Math.PI;
const DEGREES_TO_RADIANS = Math.PI / 180;
// Walls are treated as longer than they are so raiders aim past the ends
// instead of grazing along them.
const WALL_AVOIDANCE_SCALE = 2;

/** The point a raider can currently see ahead of itself. */
function sightPoint(raider) {
  const reach = raider.type.lineOfSight / raider.type.speed;
  return {
    x: raider.position.x + raider.velocity.x * reach,
    y: raider.position.y + raider.velocity.y * reach,
  };
}

/** First heading within the avoidance arc that clears the wall, or null. */
function findGap(raider, sight, wallStart, wallEnd) {
  for (let degrees = RAIDER_AVOID_STEP_DEGREES; degrees <= RAIDER_AVOID_MAX_DEGREES; degrees += RAIDER_AVOID_STEP_DEGREES) {
    const radians = degrees * DEGREES_TO_RADIANS;
    const left = rotateAround(raider.position, sight, -radians);
    if (!segmentsIntersect(wallStart, wallEnd, raider.position, left)) {
      return left;
    }
    const right = rotateAround(raider.position, sight, radians);
    if (!segmentsIntersect(wallStart, wallEnd, raider.position, right)) {
      return right;
    }
  }
  return null;
}

function chooseWaypoint(raider, walls) {
  if (walls.length === 0) {
    return raider.destination;
  }

  let pathIsClear = true;
  for (const wall of walls) {
    if (wall.isIntact && segmentsIntersect(raider.position, raider.destination, wall.start, wall.end)) {
      pathIsClear = false;
      break;
    }
  }

  const sight = sightPoint(raider);
  let detour = null;
  for (const wall of walls) {
    const avoided = scaleSegment(wall.start, wall.end, WALL_AVOIDANCE_SCALE);
    if (segmentsIntersect(raider.position, raider.destination, avoided.start, avoided.end)) {
      pathIsClear = false;
    }
    if (segmentsIntersect(raider.position, sight, avoided.start, avoided.end)) {
      detour = findGap(raider, sight, avoided.start, avoided.end);
      break;
    }
  }

  if (pathIsClear || raider.turnedRadians > FULL_TURN_RADIANS) {
    return raider.destination;
  }
  return detour ?? raider.destination;
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
    raider.turnedRadians += RAIDER_STEERING_RADIANS;
  } else if (heading > desired + deadzone) {
    heading = Math.max(desired, heading - RAIDER_STEERING_RADIANS);
    raider.turnedRadians += RAIDER_STEERING_RADIANS;
  }

  raider.velocity.x = raider.type.speed * Math.cos(heading);
  raider.velocity.y = raider.type.speed * Math.sin(heading);
}

/** Pick a waypoint around any blocking wall and turn the raider towards it. */
export function steerRaider(raider, walls) {
  raider.waypoint = chooseWaypoint(raider, walls);
  turnTowards(raider, raider.waypoint);
}
