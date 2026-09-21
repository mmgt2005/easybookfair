-- Lets an admin receive physical inventory back from a fair before
-- closing it, and makes close_fair() actually charge for what wasn't
-- sold or returned — both were previously unbuilt: quantity_returned
-- (migration 0002) existed but nothing ever wrote it, and close_fair()
-- (migration 0036) hardcoded missing_inventory_cost to 0 for exactly
-- that reason, per its own comment.

-- Mirrors deallocate_inventory() (migration 0012) closely: lock the
-- allocation/catalog item, validate against what's actually still
-- unsold, mutate, and post the same 1100/1200 journal entry a
-- deallocation posts — receiving a return is the same real-world event
-- (a book comes back into the warehouse), just incrementing
-- quantity_returned instead of decrementing quantity_allocated.
create or replace function public.receive_allocation_return(
  p_allocation_id uuid,
  p_quantity integer
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fair_id uuid;
  v_catalog_item_id uuid;
  v_org_id uuid;
  v_fair_status public.fair_status;
  v_cost numeric(10, 2);
  v_quantity_allocated integer;
  v_quantity_returned integer;
  v_sold_qty integer;
  v_returnable integer;
  v_amount numeric(12, 2);
begin
  if not app.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  if p_quantity <= 0 then
    raise exception 'quantity must be positive';
  end if;

  select a.fair_id, a.catalog_item_id, a.quantity_allocated, a.quantity_returned
  into v_fair_id, v_catalog_item_id, v_quantity_allocated, v_quantity_returned
  from public.allocations a
  where a.id = p_allocation_id
  for update;

  if v_fair_id is null then
    raise exception 'allocation % not found', p_allocation_id;
  end if;

  select status, org_id into v_fair_status, v_org_id from public.fairs where id = v_fair_id;
  if v_fair_status = 'closed' then
    raise exception 'fair already closed';
  end if;

  select cost into v_cost from public.catalog_items where id = v_catalog_item_id for update;

  select count(*) into v_sold_qty
  from public.sales
  where fair_id = v_fair_id and catalog_item_id = v_catalog_item_id and status = 'completed';

  v_returnable := v_quantity_allocated - v_quantity_returned - v_sold_qty;
  if p_quantity > v_returnable then
    raise exception
      'exceeds_returnable: % allocated, % sold, % already returned, only % returnable',
      v_quantity_allocated, v_sold_qty, v_quantity_returned, v_returnable;
  end if;

  update public.allocations
  set quantity_returned = quantity_returned + p_quantity
  where id = p_allocation_id;

  update public.catalog_items
  set stock_on_hand = stock_on_hand + p_quantity
  where id = v_catalog_item_id;

  v_amount := v_cost * p_quantity;

  perform app.post_journal_entry(
    'return', v_fair_id, v_org_id,
    format('Received %s unit(s) of catalog item %s back from allocation', p_quantity, v_catalog_item_id),
    p_allocation_id,
    jsonb_build_array(
      jsonb_build_object('account_code', '1100', 'debit', v_amount),
      jsonb_build_object('account_code', '1200', 'credit', v_amount)
    )
  );
end;
$$;

revoke execute on function public.receive_allocation_return(uuid, integer) from public;
grant execute on function public.receive_allocation_return(uuid, integer) to authenticated;

-- close_fair(): missing_inventory_cost stops being a hardcoded 0 and is
-- now computed from whatever quantity_returned values exist at the
-- moment this runs (docs/spec.md: "billed... as part of the single
-- close-fair settlement computation, not a separate after-the-fact
-- billing pass"). Billed through the same 2000/1300 pair
-- cash_wholesale_owed already uses in this same function -- not a new
-- entry type, and 1100/1200 are deliberately left untouched here since
-- record_sale() never relieves 1200 for a sold unit either; crediting it
-- only for missing units would be a new, one-sided precision this
-- ledger doesn't apply anywhere else. Every other line in this function
-- (rental fee, net payout, the "always nets 2000 to zero" property) is
-- unchanged -- v_total_owed/v_net_payout already reference
-- v_missing_inventory_cost generically.
create or replace function public.close_fair(p_fair_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_rental_fee numeric(12, 2);
  v_payout_due numeric(12, 2);
  v_cash_wholesale_owed numeric(12, 2);
  v_missing_inventory_cost numeric(12, 2);
  v_total_owed numeric(12, 2);
  v_net_payout numeric(12, 2);
  v_settlement_id uuid;
  v_lines jsonb := '[]'::jsonb;
begin
  if not app.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  select org_id, equipment_rental_fee into v_org_id, v_rental_fee
  from public.fairs where id = p_fair_id;

  if v_org_id is null then
    raise exception 'fair % not found', p_fair_id;
  end if;

  if exists (select 1 from public.settlements where fair_id = p_fair_id) then
    raise exception 'fair already closed';
  end if;

  select greatest(coalesce(sum(jl.credit), 0) - coalesce(sum(jl.debit), 0), 0)
  into v_payout_due
  from public.journal_lines jl
  join public.journal_entries je on je.id = jl.journal_entry_id
  where je.fair_id = p_fair_id and jl.account_code = '2000';

  select greatest(coalesce(sum(jl.debit), 0) - coalesce(sum(jl.credit), 0), 0)
  into v_cash_wholesale_owed
  from public.journal_lines jl
  join public.journal_entries je on je.id = jl.journal_entry_id
  where je.fair_id = p_fair_id and jl.account_code = '1300';

  select coalesce(sum(
    greatest(a.quantity_allocated - a.quantity_returned - coalesce(s.sold_count, 0), 0) * ci.cost
  ), 0)
  into v_missing_inventory_cost
  from public.allocations a
  join public.catalog_items ci on ci.id = a.catalog_item_id
  left join (
    select catalog_item_id, count(*) as sold_count
    from public.sales
    where fair_id = p_fair_id and status = 'completed'
    group by catalog_item_id
  ) s on s.catalog_item_id = a.catalog_item_id
  where a.fair_id = p_fair_id;

  v_total_owed := v_cash_wholesale_owed + v_missing_inventory_cost + v_rental_fee;
  v_net_payout := v_payout_due - v_total_owed;

  insert into public.settlements (
    fair_id, org_id, cash_wholesale_owed, missing_inventory_cost,
    total_owed_by_org, payout_due, net_payout, equipment_rental_fee
  ) values (
    p_fair_id, v_org_id, v_cash_wholesale_owed, v_missing_inventory_cost,
    v_total_owed, v_payout_due, v_net_payout, v_rental_fee
  )
  returning id into v_settlement_id;

  if v_rental_fee > 0 then
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_code', '2000', 'debit', v_rental_fee),
      jsonb_build_object('account_code', '4100', 'credit', v_rental_fee)
    );
  end if;
  if v_cash_wholesale_owed > 0 then
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_code', '2000', 'debit', v_cash_wholesale_owed),
      jsonb_build_object('account_code', '1300', 'credit', v_cash_wholesale_owed)
    );
  end if;
  if v_missing_inventory_cost > 0 then
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_code', '2000', 'debit', v_missing_inventory_cost),
      jsonb_build_object('account_code', '1300', 'credit', v_missing_inventory_cost)
    );
  end if;
  if v_net_payout > 0 then
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_code', '2000', 'debit', v_net_payout),
      jsonb_build_object('account_code', '1000', 'credit', v_net_payout)
    );
  elsif v_net_payout < 0 then
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_code', '2000', 'credit', -v_net_payout),
      jsonb_build_object('account_code', '1300', 'debit', -v_net_payout)
    );
  end if;

  if jsonb_array_length(v_lines) > 0 then
    perform app.post_journal_entry(
      'settlement', p_fair_id, v_org_id, 'Fair settlement', v_settlement_id, v_lines
    );
  end if;

  update public.fairs set status = 'closed', closed_at = now() where id = p_fair_id;

  return v_settlement_id;
end;
$$;

revoke execute on function public.close_fair(uuid) from public;
grant execute on function public.close_fair(uuid) to authenticated;
