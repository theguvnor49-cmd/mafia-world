import { BUSINESSES } from '../config';

export interface RobOutcome {
  success: boolean;
  xpReward: number;
  heatChange: number;
  jailSeconds: number;
}

function randomInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

/** Chance depends only on the TARGET business's own level (its
 * "security") — not the robber's rank, unlike GTA's rank bonus. See
 * "Open questions" in GAME_DESIGN.md. */
export function getRobSuccessChance(businessLevel: number): number {
  const raw =
    BUSINESSES.ROB.BASE_CHANCE - (businessLevel - 1) * BUSINESSES.ROB.LEVEL_PENALTY_PER_LEVEL_ABOVE_ONE;
  return Math.min(BUSINESSES.ROB.MAX_CHANCE, Math.max(BUSINESSES.ROB.MIN_CHANCE, raw));
}

/**
 * Resolves one business-robbery attempt (brief section 25's "robbable").
 * Pure except for `roll` — same injectable-rng style as resolveGta/
 * resolveBust/every gambling resolver, so this is deterministically unit-
 * testable. Deliberately does NOT compute the cash stolen: that's the
 * target business's own currently-accrued income (mafia/businesses/
 * income.ts's `computeAccruedCash`), read and zeroed by the caller inside
 * its own database transaction (routes/businesses.ts) exactly the way a
 * legitimate `collect` would, just redirecting the payout to the robber.
 */
export function resolveBusinessRob(businessLevel: number, roll: number = Math.random()): RobOutcome {
  const chance = getRobSuccessChance(businessLevel);
  const success = roll < chance;

  if (success) {
    return {
      success: true,
      xpReward: randomInt(BUSINESSES.ROB.SUCCESS_XP_MIN, BUSINESSES.ROB.SUCCESS_XP_MAX),
      heatChange: randomInt(BUSINESSES.ROB.SUCCESS_HEAT_MIN, BUSINESSES.ROB.SUCCESS_HEAT_MAX),
      jailSeconds: 0,
    };
  }

  return {
    success: false,
    xpReward: randomInt(BUSINESSES.ROB.FAILURE_XP_MIN, BUSINESSES.ROB.FAILURE_XP_MAX),
    heatChange: randomInt(BUSINESSES.ROB.FAILURE_HEAT_MIN, BUSINESSES.ROB.FAILURE_HEAT_MAX),
    jailSeconds: randomInt(BUSINESSES.ROB.FAILURE_JAIL_SECONDS_MIN, BUSINESSES.ROB.FAILURE_JAIL_SECONDS_MAX),
  };
}
