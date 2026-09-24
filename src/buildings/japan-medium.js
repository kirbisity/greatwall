import { enclosure, mirror, quadrants } from './helpers.js';

const WALL_RADIUS = 44;

/**
 * Island Castle — the keep grown to four storeys on a broader base, ringed
 * by a stone wall with corner yagura and a gate to north and south.
 */
export default {
  name: 'Island Castle',
  radius: 58,
  parts: [
    { type: 'ground', x: 0, y: 0, width: WALL_RADIUS * 2 + 8, depth: WALL_RADIUS * 2 + 8, material: 'court' },
    ...enclosure({
      radius: WALL_RADIUS, thickness: 5, height: 7,
      material: 'ishigaki', gaps: ['north', 'south'],
    }),

    // Corner turrets on the wall.
    ...quadrants({
      type: 'building', x: WALL_RADIUS - 2, y: WALL_RADIUS - 2, width: 11, depth: 11, height: 7,
      material: 'shikkui', roof: { height: 2.2, overhang: 1.5, tiers: 2, material: 'roofSlate' },
    }),

    // Gatehouses where the wall opens.
    ...mirror({
      type: 'building', x: 0, y: WALL_RADIUS, width: 15, depth: 7, height: 6,
      material: 'timberDark', roof: { height: 2, overhang: 1.5, tiers: 1, material: 'roofSlate' },
    }, 'y'),

    { type: 'ground', x: 0, y: 0, width: 54, depth: 54, material: 'courtWhite' },

    // Battered base, then four storeys, on the proportions japan-small.js
    // explains: each roof shallower than the wall standing on it.
    { type: 'block', x: 0, y: 0, width: 40, depth: 40, height: 3.6, material: 'ishigakiDark' },
    { type: 'block', x: 0, y: 0, width: 34, depth: 34, height: 3.2, base: 3.6, material: 'ishigaki' },
    {
      type: 'building', x: 0, y: 0, width: 27, depth: 27, height: 8, base: 6.8,
      material: 'shikkui', roof: { height: 2.6, overhang: 2.2, tiers: 2, material: 'roofSlate' },
    },
    {
      type: 'building', x: 0, y: 0, width: 21, depth: 21, height: 7, base: 14.8,
      material: 'shikkui', roof: { height: 2.4, overhang: 1.9, tiers: 2, material: 'roofSlate' },
    },
    {
      type: 'building', x: 0, y: 0, width: 15.5, depth: 15.5, height: 6, base: 21.8,
      material: 'shikkui', roof: { height: 2.2, overhang: 1.6, tiers: 2, material: 'roofSlate' },
    },
    {
      type: 'building', x: 0, y: 0, width: 10.5, depth: 10.5, height: 5, base: 27.8,
      material: 'shikkui', roof: { height: 2.2, overhang: 1.4, tiers: 2, material: 'roofSlateDark' },
    },
  ],
};
