import { GAMBLING } from '../config';

export type DiceBetType = 'under' | 'seven' | 'over';

export interface DiceResult {
  die1: number;
  die2: number;
  sum: number;
  won: boolean;
  netChange: number;
}

/**
 * Two six-sided dice (brief section 23's "dice" candidate), resolved as a
 * real casino side-bet shape: UNDER (sum 2-6), SEVEN (sum exactly 7), or
 * OVER (sum 8-12). Pure, injectable `rng` (see `pickWitnesses` for the
 * same pattern) — called twice, once per die, so real callers never pass
 * `rng` and get two independent `Math.random()` draws.
 *
 * `netChange` is the player's cash delta: on a win, `betAmount × (payout
 * multiplier − 1)` (the multiplier is total return, so subtracting 1
 * gives pure profit); on a loss, `-betAmount`. Rounded to the nearest
 * whole cash unit since the DB column is an integer (`BIGINT`).
 */
export function resolveDice(
  betAmount: number,
  betType: DiceBetType,
  rng: () => number = Math.random
): DiceResult {
  const die1 = 1 + Math.floor(rng() * 6);
  const die2 = 1 + Math.floor(rng() * 6);
  const sum = die1 + die2;

  const category: DiceBetType = sum <= 6 ? 'under' : sum === 7 ? 'seven' : 'over';
  const won = category === betType;

  const multiplier =
    betType === 'seven' ? GAMBLING.DICE.SEVEN_PAYOUT_MULTIPLIER : GAMBLING.DICE.UNDER_OVER_PAYOUT_MULTIPLIER;
  const netChange = won ? Math.round(betAmount * (multiplier - 1)) : -betAmount;

  return { die1, die2, sum, won, netChange };
}
