-- reserveRestock() (allocations/actions.ts) computed expected_arrival as
-- today + lead_time_days, silently assuming the order was placed at the
-- moment the admin clicked "Reorder now". That's wrong whenever the actual
-- call to the supplier happened days earlier and only got entered into the
-- system later — expected_arrival would be calculated from the wrong start
-- date. ordered_at makes that start date an explicit, editable field
-- instead of an assumption, defaulting to today but backdatable.
alter table public.restock_orders
  add column ordered_at date not null default current_date;

-- Backfill existing rows from created_at rather than leaving them at
-- whatever today happens to be when this migration runs.
update public.restock_orders
set ordered_at = created_at::date
where ordered_at = current_date;
