-- Lets an admin generate a possible shipping cost for a fair's allocated
-- inventory, in both directions: outbound (warehouse -> fair, the full
-- allocated quantity) and return (unsold inventory -> warehouse, the
-- same "returnable" quantity close_fair()/receive_allocation_return()
-- already compute, migration 0055). Uses EasyPost's free Wallet Carriers
-- tier for real USPS rates — the raw USPS rate API (developers.usps.com)
-- requires a USPS Business Account + OAuth app registration, real
-- friction for a low-volume tool; EasyPost needs only an API key. This
-- is an estimate, not a purchased label — no rate is ever bought here.
create type public.shipping_direction as enum ('outbound', 'return');

-- One current estimate per fair per direction (recomputed, not a history
-- log) — mirrors cash_drawer_setups' upsert-one-row shape (migration
-- 0057), not packing_suggestions' append-only history, since nothing
-- here is meant to be manually edited afterward like a cash drawer count
-- is.
create table public.shipping_cost_estimates (
  id uuid primary key default gen_random_uuid(),
  fair_id uuid not null references public.fairs (id) on delete cascade,
  direction public.shipping_direction not null,
  carton_spec_id uuid not null references public.carton_specs (id),
  cartons_count integer not null check (cartons_count >= 0),
  total_weight_oz numeric(10, 2) not null check (total_weight_oz >= 0),
  items_with_assumed_weight integer not null default 0,
  origin_zip text not null,
  destination_zip text not null,
  estimated_cost numeric(10, 2), -- null when EasyPost returned no usable rate
  carrier_service text,          -- e.g. "USPS Priority" — the cheapest service used
  computed_at timestamptz not null default now(),
  unique (fair_id, direction)
);

alter table public.shipping_cost_estimates enable row level security;

-- Admin computes/writes; org staff can view their own fair's estimate
-- read-only — same split already used for cash_drawer_setups
-- (admin-all + org-select, migrations 0057/0058).
create policy "shipping_cost_estimates_admin_all" on public.shipping_cost_estimates
  for all
  using (app.is_platform_admin())
  with check (app.is_platform_admin());

create policy "shipping_cost_estimates_org_select" on public.shipping_cost_estimates
  for select
  using (fair_id in (select id from public.fairs where org_id in (select app.current_org_ids())));
