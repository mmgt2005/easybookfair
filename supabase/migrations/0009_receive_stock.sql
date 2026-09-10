-- Restocking an item already in the catalog (more copies arrived) needs a
-- way to add to stock_on_hand without overwriting it — a plain update from
-- the client would require reading the current value first and racing
-- against any concurrent change. A single UPDATE ... SET x = x + n is
-- atomic at the row level regardless of caller, so this stays consistent
-- with how allocate_inventory() is structured, minus the ledger posting:
-- stock_on_hand has never been ledger-tracked at this "unallocated" stage
-- (it isn't when a catalog item is first created either) — only the
-- allocation transition (Unallocated -> Consigned) posts a journal entry.
create or replace function public.receive_stock(
  p_catalog_item_id uuid,
  p_quantity integer
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not app.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  if p_quantity <= 0 then
    raise exception 'quantity must be positive';
  end if;

  update public.catalog_items
  set stock_on_hand = stock_on_hand + p_quantity
  where id = p_catalog_item_id;

  if not found then
    raise exception 'catalog item % not found', p_catalog_item_id;
  end if;
end;
$$;

revoke execute on function public.receive_stock(uuid, integer) from public;
grant execute on function public.receive_stock(uuid, integer) to authenticated;
