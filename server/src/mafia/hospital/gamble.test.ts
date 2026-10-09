import { describe, it, expect } from 'vitest';
import { resolveGamble } from './gamble';

// Same verification note as every prior phase's pure logic: this exact
// set of assertions was run and passed as a standalone script (no npm
// deps) while this sandbox couldn't install vitest.

describe('resolveGamble', () => {
  it('wins on a low roll (just under the 0.5 boundary)', () => {
    const result = resolveGamble(1000, 0.4999);
    expect(result.won).toBe(true);
    expect(result.netChange).toBe(1000);
  });

  it('loses on a high roll (just over the 0.5 boundary)', () => {
    const result = resolveGamble(1000, 0.5001);
    expect(result.won).toBe(false);
    expect(result.netChange).toBe(-1000);
  });

  it('loses exactly at the 0.5 boundary (< 0.5 wins, not <=)', () => {
    const result = resolveGamble(1000, 0.5);
    expect(result.won).toBe(false);
    expect(result.netChange).toBe(-1000);
  });

  it('wins at roll 0 (the lowest Math.random() can return)', () => {
    const result = resolveGamble(500, 0);
    expect(result.won).toBe(true);
    expect(result.netChange).toBe(500);
  });

  it('loses at roll just under 1 (the highest Math.random() can return)', () => {
    const result = resolveGamble(500, 0.9999);
    expect(result.won).toBe(false);
    expect(result.netChange).toBe(-500);
  });

  it('net change always scales with the bet amount, win or lose', () => {
    expect(resolveGamble(5000, 0.1).netChange).toBe(5000);
    expect(resolveGamble(5000, 0.9).netChange).toBe(-5000);
  });
});
