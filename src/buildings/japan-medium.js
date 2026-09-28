import { STONE_MIN_LIGHT } from './palette.js';

/** Island Castle — three storeys on a deeper stone base. See japan-small.js. */
const BASE_HEIGHT = 7;

export default {
  name: 'Island Castle',
  radius: 15.5,
  parts: [
    {
      type: 'batter', x: 0, y: 0, width: 21, depth: 21, height: BASE_HEIGHT,
      spread: 5, material: 'ishigaki', minLight: STONE_MIN_LIGHT,
    },
    {
      type: 'building', x: 0, y: 0, width: 16, depth: 16, height: 5.6, base: BASE_HEIGHT,
      material: 'shikkui', roof: { height: 1.85, overhang: 1.6, tiers: 2, material: 'roofSlate' },
    },
    {
      type: 'building', x: 0, y: 0, width: 11.5, depth: 11.5, height: 4.8, base: BASE_HEIGHT + 5.6,
      material: 'shikkui', roof: { height: 1.7, overhang: 1.3, tiers: 2, material: 'roofSlate' },
    },
    {
      type: 'building', x: 0, y: 0, width: 7.5, depth: 7.5, height: 3.8, base: BASE_HEIGHT + 10.4,
      material: 'shikkui', roof: { height: 1.6, overhang: 1.05, tiers: 2, material: 'roofSlateDark' },
    },
  ],
};
