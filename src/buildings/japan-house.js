/**
 * The buildings that fill an island city: small keeps of the same kind as
 * the castle at its centre, a storey or two apiece. A settlement here reads
 * as a cluster of little castles rather than a town of houses, which is the
 * whole look of the level.
 */
export default {
  name: 'Yagura',
  radius: 7,
  parts: [
    {
      type: 'building', x: 0, y: 0, width: 9, depth: 9, height: 4.5,
      material: 'shikkui', roof: { height: 1.7, overhang: 1.4, tiers: 2, material: 'roofSlate' },
    },
    {
      type: 'building', x: 0, y: 0, width: 6, depth: 6, height: 3.2, base: 4.5,
      material: 'shikkui', roof: { height: 1.6, overhang: 1.1, tiers: 2, material: 'roofSlateDark' },
    },
  ],
};
