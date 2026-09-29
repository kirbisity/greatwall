import { AMBIENT_LIGHT, CAMERA, SUN } from './config.js';

const DEGREES_TO_RADIANS = Math.PI / 180;
// Step used to measure how the ground stretches on screen around a point.
// How a cursor's ray is walked out across the landscape: the stride between
// samples, how far it is followed as a multiple of the camera's distance,
// and how many times the crossing is halved afterwards. A stride well under
// the smallest hill cannot step over one, and twelve halvings take a six
// unit stride down to under a hundredth of a unit.
const TERRAIN_PICK_STEP = 6;
const TERRAIN_PICK_REACH = 3;
const TERRAIN_PICK_HALVINGS = 12;

const JACOBIAN_STEP = 0.5;

/**
 * Snapshot of the camera for one frame. World space is x east, y north, z up;
 * the ground is z = 0. Screen space is pixels with y down.
 */
/**
 * The focal length for a screen of this size.
 *
 * Fixed in pixels, a narrow screen was simply zoomed in: measured, a phone
 * held upright saw 75 units of ground across where a desktop saw 302 -- too
 * little to take in one ring of wall. Scaled by the short side instead, and
 * never past the full figure, a phone sees about as much as a laptop does
 * and nothing a laptop's size or larger changes at all.
 */
export function focalFor(width, height) {
  const shortSide = Math.min(width, height);
  return CAMERA.focalLength * Math.min(1, shortSide / CAMERA.focalReferenceSide);
}

export function createView({ focus, distance, elevation, width, height }) {
  const angle = elevation * DEGREES_TO_RADIANS;
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  return {
    position: { x: focus.x, y: focus.y - distance * cos, z: distance * sin },
    up: { x: 0, y: sin, z: cos },
    forward: { x: 0, y: cos, z: -sin },
    focal: focalFor(width, height),
    centreX: width / 2,
    centreY: height / 2,
  };
}

/** World point to pixels, or null when it sits behind the near plane. */
export function projectPoint(view, x, y, z) {
  const relY = y - view.position.y;
  const relZ = z - view.position.z;
  const depth = relY * view.forward.y + relZ * view.forward.z;
  if (depth <= CAMERA.nearPlane) {
    return null;
  }
  const height = relY * view.up.y + relZ * view.up.z;
  const perspective = view.focal / depth;
  return {
    x: view.centreX + (x - view.position.x) * perspective,
    y: view.centreY - height * perspective,
    depth,
  };
}

export function project(view, point) {
  return projectPoint(view, point.x, point.y, point.z ?? 0);
}

/**
 * Project a lattice of ground corners at once, into flat arrays rather than
 * a point object apiece.
 *
 * The ground mesh projects thousands of corners per repaint and reads only
 * their screen position, so handing back an object each would be that many
 * short-lived allocations a frame -- enough churn to show up as stutter
 * whenever the collector caught up with it. `into` holds the caller's own
 * arrays for the same reason, reused from one repaint to the next.
 * `usable` is 0 where a corner falls behind the camera, which is the null
 * projectPoint returns there.
 */
export function projectCorners(view, xs, ys, into) {
  const { heights, screenX, screenY, usable } = into;
  const down = ys.length;
  for (let i = 0; i < xs.length; i += 1) {
    const relX = xs[i] - view.position.x;
    for (let j = 0; j < down; j += 1) {
      const slot = i * down + j;
      const relY = ys[j] - view.position.y;
      const relZ = heights[slot] - view.position.z;
      const depth = relY * view.forward.y + relZ * view.forward.z;
      if (depth <= CAMERA.nearPlane) {
        usable[slot] = 0;
        continue;
      }
      const perspective = view.focal / depth;
      screenX[slot] = view.centreX + relX * perspective;
      screenY[slot] = view.centreY - (relY * view.up.y + relZ * view.up.z) * perspective;
      usable[slot] = 1;
    }
  }
}

/** Where the ray through a pixel meets a level plane at this height. */
export function groundAt(view, screenX, screenY, height = 0) {
  const u = (screenX - view.centreX) / view.focal;
  const v = -(screenY - view.centreY) / view.focal;
  const dirY = v * view.up.y + view.forward.y;
  const dirZ = v * view.up.z + view.forward.z;
  const travel = (height - view.position.z) / dirZ;
  return {
    x: view.position.x + travel * u,
    y: view.position.y + travel * dirY,
  };
}

/**
 * The ray through a pixel, stepped by ground covered rather than by depth.
 *
 * One unit of travel is one world unit across the map, whatever the camera
 * is doing, which is what lets the march below use a step size in the same
 * units the landscape is measured in.
 */
