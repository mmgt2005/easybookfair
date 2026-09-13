-- Cash has been a real sale_channel since Phase 1 (record_sale() already
-- has a dedicated posting branch for it — debit A/R 1300, credit Revenue
-- 4000 for wholesale_cost only, since the org already holds the retail
-- cash directly), but nothing in the app ever actually recorded one —
-- there was no cash-recording UI at all. This adds the RPC the checkout
-- screen's new "Charge $X in cash" button calls, mirroring
-- spend_from_wallet's shape (migrations 0021/0039): admin-gated
-- internally (SECURITY DEFINER, so callable by `authenticated` directly),
-- re-checks availability the same way every other checkout path does, and
-- accepts an explicit price_charged/promotion_id per line (computed by
-- lib/promotions.ts in the calling Server Action) rather than always
-- pricing from catalog_items itself.
create or replace function public.record_cash_sale(
  p_fair_id uuid,
  -- jsonb array of {catalog_item_id, quantity, price_charged?, promotion_id?}
  p_line_items jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_catalog_item record;
  v_qty integer;
  v_price_charged numeric;
  v_promotion_id uuid;
  v_allocated integer;
  v_sold integer;
  v_available integer;
  i integer;
begin
  if not app.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  if not exists (select 1 from public.fairs where id = p_fair_id and allow_cash) then
    raise exception 'cash isn''t enabled for this fair';
  end if;

  for v_item in select * from jsonb_array_elements(p_line_items)
  loop
    v_qty := (v_item ->> 'quantity')::integer;
    if v_qty is null or v_qty <= 0 then
      raise exception 'quantity must be positive';
    end if;

    select id, title, price, cost into v_catalog_item
    from public.catalog_items
    where id = (v_item ->> 'catalog_item_id')::uuid
    for update;

    if v_catalog_item is null then
      raise exception 'catalog item % not found', v_item ->> 'catalog_item_id';
    end if;

    select quantity_allocated into v_allocated
    from public.allocations
    where fair_id = p_fair_id and catalog_item_id = v_catalog_item.id;

    select count(*) into v_sold
    from public.sales
    where fair_id = p_fair_id
      and catalog_item_id = v_catalog_item.id
      and status = 'completed';

    v_available := coalesce(v_allocated, 0) - coalesce(v_sold, 0);
    if v_qty > v_available then
      raise exception 'insufficient_availability: only % of "%" available', v_available, v_catalog_item.title;
    end if;

    v_price_charged := coalesce((v_item ->> 'price_charged')::numeric, v_catalog_item.price);
    v_promotion_id := nullif(v_item ->> 'promotion_id', '')::uuid;

    for i in 1..v_qty loop
      perform public.record_sale(
        p_fair_id,
        v_catalog_item.id,
        'cash',
        v_price_charged,
        v_catalog_item.cost,
        null,
        v_promotion_id
      );
    end loop;
  end loop;
end;
$$;

revoke execute on function public.record_cash_sale(uuid, jsonb) from public;
grant execute on function public.record_cash_sale(uuid, jsonb) to authenticated;
