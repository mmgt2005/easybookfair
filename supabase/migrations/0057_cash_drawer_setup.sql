-- Cash drawer setup: a suggested starting petty-cash float (total dollars,
-- broken down into quarters/$1s/$5s/$10s) for a fair, computed from its
-- allocation's price points (see lib/pettyCash.ts) and freely editable
-- afterward — this is a suggestion, never enforced (docs/spec.md, "Petty
-- cash suggestion"). One row per fair (not a history log like
-- packing_suggestions), since there's nothing here worth keeping past
-- versions of — recomputing overwrites the previous suggestion/edit.
create table public.cash_drawer_setups (
  id uuid primary key default gen_random_uuid(),
  fair_id uuid not null unique references public.fairs (id) on delete cascade,
  suggested_float_total numeric(10, 2) not null,
  quarters_count integer not null default 0 check (quarters_count >= 0),
  ones_count integer not null default 0 check (ones_count >= 0),
  fives_count integer not null default 0 check (fives_count >= 0),
  tens_count integer not null default 0 check (tens_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at
  before update on public.cash_drawer_setups
  for each row execute function app.set_updated_at();

alter table public.cash_drawer_setups enable row level security;

-- Admin-only, same shape as carton_specs/restock_orders — no org-side
-- allocation screen exists to need a read policy for org staff.
create policy "cash_drawer_setups_admin_all" on public.cash_drawer_setups
  for all
  using (app.is_platform_admin())
  with check (app.is_platform_admin());
