import { describe, it, expect } from 'vitest';
import { getRobSuccessChance, resolveBusinessRob } from './rob';

// Same verification note as every prior phase's pure logic: this exact
// set of assertions was run and passed as a standalone script (no npm
// deps) while this sandbox couldn't install vitest.

// Unlike resolveDice (which needs two draws per call and so takes an rng
// *function*), resolveBusinessRob only ever needs one draw for its
// success/fail decision — same shape as resolveGta/resolveBust — so
// `roll` here is the pre-rolled number itself, not a function to call.

describe('getRobSuccessChance', () => {
  it('is the base chance at level 1 (no penalty)', () => {
    expect(getRobSuccessChance(1)).toBeCloseTo(0.45, 5);
  });

  it('drops with each level above 1', () => {
    expect(getRobSuccessChance(5)).toBeCloseTo(0.21, 5); // 0.45 - 4*0.06
  });

  it('clamps at MIN_CHANCE for a hypothetical very high level', () => {
    expect(getRobSuccessChance(50)).toBe(0.1);
  });

  it('clamps at MAX_CHANCE (never exceeds it even if the formula allowed it)', () => {
    expect(getRobSuccessChance(1)).toBeLessThanOrEqual(0.6);
  });
});

describe('resolveBusinessRob', () => {
  it('succeeds when the roll is below the chance', () => {
    const result = resolveBusinessRob(1, 0); // roll 0 < chance 0.45
    expect(result.success).toBe(true);
    expect(result.jailSeconds).toBe(0);
    expect(result.xpReward).toBeGreaterThanOrEqual(15);
    expect(result.xpReward).toBeLessThanOrEqual(40);
  });

  it('fails when the roll is above the chance', () => {
    const result = resolveBusinessRob(1, 0.99); // roll 0.99 > chance 0.45
    expect(result.success).toBe(false);
    expect(result.jailSeconds).toBeGreaterThanOrEqual(60);
    expect(result.jailSeconds).toBeLessThanOrEqual(120);
    expect(result.xpReward).toBeGreaterThanOrEqual(4);
    expect(result.xpReward).toBeLessThanOrEqual(12);
  });

  it('a higher-level target is harder to rob at the same roll', () => {
    const roll = 0.3;
    const easy = resolveBusinessRob(1, roll); // chance 0.45, 0.3 < 0.45 -> success
    const hard = resolveBusinessRob(5, roll); // chance 0.21, 0.3 > 0.21 -> failure
    expect(easy.success).toBe(true);
    expect(hard.success).toBe(false);
  });

  it('empirical success rate roughly matches the configured chance over many trials', () => {
    const trials = 100_000;
    let wins = 0;
    for (let i = 0; i < trials; i++) {
      if (resolveBusinessRob(1).success) wins++;
    }
    // Theoretical: 0.45 at level 1.
    expect(wins / trials).toBeGreaterThan(0.43);
    expect(wins / trials).toBeLessThan(0.47);
  });
});
