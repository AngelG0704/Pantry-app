import { describe, it, expect } from 'vitest';
import { UNITS, formatAmount, parseQuantity } from './units.js';

describe('UNITS', () => {
  it('lists the same ten units as the server, in the same order', () => {
    expect(UNITS).toEqual(['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'oz', 'lb', 'piece']);
  });
});

describe('formatAmount', () => {
  it('shows the number without padding zeros', () => {
    expect(formatAmount(1.5, 'cup')).toBe('1.5 cup');
    expect(formatAmount(2, 'cup')).toBe('2 cup');
    expect(formatAmount(0.001, 'kg')).toBe('0.001 kg');
  });

  it('groups thousands', () => {
    expect(formatAmount(1500, 'g')).toBe('1,500 g');
    expect(formatAmount(9999999.999, 'g')).toBe('9,999,999.999 g');
  });

  it('says "piece" for exactly one and "pieces" otherwise', () => {
    expect(formatAmount(1, 'piece')).toBe('1 piece');
    expect(formatAmount(6, 'piece')).toBe('6 pieces');
    expect(formatAmount(0.5, 'piece')).toBe('0.5 pieces');
  });
});

describe('parseQuantity', () => {
  const valid = [
    ['1', 1],
    ['1.5', 1.5],
    ['0.25', 0.25],
    ['.5', 0.5],
    ['1.005', 1.005],
    ['007', 7],
    ['9999999.999', 9999999.999],
  ];

  for (const [draft, expected] of valid) {
    it(`turns "${draft}" into the number ${expected}`, () => {
      expect(parseQuantity(draft)).toBe(expected);
    });
  }

  const invalid = [
    ['an empty draft (mid-typing or cleared)', ''],
    ['zero', '0'],
    ['zero with decimals', '0.000'],
    ['a negative number', '-1'],
    ['more than 3 decimal places', '1.2345'],
    ['exponent notation', '1e3'],
    ['a trailing dot', '1.'],
    ['a decimal comma', '1,5'],
    ['a value too large for the server', '10000000'],
  ];

  for (const [name, draft] of invalid) {
    it(`rejects ${name}`, () => {
      expect(parseQuantity(draft)).toBe(null);
    });
  }
});