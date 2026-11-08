// Shared by the pantry and recipe filters: case-insensitive, ignores outer spaces.
// An empty query matches everything.
export function matchesQuery(query, ...texts) {
  const needle = query.trim().toLowerCase();
  return texts.some((text) => text.toLowerCase().includes(needle));
}