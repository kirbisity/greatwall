/**
 * Island Keep — the little tenshu an island city starts with.
 *
 * One building and nothing else: no stone base, no court, no wall. Two
 * plastered storeys under slate, the upper one stepped in, which is about
 * as small as a keep can be and still read as one.
 *
 * The storey heights are set against the roof depths on purpose: a roof
 * shallower than the wall standing on it leaves a band of white showing
 * over the eaves, which is what makes a keep read as storeys stacked rather
 * than as a pile of tile. The larger keeps follow the same rule.
 */
export default {
  name: 'Island Keep',
  radius: 9,
  parts: [
    {
      type: 'building', x: 0, y: 0, width: 14, depth: 14, height: 6,
      material: 'shikkui', roof: { height: 2, overhang: 1.6, tiers: 2, material: 'roofSlate' },
    },
    {
      type: 'building', x: 0, y: 0, width: 9, depth: 9, height: 4.4, base: 6,
      material: 'shikkui', roof: { height: 1.9, overhang: 1.3, tiers: 2, material: 'roofSlateDark' },
    },
  ],
};
