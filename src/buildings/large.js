import { enclosure, mirror, quadrants, row } from './helpers.js';

const MOAT_RADIUS = 84;
const OUTER_WALL_RADIUS = 70;
const INNER_WALL_RADIUS = 46;

/**
 * Large City — a palace complex ringed by a blue moat and an outer stone wall.
 * Inside, a fortified wall with corner towers and gates north and south, six
 * smaller roofed buildings along the upper courtyard, and the great hall on an
 * elevated grey stone platform.
 */
export default {
  name: 'Large City',
  radius: 88,
  parts: [
    // Moat, then the dry ground it encircles.
    { type: 'ground', x: 0, y: 0, width: MOAT_RADIUS * 2, depth: MOAT_RADIUS * 2, material: 'moat' },
    { type: 'ground', x: 0, y: 0, width: OUTER_WALL_RADIUS * 2 + 6, depth: OUTER_WALL_RADIUS * 2 + 6, material: 'court' },

    // Outer stone wall.
    ...enclosure({ radius: OUTER_WALL_RADIUS, thickness: 6, height: 7, material: 'rampart' }),

    { type: 'ground', x: 0, y: 0, width: INNER_WALL_RADIUS * 2, depth: INNER_WALL_RADIUS * 2, material: 'courtWhite' },

    // Inner fortified wall, open north and south where the gates stand.
    ...enclosure({
      radius: INNER_WALL_RADIUS, thickness: 5, height: 9,
      material: 'rampartDark', gaps: ['north', 'south'],
    }),
    // Wall stubs either side of each gateway.
    ...quadrants({ type: 'block', x: 32, y: INNER_WALL_RADIUS, width: 33, depth: 5, height: 9, material: 'rampartDark' }),

    // Corner towers.
    ...quadrants({
      type: 'building', x: INNER_WALL_RADIUS, y: INNER_WALL_RADIUS, width: 12, depth: 12, height: 13,
      material: 'rampartDark', roof: { height: 6, overhang: 2.4, material: 'roofRidge' },
    }),

    // Gatehouses north and south.
    ...mirror({
      type: 'building', x: 0, y: INNER_WALL_RADIUS, width: 26, depth: 12, height: 12,
      material: 'timberDark', roof: { height: 7, overhang: 3, material: 'roofTileImperial' },
    }, 'y'),

    // Six smaller roofed buildings along the upper courtyard.
    ...row(3, 26, {
      type: 'building', x: 0, y: 32, width: 18, depth: 9, height: 5.5,
      material: 'plaster', roof: { height: 4, overhang: 1.8 },
    }),
    ...row(3, 26, {
      type: 'building', x: 0, y: 19, width: 18, depth: 9, height: 5.5,
      material: 'plaster', roof: { height: 4, overhang: 1.8 },
    }),

    // The great hall on its elevated grey stone platform.
    { type: 'block', x: 0, y: -14, width: 58, depth: 40, height: 3.2, material: 'platform' },
    { type: 'block', x: 0, y: -14, width: 50, depth: 34, height: 5, material: 'plinth' },
    {
      type: 'building', x: 0, y: -14, width: 42, depth: 27, height: 13, base: 5,
      material: 'timber', roof: { height: 12, overhang: 4.2, material: 'roofTileImperial' },
    },
  ],
};
