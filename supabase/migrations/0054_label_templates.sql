-- Phase 6 ("QR labels and restock timing" — lead-time-aware allocation
-- checks and the restock_orders "reorder now" flow were already built
-- as part of the allocations screen; this is the remaining piece).
-- Mirrors carton_specs (migration 0002) exactly: a flat, admin-only
-- "configure once, reuse everywhere" reference table for a physical
-- constraint — here a label sheet's printable geometry, per
-- docs/spec.md's "QR codes and labels" section (a "brand-agnostic label
-- template configurator" grouped alongside carton_specs in the Phase 7
-- per-tenant-settings list).
create table public.label_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sheet_width_in numeric(6, 2) not null check (sheet_width_in > 0),
  sheet_height_in numeric(6, 2) not null check (sheet_height_in > 0),
  label_width_in numeric(6, 2) not null check (label_width_in > 0),
  label_height_in numeric(6, 2) not null check (label_height_in > 0),
  margin_top_in numeric(6, 2) not null default 0 check (margin_top_in >= 0),
  margin_left_in numeric(6, 2) not null default 0 check (margin_left_in >= 0),
  gap_x_in numeric(6, 2) not null default 0 check (gap_x_in >= 0),
  gap_y_in numeric(6, 2) not null default 0 check (gap_y_in >= 0),
  columns int not null check (columns > 0),
  rows int not null check (rows > 0),
  created_at timestamptz not null default now()
);

alter table public.label_templates enable row level security;

create policy "label_templates_admin_all" on public.label_templates
  for all
  using (app.is_platform_admin())
  with check (app.is_platform_admin());

-- Avery 5160-equivalent: US Letter, 3 columns x 10 rows, 30 labels/sheet.
-- A well-known standard, but a starting point, not gospel — verify
-- against your actual sheets before a high-volume print run, same
-- caveat this app already gives the packing suggestion's own estimate.
insert into public.label_templates
  (name, sheet_width_in, sheet_height_in, label_width_in, label_height_in,
   margin_top_in, margin_left_in, gap_x_in, gap_y_in, columns, rows)
values
  ('Avery 5160 (3x10 address labels)', 8.5, 11, 2.625, 1, 0.5, 0.1875, 0.125, 0, 3, 10);
