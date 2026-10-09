import { describe, it, expect } from 'vitest';
import { getBusinessTypeDef, getIncomePerHour, computeAccruedCash, getUpgradeCost } from './income';

// Same verification note as every prior phase's pure logic: this exact
// set of assertions was run and passed as a standalone script (no npm
// deps) while this sandbox couldn't install vitest.

describe('getBusinessTypeDef', () => {
  it('finds a real catalog type', () => {
    expect(getBusinessTypeDef('Casino').basePrice).toBe(750_000);
  });

  it('throws on an unknown type', () => {
    expect(() => getBusinessTypeDef('Pizzeria')).toThrow();
  });
});

describe('getIncomePerHour', () => {
  it('equals the catalog base rate at level 1', () => {
    expect(getIncomePerHour('Chop Shop', 1)).toBe(500);
  });

  it('scales linearly with level', () => {
    expect(getIncomePerHour('Chop Shop', 5)).toBe(2_500);
    expect(getIncomePerHour('Casino', 3)).toBe(36_000);
  });
});

describe('computeAccruedCash', () => {
  const start = new Date('2026-01-01T00:00:00Z');

  it('is zero with no elapsed time', () => {
    expect(computeAccruedCash('Garage', 1, start, start)).toBe(0);
  });

  it('equals exactly one hour of income after one hour', () => {
    const oneHourLater = new Date(start.getTime() + 3_600_000);
    expect(computeAccruedCash('Garage', 1, start, oneHourLater)).toBe(1_000);
  });

  it('scales with level and fractional hours, floored to a whole dollar', () => {
    const ninetyMinutesLater = new Date(start.getTime() + 90 * 60 * 1000);
    // Garage level 2 = 2000/hr; 1.5 hours = 3000 exactly.
    expect(computeAccruedCash('Garage', 2, start, ninetyMinutesLater)).toBe(3_000);
    // A rate that doesn't divide evenly floors rather than rounding.
    const oneThirdHourLater = new Date(start.getTime() + 20 * 60 * 1000);
    expect(computeAccruedCash('Chop Shop', 1, start, oneThirdHourLater)).toBe(166); // 500/3 = 166.67
  });

  it('never goes negative even if "now" is somehow before lastCollectedAt', () => {
    const earlier = new Date(start.getTime() - 60_000);
    expect(computeAccruedCash('Garage', 1, start, earlier)).toBe(0);
  });
});

describe('getUpgradeCost', () => {
  it('costs exactly one base price to go from level 1 to 2', () => {
    expect(getUpgradeCost('Warehouse', 1)).toBe(200_000);
  });

  it('scales linearly with the level being left', () => {
    expect(getUpgradeCost('Warehouse', 4)).toBe(800_000);
  });
});
