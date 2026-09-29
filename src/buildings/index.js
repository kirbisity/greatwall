import large from './large.js';
import medium from './medium.js';
import small from './small.js';

/** Castle type id to the structure raised on the map. */
export const BUILDINGS = {
  CC0: small,
  CC1: medium,
  CC2: large,
};

import { scalePlan } from './helpers.js';
import chineseTemple from './chinese-temple.js';
import japanHouse from './japan-house.js';
import japanLarge from './japan-large.js';
import japanMedium from './japan-medium.js';
import japanSmall from './japan-small.js';
import mogaoGrotto from './mogao-grotto.js';
import waysideShrine from './shrine.js';

// The island's keeps are drawn at the size their proportions read best and
// stood down to this, so resizing them is one number rather than a pass over
// every storey.
const ISLAND_KEEP_SCALE = 1 / 1.5;

/** The island's own keep, raised in place of the imperial city. */
export const JAPAN_BUILDINGS = {
  CC0: scalePlan(japanSmall, ISLAND_KEEP_SCALE),
  CC1: scalePlan(japanMedium, ISLAND_KEEP_SCALE),
  CC2: scalePlan(japanLarge, ISLAND_KEEP_SCALE),
};

/** What an island settlement fills its platforms with. */
export const JAPAN_HOUSE = japanHouse;

// A small cultural landmark per level, standing apart from the city --
// see LEVELS' own `landmark` field and Renderer#collectLandmark.
export const CHINESE_TEMPLE = chineseTemple;
export const MOGAO_GROTTO = mogaoGrotto;
export const WAYSIDE_SHRINE = waysideShrine;
