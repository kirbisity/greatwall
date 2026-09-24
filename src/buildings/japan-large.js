import { enclosure, mirror, quadrants, row } from './helpers.js';

const MOAT_RADIUS = 84;
const OUTER_RADIUS = 70;
const INNER_RADIUS = 44;

/**
 * Island Stronghold — the keep at five storeys, a walled inner bailey, and
 * an outer rampart standing in a moat. The barracks along the bailey are
 * what the garrison musters from.
 */
export default {
  name: 'Island Stronghold',
  radius: 88,
  parts: [
    { type: 'ground', x: 0, y: 0, width: MOAT_RADIUS * 2, depth: MOAT_RADIUS * 2, material: 'moat' },
    { type: 'ground', x: 0, y: 0, width: OUTER_RADIUS * 2 + 6, depth: OUTER_RADIUS * 2 + 6, material: 'court' },
    ...enclosure({ radius: OUTER_RADIUS, thickness: 6, height: 8, material: 'ishigaki' }),

    // Yagura on each corner of the outer rampart.
    ...quadrants({
      type: 'building', x: OUTER_RADIUS - 3, y: OUTER_RADIUS - 3, width: 13, depth: 13, height: 7,
      material: 'shikkui', roof: { height: 2.4, overhang: 1.7, tiers: 2, material: 'roofSlate' },
    }),

    { type: 'ground', x: 0, y: 0, width: INNER_RADIUS * 2, depth: INNER_RADIUS * 2, material: 'courtWhite' },
    ...enclosure({
      radius: INNER_RADIUS, thickness: 5, height: 10,
      material: 'ishigakiDark', gaps: ['north', 'south'],
    }),
    ...mirror({
      type: 'building', x: 0, y: INNER_RADIUS, width: 17, depth: 8, height: 7,
      material: 'timberDark', roof: { height: 2.2, overhang: 1.6, tiers: 1, material: 'roofSlate' },
    }, 'y'),

    // Barracks along the bailey, east and west.
    ...mirror({
      type: 'building', x: 33, y: 0, width: 8, depth: 15, height: 5,
      material: 'timber', roof: { height: 2.6, overhang: 1.6, tiers: 1, material: 'roofSlate' },
    }, 'x'),
    ...row(2, 22, {
      type: 'building', x: 0, y: -30, width: 13, depth: 8, height: 5,
      material: 'timber', roof: { height: 2.6, overhang: 1.6, tiers: 1, material: 'roofSlate' },
    }),

    // The great keep: a deep battered base carrying five storeys, on the
    // proportions japan-small.js explains.
    { type: 'block', x: 0, y: 0, width: 52, depth: 52, height: 4.2, material: 'ishigakiDark' },
    { type: 'block', x: 0, y: 0, width: 45, depth: 45, height: 3.8, base: 4.2, material: 'ishigaki' },
    {
      type: 'building', x: 0, y: 0, width: 36, depth: 36, height: 9, base: 8,
      material: 'shikkui', roof: { height: 3, overhang: 2.6, tiers: 2, material: 'roofSlate' },
    },
    {
      type: 'building', x: 0, y: 0, width: 29, depth: 29, height: 8, base: 17,
      material: 'shikkui', roof: { height: 2.8, overhang: 2.2, tiers: 2, material: 'roofSlate' },
    },
    {
      type: 'building', x: 0, y: 0, width: 23, depth: 23, height: 7, base: 25,
      material: 'shikkui', roof: { height: 2.6, overhang: 1.9, tiers: 2, material: 'roofSlate' },
    },
    {
      type: 'building', x: 0, y: 0, width: 17, depth: 17, height: 6, base: 32,
      material: 'shikkui', roof: { height: 2.4, overhang: 1.6, tiers: 2, material: 'roofSlate' },
    },
    {
      type: 'building', x: 0, y: 0, width: 11.5, depth: 11.5, height: 5, base: 38,
      material: 'shikkui', roof: { height: 2.4, overhang: 1.4, tiers: 2, material: 'roofSlateDark' },
    },
  ],
};
