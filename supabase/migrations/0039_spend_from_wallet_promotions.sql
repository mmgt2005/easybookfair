-- Wallet spending never applied promotions — chargeWallet() now computes
-- discounted pricing in TypeScript (lib/promotions.ts, shared with the
-- guest/in-person checkout paths) and passes price_charged/promotion_id
-- per line here instead of this function always re-pricing from
-- catalog_items itself. Falls back to the catalog price when a line
-- doesn't specify one, so this stays compatible with a plain
-- {catalog_item_id, quantity} call.
create or replace function public.spend_from_wallet(
  p_wallet_id uuid,
  p_fair_id uuid,
  -- jsonb array of {catalog_item_id, quantity, price_charged?, promotion_id?}
  p_line_items jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet record;
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

  select * into v_wallet
  from public.student_wallets
  where id = p_wallet_id and fair_id = p_fair_id
  for update;

  if v_wallet is null then
    raise exception 'wallet not found for this fair';
  end if;
  if v_wallet.status <> 'active' then
    raise exception 'wallet is closed';
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
        'wallet',
        v_price_charged,
        v_catalog_item.cost,
        null,
        v_promotion_id
      );

      update public.student_wallets
      set balance = balance - v_price_charged
      where id = p_wallet_id;
    end loop;
  end loop;

  return v_wallet.id;
end;
$$;

revoke execute on function public.spend_from_wallet(uuid, uuid, jsonb) from public;
grant execute on function public.spend_from_wallet(uuid, uuid, jsonb) to authenticated;
