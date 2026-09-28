import { STONE_MIN_LIGHT } from './palette.js';

/**
 * Island Keep — the little tenshu an island city starts with.
 *
 * A battered stone base carrying two plastered storeys, the upper one
 * stepped in. The base is part of the building, not the ground it stands
 * on: a Japanese keep is raised on its own stonework.
 *
 * The storey heights are set against the roof depths on purpose: a roof
 * shallower than the wall standing on it leaves a band of white showing
 * over the eaves, which is what makes a keep read as storeys stacked rather
 * than as a pile of tile. The larger keeps follow the same rule.
 */
const BASE_HEIGHT = 5.5;

export default {
  name: 'Island Keep',
  radius: 11,
  parts: [
    {
      type: 'batter', x: 0, y: 0, width: 14, depth: 14, height: BASE_HEIGHT,
      spread: 4, material: 'ishigaki', minLight: STONE_MIN_LIGHT,
    },
    {
      type: 'building', x: 0, y: 0, width: 11, depth: 11, height: 5, base: BASE_HEIGHT,
      material: 'shikkui', roof: { height: 1.6, overhang: 1.3, tiers: 2, material: 'roofSlate' },
    },
    {
      type: 'building', x: 0, y: 0, width: 7, depth: 7, height: 3.5, base: BASE_HEIGHT + 5,
      material: 'shikkui', roof: { height: 1.5, overhang: 1.05, tiers: 2, material: 'roofSlateDark' },
    },
  ],
};
