import { distanceSquared } from './geometry.js';
import {
  CHARGE, HOLD, MASS, MELEE, ROUT,
} from './config.js';

/**
 * Hand-to-hand between the two sides.
 *
 * A company locks with everything it touches, so one body can be swarmed and
 * several can pile onto the same target. Locked companies stop dead and trade
 * damage until one side is gone or breaks and runs, then the survivor gathers
 * itself and moves on. How a bout opens matters: the pace and line a company
 * came in on sets how hard its first blows land (see chargeImpact), and heavy
 * cavalry may ride straight through light infantry or be stopped dead on a
 * braced spear wall instead (see engage).
 */

// --- the charge ------------------------------------------------------------------

/** How fast a company is going, as a share of a full-tilt cavalry charge. */
export function chargeSpeed(company) {
  return Math.min(1, company.momentum * company.type.speed / CHARGE.referenceSpeed);
}

/**
 * How squarely a company is heading at another: 1 dead on, -1 dead away, and
 * 0 when it is not heading anywhere at all.
 */
export function facingToward(company, other) {
  const speed = Math.hypot(company.velocity.x, company.velocity.y);
  const dx = other.position.x - company.position.x;
  const dy = other.position.y - company.position.y;
  const gap = Math.hypot(dx, dy);
  if (speed === 0 || gap === 0) {
    return 0;
  }
  return (company.velocity.x * dx + company.velocity.y * dy) / (speed * gap);
}

/**
 * What a company's first CHARGE.seconds of blows are multiplied by, from the
 * pace and line it met `foe` on. Standing still is plain strength; a head-on
 * charge at full cavalry speed doubles it; caught running the other way, the
 * same speed counts against it instead.
 */
export function chargeImpact(company, foe) {
  const alignment = facingToward(company, foe);
  const weight = alignment >= 0 ? CHARGE.bonus : CHARGE.retreatPenalty;
  return 1 + chargeSpeed(company) * alignment * weight;
}

function isCharging(company, target) {
  return !company.routed
    && chargeSpeed(company) >= MASS.chargeSpeed
    && facingToward(company, target) >= MASS.chargeAlignment;
}

/** Spears set to meet a charge: on hold, or standing near enough still. */
export function isBraced(company) {
  return Boolean(company.type.spears)
    && !company.routed
    && (company.holding || company.momentum <= MASS.bracedMomentum);
}

function tramples(cavalry, target) {
  return Boolean(cavalry.type.cavalry)
    && cavalry.type.mass >= MASS.heavy
    && !target.type.cavalry
    && target.type.mass <= MASS.light
    && !isBraced(target)
    && isCharging(cavalry, target);
}

function meetsSpears(cavalry, spears) {
  return Boolean(cavalry.type.cavalry) && isBraced(spears) && isCharging(cavalry, spears);
}

/**
 * Heavy cavalry rides a light company down and carries on: a blow scaled by
 * its speed, the target shoved off its line and knocked flat for a moment,
 * and the riders keep most of their pace rather than stopping to fight.
 */
function trample(cavalry, target) {
  target.takeHit(cavalry.type.attack * MASS.trampleMultiplier * chargeSpeed(cavalry));
  const speed = Math.hypot(cavalry.velocity.x, cavalry.velocity.y);
  const aheadX = cavalry.velocity.x / speed;
  const aheadY = cavalry.velocity.y / speed;
  // Whichever side of the riders' line it already stood, it goes further that way.
  const side = Math.sign(
    (target.position.x - cavalry.position.x) * -aheadY
    + (target.position.y - cavalry.position.y) * aheadX,
  ) || 1;
  target.position.x += -aheadY * side * MASS.tramplePush;
  target.position.y += aheadX * side * MASS.tramplePush;
  target.recoverySeconds = Math.max(target.recoverySeconds, MASS.trampleStaggerSeconds);
  cavalry.momentum *= MASS.trampleMomentumKept;
}

/** Cavalry run onto set spears: stopped dead, its charge spent on the points. */
function counterCharge(cavalry, spears, speed) {
  cavalry.takeHit(spears.type.attack * MASS.counterChargeMultiplier * speed);
  cavalry.momentum = 0;
  cavalry.impact = 1;
}

/** A company's opening blows are fixed the moment its first foe of a bout is. */
function openBout(company, foe) {
  if (company.foes.size === 0) {
    company.impact = chargeImpact(company, foe);
  }
}

