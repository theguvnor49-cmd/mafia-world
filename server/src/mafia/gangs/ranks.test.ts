import { describe, it, expect } from 'vitest';
import { getNextRank, getPreviousRank } from './ranks';

// Same verification note as every prior phase's pure logic: this exact
// set of assertions was run and passed as a standalone script (no npm
// deps) while this sandbox couldn't install vitest.

describe('getNextRank', () => {
  it('walks up the full ladder', () => {
    expect(getNextRank('Associate')).toBe('Soldier');
    expect(getNextRank('Soldier')).toBe('Capo');
    expect(getNextRank('Capo')).toBe('Underboss');
    expect(getNextRank('Underboss')).toBe('Boss');
  });

  it('returns null at the top (Boss has no next rank)', () => {
    expect(getNextRank('Boss')).toBeNull();
  });
});

describe('getPreviousRank', () => {
  it('walks down the full ladder', () => {
    expect(getPreviousRank('Boss')).toBe('Underboss');
    expect(getPreviousRank('Underboss')).toBe('Capo');
    expect(getPreviousRank('Capo')).toBe('Soldier');
    expect(getPreviousRank('Soldier')).toBe('Associate');
  });

  it('returns null at the bottom (Associate has no previous rank)', () => {
    expect(getPreviousRank('Associate')).toBeNull();
  });
});
