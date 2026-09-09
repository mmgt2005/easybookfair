-- Phase 1 tracked allocations but never tracked actual warehouse stock —
-- there was nothing to check a new allocation's quantity against. This
-- closes that gap: stock_on_hand is the unallocated quantity on hand,
-- the physical counterpart to the "Inventory — Unallocated" (1100) dollar
-- balance. Allocating a fair moves units out of it, same as the ledger
-- entry moves dollars from 1100 to 1200.

alter table public.catalog_items
  add column stock_on_hand integer not null default 0 check (stock_on_hand >= 0);

-- public.* is the deliberate RPC surface callable over the API (unlike
-- app.*, which is internal-only — see supabase/config.toml). SECURITY
-- DEFINER because it needs to call app.post_journal_entry(), which is
-- deliberately not granted to authenticated; the explicit
-- app.is_platform_admin() check below is what stands in for RLS here,
-- since a SECURITY DEFINER function bypasses it.
create or replace function public.allocate_inventory(
  p_fair_id uuid,
  p_catalog_item_id uuid,
  p_quantity integer
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_cost numeric(10, 2);
  v_stock integer;
  v_allocation_id uuid;
  v_amount numeric(12, 2);
begin
  if not app.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  if p_quantity <= 0 then
    raise exception 'quantity must be positive';
  end if;

  select org_id into v_org_id from public.fairs where id = p_fair_id;
  if v_org_id is null then
    raise exception 'fair % not found', p_fair_id;
  end if;

  -- Lock the catalog row so concurrent allocations against the same item
  -- can't both read a stale stock_on_hand and both succeed.
  select cost, stock_on_hand into v_cost, v_stock
  from public.catalog_items
  where id = p_catalog_item_id
  for update;

  if v_cost is null then
    raise exception 'catalog item % not found', p_catalog_item_id;
  end if;

  if v_stock < p_quantity then
    raise exception 'insufficient_stock: % available, % requested', v_stock, p_quantity;
  end if;

  update public.catalog_items
  set stock_on_hand = stock_on_hand - p_quantity
  where id = p_catalog_item_id;

  insert into public.allocations (fair_id, catalog_item_id, quantity_allocated)
  values (p_fair_id, p_catalog_item_id, p_quantity)
  on conflict (fair_id, catalog_item_id)
  do update set quantity_allocated = public.allocations.quantity_allocated + excluded.quantity_allocated
  returning id into v_allocation_id;

  v_amount := v_cost * p_quantity;

  perform app.post_journal_entry(
    'allocation',
    p_fair_id,
    v_org_id,
    format('Allocated %s unit(s) of catalog item %s', p_quantity, p_catalog_item_id),
    v_allocation_id,
    jsonb_build_array(
      jsonb_build_object('account_code', '1200', 'debit', v_amount),
      jsonb_build_object('account_code', '1100', 'credit', v_amount)
    )
  );

  return v_allocation_id;
end;
$$;

revoke execute on function public.allocate_inventory(uuid, uuid, integer) from public;
grant execute on function public.allocate_inventory(uuid, uuid, integer) to authenticated;
