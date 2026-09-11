-- allocate_inventory() (migration 0006) only ever adds — there was no way
-- to reduce an over-allocation and return stock. Mirrors it: locks the
-- catalog and allocation rows, decrements quantity_allocated, returns the
-- units to stock_on_hand, and posts the reverse ledger entry (Unallocated
-- <- Consigned). Refuses to pull back units that have already sold — those
-- physical copies are gone, not sitting in the org's unsold allocation —
-- by checking against completed sales for this fair/item first.
create or replace function public.deallocate_inventory(
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
  v_allocation_id uuid;
  v_current_qty integer;
  v_sold_qty integer;
  v_removable integer;
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

  select cost into v_cost
  from public.catalog_items
  where id = p_catalog_item_id
  for update;

  if v_cost is null then
    raise exception 'catalog item % not found', p_catalog_item_id;
  end if;

  select id, quantity_allocated into v_allocation_id, v_current_qty
  from public.allocations
  where fair_id = p_fair_id and catalog_item_id = p_catalog_item_id
  for update;

  if v_allocation_id is null then
    raise exception 'no allocation exists for this fair/item';
  end if;

  select count(*) into v_sold_qty
  from public.sales
  where fair_id = p_fair_id
    and catalog_item_id = p_catalog_item_id
    and status = 'completed';

  v_removable := v_current_qty - v_sold_qty;

  if p_quantity > v_removable then
    raise exception
      'insufficient_unsold_allocation: % allocated, % sold, only % removable',
      v_current_qty, v_sold_qty, v_removable;
  end if;

  update public.allocations
  set quantity_allocated = quantity_allocated - p_quantity
  where id = v_allocation_id;

  update public.catalog_items
  set stock_on_hand = stock_on_hand + p_quantity
  where id = p_catalog_item_id;

  v_amount := v_cost * p_quantity;

  perform app.post_journal_entry(
    'deallocation',
    p_fair_id,
    v_org_id,
    format('Removed %s unit(s) of catalog item %s from allocation', p_quantity, p_catalog_item_id),
    v_allocation_id,
    jsonb_build_array(
      jsonb_build_object('account_code', '1100', 'debit', v_amount),
      jsonb_build_object('account_code', '1200', 'credit', v_amount)
    )
  );

  return v_allocation_id;
end;
$$;

revoke execute on function public.deallocate_inventory(uuid, uuid, integer) from public;
grant execute on function public.deallocate_inventory(uuid, uuid, integer) to authenticated;
