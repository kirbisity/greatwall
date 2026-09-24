/** Island Castle — the keep grown to three storeys. See japan-small.js. */
export default {
  name: 'Island Castle',
  radius: 12,
  parts: [
    {
      type: 'building', x: 0, y: 0, width: 20, depth: 20, height: 7,
      material: 'shikkui', roof: { height: 2.3, overhang: 2, tiers: 2, material: 'roofSlate' },
    },
    {
      type: 'building', x: 0, y: 0, width: 14.5, depth: 14.5, height: 6, base: 7,
      material: 'shikkui', roof: { height: 2.1, overhang: 1.6, tiers: 2, material: 'roofSlate' },
    },
    {
      type: 'building', x: 0, y: 0, width: 9.5, depth: 9.5, height: 4.8, base: 13,
      material: 'shikkui', roof: { height: 2, overhang: 1.3, tiers: 2, material: 'roofSlateDark' },
    },
  ],
};
