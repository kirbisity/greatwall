import { DEFAULT_ROOF, MATERIALS } from './buildings/palette.js';

// Chinese roofs flare: shallow at the eave, steep at the ridge. Raising the
// height by t^ROOF_CURVE gives that concave profile across the tiers.
const ROOF_CURVE = 1.5;
// The ridge runs along the width and is shorter than it, as on a hip roof.
const RIDGE_WIDTH_FRACTION = 0.55;
// Ground panels sit just above z=0 so they never fight the terrain.
const GROUND_LIFT = 0.05;
// The ridge beam is the feature that makes a roof read as Chinese, so it is
// lightened off the tile colour rather than configured per building.
const RIDGE_LIGHTEN = 1.4;
const RIDGE_DEPTH = 1.1;
const RIDGE_HEIGHT = 1.0;

function corners(centreX, centreY, halfWidth, halfDepth, z) {
  return [
    { x: centreX - halfWidth, y: centreY - halfDepth, z },
    { x: centreX + halfWidth, y: centreY - halfDepth, z },
    { x: centreX + halfWidth, y: centreY + halfDepth, z },
    { x: centreX - halfWidth, y: centreY + halfDepth, z },
  ];
}

/** Top face plus four walls, wound so every normal points outwards. */
function boxFaces(centreX, centreY, halfWidth, halfDepth, bottom, top, material) {
  const base = corners(centreX, centreY, halfWidth, halfDepth, bottom);
  const lid = corners(centreX, centreY, halfWidth, halfDepth, top);
  const faces = [{ points: lid, material }];
  for (let i = 0; i < 4; i += 1) {
    const j = (i + 1) % 4;
    faces.push({ points: [base[i], base[j], lid[j], lid[i]], material });
  }
  return faces;
}

function roofRing(centreX, centreY, halfWidth, halfDepth, baseZ, height, t) {
  return corners(
    centreX,
    centreY,
    halfWidth * (1 - (1 - RIDGE_WIDTH_FRACTION) * t),
    halfDepth * (1 - t),
    baseZ + height * Math.pow(t, ROOF_CURVE),
  );
}

/**
 * A tiered hip roof. The eave oversails the body, and each tier narrows towards
 * a ridge line, so the silhouette curves instead of forming a flat-sided cone.
 */
function roofFaces(centreX, centreY, halfWidth, halfDepth, baseZ, roof, material) {
  const eaveWidth = halfWidth + roof.overhang;
  const eaveDepth = halfDepth + roof.overhang;
  const faces = [];
  for (let tier = 0; tier < roof.tiers; tier += 1) {
    const lower = roofRing(centreX, centreY, eaveWidth, eaveDepth, baseZ, roof.height, tier / roof.tiers);
    const upper = roofRing(centreX, centreY, eaveWidth, eaveDepth, baseZ, roof.height, (tier + 1) / roof.tiers);
    for (let i = 0; i < 4; i += 1) {
      const j = (i + 1) % 4;
      faces.push({ points: [lower[i], lower[j], upper[j], upper[i]], material });
    }
  }

  const ridgeZ = baseZ + roof.height;
  const ridgeHalfWidth = eaveWidth * RIDGE_WIDTH_FRACTION;
  faces.push(...boxFaces(centreX, centreY, ridgeHalfWidth, RIDGE_DEPTH / 2,
    ridgeZ - RIDGE_HEIGHT / 2, ridgeZ + RIDGE_HEIGHT / 2, lighten(material, RIDGE_LIGHTEN)));
  return faces;
}

function materialOf(name, fallback) {
  return MATERIALS[name] ?? MATERIALS[fallback];
}

function lighten(material, factor) {
  return material.map((channel) => Math.min(255, channel * factor));
}

function compilePart(part) {
  const base = part.base ?? 0;
  const halfWidth = part.width / 2;
  const halfDepth = part.depth / 2;

  if (part.type === 'ground') {
    return [{
      points: corners(part.x, part.y, halfWidth, halfDepth, base + GROUND_LIFT),
      material: materialOf(part.material, 'court'),
      ground: true,
    }];
  }

  if (part.type === 'block') {
    return boxFaces(part.x, part.y, halfWidth, halfDepth, base, base + part.height,
      materialOf(part.material, 'rampart'));
  }

  // A building is a body with a tiered roof resting on it.
  const roof = { ...DEFAULT_ROOF, ...(part.roof ?? {}) };
  const bodyTop = base + part.height;
  return [
    ...boxFaces(part.x, part.y, halfWidth, halfDepth, base, bodyTop, materialOf(part.material, 'plaster')),
    ...roofFaces(part.x, part.y, halfWidth, halfDepth, bodyTop, roof, materialOf(roof.material, 'roofTile')),
  ];
}

/**
 * Flatten a building definition into world-space faces around the origin.
 * Pure and position-independent, so a result can be cached per building type
 * and simply offset to wherever the castle stands.
 *
 * Faces marked `ground` are flat paving. They are painted in definition order
 * before anything else: depth sorting them by centroid would let a wide
 * courtyard cover the buildings standing on its far side, and nested panels
 * that share a centre have no meaningful depth order anyway.
 */
export function compileStructure(definition) {
  const faces = [];
  for (const part of definition.parts) {
    faces.push(...compilePart(part));
  }
  return faces;
}
