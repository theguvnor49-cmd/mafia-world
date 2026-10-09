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

/** Chance depends on the TARGET business's own level (its "security") and
 * the ROBBER's rank (`rankIndex`, same 0-9 index `getRankForXp` returns,
 * defaulting to 0 so existing callers that only care about level-based
 * difficulty keep working). Added in the Phase 12 balancing pass — see
 * "Open questions" #28 in GAME_DESIGN.md for why this was static-level-
 * only before, and the economy-audit section for why the bonus reuses
 * GTA's own per-level figure rather than a new one. Parameter order
 * (`level, rankIndex`) deliberately mirrors `getGtaSuccessChance(heat,
 * rankIndex)`'s own (modifier, then rank) shape. */
export function getRobSuccessChance(businessLevel: number, rankIndex: number = 0): number {
  const raw =
    BUSINESSES.ROB.BASE_CHANCE -
    (businessLevel - 1) * BUSINESSES.ROB.LEVEL_PENALTY_PER_LEVEL_ABOVE_ONE +
    rankIndex * BUSINESSES.ROB.ROBBER_RANK_BONUS_PER_LEVEL;
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
 *
 * `rankIndex` (the ROBBER's rank, defaulting to 0) was added in the
 * Phase 12 balancing pass — see `getRobSuccessChance` above. It sits
 * between `businessLevel` and `roll` so this call reads exactly like
 * `resolveGta(effectiveHeat, rankIndex, roll)`: modifiers first, the
 * dice-roll always last.
 */
export function resolveBusinessRob(businessLevel: number, rankIndex: number = 0, roll: number = Math.random()): RobOutcome {
  const chance = getRobSuccessChance(businessLevel, rankIndex);
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
