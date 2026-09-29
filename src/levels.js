import {
  CHINESE_PAGODA, CHINESE_TEMPLE_MINI, CHINESE_TEMPLE_SMALL, JAPAN_BUILDINGS, JAPAN_HOUSE, WAYSIDE_SHRINE,
} from './buildings/index.js';

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
  // steadier outline. Widened past the green land's own range too, so a
  // squat outcrop and a mesa proper both turn up rather than one size of
  // rock repeated.
  mountainMinRadius: 55,
  mountainMaxRadius: 170,
  mountainMinHeight: 32,
  mountainMaxHeight: 85,
  mountainShapeScale: 1.3,
  mountainSkirt: 55,
  // Dune lines rather than an isotropic bump field -- angled off true
  // north the way a prevailing wind would actually lay them, and taller
  // than the green land's own ridge: dune relief is the dominant shape of
  // a real desert, not a texture on top of a hill.
  ridge: { angle: 35, scale: 100, alongScale: 500, height: 20 },
  // Nothing grows here, and nothing turns in autumn.
  forestThreshold: 1,
  turnsInAutumn: false,
  // A tiny oasis a short way from the city: two ponds close enough together
  // to read as one small cultivated patch rather than two separate dots,
  // the only green this level has anywhere -- see Terrain#pondAt/oasisAt.
  ponds: [
    { x: 55, y: 25, radius: 6, fieldRadius: 22 },
    { x: 40, y: 40, radius: 4, fieldRadius: 16 },
  ],
};

