import { JAPAN_BUILDINGS } from './buildings/index.js';

/**
 * The campaigns, one short config apiece.
 *
 * Every level plays by the same rules and runs the same code; a level says
 * only what is different about it. `land` is patched over TERRAIN's defaults
 * (see Terrain), `spawnArc` narrows where raiders ride in from, `river`
 * lays water across the map, and `sea` cuts the land down to an island.
 * `buildings` and `guardTiers` swap what the city raises and who defends it. Leave a field out and the level gets whatever
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
    // Lower hills than the default: this is river country, not high ground.
    land: {
      mountainMinHeight: 34,
      mountainMaxHeight: 56,
    },
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
    // Dust hanging in the air the year round: the season still says how
    // thick the haze is, this says what colour it is and how much more of
    // it there is than a temperate sky would hold.
    mist: { color: '226, 194, 112', blend: 0.8, density: 1.9, start: 0.45 },
  },
  {
    id: 'shiro-island',
    name: 'The Island of the Keep',
    blurb: 'An island with no landward side. They come ashore wherever they please.',
    // The same green country as the northern march, but only as much of it
    // as fits between the beaches -- so the hills are smaller in kind, not
    // just fewer.
    land: {
      hillScale: 300,
      hillHeight: 46,
      mountainMinRadius: 34,
      mountainMaxRadius: 60,
      mountainMinHeight: 26,
      mountainMaxHeight: 44,
      mountainSkirt: 26,
    },
    sea: {
      // Land out to roughly this radius, give or take the coves `coast`
      // cuts into it. Little enough ground that a ring of wall is a real
      // choice about what to leave outside it.
      shore: 260,
      coast: 34,
      // How many times the coastline wanders on one walk round the island.
      coastScale: 2.4,
      // Over what distance the water deepens past the beach, and by how much.
      shelf: 140,
      depth: 26,
      color: '#2f5f86',
      bankColor: '#cbb98d',
    },
    // No landward flank: raiders row in and beach at the coves, so they
    // arrive from every quarter at once and start already ashore.
    landings: { count: 8, inset: 12 },
    buildings: JAPAN_BUILDINGS,
    guardTiers: {
      CC0: ['JG_ASHIGARU'],
      CC1: ['JG_ASHIGARU', 'JG_SAMURAI'],
      CC2: ['JG_ASHIGARU', 'JG_SAMURAI', 'JG_SOHEI'],
    },
    // Sea air: thinner and cooler than the dust, and never quite absent.
    mist: { color: '196, 214, 226', blend: 0.45, density: 1.25, start: 0.8 },
  },
];

export function levelAt(index) {
  return LEVELS[Math.max(0, Math.min(LEVELS.length - 1, index))];
}
