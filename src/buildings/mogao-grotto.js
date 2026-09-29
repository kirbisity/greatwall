import { row } from './helpers.js';

/**
 * Cliff Shrine -- a sandstone face pocked with small cave temples and
 * threaded by timber galleries, after the cliff-carved sanctuaries of the
 * Silk Road. Its own outcrop rather than a carving added to one of the
 * level's generated mesas, so it stands wherever the level places it,
 * independent of the noise those mesas scatter by.
 *
 * The cliff is built as short stacked tiers rather than one tall block.
 * Depth sorting here paints each face by the average depth of its own
 * corners, and for a single face spanning thirty units of height that
 * average is dominated by how far up or down the face runs, not by how
 * far forward it sits -- a cave set a few tenths of a unit proud of a
 * backing that tall reads as further away than the backing itself, since
 * the backing's own bottom edge alone outweighs it, and paints over it.
 * A tier only a little taller than the row of caves and galleries it
 * carries keeps that average close to the row's own height, so the row's
 * forward offset is what actually decides the sort. Faces built out on
 * -y throughout, since the camera looks down +y (see
 * Projection#createView's own `forward`) and a +y face would stand
 * behind solid rock from every angle play shows.
 */
const CLIFF_WIDTH = 34;
const CLIFF_DEPTH = 6;
const TALUS_HEIGHT = 4;
const CAVE_ROW_1 = TALUS_HEIGHT + 4;
const CAVE_ROW_2 = TALUS_HEIGHT + 14;
const GALLERY_1 = TALUS_HEIGHT + 7;
const GALLERY_2 = TALUS_HEIGHT + 17;
const CAP_TOP = TALUS_HEIGHT + 30;
// A little proud of the cliff's own -y face, and further still for the
// galleries -- see the depth-sorting note above for why this has to be
// more than a token offset. Checked against CAMERA's own elevation range
// (see config.js): the steepest angle it allows is the one that most
// favours the tier's own depth over the cave's, and 1.3 is what it takes
// to win the sort there; less clears the shallower end of the range but
// not the steep one.
const CAVE_FACE = -(CLIFF_DEPTH / 2 + 1.3);
const GALLERY_FACE = CAVE_FACE - 1.2;

function tier(base, top, material = 'sandstone') {
  return {
    type: 'block', x: 0, y: 0, width: CLIFF_WIDTH, depth: CLIFF_DEPTH, base, height: top - base, material,
  };
}

export default {
  name: 'Cliff Shrine',
  radius: 20,
  parts: [
    // Eroded material mounded at the cliff's own foot -- the only part of
    // it that tapers.
    {
      type: 'batter', x: 0, y: 0, width: CLIFF_WIDTH + 4, depth: CLIFF_DEPTH + 4, height: TALUS_HEIGHT,
      spread: 3, material: 'sandstone',
    },
    // Short tiers, each bracketing one row of caves and its gallery (or,
    // for the plain cap above the second row, nothing at all).
    tier(TALUS_HEIGHT, CAVE_ROW_1 - 1),
    tier(CAVE_ROW_1 - 1, GALLERY_1 + 2),
    tier(GALLERY_1 + 2, CAVE_ROW_2 - 1),
    tier(CAVE_ROW_2 - 1, GALLERY_2 + 2),
    tier(GALLERY_2 + 2, CAP_TOP),
    // Cave mouths in two uneven rows, let straight into the cliff's front.
    ...row(5, 6, {
      type: 'block', x: 0, y: CAVE_FACE, width: 2.2, depth: 0.3, height: 2.6,
      base: CAVE_ROW_1, material: 'caveDark',
    }),
    ...row(4, 7, {
      type: 'block', x: 3, y: CAVE_FACE, width: 2.2, depth: 0.3, height: 2.6,
      base: CAVE_ROW_2, material: 'caveDark',
    }),
    // Timber galleries strung along the face -- the walkways that actually
    // reach each grotto, one narrower than the other as a real ledge
    // carried further along the rock would be than a higher, shorter one.
    {
      type: 'block', x: 0, y: GALLERY_FACE, width: CLIFF_WIDTH - 3, depth: 1.8, height: 0.5,
      base: GALLERY_1, material: 'timber',
    },
    {
      type: 'block', x: 0, y: GALLERY_FACE, width: CLIFF_WIDTH - 8, depth: 1.8, height: 0.5,
      base: GALLERY_2, material: 'timberDark',
    },
    // A small shrine at the cliff's foot, where the climb actually starts.
    { type: 'block', x: 0, y: -9, width: 10, depth: 7, height: 1, material: 'plinth' },
    {
      type: 'building', x: 0, y: -9, width: 7, depth: 5, height: 4, base: 1,
      material: 'timberDark', roof: { height: 3, overhang: 1.4, material: 'roofTile' },
    },
  ],
};
