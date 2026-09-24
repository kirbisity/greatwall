import large from './large.js';
import medium from './medium.js';
import small from './small.js';

/** Castle type id to the structure raised on the map. */
export const BUILDINGS = {
  CC0: small,
  CC1: medium,
  CC2: large,
};

import japanLarge from './japan-large.js';
import japanMedium from './japan-medium.js';
import japanSmall from './japan-small.js';

/** The island's own keep, raised in place of the imperial city. */
export const JAPAN_BUILDINGS = {
  CC0: japanSmall,
  CC1: japanMedium,
  CC2: japanLarge,
};
