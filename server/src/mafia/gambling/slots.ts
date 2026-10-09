import { GAMBLING } from '../config';

export interface SlotsResult {
  reels: [string, string, string];
  multiplier: number;
  won: boolean;
  netChange: number;
}

const CHERRY = '🍒';

/**
 * Three independent reels (brief section 23's "slots" candidate), each
 * drawn with replacement from `GAMBLING.SLOTS.SYMBOLS` using the symbol's
 * `weight` (same weighted-threshold technique as `pickVehicleDrop`, just
 * applied three times instead of once). Pure, injectable `rng` — three
 * draws, one per reel.
 *
 * Payout: three matching symbols pays that symbol's own
 * `threeOfAKindMultiplier` (rarer symbols are weighted to come up less
 * often *and* pay more, standard slot-machine shape); otherwise two
 * cherries anywhere (regardless of the third reel) pays the smaller
 * `TWO_CHERRIES_MULTIPLIER` consolation — a specific, named rule, not "any
 * two matching symbols"; anything else is a total loss.
 */
export function resolveSlots(betAmount: number, rng: () => number = Math.random): SlotsResult {
  const reels = [pickSymbol(rng), pickSymbol(rng), pickSymbol(rng)] as [string, string, string];

  let multiplier = 0;
  if (reels[0] === reels[1] && reels[1] === reels[2]) {
    const def = GAMBLING.SLOTS.SYMBOLS.find((s) => s.symbol === reels[0]);
    multiplier = def ? def.threeOfAKindMultiplier : 0;
  } else if (reels.filter((r) => r === CHERRY).length >= 2) {
    multiplier = GAMBLING.SLOTS.TWO_CHERRIES_MULTIPLIER;
  }

  const won = multiplier > 0;
  const netChange = won ? Math.round(betAmount * (multiplier - 1)) : -betAmount;

  return { reels, multiplier, won, netChange };
}

function pickSymbol(rng: () => number): string {
  const symbols = GAMBLING.SLOTS.SYMBOLS;
  const totalWeight = symbols.reduce((sum, s) => sum + s.weight, 0);
  let threshold = rng() * totalWeight;
  for (const s of symbols) {
    threshold -= s.weight;
    if (threshold <= 0) return s.symbol;
  }
  // Floating-point safety net — should only trigger if rng() returns ~1.
  return symbols[symbols.length - 1].symbol;
}
