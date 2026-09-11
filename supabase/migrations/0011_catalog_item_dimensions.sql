-- Adds per-item dimensions so the packing suggestion can check volume
-- capacity alongside weight (carton_specs already has length_in/width_in/
-- height_in from Phase 1 — only catalog_items was missing them). All
-- nullable: existing items have neither until an admin fills them in, and
-- the packing algorithm falls back to whichever of weight/volume it
-- actually has data for rather than blocking on the other.
alter table public.catalog_items
  add column length_in numeric(6, 2) check (length_in is null or length_in > 0),
  add column width_in numeric(6, 2) check (width_in is null or width_in > 0),
  add column height_in numeric(6, 2) check (height_in is null or height_in > 0);
