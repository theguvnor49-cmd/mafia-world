import { describe, it, expect } from 'vitest';
import { computeEffectiveHeat, clampHeat } from './heat';
import { HEAT } from './config';

// See the header note in crimes/gta.test.ts — this suite's assertions were
// run and passed as a standalone script before vitest could be installed.

describe('computeEffectiveHeat', () => {
  const t0 = new Date('2026-01-01T00:00:00Z');

  it('decays by 1 point after exactly 180s at the placeholder rate', () => {
    expect(computeEffectiveHeat(50, t0, new Date(t0.getTime() + 180_000))).toBe(49);
  });

  it('floors at HEAT.MIN after a very long time', () => {
    expect(computeEffectiveHeat(50, t0, new Date(t0.getTime() + 1000 * 3600 * 1000))).toBe(HEAT.MIN);
  });

  it('never goes negative when already at 0', () => {
    expect(computeEffectiveHeat(0, t0, new Date(t0.getTime() + 999_999_000))).toBe(0);
  });

  it('is unchanged with zero elapsed time', () => {
    expect(computeEffectiveHeat(50, t0, t0)).toBe(50);
  });
});

describe('clampHeat', () => {
  it('clamps above MAX down to MAX', () => {
    expect(clampHeat(150)).toBe(HEAT.MAX);
  });

  it('clamps below MIN up to MIN', () => {
    expect(clampHeat(-10)).toBe(HEAT.MIN);
  });
});
