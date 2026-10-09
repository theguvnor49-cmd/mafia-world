export interface GambleResult {
  won: boolean;
  /** Signed change to the player's cash: +betAmount on a win, -betAmount
   * on a loss. The route applies this directly and also derives which of
   * `cash_earned`/`cash_lost` to bump from `won`. */
  netChange: number;
}

/**
 * "Limited gambling," one of hospital's recovery activities (brief
 * section 22). A plain, honest 50/50 double-or-nothing coin flip — the
 * brief gives no odds, payout structure, or house edge, so the simplest
 * defensible choice is taken rather than inventing a house advantage with
 * no basis. Pure and injectable-RNG, same style as every other
 * probabilistic mechanic in this codebase (resolveGta, pickWitnesses,
 * resolveBust, pickVehicleDrop, pickRandomState) — the route is
 * responsible for validating `betAmount` against
 * `HOSPITAL.GAMBLE_MIN_BET`/`MAX_BET` and the player's actual balance
 * before ever calling this; this function trusts its inputs.
 */
export function resolveGamble(betAmount: number, roll: number = Math.random()): GambleResult {
  const won = roll < 0.5;
  return { won, netChange: won ? betAmount : -betAmount };
}
