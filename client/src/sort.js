// How the Pantry page can order its items. The first option is the default.
export const SORT_OPTIONS = [
  { value: 'expiry-asc', label: 'Expiry: soonest first' },
  { value: 'expiry-desc', label: 'Expiry: latest first' },
  { value: 'added-desc', label: 'Recently added' },
  { value: 'added-asc', label: 'Oldest added' },
  { value: 'name-asc', label: 'Name: A–Z' },
  { value: 'name-desc', label: 'Name: Z–A' },
];

export const DEFAULT_SORT = 'expiry-asc';

// "YYYY-MM-DD" dates and ISO timestamps both sort correctly as plain text.
function compareText(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

// Items with no date go last in both directions.
function compareExpiry(a, b, direction) {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return direction * compareText(a, b);
}

// No addedAt only happens while an add is waiting for the server: that item is the newest.
function compareAdded(a, b, direction) {
  if (a === b) return 0;
  if (a === null) return direction;
  if (b === null) return -direction;
  return direction * compareText(a, b);
}

const COMPARE = {
  'expiry-asc': (a, b) => compareExpiry(a.expiresOn, b.expiresOn, 1),
  'expiry-desc': (a, b) => compareExpiry(a.expiresOn, b.expiresOn, -1),
  'added-desc': (a, b) => compareAdded(a.addedAt, b.addedAt, -1),
  'added-asc': (a, b) => compareAdded(a.addedAt, b.addedAt, 1),
  'name-asc': (a, b) => a.name.localeCompare(b.name),
  'name-desc': (a, b) => b.name.localeCompare(a.name),
};

// items: [{ id, name }]. details: the usePantry map, { [id]: { expiresOn, addedAt, ... } }.
// Returns a new array; ties are broken by name A–Z so the order never jumps around.
export function sortPantry(items, details, sortKey) {
  const compare = COMPARE[sortKey] ?? COMPARE[DEFAULT_SORT];
  const row = (item) => ({
    name: item.name,
    expiresOn: details[item.id]?.expiresOn ?? null,
    addedAt: details[item.id]?.addedAt ?? null,
  });

  // Copy first: Array.prototype.sort reorders the array it is called on.
  return [...items].sort((a, b) => compare(row(a), row(b)) || a.name.localeCompare(b.name));
}