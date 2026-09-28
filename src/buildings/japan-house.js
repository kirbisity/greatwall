/**
 * The buildings that fill an island city: small keeps of the same kind as
 * the castle at its centre, a storey or two apiece. A settlement here reads
 * as a cluster of little castles rather than a town of houses, which is the
 * whole look of the level.
 */
export default {
  name: 'Yagura',
  radius: 5.5,
  parts: [
    {
      type: 'building', x: 0, y: 0, width: 7, depth: 7, height: 3.6,
      material: 'shikkui', roof: { height: 1.35, overhang: 1.1, tiers: 2, material: 'roofSlate' },
    },
    {
      type: 'building', x: 0, y: 0, width: 4.8, depth: 4.8, height: 2.55, base: 3.6,
      material: 'shikkui', roof: { height: 1.3, overhang: 0.9, tiers: 2, material: 'roofSlateDark' },
    },
  ],
};
