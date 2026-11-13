import { describe, it, expect } from 'vitest';
import { sortPantry, SORT_OPTIONS, DEFAULT_SORT } from './sort.js';

// Ties on purpose: apple and dates expire the same day, dates and egg were added
// at the same moment. flour has no details entry at all, like an item whose add
// the server hasn't answered yet.
const ITEMS = [
  { id: 1, name: 'egg' },
  { id: 2, name: 'apple' },
  { id: 3, name: 'flour' },
  { id: 4, name: 'cheese' },
  { id: 5, name: 'butter' },
  { id: 6, name: 'dates' },
];

const DETAILS = {
  1: { expiresOn: null, quantity: null, unit: null, addedAt: '2026-11-03T09:00:00.000Z' },
  2: { expiresOn: '2026-11-15', quantity: 3, unit: 'piece', addedAt: '2026-11-05T09:00:00.000Z' },
  4: { expiresOn: null, quantity: 200, unit: 'g', addedAt: '2026-11-10T09:00:00.000Z' },
  5: { expiresOn: '2026-11-09', quantity: null, unit: null, addedAt: '2026-11-01T09:00:00.000Z' },
  6: { expiresOn: '2026-11-15', quantity: null, unit: null, addedAt: '2026-11-03T09:00:00.000Z' },
};

const names = (items) => items.map((item) => item.name);

describe('SORT_OPTIONS', () => {
  it('offers the six orders, in this order, with readable labels', () => {
    expect(SORT_OPTIONS).toEqual([
      { value: 'expiry-asc', label: 'Expiry: soonest first' },
      { value: 'expiry-desc', label: 'Expiry: latest first' },
      { value: 'added-desc', label: 'Recently added' },
      { value: 'added-asc', label: 'Oldest added' },
      { value: 'name-asc', label: 'Name: A–Z' },
      { value: 'name-desc', label: 'Name: Z–A' },
    ]);
  });

  it('starts on soonest expiry, which is one of the options', () => {
    expect(DEFAULT_SORT).toBe('expiry-asc');
    expect(SORT_OPTIONS.map((option) => option.value)).toContain(DEFAULT_SORT);
  });
});

describe('sortPantry', () => {
  it.each([
    // Earliest date first; same day by name; no date last.
    ['expiry-asc', ['butter', 'apple', 'dates', 'cheese', 'egg', 'flour']],
    // Latest date first; same day still by name A–Z; no date still last.
    ['expiry-desc', ['apple', 'dates', 'butter', 'cheese', 'egg', 'flour']],
    // flour is still being added, so it counts as the newest.
    ['added-desc', ['flour', 'cheese', 'apple', 'dates', 'egg', 'butter']],
    ['added-asc', ['butter', 'dates', 'egg', 'apple', 'cheese', 'flour']],
    ['name-asc', ['apple', 'butter', 'cheese', 'dates', 'egg', 'flour']],
    ['name-desc', ['flour', 'egg', 'dates', 'cheese', 'butter', 'apple']],
  ])('%s', (sortKey, expected) => {
    expect(names(sortPantry(ITEMS, DETAILS, sortKey))).toEqual(expected);
  });

  it('returns a new array and leaves the one it was given alone', () => {
    // A frozen array makes an in-place sort throw instead of quietly reordering it.
    const items = Object.freeze([...ITEMS]);

    const sorted = sortPantry(items, DETAILS, 'name-asc');

    expect(sorted).not.toBe(items);
    expect(names(items)).toEqual(['egg', 'apple', 'flour', 'cheese', 'butter', 'dates']);
  });

  it('returns the same item objects, not copies', () => {
    const sorted = sortPantry(ITEMS, DETAILS, 'name-asc');

    expect(sorted[0]).toBe(ITEMS[1]);
  });

  it('falls back to the default order for an unknown sort key', () => {
    expect(names(sortPantry(ITEMS, DETAILS, 'nonsense'))).toEqual(
      names(sortPantry(ITEMS, DETAILS, DEFAULT_SORT))
    );
  });

  it('handles an empty pantry', () => {
    expect(sortPantry([], {}, 'expiry-asc')).toEqual([]);
  });
});