-- Adds category to fair_storefront_items (migration 0024) so the
-- storefront can offer a category filter — buyer-facing polish, not a
-- security-relevant change (category is no more sensitive than title).
-- Postgres won't let CREATE OR REPLACE change a function's OUT/return
-- columns, so the old signature has to be dropped first.
drop function if exists public.fair_storefront_items(uuid);

create or replace function public.fair_storefront_items(p_fair_id uuid)
returns table (
  catalog_item_id uuid,
  title text,
  price numeric,
  image_url text,
  description text,
  category text,
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
    ci.category,
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

-- The DROP above also drops its grants, so these need reapplying.
revoke execute on function public.fair_storefront_items(uuid) from public;
grant execute on function public.fair_storefront_items(uuid) to anon, authenticated;
