/**
 * The campaigns, one short config apiece.
 *
 * Every level plays by the same rules and runs the same code; a level says
 * only what is different about it. `land` is patched over TERRAIN's defaults
 * (see Terrain), `spawnArc` narrows where raiders ride in from, and `river`
 * lays water across the map. Leave a field out and the level gets whatever
 * the game does by default, which is what makes adding another level a
 * matter of a dozen lines rather than a fork of the game.
 */

// Sand, sun-bleached rock and dry clay, in the same four slots the green
// land uses -- so nothing downstream needs to know which world it is in.
const DESERT = {
  grassColor: '#d9c188',
  mossColor: '#c9ab6b',
  dirtColor: '#b08d57',
  rockColor: '#a1907a',
  // Dunes rather than hills: one long wavelength, taller, and smoothed of
  // the fine grain that reads as turf underfoot.
  hillScale: 420,
  hillHeight: 72,
  detailScale: 210,
  detailHeight: 1.5,
  slopeRelief: 2.6,
  // Mesas: broader and blunter than the green land's peaks, with a
  // steadier outline.
  mountainMinRadius: 70,
  mountainMaxRadius: 140,
  mountainMinHeight: 40,
  mountainMaxHeight: 70,
  mountainShapeScale: 1.3,
  mountainSkirt: 55,
  // Nothing grows here, and nothing turns in autumn.
  forestThreshold: 1,
  turnsInAutumn: false,
};

export const LEVELS = [
  {
    id: 'northern-march',
    name: 'The Northern March',
    blurb: 'They ride down out of the north. The river guards your back.',
    // Raiders muster along the northern skyline only, so the south is a
    // flank you never have to hold -- see Game#spawnRaider.
    spawnArc: { centre: 90, spread: 70 },
    river: {
      y: -280,
      halfWidth: 46,
      // How far the channel wanders off that line, and over what stretch,
      // so it reads as a river rather than a ruled canal.
      meander: 58,
      meanderScale: 420,
      depth: 16,
      color: '#3d6e8e',
      bankColor: '#8d8460',
    },
  },
  {
    id: 'dust-sea',
    name: 'The Dust Sea',
    blurb: 'The same war, fought over sand. They come from every horizon.',
    land: DESERT,
  },
];

export function levelAt(index) {
  return LEVELS[Math.max(0, Math.min(LEVELS.length - 1, index))];
}
