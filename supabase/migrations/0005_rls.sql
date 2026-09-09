-- RLS helper functions -----------------------------------------------------
-- SECURITY DEFINER so these can read platform_admins/org_members without
-- those tables' own RLS policies recursing back into these functions.
-- Executed as the function owner (the migration role), which — like any
-- table owner — bypasses RLS by default; we deliberately don't FORCE RLS
-- on those two tables, since that would also restrict the owner here.

create or replace function app.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.platform_admins where user_id = auth.uid()
  );
$$;

create or replace function app.current_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from public.org_members where user_id = auth.uid();
$$;

-- Policies are evaluated as the calling Postgres role (anon/authenticated),
-- which needs EXECUTE on any function a policy invokes, independent of
-- whether that function is reachable over the API.
grant execute on function app.is_platform_admin() to anon, authenticated;
grant execute on function app.current_org_ids() to anon, authenticated;

-- app.post_journal_entry is intentionally not granted to anon/authenticated:
-- it posts ledger entries with no business validation of its own, so only
-- trusted server-side code (webhook handlers, close-fair logic) may call
-- it, over a direct Postgres connection — see supabase/config.toml.
revoke execute on function app.post_journal_entry(text, uuid, uuid, text, uuid, jsonb) from public;

-- organizations ---------------------------------------------------------

alter table public.organizations enable row level security;

create policy "organizations_select" on public.organizations
  for select
  using (
    app.is_platform_admin()
    or id in (select app.current_org_ids())
  );

create policy "organizations_admin_write" on public.organizations
  for all
  using (app.is_platform_admin())
  with check (app.is_platform_admin());

-- platform_admins ---------------------------------------------------------
-- No write policy for authenticated/anon: platform admins are provisioned
-- by trusted server-side code (service role), not through client writes.

alter table public.platform_admins enable row level security;

create policy "platform_admins_select" on public.platform_admins
  for select
  using (app.is_platform_admin() or user_id = auth.uid());

-- org_members ---------------------------------------------------------

alter table public.org_members enable row level security;

create policy "org_members_select" on public.org_members
  for select
  using (
    app.is_platform_admin()
    or user_id = auth.uid()
    or org_id in (select app.current_org_ids())
  );

create policy "org_members_admin_write" on public.org_members
  for all
  using (app.is_platform_admin())
  with check (app.is_platform_admin());

-- catalog_items ---------------------------------------------------------
-- Authenticated (admin + org staff) can read the full row, cost included —
-- org staff need cost for the ledger/settlement picture. Deliberately no
-- anon policy yet: the public storefront (Phase 4) must never see
-- wholesale `cost`, so it needs its own scoped view/policy, not blanket
-- read access to this table.

alter table public.catalog_items enable row level security;

create policy "catalog_items_select_authenticated" on public.catalog_items
  for select
  to authenticated
  using (true);

create policy "catalog_items_admin_write" on public.catalog_items
  for all
  using (app.is_platform_admin())
  with check (app.is_platform_admin());

-- fairs ---------------------------------------------------------

alter table public.fairs enable row level security;

create policy "fairs_select" on public.fairs
  for select
  using (
    app.is_platform_admin()
    or org_id in (select app.current_org_ids())
  );

create policy "fairs_admin_write" on public.fairs
  for all
  using (app.is_platform_admin())
  with check (app.is_platform_admin());

-- allocations ---------------------------------------------------------

alter table public.allocations enable row level security;

create policy "allocations_select" on public.allocations
  for select
  using (
    app.is_platform_admin()
    or fair_id in (select id from public.fairs where org_id in (select app.current_org_ids()))
  );

create policy "allocations_admin_write" on public.allocations
  for all
  using (app.is_platform_admin())
  with check (app.is_platform_admin());

-- carton_specs ---------------------------------------------------------
-- Internal packing/shipping reference data — admin only.

alter table public.carton_specs enable row level security;

create policy "carton_specs_admin_all" on public.carton_specs
  for all
  using (app.is_platform_admin())
  with check (app.is_platform_admin());

-- packing_suggestions ---------------------------------------------------------

alter table public.packing_suggestions enable row level security;

create policy "packing_suggestions_select" on public.packing_suggestions
  for select
  using (
    app.is_platform_admin()
    or fair_id in (select id from public.fairs where org_id in (select app.current_org_ids()))
  );

create policy "packing_suggestions_admin_write" on public.packing_suggestions
  for all
  using (app.is_platform_admin())
  with check (app.is_platform_admin());

-- restock_orders ---------------------------------------------------------
-- Supplier-side lead-time/reorder detail — admin only, orgs don't need it.

alter table public.restock_orders enable row level security;

create policy "restock_orders_admin_all" on public.restock_orders
  for all
  using (app.is_platform_admin())
  with check (app.is_platform_admin());

-- promotions ---------------------------------------------------------
-- Active promotions are readable by anyone (the storefront needs to show
-- bundle/percent discounts to buyers); the admin policy separately gives
-- admins visibility into inactive ones too.

alter table public.promotions enable row level security;

create policy "promotions_select_public" on public.promotions
  for select
  to anon, authenticated
  using (active);

create policy "promotions_admin_write" on public.promotions
  for all
  using (app.is_platform_admin())
  with check (app.is_platform_admin());

-- sales ---------------------------------------------------------
-- Read-only for clients. Writes happen only via trusted server-side code
-- (the payment webhook, close-fair logic) using the service role, which
-- bypasses RLS entirely — so no insert/update/delete policy is defined
-- here; that's a deliberate default-deny for anon/authenticated, not an
-- oversight.

alter table public.sales enable row level security;

create policy "sales_select" on public.sales
  for select
  using (
    app.is_platform_admin()
    or fair_id in (select id from public.fairs where org_id in (select app.current_org_ids()))
  );

-- webhook_events ---------------------------------------------------------
-- No policies at all: only the service role (which bypasses RLS) should
-- ever touch this table. Default-deny for anon/authenticated is correct.

alter table public.webhook_events enable row level security;

-- accounts ---------------------------------------------------------

alter table public.accounts enable row level security;

create policy "accounts_select_authenticated" on public.accounts
  for select
  to authenticated
  using (true);

create policy "accounts_admin_write" on public.accounts
  for all
  using (app.is_platform_admin())
  with check (app.is_platform_admin());

-- journal_entries / journal_lines ---------------------------------------------------------
-- Read-only for clients, scoped to their own org; posted only via
-- app.post_journal_entry() from trusted server-side code.

alter table public.journal_entries enable row level security;

create policy "journal_entries_select" on public.journal_entries
  for select
  using (
    app.is_platform_admin()
    or org_id in (select app.current_org_ids())
  );

alter table public.journal_lines enable row level security;

create policy "journal_lines_select" on public.journal_lines
  for select
  using (
    app.is_platform_admin()
    or journal_entry_id in (
      select id from public.journal_entries where org_id in (select app.current_org_ids())
    )
  );

-- settlements ---------------------------------------------------------
-- Read-only for clients; only created by close-fair server-side logic.

alter table public.settlements enable row level security;

create policy "settlements_select" on public.settlements
  for select
  using (
    app.is_platform_admin()
    or org_id in (select app.current_org_ids())
  );
