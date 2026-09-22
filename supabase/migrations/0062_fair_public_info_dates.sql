-- The storefront/wallet pages need to show a status-aware message
-- ("opens on <date>") when gating access by fair status (app-layer change,
-- no schema needed for the gate itself) — fair_public_info() doesn't
-- expose start_date/end_date yet. Same drop-then-recreate as migrations
-- 0026/0031/0044: CREATE OR REPLACE can't add new OUT columns.
drop function if exists public.fair_public_info(uuid);

create or replace function public.fair_public_info(p_fair_id uuid)
returns table (
  fair_id uuid,
  fair_name text,
  org_name text,
  is_school boolean,
  status public.fair_status,
  start_date date,
  end_date date,
  allow_online boolean,
  allow_wallet boolean,
  allow_in_person boolean,
  is_demo boolean,
  is_demo_enabled boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    f.id, f.name, o.name, o.is_school, f.status, f.start_date, f.end_date,
    f.allow_online, f.allow_wallet, f.allow_in_person,
    o.is_demo, o.is_demo_enabled
  from public.fairs f
  join public.organizations o on o.id = f.org_id
  where f.id = p_fair_id;
$$;

revoke execute on function public.fair_public_info(uuid) from public;
grant execute on function public.fair_public_info(uuid) to anon, authenticated;
