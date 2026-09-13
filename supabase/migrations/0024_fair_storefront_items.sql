-- The first anon-facing (unauthenticated buyer) read in this schema.
-- catalog_items/allocations/sales have no anon SELECT policy at all — deny
-- by default, per the existing RLS posture — so rather than opening broad
-- anon read access to those tables, this SECURITY DEFINER function exposes
-- only the narrow, buyer-safe shape the storefront needs (no wholesale
-- cost, no other fairs' data). "Available" is computed the same way as
-- everywhere else in this schema: allocated minus already-completed sales,
-- not a separately-decremented counter.
create or replace function public.fair_storefront_items(p_fair_id uuid)
returns table (
  catalog_item_id uuid,
  title text,
  price numeric,
  image_url text,
  description text,
  available integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ci.id,
    ci.title,
    ci.price,
    ci.image_url,
    ci.description,
    (a.quantity_allocated - coalesce(sold.sold_count, 0))::integer as available
  from public.allocations a
  join public.catalog_items ci on ci.id = a.catalog_item_id
  left join (
    select catalog_item_id, count(*) as sold_count
    from public.sales
    where fair_id = p_fair_id and status = 'completed'
    group by catalog_item_id
  ) sold on sold.catalog_item_id = ci.id
  where a.fair_id = p_fair_id
    and (a.quantity_allocated - coalesce(sold.sold_count, 0)) > 0;
$$;

revoke execute on function public.fair_storefront_items(uuid) from public;
grant execute on function public.fair_storefront_items(uuid) to anon, authenticated;
