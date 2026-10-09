import { describe, it, expect } from 'vitest';
import { getGtaSuccessChance, resolveGta } from './gta';
import { GTA } from '../config';

// This exact set of assertions was run and passed as a standalone script
// (no npm deps) while this sandbox couldn't install vitest — see
// GAME_DESIGN.md "Open questions" for why, and TODO.md for what that run
// covered. Keeping it here as a real vitest suite for the first time
// `npm test` actually runs.

describe('getGtaSuccessChance', () => {
  it('clamps to MIN_SUCCESS_CHANCE at very high heat', () => {
    expect(getGtaSuccessChance(1000, 0)).toBe(GTA.MIN_SUCCESS_CHANCE);
  });

  it('clamps to MAX_SUCCESS_CHANCE when the raw formula would exceed it (synthetic extreme input)', () => {
    expect(getGtaSuccessChance(-1000, 9)).toBe(GTA.MAX_SUCCESS_CHANCE);
  });

  it('equals BASE_SUCCESS_CHANCE at heat=0, rank=0', () => {
    expect(getGtaSuccessChance(0, 0)).toBe(GTA.BASE_SUCCESS_CHANCE);
  });

  it('tops out at 0.87 with realistic inputs (heat 0-100, rank 0-9) — the brief\'s 90% cap is a safety ceiling that rank/heat alone can\'t currently reach', () => {
    expect(getGtaSuccessChance(0, 9)).toBeCloseTo(0.87, 9);
  });
});

describe('resolveGta', () => {
  it('forced success (roll=0): succeeds, no jail, rewards in range', () => {
    const outcome = resolveGta(0, 3, 0);
    expect(outcome.success).toBe(true);
    expect(outcome.jailSeconds).toBe(0);
    expect(outcome.cashReward).toBeGreaterThanOrEqual(
      GTA.SUCCESS_CASH_MIN + 3 * GTA.SUCCESS_CASH_RANK_BONUS_PER_LEVEL
    );
    expect(outcome.cashReward).toBeLessThanOrEqual(GTA.SUCCESS_CASH_MAX + 3 * GTA.SUCCESS_CASH_RANK_BONUS_PER_LEVEL);
    expect(outcome.xpReward).toBeGreaterThanOrEqual(GTA.SUCCESS_XP_MIN + 3 * GTA.SUCCESS_XP_RANK_BONUS_PER_LEVEL);
    expect(outcome.xpReward).toBeLessThanOrEqual(GTA.SUCCESS_XP_MAX + 3 * GTA.SUCCESS_XP_RANK_BONUS_PER_LEVEL);
    expect(outcome.heatChange).toBeGreaterThanOrEqual(GTA.SUCCESS_HEAT_MIN);
    expect(outcome.heatChange).toBeLessThanOrEqual(GTA.SUCCESS_HEAT_MAX);
  });

  it('forced failure (roll=0.999999): fails, no cash, jail and penalties in range', () => {
    const outcome = resolveGta(0, 0, 0.999999);
    expect(outcome.success).toBe(false);
    expect(outcome.cashReward).toBe(0);
    expect(outcome.jailSeconds).toBeGreaterThanOrEqual(GTA.FAILURE_JAIL_SECONDS_MIN);
    expect(outcome.jailSeconds).toBeLessThanOrEqual(GTA.FAILURE_JAIL_SECONDS_MAX);
    expect(outcome.xpReward).toBeGreaterThanOrEqual(GTA.FAILURE_XP_MIN);
    expect(outcome.xpReward).toBeLessThanOrEqual(GTA.FAILURE_XP_MAX);
    expect(outcome.heatChange).toBeGreaterThanOrEqual(GTA.FAILURE_HEAT_MIN);
    expect(outcome.heatChange).toBeLessThanOrEqual(GTA.FAILURE_HEAT_MAX);
  });

  it('empirical success rate over many trials matches the formula (heat=0, rank=0)', () => {
    const trials = 50_000;
    let successes = 0;
    for (let i = 0; i < trials; i++) {
      if (resolveGta(0, 0).success) successes++;
    }
    expect(Math.abs(successes / trials - GTA.BASE_SUCCESS_CHANCE)).toBeLessThan(0.02);
  });
});
