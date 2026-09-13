-- Defense in depth: fair_storefront_items is callable directly by anyone
-- with the anon key, not just through the storefront page — so the
-- allow_online gate (migration 0029) belongs here too, not only in the
-- page's own check. Same OUT columns as before, so no DROP needed this
-- time (only migrations that add/remove/reorder columns need one).
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
  join public.fairs f on f.id = a.fair_id and f.allow_online = true
  left join (
    select catalog_item_id, count(*) as sold_count
    from public.sales
    where fair_id = p_fair_id and status = 'completed'
    group by catalog_item_id
  ) sold on sold.catalog_item_id = ci.id
  where a.fair_id = p_fair_id
    and (a.quantity_allocated - coalesce(sold.sold_count, 0)) > 0;
$$;
