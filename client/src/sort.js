export const SORT_OPTIONS = [
  { value: 'expiry-asc',  label: 'Expiry: soonest first' },
  { value: 'expiry-desc', label: 'Expiry: latest first' },
  { value: 'added-desc',  label: 'Recently added' },
  { value: 'added-asc',   label: 'Oldest added' },
  { value: 'name-asc',    label: 'Name: A–Z' },
  { value: 'name-desc',   label: 'Name: Z–A' },
];
export const DEFAULT_SORT = 'expiry-asc';

sortPantry(items, details, sortKey)  // → a new array; never sorts `items` in place