import { BULLET_CALC } from './config';

export interface BulletCalcInput {
  /** The defender's rank's baseBulletsToKill (brief section 10/`RANKS`). */
  targetBaseBullets: number;
  /** The attacker's equipped gun's bullet_multiplier. */
  gunMultiplier: number;
  /** The defender's equipped armour's bonus_bullets, or 0 if unarmoured. */
  armourBonusBullets: number;
  /** The defender's equipped armour's multiplier, or 1 if unarmoured. */
  armourMultiplier: number;
}

/**
 * Brief section 12, verbatim:
 *   gunApplied = targetRankBaseBullets × gunMultiplier
 *   withArmor  = gunApplied + armourBonusBullets
 *   final      = withArmor × armourMultiplier
 *   result     = max(25, round(final))
 *
 * Deliberately pure and catalog-agnostic: callers look up the real gun /
 * armour rows (or, for the Phase 4 "what-if" calculator, a hypothetical
 * combination) and the target's real rank, and pass plain numbers in here.
 * There's only one implementation of this formula in the codebase — Phase
 * 5's real kill resolution will call this exact function, not reimplement
 * it, so the "informational" calculator and the real combat math can never
 * drift apart (brief section 12: "the server calculates the real number; a
 * frontend calculator is informational only").
 */
export function calculateBulletsToKill(input: BulletCalcInput): number {
  const gunApplied = input.targetBaseBullets * input.gunMultiplier;
  const withArmour = gunApplied + input.armourBonusBullets;
  const final = withArmour * input.armourMultiplier;
  return Math.max(BULLET_CALC.MIN_BULLETS, Math.round(final));
}
