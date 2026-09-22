const EPSILON = 1e-9;

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function distanceSquared(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function segmentsIntersect(aStart, aEnd, bStart, bEnd) {
  const det = (aEnd.x - aStart.x) * (bEnd.y - bStart.y) - (bEnd.x - bStart.x) * (aEnd.y - aStart.y);
  if (det === 0) {
    return false;
  }
  const lambda = ((bEnd.y - bStart.y) * (bEnd.x - aStart.x) + (bStart.x - bEnd.x) * (bEnd.y - aStart.y)) / det;
  const gamma = ((aStart.y - aEnd.y) * (bEnd.x - aStart.x) + (aEnd.x - aStart.x) * (bEnd.y - aStart.y)) / det;
  return lambda > 0 && lambda < 1 && gamma > 0 && gamma < 1;
}

export function pointToLineDistance(point, lineStart, lineEnd) {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return distance(point, lineStart);
  }
  const cross = dy * point.x - dx * point.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x;
  return Math.abs(cross) / Math.sqrt(lengthSquared);
}

/**
 * Whether a point sits inside the damage band around a wall segment: close to
 * the infinite line, and within reach of both endpoints.
 * Compares squared magnitudes so the per-frame combat scan stays sqrt-free.
 */
export function isWithinSegmentBand(point, lineStart, lineEnd, range, reach) {
  const reachSquared = reach * reach;
  if (distanceSquared(point, lineStart) >= reachSquared) {
    return false;
  }
  if (distanceSquared(point, lineEnd) >= reachSquared) {
    return false;
  }
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return false;
  }
  const cross = dy * point.x - dx * point.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x;
  return cross * cross < range * range * lengthSquared;
}



/** Grow a segment outwards from its midpoint by `factor` (1 leaves it alone). */
export function scaleSegment(start, end, factor) {
  const half = (factor - 1) / 2;
  return {
    start: { x: start.x - (end.x - start.x) * half, y: start.y - (end.y - start.y) * half },
    end: { x: end.x + (end.x - start.x) * half, y: end.y + (end.y - start.y) * half },
  };
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** Nearest point on an axis-aligned square's perimeter, inside or out. */
export function closestPointOnSquare(point, centre, half) {
  const minX = centre.x - half;
  const maxX = centre.x + half;
  const minY = centre.y - half;
  const maxY = centre.y + half;

  if (point.x > minX && point.x < maxX && point.y > minY && point.y < maxY) {
    const gaps = [point.x - minX, maxX - point.x, point.y - minY, maxY - point.y];
    const nearest = Math.min(...gaps);
    if (nearest === gaps[0]) {
      return { x: minX, y: point.y };
    }
    if (nearest === gaps[1]) {
      return { x: maxX, y: point.y };
    }
    return { x: point.x, y: nearest === gaps[2] ? minY : maxY };
  }
  return { x: clamp(point.x, minX, maxX), y: clamp(point.y, minY, maxY) };
}

/**
 * Whether a segment passes through the interior of an axis-aligned square,
 * by clipping its parameter against each slab. Merely touching the boundary
 * does not count, so a wall snapped onto a city edge may meet it, while a
 * diagonal through two opposite corners is correctly caught.
 */
export function segmentEntersSquare(start, end, centre, half) {
  const slabs = [
    { origin: start.x, delta: end.x - start.x, min: centre.x - half, max: centre.x + half },
    { origin: start.y, delta: end.y - start.y, min: centre.y - half, max: centre.y + half },
  ];
  let enter = 0;
  let leave = 1;

  for (const slab of slabs) {
    if (Math.abs(slab.delta) < EPSILON) {
      // Parallel to this slab: it only ever enters if it starts within it.
      if (slab.origin <= slab.min || slab.origin >= slab.max) {
        return false;
      }
      continue;
    }
    const first = (slab.min - slab.origin) / slab.delta;
    const second = (slab.max - slab.origin) / slab.delta;
    enter = Math.max(enter, Math.min(first, second));
    leave = Math.min(leave, Math.max(first, second));
    if (enter >= leave) {
      return false;
    }
  }
  return leave - enter > EPSILON;
}

/** Distance from a point to an axis-aligned square; zero when inside it. */
export function distanceToSquare(point, centre, half) {
  const outsideX = Math.max(0, Math.abs(point.x - centre.x) - half);
  const outsideY = Math.max(0, Math.abs(point.y - centre.y) - half);
  return Math.hypot(outsideX, outsideY);
}
