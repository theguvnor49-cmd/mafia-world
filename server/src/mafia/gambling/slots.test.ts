import { describe, it, expect } from 'vitest';
import { resolveSlots } from './slots';
import { GAMBLING } from '../config';

// Same verification note as every prior phase's pure logic: this exact
// set of assertions was run and passed as a standalone script (no npm
// deps) while this sandbox couldn't install vitest.

function queueRng(values: number[]): () => number {
  let i = 0;
  return () => {
    if (i >= values.length) throw new Error('queueRng exhausted — test drew more values than expected');
    return values[i++];
  };
}

// Weights are CHERRY 40 / LEMON 28 / BELL 18 / DIAMOND 10 / SEVEN 4 (sum
// 100) — these rng values each land squarely inside one symbol's slice of
// the weighted-threshold loop in slots.ts.
const CHERRY_RNG = 0.1;
const LEMON_RNG = 0.5;
const BELL_RNG = 0.8;
const DIAMOND_RNG = 0.9;
const SEVEN_RNG = 0.99;

describe('resolveSlots', () => {
  it('three cherries pays the cherry three-of-a-kind multiplier', () => {
    const result = resolveSlots(1000, queueRng([CHERRY_RNG, CHERRY_RNG, CHERRY_RNG]));
    expect(result.reels).toEqual(['🍒', '🍒', '🍒']);
    expect(result.won).toBe(true);
    expect(result.multiplier).toBe(2);
    expect(result.netChange).toBe(1000); // 1000 * (2 - 1)
  });

  it('three sevens pays the jackpot multiplier', () => {
    const result = resolveSlots(1000, queueRng([SEVEN_RNG, SEVEN_RNG, SEVEN_RNG]));
    expect(result.reels).toEqual(['7️⃣', '7️⃣', '7️⃣']);
    expect(result.won).toBe(true);
    expect(result.multiplier).toBe(40);
    expect(result.netChange).toBe(39_000);
  });

  it('two cherries (not three) pays the smaller consolation multiplier', () => {
    // Multiplier retuned 1.5 -> 1.75 in the Phase 12 balancing pass (see
    // GAME_DESIGN.md's economy-audit section): at 1.5 this game's real
    // house edge was ~32.5%, an outlier next to roulette/dice/blackjack's
    // 2.7%-25%; 1.75 brings it to ~25%, in line with dice's own steepest
    // bet instead of well above everything else.
    const result = resolveSlots(1000, queueRng([CHERRY_RNG, CHERRY_RNG, BELL_RNG]));
    expect(result.reels).toEqual(['🍒', '🍒', '🔔']);
    expect(result.won).toBe(true);
    expect(result.multiplier).toBe(1.75);
    expect(result.netChange).toBe(750);
  });

  it('two cherries in any position still counts (not just adjacent)', () => {
    const result = resolveSlots(1000, queueRng([CHERRY_RNG, BELL_RNG, CHERRY_RNG]));
    expect(result.reels).toEqual(['🍒', '🔔', '🍒']);
    expect(result.won).toBe(true);
    expect(result.multiplier).toBe(1.75);
  });

  it('no match and fewer than two cherries is a total loss', () => {
    const result = resolveSlots(1000, queueRng([CHERRY_RNG, LEMON_RNG, BELL_RNG]));
    expect(result.reels).toEqual(['🍒', '🍋', '🔔']);
    expect(result.won).toBe(false);
    expect(result.multiplier).toBe(0);
    expect(result.netChange).toBe(-1000);
  });

  it('three-of-a-kind on every symbol pays that symbol’s own configured multiplier', () => {
    for (const def of GAMBLING.SLOTS.SYMBOLS) {
      const rngVal = def.symbol === '🍒' ? CHERRY_RNG
        : def.symbol === '🍋' ? LEMON_RNG
        : def.symbol === '🔔' ? BELL_RNG
        : def.symbol === '💎' ? DIAMOND_RNG
        : SEVEN_RNG;
      const result = resolveSlots(100, queueRng([rngVal, rngVal, rngVal]));
      expect(result.multiplier).toBe(def.threeOfAKindMultiplier);
    }
  });

  it('every reel is always one of the five configured symbols, over many trials', () => {
    const validSymbols = new Set(GAMBLING.SLOTS.SYMBOLS.map((s) => s.symbol));
    for (let i = 0; i < 10_000; i++) {
      const result = resolveSlots(100);
      for (const reel of result.reels) {
        expect(validSymbols.has(reel)).toBe(true);
      }
    }
  });

  it('empirical symbol frequency roughly matches each symbol’s configured weight', () => {
    const trials = 200_000;
    const counts: Record<string, number> = {};
    for (let i = 0; i < trials; i++) {
      const result = resolveSlots(100);
      for (const reel of result.reels) {
        counts[reel] = (counts[reel] ?? 0) + 1;
      }
    }
    const totalDraws = trials * 3;
    const totalWeight = GAMBLING.SLOTS.SYMBOLS.reduce((sum, s) => sum + s.weight, 0);
    for (const def of GAMBLING.SLOTS.SYMBOLS) {
      const expectedShare = def.weight / totalWeight;
      const actualShare = (counts[def.symbol] ?? 0) / totalDraws;
      expect(actualShare).toBeGreaterThan(expectedShare - 0.02);
      expect(actualShare).toBeLessThan(expectedShare + 0.02);
    }
  });
});
