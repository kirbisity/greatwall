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

export function rotateAround(origin, point, radians) {
  const radius = distance(origin, point);
  const angle = Math.atan2(point.y - origin.y, point.x - origin.x) + radians;
  return {
    x: origin.x + radius * Math.cos(angle),
    y: origin.y + radius * Math.sin(angle),
  };
}

/** Grow a segment outwards from its midpoint by `factor` (1 leaves it unchanged). */
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
