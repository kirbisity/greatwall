import { distanceSquared } from './geometry.js';
import { MELEE } from './config.js';

/**
 * Hand-to-hand between the two sides.
 *
 * A company locks with everything it touches, so one body can be swarmed and
 * several can pile onto the same target. Locked companies stop dead and trade
 * damage until one side is gone, then the survivor gathers itself and moves on.
 */

/** Pair up anything from the two sides that has come within reach. */
export function lockEngagements(guards, raiders) {
  const reach = MELEE.engageDistance * MELEE.engageDistance;
  for (const guard of guards) {
    if (guard.recoverySeconds > 0) {
      continue;
    }
    for (const raider of raiders) {
      if (raider.recoverySeconds > 0 || guard.foes.has(raider)) {
        continue;
      }
      if (distanceSquared(guard.position, raider.position) <= reach) {
        guard.foes.add(raider);
        raider.foes.add(guard);
      }
    }
  }
}

/** Everything locked with this company that is still standing and still close. */
function prunedFoes(company) {
  const reach = (MELEE.engageDistance * 1.6) ** 2;
  for (const foe of company.foes) {
    if (!foe.isAlive || distanceSquared(company.position, foe.position) > reach) {
      company.foes.delete(foe);
      foe.foes.delete(company);
    }
  }
  return company.foes;
}

/**
 * Advance every fight. Damage is split across however many are piled on, so
 * being outnumbered is punishing without a lone company hitting for a crowd.
 */
export function resolveMelee(companies, seconds) {
  for (const company of companies) {
    if (company.recoverySeconds > 0) {
      company.recoverySeconds = Math.max(0, company.recoverySeconds - seconds);
    }
    if (company.foes.size === 0) {
      continue;
    }
    prunedFoes(company);
  }

  const struck = new Map();
  for (const company of companies) {
    if (company.foes.size === 0) {
      continue;
    }
    company.meleeSeconds += seconds;
    const share = company.type.attack * MELEE.damageRate * seconds / company.foes.size;
    for (const foe of company.foes) {
      struck.set(foe, (struck.get(foe) ?? 0) + share);
    }
  }
  for (const [company, blows] of struck) {
    company.takeHit(blows);
  }

  // Break off the dead, and anything that has been at it too long.
  for (const company of companies) {
    if (company.foes.size === 0) {
      company.meleeSeconds = 0;
      continue;
    }
    const spent = company.meleeSeconds >= MELEE.maxSeconds;
    if (!spent && company.isAlive && [...company.foes].some((foe) => foe.isAlive)) {
      continue;
    }
    for (const foe of company.foes) {
      foe.foes.delete(company);
      foe.meleeSeconds = 0;
      foe.recoverySeconds = MELEE.recoverySeconds;
    }
    company.foes.clear();
    company.meleeSeconds = 0;
    company.recoverySeconds = MELEE.recoverySeconds;
  }
}
