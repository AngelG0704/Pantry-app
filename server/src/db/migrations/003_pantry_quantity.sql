-- 003: optional amount for each pantry item, e.g. 2 cup, 500 g, 6 piece.
-- Nullable: existing rows become NULL, and the live code never writes these
-- columns, so the checks below can't fire against the old release.
ALTER TABLE pantry_items
  ADD COLUMN quantity NUMERIC(10, 3),
  ADD COLUMN unit TEXT,
  ADD CONSTRAINT pantry_items_quantity_positive CHECK (quantity > 0),
  ADD CONSTRAINT pantry_items_unit_known
    CHECK (unit IN ('g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'oz', 'lb', 'piece')),
  ADD CONSTRAINT pantry_items_quantity_with_unit
    CHECK ((quantity IS NULL) = (unit IS NULL));