import { GTA } from '../config';

export interface GtaOutcome {
  success: boolean;
  cashReward: number;
  xpReward: number;
  heatChange: number;
  jailSeconds: number;
}

function randomInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

export function getGtaSuccessChance(effectiveHeat: number, rankIndex: number): number {
  const raw =
    GTA.BASE_SUCCESS_CHANCE - effectiveHeat * GTA.HEAT_PENALTY_PER_POINT + rankIndex * GTA.RANK_BONUS_PER_LEVEL;
  return Math.min(GTA.MAX_SUCCESS_CHANCE, Math.max(GTA.MIN_SUCCESS_CHANCE, raw));
}

/**
 * Resolves one Grand Theft Auto attempt (brief section 19). Pure function —
 * the only randomness is `roll` (defaults to a fresh Math.random() per
 * call, but is injectable so this can be unit-tested deterministically).
 * The route handler (routes/crimes.ts) is what applies the result inside a
 * database transaction; this function never touches the database.
 */
export function resolveGta(effectiveHeat: number, rankIndex: number, roll: number = Math.random()): GtaOutcome {
  const chance = getGtaSuccessChance(effectiveHeat, rankIndex);
  const success = roll < chance;

  if (success) {
    return {
      success: true,
      cashReward:
        randomInt(GTA.SUCCESS_CASH_MIN, GTA.SUCCESS_CASH_MAX) + rankIndex * GTA.SUCCESS_CASH_RANK_BONUS_PER_LEVEL,
      xpReward: randomInt(GTA.SUCCESS_XP_MIN, GTA.SUCCESS_XP_MAX) + rankIndex * GTA.SUCCESS_XP_RANK_BONUS_PER_LEVEL,
      heatChange: randomInt(GTA.SUCCESS_HEAT_MIN, GTA.SUCCESS_HEAT_MAX),
      jailSeconds: 0,
    };
  }

  return {
    success: false,
    cashReward: 0,
    xpReward: randomInt(GTA.FAILURE_XP_MIN, GTA.FAILURE_XP_MAX),
    heatChange: randomInt(GTA.FAILURE_HEAT_MIN, GTA.FAILURE_HEAT_MAX),
    jailSeconds: randomInt(GTA.FAILURE_JAIL_SECONDS_MIN, GTA.FAILURE_JAIL_SECONDS_MAX),
  };
}
