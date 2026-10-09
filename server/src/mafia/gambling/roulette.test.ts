import { describe, it, expect } from 'vitest';
import { resolveRoulette } from './roulette';

// Same verification note as every prior phase's pure logic: this exact
// set of assertions was run and passed as a standalone script (no npm
// deps) while this sandbox couldn't install vitest.

function queueRng(values: number[]): () => number {
  let i = 0;
  return () => {
    if (i >= values.length) throw new Error('queueRng exhausted — test drew more values than expected');
    return values[i++];
  };
}

/** rng value that makes `Math.floor(rng * 37)` land exactly on `n`. */
function rngFor(n: number): number {
  return (n + 0.5) / 37;
}

describe('resolveRoulette', () => {
  it('0 is green and loses every color bet', () => {
    const result = resolveRoulette(1000, { type: 'color', color: 'red' }, queueRng([rngFor(0)]));
    expect(result.number).toBe(0);
    expect(result.color).toBe('green');
    expect(result.won).toBe(false);
    expect(result.netChange).toBe(-1000);
  });

  it('0 loses every parity bet too (neither odd nor even)', () => {
    const result = resolveRoulette(1000, { type: 'parity', parity: 'even' }, queueRng([rngFor(0)]));
    expect(result.won).toBe(false);
  });

  it('0 wins a straight-up bet on 0', () => {
    const result = resolveRoulette(1000, { type: 'number', number: 0 }, queueRng([rngFor(0)]));
    expect(result.won).toBe(true);
    expect(result.netChange).toBe(35_000); // 1000 * (36 - 1)
  });

  it('number 1 is red — a red color bet wins, a black one loses', () => {
    const win = resolveRoulette(1000, { type: 'color', color: 'red' }, queueRng([rngFor(1)]));
    expect(win.color).toBe('red');
    expect(win.won).toBe(true);
    expect(win.netChange).toBe(1000); // 1000 * (2 - 1)

    const lose = resolveRoulette(1000, { type: 'color', color: 'black' }, queueRng([rngFor(1)]));
    expect(lose.won).toBe(false);
    expect(lose.netChange).toBe(-1000);
  });

  it('number 2 is black and even', () => {
    const colorResult = resolveRoulette(1000, { type: 'color', color: 'black' }, queueRng([rngFor(2)]));
    expect(colorResult.color).toBe('black');
    expect(colorResult.won).toBe(true);

    const parityResult = resolveRoulette(1000, { type: 'parity', parity: 'even' }, queueRng([rngFor(2)]));
    expect(parityResult.won).toBe(true);

    const oddResult = resolveRoulette(1000, { type: 'parity', parity: 'odd' }, queueRng([rngFor(2)]));
    expect(oddResult.won).toBe(false);
  });

  it('a straight-up number bet wins only on an exact match', () => {
    const hit = resolveRoulette(500, { type: 'number', number: 7 }, queueRng([rngFor(7)]));
    expect(hit.won).toBe(true);
    expect(hit.netChange).toBe(17_500); // 500 * 35

    const miss = resolveRoulette(500, { type: 'number', number: 7 }, queueRng([rngFor(8)]));
    expect(miss.won).toBe(false);
    expect(miss.netChange).toBe(-500);
  });

  it('the spun number is always within 0-36, over many trials', () => {
    for (let i = 0; i < 10_000; i++) {
      const result = resolveRoulette(100, { type: 'color', color: 'red' });
      expect(result.number).toBeGreaterThanOrEqual(0);
      expect(result.number).toBeLessThanOrEqual(36);
    }
  });

  it('empirical color/number frequencies roughly match the real 37-slot wheel', () => {
    const trials = 200_000;
    let reds = 0;
    let blacks = 0;
    let greens = 0;
    let exactSevens = 0;
    for (let i = 0; i < trials; i++) {
      const result = resolveRoulette(100, { type: 'number', number: 7 });
      if (result.color === 'red') reds++;
      else if (result.color === 'black') blacks++;
      else greens++;
      if (result.number === 7) exactSevens++;
    }
    // 18/37 red, 18/37 black, 1/37 green, 1/37 for any exact number.
    expect(reds / trials).toBeGreaterThan(0.46);
    expect(reds / trials).toBeLessThan(0.51);
    expect(blacks / trials).toBeGreaterThan(0.46);
    expect(blacks / trials).toBeLessThan(0.51);
    expect(greens / trials).toBeGreaterThan(0.02 - 0.01);
    expect(greens / trials).toBeLessThan(0.02 + 0.01);
    expect(exactSevens / trials).toBeGreaterThan(1 / 37 - 0.01);
    expect(exactSevens / trials).toBeLessThan(1 / 37 + 0.01);
  });
});
