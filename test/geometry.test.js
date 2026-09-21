import test from 'node:test';
import assert from 'node:assert/strict';
import {
  distance,
  isWithinSegmentBand,
  pointToLineDistance,
  rotateAround,
  scaleSegment,
  segmentsIntersect,
} from '../src/geometry.js';

test('distance measures euclidean length', () => {
  assert.equal(distance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
});

test('segmentsIntersect detects a crossing and ignores a near miss', () => {
  const across = segmentsIntersect({ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: -1 }, { x: 0, y: 1 });
  const apart = segmentsIntersect({ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 2 }, { x: 0, y: 3 });
  assert.equal(across, true);
  assert.equal(apart, false);
});

test('segmentsIntersect treats parallel segments as non-crossing', () => {
  assert.equal(
    segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 1 }, { x: 10, y: 1 }),
    false,
  );
});

test('isWithinSegmentBand agrees with the unoptimised distance checks', () => {
  const start = { x: 0, y: 0 };
  const end = { x: 100, y: 0 };
  const reach = 102;
  const range = 5;
  const naive = (point) => pointToLineDistance(point, start, end) < range
    && distance(point, start) < reach
    && distance(point, end) < reach;

  for (let x = -20; x <= 120; x += 7) {
    for (let y = -20; y <= 20; y += 3) {
      const point = { x, y };
      assert.equal(
        isWithinSegmentBand(point, start, end, range, reach),
        naive(point),
        `disagreement at ${x},${y}`,
      );
    }
  }
});

test('isWithinSegmentBand rejects a degenerate segment', () => {
  const point = { x: 0, y: 0 };
  assert.equal(isWithinSegmentBand(point, point, point, 5, 10), false);
});

test('rotateAround preserves radius and turns by the given angle', () => {
  const rotated = rotateAround({ x: 0, y: 0 }, { x: 10, y: 0 }, Math.PI / 2);
  assert.ok(Math.abs(rotated.x) < 1e-9);
  assert.ok(Math.abs(rotated.y - 10) < 1e-9);
});

test('scaleSegment grows a segment about its midpoint', () => {
  const { start, end } = scaleSegment({ x: 0, y: 0 }, { x: 10, y: 0 }, 2);
  assert.deepEqual(start, { x: -5, y: 0 });
  assert.deepEqual(end, { x: 15, y: 0 });
});
