import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILDINGS } from '../src/buildings/index.js';
import { MATERIALS } from '../src/buildings/palette.js';
import { enclosure, mirror, quadrants, row } from '../src/buildings/helpers.js';
import { compileStructure } from '../src/structures.js';
import { CASTLE_TYPES } from '../src/config.js';
import { centroid, facesCamera, createView, normalOf } from '../src/projection.js';

const entries = Object.entries(BUILDINGS);

test('every castle type has a building', () => {
  for (const typeId of Object.keys(CASTLE_TYPES)) {
    assert.ok(BUILDINGS[typeId], `no building defined for ${typeId}`);
  }
});

for (const [typeId, definition] of entries) {
  test(`${typeId} (${definition.name}) compiles to drawable faces`, () => {
    const faces = compileStructure(definition);
    assert.ok(faces.length > 20, `only ${faces.length} faces`);
    for (const face of faces) {
      assert.ok(face.points.length >= 3, 'face needs at least three points');
      assert.ok(Array.isArray(face.material) && face.material.length === 3, 'material is rgb');
      for (const channel of face.material) {
        assert.ok(channel >= 0 && channel <= 255, `channel out of range: ${channel}`);
      }
    }
  });

  test(`${typeId} names only materials that exist`, () => {
    const known = new Set(Object.keys(MATERIALS));
    for (const part of definition.parts) {
      if (part.material) {
        assert.ok(known.has(part.material), `unknown material ${part.material}`);
      }
      if (part.roof?.material) {
        assert.ok(known.has(part.roof.material), `unknown roof material ${part.roof.material}`);
      }
    }
  });

  // The renderer culls a castle on this radius, so anything outside it would
  // vanish when the centre leaves the screen.
  test(`${typeId} keeps every part inside its declared radius`, () => {
    for (const part of definition.parts) {
      const reach = Math.max(
        Math.abs(part.x) + part.width / 2,
        Math.abs(part.y) + part.depth / 2,
      );
      assert.ok(reach <= definition.radius + 0.001,
        `${part.type} at ${part.x},${part.y} reaches ${reach.toFixed(1)} > radius ${definition.radius}`);
    }
  });

  test(`${typeId} is plain data, so it could be moved to JSON`, () => {
    const copy = JSON.parse(JSON.stringify(definition));
    assert.deepEqual(copy, definition);
  });

  test(`${typeId} marks paving so it is painted beneath the buildings`, () => {
    const faces = compileStructure(definition);
    const paving = faces.filter((face) => face.ground);
    assert.ok(paving.length > 0, 'expected at least one ground panel');
    for (const face of paving) {
      assert.ok(face.points.every((point) => point.z < 0.5), 'paving lies on the ground');
    }
  });
}

// Guards the same winding bug the wall prisms had: an inward-facing roof would
// be culled and the building would render hollow.
test('roof faces turn outwards, so none is culled from directly above', () => {
  const view = createView({ focus: { x: 0, y: 0 }, distance: 400, elevation: 89, width: 1200, height: 800 });
  for (const [typeId, definition] of entries) {
    const faces = compileStructure(definition);
    const visible = faces.filter((face) => {
      const normal = normalOf(face.points[0], face.points[1], face.points[2]);
      return facesCamera(view, normal, centroid(face.points));
    });
    assert.ok(visible.length > faces.length * 0.25,
      `${typeId}: only ${visible.length} of ${faces.length} faces visible from overhead`);
  }
});

test('quadrants mirrors a part into all four corners', () => {
  const parts = quadrants({ type: 'block', x: 10, y: 20, width: 1, depth: 1, height: 1 });
  assert.equal(parts.length, 4);
  assert.deepEqual(
    parts.map((part) => `${part.x},${part.y}`).sort(),
    ['-10,-20', '-10,20', '10,-20', '10,20'],
  );
});

test('mirror flips across one axis only', () => {
  const [north, south] = mirror({ type: 'block', x: 3, y: 7, width: 1, depth: 1, height: 1 }, 'y');
  assert.deepEqual([north.x, north.y], [3, 7]);
  assert.deepEqual([south.x, south.y], [3, -7]);
});

test('row spaces parts evenly about their centre', () => {
  const parts = row(3, 10, { type: 'block', x: 0, y: 5, width: 1, depth: 1, height: 1 });
  assert.deepEqual(parts.map((part) => part.x), [-10, 0, 10]);
  assert.ok(parts.every((part) => part.y === 5));
});

test('enclosure walls a square and honours gaps', () => {
  assert.equal(enclosure({ radius: 20, thickness: 2, height: 5 }).length, 4);
  const open = enclosure({ radius: 20, thickness: 2, height: 5, gaps: ['north', 'south'] });
  assert.equal(open.length, 2);
});
