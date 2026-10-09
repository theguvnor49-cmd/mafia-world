import { describe, it, expect } from 'vitest';
import { resolveDice } from './dice';

// Same verification note as every prior phase's pure logic: this exact
// set of assertions was run and passed as a standalone script (no npm
// deps) while this sandbox couldn't install vitest.

/** Deterministic rng that returns a fixed sequence, one value per call —
 * throws if a test calls it more times than it supplied values for, so a
 * test accidentally relying on an extra draw fails loudly instead of
 * silently wrapping around. */
function queueRng(values: number[]): () => number {
  let i = 0;
  return () => {
    if (i >= values.length) throw new Error('queueRng exhausted — test drew more values than expected');
    return values[i++];
  };
}

// rng value -> die face: floor(rng * 6) + 1. 0 -> 1, 0.5 -> 4, 0.9999 -> 6.
describe('resolveDice', () => {
  it('UNDER wins on a low roll (1+1=2)', () => {
    const result = resolveDice(1000, 'under', queueRng([0, 0]));
    expect(result.die1).toBe(1);
    expect(result.die2).toBe(1);
    expect(result.sum).toBe(2);
    expect(result.won).toBe(true);
    expect(result.netChange).toBe(900); // 1000 * (1.9 - 1)
  });

  it('SEVEN wins on an exact seven (4+3=7)', () => {
    const result = resolveDice(1000, 'seven', queueRng([0.5, 1 / 3]));
    expect(result.sum).toBe(7);
    expect(result.won).toBe(true);
    expect(result.netChange).toBe(3500); // 1000 * (4.5 - 1)
  });

  it('OVER wins on a high roll (6+6=12)', () => {
    const result = resolveDice(1000, 'over', queueRng([0.9999, 0.9999]));
    expect(result.sum).toBe(12);
    expect(result.won).toBe(true);
    expect(result.netChange).toBe(900);
  });

  it('loses when the category does not match the bet (rolled seven, bet under)', () => {
    const result = resolveDice(1000, 'under', queueRng([0.5, 1 / 3]));
    expect(result.sum).toBe(7);
    expect(result.won).toBe(false);
    expect(result.netChange).toBe(-1000);
  });

  it('loses when the category does not match the bet (rolled under, bet seven)', () => {
    const result = resolveDice(500, 'seven', queueRng([0, 0]));
    expect(result.sum).toBe(2);
    expect(result.won).toBe(false);
    expect(result.netChange).toBe(-500);
  });

  it('every die face is always within 1-6', () => {
    for (let face = 0; face < 6; face++) {
      const rngVal = face / 6;
      const result = resolveDice(100, 'under', queueRng([rngVal, rngVal]));
      expect(result.die1).toBeGreaterThanOrEqual(1);
      expect(result.die1).toBeLessThanOrEqual(6);
      expect(result.die1).toBe(face + 1);
    }
  });

  it('empirical win rates roughly match the real probabilities over many trials', () => {
    const trials = 100_000;
    let underWins = 0;
    let sevenWins = 0;
    let overWins = 0;
    for (let i = 0; i < trials; i++) {
      const r = resolveDice(100, 'under');
      if (r.sum <= 6) underWins++;
      if (r.sum === 7) sevenWins++;
      if (r.sum >= 8) overWins++;
    }
    // Theoretical: under/over 15/36 (~0.4167), seven 6/36 (~0.1667).
    expect(underWins / trials).toBeGreaterThan(0.39);
    expect(underWins / trials).toBeLessThan(0.44);
    expect(sevenWins / trials).toBeGreaterThan(0.15);
    expect(sevenWins / trials).toBeLessThan(0.18);
    expect(overWins / trials).toBeGreaterThan(0.39);
    expect(overWins / trials).toBeLessThan(0.44);
  });
});
