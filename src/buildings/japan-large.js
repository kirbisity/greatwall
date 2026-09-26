import { STONE_MIN_LIGHT } from './palette.js';

/** Island Stronghold — five storeys on a high stone base. See japan-small.js. */
const BASE_HEIGHT = 9.5;

export default {
  name: 'Island Stronghold',
  radius: 20,
  parts: [
    {
      type: 'batter', x: 0, y: 0, width: 27, depth: 27, height: BASE_HEIGHT,
      spread: 6.5, material: 'ishigaki', minLight: STONE_MIN_LIGHT,
    },
    {
      type: 'building', x: 0, y: 0, width: 21.5, depth: 21.5, height: 6.4, base: BASE_HEIGHT,
      material: 'shikkui', roof: { height: 2.15, overhang: 1.9, tiers: 2, material: 'roofSlate' },
    },
    {
      type: 'building', x: 0, y: 0, width: 17, depth: 17, height: 5.6, base: BASE_HEIGHT + 6.4,
      material: 'shikkui', roof: { height: 2, overhang: 1.6, tiers: 2, material: 'roofSlate' },
    },
    {
      type: 'building', x: 0, y: 0, width: 13, depth: 13, height: 4.8, base: BASE_HEIGHT + 12,
      material: 'shikkui', roof: { height: 1.85, overhang: 1.35, tiers: 2, material: 'roofSlate' },
    },
    {
      type: 'building', x: 0, y: 0, width: 9.5, depth: 9.5, height: 4, base: BASE_HEIGHT + 16.8,
      material: 'shikkui', roof: { height: 1.75, overhang: 1.1, tiers: 2, material: 'roofSlate' },
    },
    {
      type: 'building', x: 0, y: 0, width: 6.5, depth: 6.5, height: 3.2, base: BASE_HEIGHT + 20.8,
      material: 'shikkui', roof: { height: 1.7, overhang: 0.95, tiers: 2, material: 'roofSlateDark' },
    },
  ],
};
