// Must match UNITS in server/src/validation/schemas.js and the
// pantry_items_unit_known check in migration 003. If they drift, the server
// answers 400 and nothing is stored.
export const UNITS = ['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'oz', 'lb', 'piece'];

const QUANTITY_FORMAT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 });

// 1.5, 'cup' -> "1.5 cup"; 6, 'piece' -> "6 pieces"; 1, 'piece' -> "1 piece"
export function formatAmount(quantity, unit) {
  const label = unit === 'piece' && quantity !== 1 ? 'pieces' : unit;
  return `${QUANTITY_FORMAT.format(quantity)} ${label}`;
}

const MAX_QUANTITY = 9999999.999; // NUMERIC(10, 3) on the server

// A number input's value is always a string, and "" while it's partly typed.
// Returns the number to send, or null if the draft isn't a valid quantity yet.
export function parseQuantity(draft) {
  if (!/^(\d+(\.\d{1,3})?|\.\d{1,3})$/.test(draft)) {
    return null;
  }
  const value = Number(draft);
  return value > 0 && value <= MAX_QUANTITY ? value : null;
}