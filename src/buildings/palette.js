/** Materials shared by every building definition, tuned for the bronze UI. */
export const MATERIALS = {
  moat: [58, 92, 116],
  water: [72, 112, 138],
  court: [206, 198, 180],
  courtWhite: [226, 222, 209],
  path: [150, 145, 133],
  rampart: [158, 148, 126],
  rampartDark: [126, 117, 98],
  platform: [150, 149, 146],
  plinth: [176, 172, 163],
  timber: [150, 74, 52],
  timberDark: [116, 56, 40],
  plaster: [214, 203, 180],
  roofTile: [108, 122, 110],
  roofTileImperial: [172, 130, 50],
  roofRidge: [78, 88, 80],
  // For the island keep: pale lime plaster over a sloped stone base, under
  // dark slate tile.
  ishigaki: [138, 132, 118],
  ishigakiDark: [112, 106, 94],
  shikkui: [232, 228, 216],
  roofSlate: [74, 84, 92],
  roofSlateDark: [58, 66, 74],
};

export const DEFAULT_ROOF = { height: 4.2, overhang: 1.6, tiers: 3, material: 'roofTile' };
