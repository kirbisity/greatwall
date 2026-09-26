/** Island Stronghold — five storeys on a high stone base. See japan-small.js. */
import { STONE_MIN_LIGHT } from './palette.js';

const BASE_HEIGHT = 12;

export default {
  name: 'Island Stronghold',
  radius: 25,
  parts: [
    {
      type: 'batter', x: 0, y: 0, width: 34, depth: 34, height: BASE_HEIGHT,
      spread: 8, material: 'ishigaki', minLight: STONE_MIN_LIGHT,
    },
    {
      type: 'building', x: 0, y: 0, width: 27, depth: 27, height: 8, base: BASE_HEIGHT,
      material: 'shikkui', roof: { height: 2.7, overhang: 2.4, tiers: 2, material: 'roofSlate' },
    },
    {
      type: 'building', x: 0, y: 0, width: 21.5, depth: 21.5, height: 7, base: BASE_HEIGHT + 8,
      material: 'shikkui', roof: { height: 2.5, overhang: 2, tiers: 2, material: 'roofSlate' },
    },
    {
      type: 'building', x: 0, y: 0, width: 16.5, depth: 16.5, height: 6, base: BASE_HEIGHT + 15,
      material: 'shikkui', roof: { height: 2.3, overhang: 1.7, tiers: 2, material: 'roofSlate' },
    },
    {
      type: 'building', x: 0, y: 0, width: 12, depth: 12, height: 5, base: BASE_HEIGHT + 21,
      material: 'shikkui', roof: { height: 2.2, overhang: 1.4, tiers: 2, material: 'roofSlate' },
    },
    {
      type: 'building', x: 0, y: 0, width: 8, depth: 8, height: 4, base: BASE_HEIGHT + 26,
      material: 'shikkui', roof: { height: 2.1, overhang: 1.2, tiers: 2, material: 'roofSlateDark' },
    },
  ],
};
