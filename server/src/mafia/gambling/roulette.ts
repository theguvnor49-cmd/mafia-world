import { GAMBLING } from '../config';

export type RouletteBet =
  | { type: 'color'; color: 'red' | 'black' }
  | { type: 'parity'; parity: 'odd' | 'even' }
  | { type: 'number'; number: number };

export interface RouletteResult {
  number: number;
  color: 'red' | 'black' | 'green';
  won: boolean;
  netChange: number;
}

// Standard single-zero European wheel's red numbers — everything else
// 1-36 is black, and 0 is green (the house number, used instead of the
// American wheel's extra 00 — one green number, not two, for a slightly
// lower and simpler house edge).
const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

/**
 * One spin of a single-zero roulette wheel (brief section 23's "roulette"
 * candidate), supporting the three most standard outside/inside bets:
 * color (red/black), parity (odd/even), and a straight-up single number.
 * Pure, injectable `rng` — one draw, uniform over the 37 outcomes (0-36).
 *
 * 0 is green and satisfies neither a color nor a parity bet — the same
 * "house number" role it plays on a real wheel, which is where roulette's
 * house edge actually comes from (color/parity pay even money on a bet
 * that wins slightly *less* than half the time, 18/37, because of 0).
 */
export function resolveRoulette(
  betAmount: number,
  bet: RouletteBet,
  rng: () => number = Math.random
): RouletteResult {
  const number = Math.floor(rng() * 37); // 0-36 inclusive
  const color: RouletteResult['color'] = number === 0 ? 'green' : RED_NUMBERS.has(number) ? 'red' : 'black';

  let won: boolean;
  let multiplier: number;
  if (bet.type === 'color') {
    won = color === bet.color;
    multiplier = GAMBLING.ROULETTE.COLOR_OR_PARITY_PAYOUT_MULTIPLIER;
  } else if (bet.type === 'parity') {
    won = number !== 0 && number % 2 === (bet.parity === 'even' ? 0 : 1);
    multiplier = GAMBLING.ROULETTE.COLOR_OR_PARITY_PAYOUT_MULTIPLIER;
  } else {
    won = number === bet.number;
    multiplier = GAMBLING.ROULETTE.STRAIGHT_UP_PAYOUT_MULTIPLIER;
  }

  const netChange = won ? Math.round(betAmount * (multiplier - 1)) : -betAmount;
  return { number, color, won, netChange };
}
