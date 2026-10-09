import { BUST } from '../config';

export interface BustOutcome {
  success: boolean;
  /** 0 on failure — the brief pays a reward on success only. */
  cashReward: number;
}

/**
 * Success chance for one bust-out attempt (brief section 25): 25% base,
 * +2% per the buster's own prior *successful* bust, -1% per their prior
 * *failed* bust, clamped 15-80%. Pure function of the buster's own career
 * bust stats — never the prisoner's.
 */
export function getBustSuccessChance(priorSuccessfulBusts: number, priorFailedBusts: number): number {
  const raw =
    BUST.BASE_SUCCESS_CHANCE +
    priorSuccessfulBusts * BUST.SUCCESS_BONUS_PER_SUCCESSFUL_BUST -
    priorFailedBusts * BUST.FAILURE_PENALTY_PER_FAILED_BUST;
  return Math.min(BUST.MAX_SUCCESS_CHANCE, Math.max(BUST.MIN_SUCCESS_CHANCE, raw));
}

/** Cash reward on a successful bust (brief section 25): $25,000 +
 * $4,000 per the buster's prior successful bust. */
export function getBustReward(priorSuccessfulBusts: number): number {
  return BUST.BASE_REWARD + priorSuccessfulBusts * BUST.REWARD_BONUS_PER_SUCCESSFUL_BUST;
}

/**
 * Resolves one bust-out attempt. Pure function — the only randomness is
 * `roll` (defaults to a fresh Math.random() per call, but is injectable for
 * deterministic tests). The route handler (routes/jail.ts) applies the
 * result inside a database transaction; this function never touches the
 * database, mirroring crimes/gta.ts's resolveGta.
 */
export function resolveBust(
  priorSuccessfulBusts: number,
  priorFailedBusts: number,
  roll: number = Math.random()
): BustOutcome {
  const chance = getBustSuccessChance(priorSuccessfulBusts, priorFailedBusts);
  const success = roll < chance;
  return {
    success,
    cashReward: success ? getBustReward(priorSuccessfulBusts) : 0,
  };
}
