import { describe, it, expect } from 'vitest';
import { pickVehicleDrop } from './drop';

// Same verification note as every prior phase's pure logic: this exact set
// of assertions was run and passed as a standalone script (no npm deps)
// while this sandbox couldn't install vitest.

const REAL_CATALOG = [
  { name: 'Hatchback', theftDifficulty: 8 },
  { name: 'Sedan', theftDifficulty: 10 },
  { name: 'Pickup Truck', theftDifficulty: 12 },
  { name: 'SUV', theftDifficulty: 22 },
  { name: 'Sports Coupe', theftDifficulty: 25 },
  { name: 'Muscle Car', theftDifficulty: 28 },
  { name: 'Luxury Sedan', theftDifficulty: 45 },
  { name: 'Convertible', theftDifficulty: 48 },
  { name: 'Armored Van', theftDifficulty: 50 },
  { name: 'Vintage Classic', theftDifficulty: 68 },
  { name: 'Supercar', theftDifficulty: 70 },
  { name: 'Armored Limousine', theftDifficulty: 72 },
  { name: 'Lamborghini', theftDifficulty: 90 },
  { name: 'Bugatti', theftDifficulty: 92 },
  { name: 'Armored Presidential Limo', theftDifficulty: 95 },
];

describe('pickVehicleDrop', () => {
  it('returns null when the drop roll misses (>= the 20% threshold)', () => {
    expect(pickVehicleDrop(REAL_CATALOG, 0.2, 0.5)).toBeNull();
    expect(pickVehicleDrop(REAL_CATALOG, 0.9, 0.5)).toBeNull();
  });

  it('proceeds to pick when the drop roll hits (just under the threshold)', () => {
    expect(pickVehicleDrop(REAL_CATALOG, 0.1999, 0.5)).not.toBeNull();
  });

  it('returns null for an empty catalog even when the drop roll hits', () => {
    expect(pickVehicleDrop([], 0.0, 0.5)).toBeNull();
  });

  it('weights selection toward lower theft difficulty, on a simple 2-item catalog', () => {
    // weight(A) = 101-1 = 100, weight(B) = 101-91 = 10, total = 110.
    // A's cumulative share is [0, 100/110); B's is [100/110, 1).
    const two = [
      { name: 'A', theftDifficulty: 1 },
      { name: 'B', theftDifficulty: 91 },
    ];
    expect(pickVehicleDrop(two, 0, 0)?.name).toBe('A');
    expect(pickVehicleDrop(two, 0, 0.5)?.name).toBe('A');
    expect(pickVehicleDrop(two, 0, 0.95)?.name).toBe('B');
    expect(pickVehicleDrop(two, 0, 0.999999)?.name).toBe('B');
  });

  it('matches a hand-worked boundary on the real 15-vehicle catalog', () => {
    // Total weight across the real catalog is 780 (see drop.test.ts header
    // math, verified independently in the executed scratchpad script).
    // Hatchback's weight is 93, so pickRoll just under 93/780 ≈ 0.1192
    // should select it (the first item), and just over should move on.
    expect(pickVehicleDrop(REAL_CATALOG, 0, 0.11)?.name).toBe('Hatchback');
  });

  it('never selects a vehicle the drop roll should have blocked, across repeated calls', () => {
    for (let i = 0; i < 20; i++) {
      expect(pickVehicleDrop(REAL_CATALOG, 0.99, Math.random())).toBeNull();
    }
  });
});
