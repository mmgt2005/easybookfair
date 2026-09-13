-- fairs/organizations have no anon SELECT policy either — the storefront
-- and wallet-funding pages need the fair's name and whether its org is a
-- school (to gate the wallet page), so this exposes just that, the same
-- narrow-RPC approach as fair_storefront_items (migration 0024).
create or replace function public.fair_public_info(p_fair_id uuid)
returns table (
  fair_id uuid,
  fair_name text,
  org_name text,
  is_school boolean,
  status public.fair_status
)
language sql
stable
security definer
set search_path = public
as $$
  select f.id, f.name, o.name, o.is_school, f.status
  from public.fairs f
  join public.organizations o on o.id = f.org_id
  where f.id = p_fair_id;
$$;

revoke execute on function public.fair_public_info(uuid) from public;
grant execute on function public.fair_public_info(uuid) to anon, authenticated;

-- The order confirmation page has no buyer login to check against, so
-- access is by the checkout_sessions id itself — an unguessable uuid,
-- the same access-control shape as e.g. Stripe's own hosted receipt links.
-- Exposes only what the buyer who just placed the order already knows
-- (their own cart), nothing about other buyers or other fairs.
create or replace function public.get_checkout_session_public(p_checkout_session_id uuid)
returns table (
  id uuid,
  status text,
  fulfillment_status text,
  buyer_name text,
  line_items jsonb,
  fair_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select cs.id, cs.status, cs.fulfillment_status, cs.buyer_name, cs.line_items, f.name
  from public.checkout_sessions cs
  join public.fairs f on f.id = cs.fair_id
  where cs.id = p_checkout_session_id;
$$;

revoke execute on function public.get_checkout_session_public(uuid) from public;
grant execute on function public.get_checkout_session_public(uuid) to anon, authenticated;
