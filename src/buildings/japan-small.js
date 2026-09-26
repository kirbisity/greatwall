/**
 * Island Keep — the little tenshu an island city starts with.
 *
 * A battered stone base carrying two plastered storeys, the upper one
 * stepped in. The base is part of the building, not the ground it stands
 * on: a Japanese keep is raised on its own stonework, and modelling that as
 * terrain put the whole city on a shelf instead.
 *
 * The storey heights are set against the roof depths on purpose: a roof
 * shallower than the wall standing on it leaves a band of white showing
 * over the eaves, which is what makes a keep read as storeys stacked rather
 * than as a pile of tile. The larger keeps follow the same rule.
 */
import { STONE_MIN_LIGHT } from './palette.js';

const BASE_HEIGHT = 7;

export default {
  name: 'Island Keep',
  radius: 14,
  parts: [
    {
      type: 'batter', x: 0, y: 0, width: 18, depth: 18, height: BASE_HEIGHT,
      spread: 5, material: 'ishigaki', minLight: STONE_MIN_LIGHT,
    },
    {
      type: 'building', x: 0, y: 0, width: 14, depth: 14, height: 6, base: BASE_HEIGHT,
      material: 'shikkui', roof: { height: 2, overhang: 1.6, tiers: 2, material: 'roofSlate' },
    },
    {
      type: 'building', x: 0, y: 0, width: 9, depth: 9, height: 4.4, base: BASE_HEIGHT + 6,
      material: 'shikkui', roof: { height: 1.9, overhang: 1.3, tiers: 2, material: 'roofSlateDark' },
    },
  ],
};
