-- The storefront and wallet-funding pages need to know whether their fair
-- actually allows that channel (migration 0029) — an org can now turn
-- online ordering or wallets off entirely. Same drop-then-recreate dance
-- as migration 0026: CREATE OR REPLACE can't change OUT columns.
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
  allow_in_person boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    f.id, f.name, o.name, o.is_school, f.status,
    f.allow_online, f.allow_wallet, f.allow_in_person
  from public.fairs f
  join public.organizations o on o.id = f.org_id
  where f.id = p_fair_id;
$$;

revoke execute on function public.fair_public_info(uuid) from public;
grant execute on function public.fair_public_info(uuid) to anon, authenticated;
