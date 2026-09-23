import { AMBIENT_LIGHT, CAMERA, SUN } from './config.js';

const DEGREES_TO_RADIANS = Math.PI / 180;
// Step used to measure how the ground stretches on screen around a point.
const JACOBIAN_STEP = 0.5;

/**
 * Snapshot of the camera for one frame. World space is x east, y north, z up;
 * the ground is z = 0. Screen space is pixels with y down.
 */
export function createView({ focus, distance, elevation, width, height }) {
  const angle = elevation * DEGREES_TO_RADIANS;
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  return {
    position: { x: focus.x, y: focus.y - distance * cos, z: distance * sin },
    up: { x: 0, y: sin, z: cos },
    forward: { x: 0, y: cos, z: -sin },
    focal: CAMERA.focalLength,
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

/** Where the ray through a pixel meets the ground plane. */
export function groundAt(view, screenX, screenY) {
  const u = (screenX - view.centreX) / view.focal;
  const v = -(screenY - view.centreY) / view.focal;
  const dirY = v * view.up.y + view.forward.y;
  const dirZ = v * view.up.z + view.forward.z;
  const travel = -view.position.z / dirZ;
  return {
    x: view.position.x + travel * u,
    y: view.position.y + travel * dirY,
  };
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
  const lambert = Math.max(0, normal.x * SUN.x + normal.y * SUN.y + normal.z * SUN.z);
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
