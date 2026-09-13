-- The demo fair's public storefront/wallet pages (app/fairs/[fairId])
-- were reachable by anyone with the link, same as a real fair — fine for
-- a real fair (buyers never sign in), but wrong for a sandbox meant only
-- for admins to click through, especially with live Stripe keys where a
-- stray public link means a real card could be charged against seeded
-- demo data. Two things needed to lock that down:
--
-- 1. is_demo_enabled: a kill switch an admin can flip off entirely — when
--    false, the demo fair's public pages are unavailable to everyone,
--    admin included, not just non-admins.
-- 2. fair_public_info needs to expose is_demo/is_demo_enabled to the
--    (anon-callable) storefront/wallet pages so they can decide whether
--    to require an admin session before rendering anything.
alter table public.organizations
  add column is_demo_enabled boolean not null default true;

-- Same drop-then-recreate as migrations 0026/0031: CREATE OR REPLACE can't
-- add new OUT columns to an existing function.
drop function if exists public.fair_public_info(uuid);

create or replace function public.fair_public_info(p_fair_id uuid)
returns table (
  fair_id uuid,
  fair_name text,
  org_name text,
  is_school boolean,
  status public.fair_status,
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
    f.id, f.name, o.name, o.is_school, f.status,
    f.allow_online, f.allow_wallet, f.allow_in_person,
    o.is_demo, o.is_demo_enabled
  from public.fairs f
  join public.organizations o on o.id = f.org_id
  where f.id = p_fair_id;
$$;

revoke execute on function public.fair_public_info(uuid) from public;
grant execute on function public.fair_public_info(uuid) to anon, authenticated;