export const LEVELS = [
  {
    id: 'northern-march',
    name: 'The Northern March',
    blurb: 'Raiders from the north. A river guards your back.',
    music: 'sounds/level_1.mp3',
    // Lower hills than the default: this is river country, not high ground.
    // A true wood surrounds the city -- tree spacing tight and the noise's
    // own threshold loosened well past the default, so cover reads as
    // forest rather than scattered stands, with the noise's low patches
    // left as clearings in it rather than filled in. Ringed clear around
    // the castle itself (see Terrain#forestAt): the city stands on open
    // ground the player can actually see, with the treeline beginning
    // just past it rather than crowding the walls from the first frame.
    // A ridge runs parallel to the river (angle 0, the river's own line)
    // rather than across it -- river valleys terrace along their length,
    // not against it -- and the peaks widen past the default range for a
    // skyline with real high ground on it, not just one size of foothill.
    land: {
      mountainMinHeight: 30,
      mountainMaxHeight: 68,
      mountainMinRadius: 38,
      mountainMaxRadius: 115,
      ridge: { angle: 0, scale: 130, alongScale: 700, height: 12 },
      treeSpacing: 7,
      forestScale: 280,
      forestThreshold: 0.05,
      cityClearRadius: 70,
      cityClearFeather: 50,
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
    // A slender pagoda and a couple of modest wayside shrines, scattered
    // through the clear ground around the city -- far enough that none of
    // them competes with the walls for the eye, standing apart from the
    // raid the same way they would stand apart from any passing army.
    landmarks: [
      { structure: CHINESE_PAGODA, x: 100, y: 40 },
      { structure: CHINESE_TEMPLE_MINI, x: -160, y: 60 },
      { structure: CHINESE_TEMPLE_MINI, x: 200, y: 140 },
    ],
  },
  {
    id: 'dust-sea',
    name: 'The Dust Sea',
    blurb: 'A desert siege. Raiders from every side.',
    music: 'sounds/level_2.mp3',
    land: DESERT,
    // A standing sandstorm rather than an ordinary dusty haze: thicker than
    // any season alone gets, starting well short of the ordinary distance
    // so it presses in past the middle ground, with the whole sky driven
    // past overhead several times faster than an ordinary wind -- see
    // Atmosphere#placeClouds. `floor` is what keeps it a sandstorm rather
    // than aerial haze: without it the gradient still clears up close to
    // the camera, and a player zoomed in to build a wall would see the
    // storm vanish around them -- see Atmosphere#drawFog.
    mist: {
      color: '226, 194, 112', blend: 0.8, density: 2.6, start: 0.22, windSpeed: 4, floor: 0.55,
    },
    // A desert runs warmer than the calendar alone says -- see
    // Season#snowCoverAt -- so even winter's own coldest night never
    // actually reaches freezing here. No snow falls, and no patch of
    // ground ever turns white, without either needing to know this is a
    // desert specifically; they only ever read the temperature.
    climate: { offset: 20 },
    // A wayside temple off in the dunes, well clear of the oasis and the
    // city both -- see Terrain#pondAt for where the oasis itself sits.
    landmarks: [
      { structure: CHINESE_TEMPLE_SMALL, x: -170, y: 90 },
    ],
  },
  {
    id: 'shiro-island',
    name: 'The Island of the Keep',
    blurb: 'An island siege. No safe side at all.',
    // Flies over the keep in place of FLAG's own default banner.
    flag: 'images/flags/flag_japan.png',
    music: 'sounds/level_3.mp3',
    // The same green country as the northern march, but only as much of it
    // as fits between the beaches -- so the hills are smaller in kind, not
    // just fewer.
    land: {
      hillScale: 300,
      hillHeight: 46,
      // Widened past a single size of foothill, same as the mainland's own
      // range, so a small island still shows some size variety rather than
      // every peak reading the same.
      mountainMinRadius: 28,
      mountainMaxRadius: 72,
      mountainMinHeight: 22,
      mountainMaxHeight: 52,
      mountainSkirt: 26,
      // The rise the whole level is built around: the keep stands on its
      // summit and the walls climb it. `spurs` is how far its reach wanders
      // with the direction and `grain` how rough its surface is, which is
      // what keeps it from reading as a dome. Cut back to a real hill
      // rather than the small mountain it had grown into -- the castle's
      // own footprint is a fraction of this reach even now.
      hill: {
        radius: 115,
        height: 36,
        spurs: 26,
        spurScale: 2.4,
        grain: 10,
        grainScale: 55,
      },
      // Cherry blossom rather than the mainland's wood: pink, and smaller,
      // so a stand of them reads as an orchard rather than a green forest
      // that happens to have changed colour. Grown far thicker too --
      // measured over the island's playable radius, the mainland's own
      // settings plant only about a tree, since the two gates that decide
      // where woodland grows (a noise for how wooded a patch is, another
      // for which ground counts as grass at all) compound to a sliver of
      // the map. Loosening the first is what turns a sliver into a wood
      // worth walking through.
      //
      // Pink only while the blossom is actually out, in spring; the same
      // turn to yellow and then white as any other wood the rest of the
      // year, and a plain green in summer once the blossom has dropped --
      // the same green the mainland wears then, not a colour of its own.
      canopySeasons: {
        Autumn: '#d9b23a', Winter: '#eef2f5', Spring: '#eaacc7', Summer: '#4a603a',
      },
      treeSize: 3,
      treeSpacing: 7,
      forestThreshold: 0.24,
    },
    sea: {
      // Land out to roughly this radius, give or take the coves `coast`
      // cuts into it. Little enough ground that a ring of wall is a real
      // choice about what to leave outside it.
      shore: 260,
      coast: 34,
      // How many times the coastline wanders on one walk round the island.
      coastScale: 2.4,
      // A real strip of sand inland of the shore, the same bank colour as
      // the wet side fading in from the waterline, so the two meet without
      // a seam rather than the coast cutting straight from surf to turf --
      // see Terrain#beachAt. Dipped below the grass above it too, so the
      // two read as different shelves rather than sharing a level -- see
      // wildHeightAt's own use of beachDip for how that stays a step
      // rather than the scooped bowl an earlier attempt at this read as.
      beachWidth: 55,
      beachDip: 12,
      // Over what distance the water deepens past the beach, and by how
      // much -- narrow, so the open sea reads as a clear colour past the
      // shallows rather than the two blurring into one long fade.
      shelf: 50,
      depth: 26,
      color: '#2f5f86',
      bankColor: '#cbb98d',
    },
    // No landward flank: raiders row in and beach at the coves, so they
    // arrive from every quarter at once and start already ashore.
    landings: { count: 8, inset: 12 },
    wall: {
      // Rammed stonework rather than a squared rampart: wider at the foot
      // than at the crest, on both sides, and low enough to be a revetment
      // cut into the hill rather than a curtain standing on it.
      shape: 'tapered',
      heightScale: 0.5,
      // The stonework simply turns a corner; no turret is raised where two
      // runs meet.
      towers: false,
      // Five times the usual stone, because raiders do not have to break a
      // section to get past it -- they go over, and wear it down the whole
      // time they are up there.
      healthScale: 5,
      // What going over costs: a crawl while astride the stone, and a share
      // of the company's strength for the crossing. A wall here buys time
      // and lives rather than denying the ground outright.
      climb: {
        reach: 20,
        speed: 0.16,
        healthCost: 0.3,
        // Scrambling over stone is not battering it. At full strength a
        // company in contact for ten seconds brings down a section, and a
        // crossing lasts many times that, so climbing alone would demolish
        // every wall it touched. Set against what a whole crossing should
        // cost the stone rather than against the second, so slowing the
        // climb does not quietly make walls easier to wear through.
        wear: 0.02,
        // And on the stone itself, rather than on the approach to it, a
        // company is this many times slower again.
        overlapSlow: 3,
      },
    },
    buildings: JAPAN_BUILDINGS,
    // The island's keeps are a fraction of the size of the imperial city's,
    // so they claim a fraction of the ground. Left at the imperial figures a
    // grown castle fenced walls out of the whole hilltop and stood on a
    // terrace nearly two hundred units across.
    castleTypes: {
      CC0: { footprint: 9, hitbox: 5 },
      CC1: { footprint: 12, hitbox: 7 },
      CC2: { footprint: 16, hitbox: 9 },
    },
    // The settlement is little keeps rather than houses, raised on whatever
    // platform ground the player has made for them.
    house: JAPAN_HOUSE,
    guardTiers: {
      CC0: ['JG_ASHIGARU'],
      CC1: ['JG_ASHIGARU', 'JG_SAMURAI'],
      CC2: ['JG_ASHIGARU', 'JG_SAMURAI', 'JG_SOHEI'],
    },
    // Sea air: thinner and cooler than the dust, and never quite absent.
    mist: { color: '196, 214, 226', blend: 0.45, density: 1.25, start: 0.8 },
    // A few wayside shrines along the shore paths, clear of the hill and
    // its walls -- see Terrain#hillAt for the rise the keep itself stands
    // on -- so a raid from any quarter passes near one of them.
    landmarks: [
      { structure: WAYSIDE_SHRINE, x: 150, y: 120 },
      { structure: WAYSIDE_SHRINE, x: -150, y: 80 },
      { structure: WAYSIDE_SHRINE, x: 0, y: -170 },
    ],
  },
];

export function levelAt(index) {
  return LEVELS[Math.max(0, Math.min(LEVELS.length - 1, index))];
}
