import { mirror } from './helpers.js';

/**
 * Small Complex — a compact courtyard arrangement: a central tile-roofed
 * palace hall flanked by four outer buildings on the cardinal points, each
 * joined to the centre by a short grey path.
 */
export default {
  name: 'Small Complex',
  radius: 28,
  parts: [
    { type: 'ground', x: 0, y: 0, width: 46, depth: 46, material: 'court' },

    // Paths radiating to each outer building.
    ...mirror({ type: 'ground', x: 0, y: 12, width: 4, depth: 12, material: 'path' }, 'y'),
    ...mirror({ type: 'ground', x: 12, y: 0, width: 12, depth: 4, material: 'path' }, 'x'),

    // Central hall on a low plinth.
    { type: 'block', x: 0, y: 0, width: 24, depth: 18, height: 1.2, material: 'plinth' },
    {
      type: 'building', x: 0, y: 0, width: 19, depth: 13, height: 6, base: 1.2,
      material: 'timber', roof: { height: 5, overhang: 2, material: 'roofTile' },
    },

    // Four outer buildings, north and south deeper than east and west.
    ...mirror({
      type: 'building', x: 0, y: 21, width: 18, depth: 7, height: 4,
      material: 'plaster', roof: { height: 3, overhang: 1.3 },
    }, 'y'),
    ...mirror({
      type: 'building', x: 21, y: 0, width: 7, depth: 16, height: 4,
      material: 'plaster', roof: { height: 3, overhang: 1.3 },
    }, 'x'),
  ],
};