function rayThrough(view, screenX, screenY) {
  const u = (screenX - view.centreX) / view.focal;
  const v = -(screenY - view.centreY) / view.focal;
  const dirY = v * view.up.y + view.forward.y;
  const dirZ = v * view.up.z + view.forward.z;
  const overGround = Math.hypot(u, dirY);
  if (overGround < 1e-6) {
    return null;
  }
  return {
    stepX: u / overGround,
    stepY: dirY / overGround,
    climb: dirZ / overGround,
  };
}

/**
 * Where the ray through a pixel meets the landscape rather than a plane.
 *
 * Everything the player points at stands on the ground, so a cursor read
 * against sea level lands somewhere else entirely once the ground is not at
 * sea level: on the island's hill that error runs to tens of units, and a
 * wall goes in nowhere near where it was drawn.
 *
 * Marched rather than solved. Re-cutting the ray at the height it last
 * found -- the obvious fix -- converges near the bottom of the screen and
 * diverges towards the top, where a ray comes in almost parallel to the
 * slope it is crossing: measured, it left errors of sixty units up there
 * while fixing the foreground. Walking out along the ray until it first
 * goes under the ground, then halving in on the crossing, holds everywhere
 * and finds the nearest hit rather than whichever one it stumbles into.
 *
 * `heightAt(x, y)` supplies the landscape, so this stays independent of it.
 * Falls back to the flat reading when the ray meets nothing.
 */
export function terrainPointAt(view, screenX, screenY, heightAt) {
  const flat = groundAt(view, screenX, screenY);
  const ray = rayThrough(view, screenX, screenY);
  if (!ray) {
    return flat;
  }
  const pointAt = (travel) => ({
    x: view.position.x + ray.stepX * travel,
    y: view.position.y + ray.stepY * travel,
  });
  const clearanceAt = (travel) => {
    const point = pointAt(travel);
    return view.position.z + ray.climb * travel - heightAt(point.x, point.y);
  };
  if (clearanceAt(0) <= 0) {
    return flat;
  }

  // Far enough to cross anything the ground mesh draws, which is itself
  // capped against the camera's own distance -- see Renderer#groundBounds.
  const reach = (view.position.z / Math.max(view.up.y, 1e-6)) * TERRAIN_PICK_REACH;
  let above = 0;
  let below = null;
  for (let travel = TERRAIN_PICK_STEP; travel < reach; travel += TERRAIN_PICK_STEP) {
    if (clearanceAt(travel) <= 0) {
      below = travel;
      break;
    }
    above = travel;
  }
  if (below === null) {
    return flat;
  }

  for (let pass = 0; pass < TERRAIN_PICK_HALVINGS; pass += 1) {
    const middle = (above + below) / 2;
    if (clearanceAt(middle) > 0) {
      above = middle;
    } else {
      below = middle;
    }
  }
  return pointAt((above + below) / 2);
}

/**
 * How one world unit of ground maps to pixels at a point, as two screen
 * vectors: east and north. Health bars are sized from this.
 */
export function groundJacobian(view, x, y) {
  const origin = projectPoint(view, x, y, 0);
  const east = projectPoint(view, x + JACOBIAN_STEP, y, 0);
  const north = projectPoint(view, x, y + JACOBIAN_STEP, 0);
  if (!origin || !east || !north) {
    return null;
  }
  return {
    origin,
    east: { x: (east.x - origin.x) / JACOBIAN_STEP, y: (east.y - origin.y) / JACOBIAN_STEP },
    north: { x: (north.x - origin.x) / JACOBIAN_STEP, y: (north.y - origin.y) / JACOBIAN_STEP },
  };
}

export function normalOf(a, b, c) {
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const uz = b.z - a.z;
  const vx = c.x - a.x;
  const vy = c.y - a.y;
  const vz = c.z - a.z;
  const x = uy * vz - uz * vy;
  const y = uz * vx - ux * vz;
  const z = ux * vy - uy * vx;
  const length = Math.hypot(x, y, z) || 1;
  return { x: x / length, y: y / length, z: z / length };
}

/** True when a face turns towards the camera and should be drawn. */
export function facesCamera(view, normal, centre) {
  return normal.x * (view.position.x - centre.x)
    + normal.y * (view.position.y - centre.y)
    + normal.z * (view.position.z - centre.z) > 0;
}

/** Lambert term in [AMBIENT_LIGHT, 1] for a face with this normal. */
export function lightingFor(normal) {
  return lightingForVector(normal.x, normal.y, normal.z);
}

/** As lightingFor, for a caller that has the components and no object. */
export function lightingForVector(x, y, z) {
  const lambert = Math.max(0, x * SUN.x + y * SUN.y + z * SUN.z);
  return AMBIENT_LIGHT + (1 - AMBIENT_LIGHT) * lambert;
}

export function centroid(points) {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const point of points) {
    x += point.x;
    y += point.y;
    z += point.z;
  }
  return { x: x / points.length, y: y / points.length, z: z / points.length };
}
