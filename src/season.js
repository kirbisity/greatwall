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
  };
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
