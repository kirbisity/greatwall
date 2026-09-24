/** Island Stronghold — the keep at five storeys. See japan-small.js. */
export default {
  name: 'Island Stronghold',
  radius: 16,
  parts: [
    {
      type: 'building', x: 0, y: 0, width: 27, depth: 27, height: 8,
      material: 'shikkui', roof: { height: 2.7, overhang: 2.4, tiers: 2, material: 'roofSlate' },
    },
    {
      type: 'building', x: 0, y: 0, width: 21.5, depth: 21.5, height: 7, base: 8,
      material: 'shikkui', roof: { height: 2.5, overhang: 2, tiers: 2, material: 'roofSlate' },
    },
    {
      type: 'building', x: 0, y: 0, width: 16.5, depth: 16.5, height: 6, base: 15,
      material: 'shikkui', roof: { height: 2.3, overhang: 1.7, tiers: 2, material: 'roofSlate' },
    },
    {
      type: 'building', x: 0, y: 0, width: 12, depth: 12, height: 5, base: 21,
      material: 'shikkui', roof: { height: 2.2, overhang: 1.4, tiers: 2, material: 'roofSlate' },
    },
    {
      type: 'building', x: 0, y: 0, width: 8, depth: 8, height: 4, base: 26,
      material: 'shikkui', roof: { height: 2.1, overhang: 1.2, tiers: 2, material: 'roofSlateDark' },
    },
  ],
};
