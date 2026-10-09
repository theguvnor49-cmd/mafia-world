import { describe, it, expect } from 'vitest';
import { pickRandomState } from './job';

// Same verification note as every prior phase's pure logic: this exact set
// of assertions was run and passed as a standalone script (no npm deps)
// while this sandbox couldn't install vitest.

const EIGHT_STATES = ['New York', 'Chicago', 'Los Angeles', 'Miami', 'Las Vegas', 'Boston', 'Detroit', 'Atlanta'];

describe('pickRandomState', () => {
  it('picks the first state at roll 0', () => {
    expect(pickRandomState(EIGHT_STATES, 0)).toBe('New York');
  });

  it('picks the last state as the roll approaches 1', () => {
    expect(pickRandomState(EIGHT_STATES, 0.9999)).toBe('Atlanta');
  });

  it('picks the middle state at roll 0.5 (8 states -> index 4)', () => {
    expect(pickRandomState(EIGHT_STATES, 0.5)).toBe('Las Vegas');
  });

  it('always returns the only state in a single-item list', () => {
    expect(pickRandomState(['Solo State'], 0)).toBe('Solo State');
    expect(pickRandomState(['Solo State'], 0.999)).toBe('Solo State');
  });

  it('throws on an empty list rather than silently returning undefined', () => {
    expect(() => pickRandomState([])).toThrow();
  });
});
