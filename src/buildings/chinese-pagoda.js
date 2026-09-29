/**
 * Wayside Pagoda -- a slender, storeyed tower, each tier a little narrower
 * and shorter than the one below it, tiled the same way the city's own
 * halls are but built to be seen from a distance rather than lived in.
 *
 * Each tier's own base sits on the storey below it, not on the roof that
 * oversails it -- the same way the island's keeps stack theirs (see
 * japan-small.js) -- which is what lets the lower roof visibly flare out
 * around the foot of the storey above it instead of the two fighting for
 * the same ground. The roof is kept short and its overhang modest on
 * purpose: a roof anywhere near as tall as its own storey, or reaching
 * much past it, swallows the wall below the next storey up and five
 * tiers read as one smooth cone rather than a stack of distinct storeys.
 */
const TIERS = 5;
const BASE_WIDTH = 5.5;
const STOREY_HEIGHT = 3;
const TAPER = 0.78;
const PLINTH_HEIGHT = 1;

function storeys() {
  const parts = [];
  let width = BASE_WIDTH;
  let base = PLINTH_HEIGHT;
  for (let tier = 0; tier < TIERS; tier += 1) {
    parts.push({
      type: 'building', x: 0, y: 0, width, depth: width, height: STOREY_HEIGHT, base,
      material: tier % 2 === 0 ? 'timber' : 'timberDark',
      roof: {
        height: STOREY_HEIGHT * 0.22, overhang: width * 0.14, tiers: 1, material: 'roofTileImperial',
      },
    });
    base += STOREY_HEIGHT;
    width *= TAPER;
  }
  return { parts, top: base };
}

const { parts: TIER_PARTS, top: SPIRE_BASE } = storeys();

export default {
  name: 'Wayside Pagoda',
  radius: 6,
  parts: [
    { type: 'block', x: 0, y: 0, width: BASE_WIDTH + 2, depth: BASE_WIDTH + 2, height: PLINTH_HEIGHT, material: 'plinth' },
    ...TIER_PARTS,
    // A thin finial capping the topmost roof.
    { type: 'block', x: 0, y: 0, width: 0.5, depth: 0.5, height: 3.5, base: SPIRE_BASE, material: 'roofRidge' },
  ],
};
