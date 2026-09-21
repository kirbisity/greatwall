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
