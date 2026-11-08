import { describe, it, expect } from 'vitest';
import { matchesQuery } from './search.js';

describe('matchesQuery', () => {
  it('matches part of a word, ignoring case and outer spaces', () => {
    expect(matchesQuery('  BUT ', 'Buttered toast')).toBe(true);
    expect(matchesQuery('toast', 'Buttered toast')).toBe(true);
  });

  it('matches if any of the texts match', () => {
    expect(matchesQuery('cheese', 'Omelette', 'bread', 'cheese')).toBe(true);
    expect(matchesQuery('milk', 'Omelette', 'bread', 'cheese')).toBe(false);
  });

  it('matches everything for an empty or blank query', () => {
    expect(matchesQuery('', 'egg')).toBe(true);
    expect(matchesQuery('   ', 'egg')).toBe(true);
  });
});