function engage(guard, raider) {
  if (tramples(raider, guard)) {
    trample(raider, guard);
    return;
  }
  if (tramples(guard, raider)) {
    trample(guard, raider);
    return;
  }
  // Read before either side's bout opens: the counter-charge itself stops
  // the riders, and it is the pace they came in with that it punishes.
  const raiderOnSpears = meetsSpears(raider, guard) ? chargeSpeed(raider) : null;
  const guardOnSpears = meetsSpears(guard, raider) ? chargeSpeed(guard) : null;
  openBout(guard, raider);
  openBout(raider, guard);
  guard.foes.add(raider);
  raider.foes.add(guard);
  if (raiderOnSpears !== null) {
    counterCharge(raider, guard, raiderOnSpears);
  }
  if (guardOnSpears !== null) {
    counterCharge(guard, raider, guardOnSpears);
  }
}

/**
 * Pair up anything from the two sides that has come within reach. A routed
 * company is running rather than looking for a fight, so it is only pinned
 * by an enemy that actually catches it up -- see ROUT.catchDistance.
 */
export function lockEngagements(guards, raiders) {
  const reach = MELEE.engageDistance * MELEE.engageDistance;
  const caught = ROUT.catchDistance * ROUT.catchDistance;
  for (const guard of guards) {
    for (const raider of raiders) {
      if (guard.recoverySeconds > 0) {
        break;
      }
      if (raider.recoverySeconds > 0 || guard.foes.has(raider)) {
        continue;
      }
      if (guard.routed && raider.routed) {
        continue;
      }
      const limit = guard.routed || raider.routed ? caught : reach;
      if (distanceSquared(guard.position, raider.position) <= limit) {
        engage(guard, raider);
      }
    }
  }
}

// --- the bout --------------------------------------------------------------------

/**
 * Draw locked companies into each other so the ranks interleave. Fighting at
 * arm's length reads as two blocks standing apart; overlapping reads as a
 * melee. The heavier of two gives the less ground.
 */
function closeIn(companies, seconds) {
  for (const company of companies) {
    if (company.foes.size === 0) {
      continue;
    }
    let pullX = 0;
    let pullY = 0;
    for (const foe of company.foes) {
      const dx = foe.position.x - company.position.x;
      const dy = foe.position.y - company.position.y;
      const gap = Math.hypot(dx, dy);
      if (gap <= MELEE.lockedGap || gap === 0) {
        continue;
      }
      const yielding = (2 * foe.type.mass) / (company.type.mass + foe.type.mass);
      const step = Math.min(MELEE.closeRate * seconds, (gap - MELEE.lockedGap) / 2) * yielding;
      pullX += dx / gap * step;
      pullY += dy / gap * step;
    }
    company.position.x += pullX / Math.max(1, company.foes.size);
    company.position.y += pullY / Math.max(1, company.foes.size);
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

/** What a company strikes with right now: its charge early in a bout, halved in a rout. */
function strikingPower(company) {
  const charge = company.meleeSeconds <= CHARGE.seconds ? company.impact : 1;
  const morale = company.routed ? ROUT.attackMultiplier : 1;
  return company.type.attack * charge * morale;
}

/** How much a company on hold shrugs off, for the first HOLD.seconds of a bout. */
function bracing(company) {
  return company.holding && company.meleeSeconds <= HOLD.seconds ? 1 + HOLD.defenseBonus : 1;
}

function breaksNow(company) {
  return !company.routed
    && company.isAlive
    && company.type.breaksAt > 0
    && company.healthFraction <= company.type.breaksAt;
}

/** Rout a company whose health has just fallen past its breaking point; true if it did. */
export function testMorale(company) {
  if (!breaksNow(company)) {
    return false;
  }
  rout(company);
  return true;
}

/**
 * Morale breaks: the company drops out of every fight it is in and runs,
 * at a sprint -- panic needs no run-up. Whatever it was fighting is a beat
 * slow to give chase, so the rout is a real chance to get away rather than
 * a formality, but only a real chance: anything faster will run it down.
 */
export function rout(company) {
  company.routed = true;
  company.routedAt = { ...company.position };
  company.holding = false;
  company.selected = false;
  for (const foe of company.foes) {
    foe.foes.delete(company);
    if (foe.foes.size === 0) {
      foe.meleeSeconds = 0;
    }
    foe.recoverySeconds = MELEE.recoverySeconds;
  }
  company.foes.clear();
  company.meleeSeconds = 0;
  company.recoverySeconds = 0;
  company.momentum = 1;
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

  closeIn(companies, seconds);

  const struck = new Map();
  for (const company of companies) {
    if (company.foes.size === 0) {
      continue;
    }
    company.meleeSeconds += seconds;
    const share = strikingPower(company) * MELEE.damageRate * seconds / company.foes.size;
    for (const foe of company.foes) {
      struck.set(foe, (struck.get(foe) ?? 0) + share);
    }
  }
  for (const [company, blows] of struck) {
    company.takeHit(blows / bracing(company));
  }

  // Only blows break morale -- here, and from a wall that strikes back at
  // whoever batters it (see Game#resolveWallContact). A raider bloodied
  // merely climbing over one is shaken, not beaten.
  for (const company of struck.keys()) {
    testMorale(company);
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
