-- 002: optional expiry date for each pantry item.
-- Nullable: existing rows become NULL, and code that doesn't select
-- this column keeps working while the old release still serves.
ALTER TABLE pantry_items ADD COLUMN expires_on DATE;

