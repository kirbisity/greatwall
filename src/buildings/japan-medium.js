/** Island Castle — three storeys on a deeper stone base. See japan-small.js. */
import { STONE_MIN_LIGHT } from './palette.js';

const BASE_HEIGHT = 9;

export default {
  name: 'Island Castle',
  radius: 19,
  parts: [
    {
      type: 'batter', x: 0, y: 0, width: 26, depth: 26, height: BASE_HEIGHT,
      spread: 6, material: 'ishigaki', minLight: STONE_MIN_LIGHT,
    },
    {
      type: 'building', x: 0, y: 0, width: 20, depth: 20, height: 7, base: BASE_HEIGHT,
      material: 'shikkui', roof: { height: 2.3, overhang: 2, tiers: 2, material: 'roofSlate' },
    },
    {
      type: 'building', x: 0, y: 0, width: 14.5, depth: 14.5, height: 6, base: BASE_HEIGHT + 7,
      material: 'shikkui', roof: { height: 2.1, overhang: 1.6, tiers: 2, material: 'roofSlate' },
    },
    {
      type: 'building', x: 0, y: 0, width: 9.5, depth: 9.5, height: 4.8, base: BASE_HEIGHT + 13,
      material: 'shikkui', roof: { height: 2, overhang: 1.3, tiers: 2, material: 'roofSlateDark' },
    },
  ],
};
