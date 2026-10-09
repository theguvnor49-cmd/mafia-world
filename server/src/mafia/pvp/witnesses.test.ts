import { describe, it, expect } from 'vitest';
import { pickWitnesses } from './witnesses';

// Same verification note as the Phase 3/4 test files: this exact set of
// assertions was run and passed as a standalone script (no npm deps)
// while this sandbox couldn't install vitest.

describe('pickWitnesses', () => {
  it('returns empty when there are no candidates', () => {
    expect(pickWitnesses([], 3)).toEqual([]);
  });

  it('returns every candidate, unmodified in count, when fewer than max', () => {
    const result = pickWitnesses(['a', 'b'], 3, () => 0);
    expect(result).toHaveLength(2);
    expect(new Set(result)).toEqual(new Set(['a', 'b']));
  });

  it('is deterministic with a fixed rng (always picks index 0 of the shrinking pool)', () => {
    expect(pickWitnesses(['a', 'b', 'c', 'd', 'e'], 3, () => 0)).toEqual(['a', 'b', 'c']);
  });

  it('never returns more than max, even with a huge candidate pool', () => {
    const candidates = Array.from({ length: 1000 }, (_, i) => i);
    expect(pickWitnesses(candidates, 3)).toHaveLength(3);
  });

  it('never picks the same candidate twice, across a cycling rng sequence', () => {
    const candidates = Array.from({ length: 10 }, (_, i) => i);
    const sequence = [0.9, 0.1, 0.5, 0.99, 0.0];
    let call = 0;
    const rng = () => sequence[call++ % sequence.length];
    const result = pickWitnesses(candidates, 5, rng);
    expect(result).toHaveLength(5);
    expect(new Set(result).size).toBe(5);
  });

  it('does not mutate the candidates array passed in', () => {
    const candidates = ['a', 'b', 'c'];
    pickWitnesses(candidates, 2, () => 0.99);
    expect(candidates).toEqual(['a', 'b', 'c']);
  });

  it('picks roughly uniformly over many trials (statistical, generous tolerance)', () => {
    const candidates = ['a', 'b', 'c', 'd', 'e'];
    const trials = 30_000;
    const counts: Record<string, number> = { a: 0, b: 0, c: 0, d: 0, e: 0 };
    for (let i = 0; i < trials; i++) {
      const [picked] = pickWitnesses(candidates, 1);
      counts[picked as string]++;
    }
    for (const candidate of candidates) {
      expect(Math.abs(counts[candidate] / trials - 0.2)).toBeLessThan(0.02);
    }
  });
});
