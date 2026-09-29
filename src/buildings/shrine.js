import { STONE_MIN_LIGHT } from './palette.js';
import { mirror } from './helpers.js';

/**
 * Wayside Shrine -- a vermilion torii marking the approach to a small hall,
 * in the same stone-and-plaster idiom as the island's keeps but built for
 * worship rather than defence.
 */
const POST_HEIGHT = 5.5;

export default {
  name: 'Wayside Shrine',
  radius: 9,
  parts: [
    // Torii: two posts, the lintel (kasagi) resting on them, and the
    // tie-beam (nuki) locking the two together below it.
    ...mirror({
      type: 'block', x: 3.2, y: -6, width: 0.8, depth: 0.8, height: POST_HEIGHT, material: 'vermilion',
    }, 'x'),
    {
      type: 'block', x: 0, y: -6, width: 8.4, depth: 1, height: 0.7, base: POST_HEIGHT - 0.2,
      material: 'vermilion',
    },
    {
      type: 'block', x: 0, y: -6, width: 7.2, depth: 0.6, height: 0.5, base: POST_HEIGHT - 1.6,
      material: 'vermilionDark',
    },
    // The hall itself, a step in from the gate, on its own battered base.
    {
      type: 'batter', x: 0, y: 0, width: 8, depth: 6, height: 1.4, spread: 0.8,
      material: 'ishigaki', minLight: STONE_MIN_LIGHT,
    },
    {
      type: 'building', x: 0, y: 0, width: 6, depth: 4.5, height: 3.5, base: 1.4,
      material: 'shikkui', roof: { height: 2.4, overhang: 1.2, tiers: 2, material: 'roofSlateDark' },
    },
  ],
};
