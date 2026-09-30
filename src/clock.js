import { DEBUG, FPS } from './config.js';

/**
 * How many fixed simulation steps a stretch of real time buys at a game speed.
 *
 * Rounded rather than floored, with the remainder carried, so ordinary frame
 * jitter around 1/60 s still yields exactly one step a frame at medium speed
 * instead of the occasional zero-then-two that would read as a stutter.
 *
 * @param {number} carry - fractional steps left over from earlier frames
 * @param {number} elapsedSeconds - real time since the last frame
 * @param {number} factor - game speed, where 1 is medium
 * @returns {{steps: number, carry: number}}
 */
export function simulationSteps(carry, elapsedSeconds, factor) {
  const owed = carry + elapsedSeconds * FPS * factor;
  const steps = Math.min(Math.max(Math.round(owed), 0), DEBUG.maxStepsPerFrame);
  // A stall past the cap is dropped rather than repaid, or the game would race to catch up.
  const remainder = owed - steps;
  return { steps, carry: Math.abs(remainder) > 1 ? 0 : remainder };
}
