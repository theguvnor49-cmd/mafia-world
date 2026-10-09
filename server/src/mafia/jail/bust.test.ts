import { describe, it, expect } from 'vitest';
import { getBustSuccessChance, getBustReward, resolveBust } from './bust';

// Same verification note as gta.test.ts / heat.test.ts / bulletCalculator.test.ts:
// this exact set of assertions was run and passed as a standalone script
// (no npm deps) while this sandbox couldn't install vitest.

describe('getBustSuccessChance', () => {
  it('is 25% with no bust history', () => {
    expect(getBustSuccessChance(0, 0)).toBeCloseTo(0.25);
  });

  it('adds 2% per prior successful bust', () => {
    expect(getBustSuccessChance(5, 0)).toBeCloseTo(0.35);
  });

  it('subtracts 1% per prior failed bust', () => {
    expect(getBustSuccessChance(0, 5)).toBeCloseTo(0.2);
  });

  it('clamps at the 80% ceiling', () => {
    // Raw would be 0.25 + 30*0.02 = 0.85.
    expect(getBustSuccessChance(30, 0)).toBeCloseTo(0.8);
  });

  it('clamps at the 15% floor', () => {
    // Raw would be 0.25 - 20*0.01 = 0.05.
    expect(getBustSuccessChance(0, 20)).toBeCloseTo(0.15);
  });
});

describe('getBustReward', () => {
  it('is $25,000 with no successful busts yet', () => {
    expect(getBustReward(0)).toBe(25_000);
  });

  it('adds $4,000 per prior successful bust', () => {
    expect(getBustReward(3)).toBe(37_000);
    expect(getBustReward(10)).toBe(65_000);
  });
});

describe('resolveBust', () => {
  it('succeeds when the roll lands below the chance, with the matching reward', () => {
    expect(resolveBust(0, 0, 0.24)).toEqual({ success: true, cashReward: 25_000 });
    expect(resolveBust(5, 0, 0.34)).toEqual({ success: true, cashReward: 45_000 });
  });

  it('fails when the roll lands at or above the chance, with no reward', () => {
    expect(resolveBust(0, 0, 0.26)).toEqual({ success: false, cashReward: 0 });
  });

  it('uses the clamped ceiling, not the raw formula, to decide the roll boundary', () => {
    // Raw chance would be 0.85, but it's clamped to 0.80 — a roll of 0.79
    // must still succeed (it's a real scenario at 30 prior successful busts).
    expect(resolveBust(30, 0, 0.79)).toEqual({ success: true, cashReward: 145_000 });
  });

  it('uses the clamped floor, not the raw formula, to decide the roll boundary', () => {
    // Raw chance would be 0.05, but it's clamped to 0.15.
    expect(resolveBust(0, 20, 0.14)).toEqual({ success: true, cashReward: 25_000 });
    expect(resolveBust(0, 20, 0.16)).toEqual({ success: false, cashReward: 0 });
  });
});
