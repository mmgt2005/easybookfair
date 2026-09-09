-- Generic, brand-agnostic carton sizes so the packing-suggestion feature
-- has something to compute against. No admin screen manages these yet in
-- Phase 2 — like the chart of accounts, they're baseline reference data;
-- add a CRUD screen later if real-world carton sizes need to vary.

insert into public.carton_specs (name, length_in, width_in, height_in, max_weight_oz) values
  ('Small', 12, 9, 6, 400),
  ('Medium', 16, 12, 10, 700),
  ('Large', 20, 16, 14, 1100);
