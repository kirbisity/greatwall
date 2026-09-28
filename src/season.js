import { hexChannels } from './color.js';
import { SEASONS } from './config.js';

/**
 * What the year looks like at a given moment, blended rather than switched.
 *
 * `phase` is the season index plus how far through it play has got (0 at the
 * start of autumn, 1.5 at the middle of winter, and so on -- see
 * Game.seasonPhase). Each season's own values hold exactly at its midpoint
 * and blend linearly to the next season's across the boundary between them,
 * so nothing about the world changes on the tick a season turns: the orange
 * of summer is already fading as autumn arrives, and autumn's gold is
 * already creeping in before it.
 *
 * The sky reads this for its haze and cloud, and the ground for how far its
 * green has turned, which is why it sits here rather than in either.
 */
export function seasonBlend(phase) {
  const count = SEASONS.length;
  const raw = phase - 0.5;
  const base = Math.floor(raw);
  const t = raw - base;
  const from = SEASONS[((base % count) + count) % count];
  const to = SEASONS[(((base + 1) % count) + count) % count];
  return {
    haze: mixChannels(from.haze, to.haze, t),
    hazeDensity: mix(from.hazeDensity, to.hazeDensity, t),
    cloudBoost: mix(from.cloudBoost, to.cloudBoost, t),
    tint: mixChannels(from.tint, to.tint, t),
    tintStrength: mix(from.tintStrength, to.tintStrength, t),
    groundGold: mix(from.groundGold, to.groundGold, t),
    temperature: mix(from.temperature, to.temperature, t),
  };
}

// Where snow starts, and how many degrees further it takes to reach a full
// snowfall -- one curve driving both the flakes that fall and the ground
// they settle on, so the two always agree about how wintry it reads.
const FREEZING_POINT = 0;
const SNOW_TEMPERATURE_RANGE = 6;

/**
 * How wintry this moment reads, 0 well above freezing to 1 deep in a hard
 * frost. `climate` is a level's own offset off the season's shared
 * temperature (see levels.js) -- a desert runs warmer than the calendar
 * alone says, without the snow itself needing to know why. Continuous
 * across the year the same way seasonBlend's own fields are, so a winter
 * settles in and lifts again gradually rather than switching on.
 */
export function snowCoverAt(phase, climate = null) {
  const temperature = seasonBlend(phase).temperature + (climate?.offset ?? 0);
  return Math.max(0, Math.min(1, (FREEZING_POINT - temperature) / SNOW_TEMPERATURE_RANGE));
}

function mix(from, to, t) {
  return from + (to - from) * t;
}

/** Blend two 'r, g, b' strings, giving another of the same shape. */
export function mixChannels(from, to, t) {
  const a = from.split(',');
  const b = to.split(',');
  return a.map((channel, i) => Math.round(mix(Number(channel), Number(b[i]), t))).join(', ');
}

/**
 * Blend a hex colour given once per season -- a level's own tree canopy, say
 * -- the same gradual way the sky's own haze and tint turn: held exactly at
 * each season's midpoint, blending linearly across the boundary between two
 * rather than cutting on the season's first tick.
 *
 * Kept separate from seasonBlend rather than folded into it: that function
 * reads a single fixed table (SEASONS itself), and a caller with a table of
 * its own should not have to teach it that table exists. Returns channels,
 * not a string, so the caller can shade them or format them however its own
 * drawing already does -- exactly what an already-established colour field
 * gets read as elsewhere in the renderer.
 */
export function seasonalColorMix(phase, hexBySeason) {
  const count = SEASONS.length;
  const raw = phase - 0.5;
  const base = Math.floor(raw);
  const t = raw - base;
  const from = hexChannels(hexBySeason[SEASONS[((base % count) + count) % count].name]);
  const to = hexChannels(hexBySeason[SEASONS[(((base + 1) % count) + count) % count].name]);
  return from.map((channel, i) => Math.round(mix(channel, to[i], t)));
}
