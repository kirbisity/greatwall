/**
 * A blow is split in two: `aa` (anti-armour) goes through plate untouched,
 * `normal` is only worth what the target's armour (0 to 1, the share of
 * ordinary damage it absorbs) lets through. Defence then blunts the total --
 * see the takeHit of each thing that can be struck.
 */

/** The blow a unit type lands at `scale` of its strength. */
export function blowOf(type, scale = 1) {
  return { aa: (type.attackAA ?? 0) * scale, normal: (type.attackNormal ?? 0) * scale };
}

/** What a type's blow amounts to against a target of this `armor`. */
export function blowDamage(blow, armor = 0) {
  return blow.aa + blow.normal * (1 - armor);
}

export function addBlows(first, second) {
  return { aa: first.aa + second.aa, normal: first.normal + second.normal };
}

/** Both halves of the blow, scaled: used to share one company's strength between foes. */
export function scaleBlow(blow, factor) {
  return { aa: blow.aa * factor, normal: blow.normal * factor };
}
