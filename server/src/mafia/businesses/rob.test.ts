import { describe, it, expect } from 'vitest';
import { getRobSuccessChance, resolveBusinessRob } from './rob';

// Same verification note as every prior phase's pure logic: this exact
// set of assertions was run and passed as a standalone script (no npm
// deps) while this sandbox couldn't install vitest.

// Unlike resolveDice (which needs two draws per call and so takes an rng
// *function*), resolveBusinessRob only ever needs one draw for its
// success/fail decision — same shape as resolveGta/resolveBust — so
// `roll` here is the pre-rolled number itself, not a function to call.
//
// Phase 12 balancing pass added `rankIndex` (the ROBBER's rank) between
// `businessLevel` and `roll`, mirroring resolveGta(heat, rankIndex, roll)'s
// own parameter order — every call below that doesn't care about rank
// bonus passes 0 explicitly (rather than relying on the default) so the
// roll always lands in the third position, matching the real call shape
// routes/businesses.ts now uses.

describe('getRobSuccessChance', () => {
  it('is the base chance at level 1, rank 0 (no penalty, no bonus)', () => {
    expect(getRobSuccessChance(1, 0)).toBeCloseTo(0.45, 5);
  });

  it('drops with each level above 1', () => {
    expect(getRobSuccessChance(5, 0)).toBeCloseTo(0.21, 5); // 0.45 - 4*0.06
  });

  it('defaults rankIndex to 0 when omitted (backward-compatible call shape)', () => {
    expect(getRobSuccessChance(5)).toBeCloseTo(0.21, 5);
  });

  it('rises with the robber’s own rank, same per-level figure as GTA (0.01)', () => {
    expect(getRobSuccessChance(1, 4)).toBeCloseTo(0.49, 5); // 0.45 + 4*0.01
    expect(getRobSuccessChance(1, 9)).toBeCloseTo(0.54, 5); // 0.45 + 9*0.01
  });

  it('level penalty and rank bonus combine additively', () => {
    // level 5 (-0.24 from base) + rank 9 (+0.09) = 0.45 - 0.24 + 0.09 = 0.30
    expect(getRobSuccessChance(5, 9)).toBeCloseTo(0.3, 5);
  });

  it('clamps at MIN_CHANCE for a hypothetical very high level even at max rank', () => {
    expect(getRobSuccessChance(50, 9)).toBe(0.1);
  });

  it('clamps at MAX_CHANCE (never exceeds it even with level 1 + top rank)', () => {
    expect(getRobSuccessChance(1, 9)).toBeLessThanOrEqual(0.6);
  });
});

describe('resolveBusinessRob', () => {
  it('succeeds when the roll is below the chance', () => {
    const result = resolveBusinessRob(1, 0, 0); // level 1, rank 0 -> chance 0.45; roll 0 < 0.45
    expect(result.success).toBe(true);
    expect(result.jailSeconds).toBe(0);
    expect(result.xpReward).toBeGreaterThanOrEqual(15);
    expect(result.xpReward).toBeLessThanOrEqual(40);
  });

  it('fails when the roll is above the chance', () => {
    const result = resolveBusinessRob(1, 0, 0.99); // chance 0.45, roll 0.99 > 0.45
    expect(result.success).toBe(false);
    expect(result.jailSeconds).toBeGreaterThanOrEqual(60);
    expect(result.jailSeconds).toBeLessThanOrEqual(120);
    expect(result.xpReward).toBeGreaterThanOrEqual(4);
    expect(result.xpReward).toBeLessThanOrEqual(12);
  });

  it('a higher-level target is harder to rob at the same roll and rank', () => {
    const roll = 0.3;
    const easy = resolveBusinessRob(1, 0, roll); // chance 0.45, 0.3 < 0.45 -> success
    const hard = resolveBusinessRob(5, 0, roll); // chance 0.21, 0.3 > 0.21 -> failure
    expect(easy.success).toBe(true);
    expect(hard.success).toBe(false);
  });

  it('a higher-rank robber succeeds at a roll a rank-0 robber would fail', () => {
    const roll = 0.47; // between level-1's rank-0 chance (0.45) and rank-9 chance (0.54)
    const lowRank = resolveBusinessRob(1, 0, roll);
    const highRank = resolveBusinessRob(1, 9, roll);
    expect(lowRank.success).toBe(false);
    expect(highRank.success).toBe(true);
  });

  it('omitting rankIndex still works and behaves as rank 0', () => {
    const result = resolveBusinessRob(1, undefined, 0.99);
    expect(result.success).toBe(false);
  });

  it('empirical success rate roughly matches the configured chance over many trials', () => {
    const trials = 100_000;
    let wins = 0;
    for (let i = 0; i < trials; i++) {
      if (resolveBusinessRob(1, 0).success) wins++;
    }
    // Theoretical: 0.45 at level 1, rank 0.
    expect(wins / trials).toBeGreaterThan(0.43);
    expect(wins / trials).toBeLessThan(0.47);
  });

  it('empirical success rate at top rank roughly matches the boosted chance', () => {
    const trials = 100_000;
    let wins = 0;
    for (let i = 0; i < trials; i++) {
      if (resolveBusinessRob(1, 9).success) wins++;
    }
    // Theoretical: 0.54 at level 1, rank 9.
    expect(wins / trials).toBeGreaterThan(0.52);
    expect(wins / trials).toBeLessThan(0.56);
  });
});
