import { enclosure, mirror } from './helpers.js';

/**
 * Wayside Temple -- a single-hall shrine standing apart from the city, its
 * roof tiled gold rather than the palace's own grey so it reads as a temple
 * rather than another wing of the court.
 */
export default {
  name: 'Wayside Temple',
  radius: 14,
  parts: [
    { type: 'ground', x: 0, y: 0, width: 24, depth: 20, material: 'court' },
    // A low perimeter wall, open to the south where the steps climb in.
    ...enclosure({
      radius: 11, thickness: 1.2, height: 1.8, material: 'rampartDark', gaps: ['south'],
    }),
    { type: 'block', x: 0, y: -1, width: 18, depth: 12, height: 1.2, material: 'plinth' },
    {
      type: 'building', x: 0, y: -1, width: 14, depth: 9, height: 6.5, base: 1.2,
      material: 'timber', roof: { height: 5, overhang: 2.2, material: 'roofTileImperial' },
    },
    // A pair of stone lanterns either side of the gate -- the gate itself
    // is the south wall's own gap (see `enclosure` above), and south is
    // -y here: the camera looks down +y (see Projection#createView), so
    // -y is the near side play actually approaches from.
    ...mirror({ type: 'block', x: 4, y: -8, width: 1.4, depth: 1.4, height: 2.4, material: 'plinth' }, 'x'),
  ],
};
