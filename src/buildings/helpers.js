/** Layout helpers. Palace plans are symmetric, so definitions stay declarative. */

/** The same part mirrored to all four quadrants. */
export function quadrants(part) {
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => ({
    ...part,
    x: part.x * sx,
    y: part.y * sy,
  }));
}

/** The same part on opposite sides of an axis. */
export function mirror(part, axis = 'y') {
  return [1, -1].map((sign) => ({
    ...part,
    x: axis === 'x' ? part.x * sign : part.x,
    y: axis === 'y' ? part.y * sign : part.y,
  }));
}

/** `count` copies evenly spaced along the east-west axis. */
export function row(count, spacing, part) {
  const offset = (count - 1) / 2;
  return Array.from({ length: count }, (unused, index) => ({
    ...part,
    x: part.x + (index - offset) * spacing,
  }));
}

/** Four walls enclosing a square, each a block of the given thickness. */
export function enclosure({ radius, thickness, height, material, gaps = [] }) {
  const sides = [
    { name: 'south', x: 0, y: -radius, width: radius * 2 + thickness, depth: thickness },
    { name: 'north', x: 0, y: radius, width: radius * 2 + thickness, depth: thickness },
    { name: 'west', x: -radius, y: 0, width: thickness, depth: radius * 2 - thickness },
    { name: 'east', x: radius, y: 0, width: thickness, depth: radius * 2 - thickness },
  ];
  return sides
    .filter((side) => !gaps.includes(side.name))
    .map(({ name, ...side }) => ({ type: 'block', ...side, height, material }));
}

/**
 * The same plan drawn at another size.
 *
 * Every length in a part is a world measurement, so one factor over all of
 * them keeps the proportions a keep was designed with -- the batter of its
 * base, the step between storeys, the reach of its eaves. Lets a definition
 * stay written at the size it reads best and be stood down where it is used.
 */
export function scalePlan(definition, factor) {
  return {
    ...definition,
    radius: definition.radius * factor,
    parts: definition.parts.map((part) => scalePart(part, factor)),
  };
}

const SCALED_LENGTHS = ['x', 'y', 'width', 'depth', 'height', 'base', 'spread'];

function scalePart(part, factor) {
  const scaled = { ...part };
  for (const name of SCALED_LENGTHS) {
    if (typeof part[name] === 'number') {
      scaled[name] = part[name] * factor;
    }
  }
  if (part.roof) {
    scaled.roof = {
      ...part.roof,
      height: part.roof.height * factor,
      overhang: part.roof.overhang * factor,
    };
  }
  return scaled;
}
