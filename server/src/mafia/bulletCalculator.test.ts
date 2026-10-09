import { describe, it, expect } from 'vitest';
import { calculateBulletsToKill } from './bulletCalculator';
import { BULLET_CALC } from './config';

// Same verification note as gta.test.ts / heat.test.ts: this exact set of
// assertions was run and passed as a standalone script (no npm deps) while
// this sandbox couldn't install vitest.

describe('calculateBulletsToKill', () => {
  it('matches a hand-worked example: Rookie (120) vs 9mm (1.00x), no armour', () => {
    expect(
      calculateBulletsToKill({
        targetBaseBullets: 120,
        gunMultiplier: 1.0,
        armourBonusBullets: 0,
        armourMultiplier: 1,
      })
    ).toBe(120);
  });

  it('matches a hand-worked example with armour: Rookie (120) vs Pocket Pistol (1.10x) vs Light Vest (+40, 1.10x)', () => {
    // gunApplied = 132, withArmour = 172, final = 189.2 -> round 189
    expect(
      calculateBulletsToKill({
        targetBaseBullets: 120,
        gunMultiplier: 1.1,
        armourBonusBullets: 40,
        armourMultiplier: 1.1,
      })
    ).toBe(189);
  });

  it('matches a hand-worked example at the top end: Legend (1050) vs Sniper Rifle (0.70x) vs Heavy Plates (+160, 1.35x)', () => {
    // gunApplied = 735, withArmour = 895, final = 1208.25 -> round 1208
    expect(
      calculateBulletsToKill({
        targetBaseBullets: 1050,
        gunMultiplier: 0.7,
        armourBonusBullets: 160,
        armourMultiplier: 1.35,
      })
    ).toBe(1208);
  });

  it('floors at BULLET_CALC.MIN_BULLETS when the raw formula would go lower', () => {
    // final = 10, which is below the 25 floor from the brief.
    expect(
      calculateBulletsToKill({
        targetBaseBullets: 10,
        gunMultiplier: 1,
        armourBonusBullets: 0,
        armourMultiplier: 1,
      })
    ).toBe(BULLET_CALC.MIN_BULLETS);
  });

  it('does not floor a result already above MIN_BULLETS', () => {
    expect(
      calculateBulletsToKill({
        targetBaseBullets: 30,
        gunMultiplier: 1,
        armourBonusBullets: 0,
        armourMultiplier: 1,
      })
    ).toBe(30);
  });
});
