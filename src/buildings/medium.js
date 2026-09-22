import { mirror, row } from './helpers.js';

/**
 * Medium Compound — a walled square compound. A central roofed palace hall
 * stands on a white tiled courtyard with gate buildings north and south,
 * ringed by eight separate tile-roofed buildings forming the outer boundary.
 */
export default {
  name: 'Medium Compound',
  radius: 58,
  parts: [
    { type: 'ground', x: 0, y: 0, width: 104, depth: 104, material: 'courtWhite' },

    // Central hall on a two-step plinth.
    { type: 'block', x: 0, y: 0, width: 42, depth: 32, height: 1.4, material: 'plinth' },
    { type: 'block', x: 0, y: 0, width: 36, depth: 27, height: 2.6, material: 'platform' },
    {
      type: 'building', x: 0, y: 0, width: 30, depth: 21, height: 9, base: 2.6,
      material: 'timber', roof: { height: 8, overhang: 3, material: 'roofTileImperial' },
    },

    // Gate buildings closing the north and south approaches.
    ...mirror({
      type: 'building', x: 0, y: 44, width: 22, depth: 9, height: 6,
      material: 'timberDark', roof: { height: 4.5, overhang: 2 },
    }, 'y'),

    // Eight boundary buildings: three along each of north and south, one each side.
    ...row(3, 30, {
      type: 'building', x: 0, y: 32, width: 20, depth: 8, height: 4.5,
      material: 'plaster', roof: { height: 3.4, overhang: 1.5 },
    }).filter((part) => part.x !== 0),
    ...row(3, 30, {
      type: 'building', x: 0, y: -32, width: 20, depth: 8, height: 4.5,
      material: 'plaster', roof: { height: 3.4, overhang: 1.5 },
    }).filter((part) => part.x !== 0),
    ...mirror({
      type: 'building', x: 40, y: 16, width: 9, depth: 22, height: 4.5,
      material: 'plaster', roof: { height: 3.4, overhang: 1.5 },
    }, 'x'),
    ...mirror({
      type: 'building', x: 40, y: -16, width: 9, depth: 22, height: 4.5,
      material: 'plaster', roof: { height: 3.4, overhang: 1.5 },
    }, 'x'),
  ],
};
