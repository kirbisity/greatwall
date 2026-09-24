import { mirror } from './helpers.js';

/**
 * Island Keep — the tenshu a fresh island city starts with.
 *
 * Two courses of battered ishigaki stone carry three plastered storeys, each
 * a step narrower than the one below and each roofed before the next rises
 * out of it. The storey heights are set against the roof depths on purpose:
 * a roof shallower than the wall above it leaves a band of white showing
 * over the eaves, which is what makes the keep read as storeys stacked
 * rather than as a pile of tile.
 */
export default {
  name: 'Island Keep',
  radius: 34,
  parts: [
    { type: 'ground', x: 0, y: 0, width: 46, depth: 46, material: 'court' },

    { type: 'block', x: 0, y: 0, width: 30, depth: 30, height: 3.2, material: 'ishigakiDark' },
    { type: 'block', x: 0, y: 0, width: 25, depth: 25, height: 2.8, base: 3.2, material: 'ishigaki' },

    {
      type: 'building', x: 0, y: 0, width: 19, depth: 19, height: 7, base: 6,
      material: 'shikkui', roof: { height: 2.2, overhang: 1.8, tiers: 2, material: 'roofSlate' },
    },
    {
      type: 'building', x: 0, y: 0, width: 14, depth: 14, height: 6, base: 13,
      material: 'shikkui', roof: { height: 2, overhang: 1.5, tiers: 2, material: 'roofSlate' },
    },
    {
      type: 'building', x: 0, y: 0, width: 9.5, depth: 9.5, height: 5, base: 19,
      material: 'shikkui', roof: { height: 2, overhang: 1.3, tiers: 2, material: 'roofSlateDark' },
    },

    // Timber gates through the stone, north and south.
    ...mirror({
      type: 'building', x: 0, y: 15, width: 11, depth: 5, height: 4.5,
      material: 'timberDark', roof: { height: 1.8, overhang: 1.4, tiers: 1, material: 'roofSlate' },
    }, 'y'),
  ],
};
