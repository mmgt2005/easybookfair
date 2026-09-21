-- reset_demo_fair() (migration 0035) predates event_requests (migration
-- 0049), whose composite FK to allocations (fair_id, catalog_item_id) has
-- no `on delete cascade` (unlike its own fair_id FK, which does). So
-- `delete from public.allocations where fair_id = v_fair_id` fails with a
-- foreign-key violation the moment any event_requests row was ever
-- created against the demo fair (e.g. from testing "Request an event"
-- against the demo org), taking down the whole reset with an unhandled
-- Postgres error instead of resetting anything. Re-defining the function
-- to also clear event_requests for the demo fair first, same as every
-- other demo-fair-scoped table it already resets.
create or replace function public.reset_demo_fair()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_fair_id uuid;
  v_full_stock constant integer := 50;
  v_allocate_qty constant integer := 20;
  v_item record;
begin
  if not app.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  select o.id, f.id into v_org_id, v_fair_id
  from public.organizations o
  join public.fairs f on f.org_id = o.id
  where o.is_demo
  limit 1;

  if v_fair_id is null then
    raise exception 'demo fair not found — was migration 0035 applied?';
  end if;

  delete from public.event_requests where fair_id = v_fair_id;
  delete from public.sales where fair_id = v_fair_id;
  delete from public.checkout_sessions where fair_id = v_fair_id;
  delete from public.wallet_fundings
    where wallet_id in (select id from public.student_wallets where fair_id = v_fair_id);
  delete from public.student_wallets where fair_id = v_fair_id;
  delete from public.settlements where fair_id = v_fair_id;
  -- Cascades to journal_lines (journal_lines.journal_entry_id is `on
  -- delete cascade`) — see migration 0003.
  delete from public.journal_entries where fair_id = v_fair_id;
  delete from public.allocations where fair_id = v_fair_id;

  for v_item in
    select id, cost from public.catalog_items where title like '[Demo] %'
  loop
    update public.catalog_items
    set stock_on_hand = v_full_stock - v_allocate_qty
    where id = v_item.id;

    insert into public.allocations (fair_id, catalog_item_id, quantity_allocated)
    values (v_fair_id, v_item.id, v_allocate_qty);

    perform app.post_journal_entry(
      'allocation', v_fair_id, v_org_id,
      'Demo fair reset — reallocated demo stock', v_item.id,
      jsonb_build_array(
        jsonb_build_object('account_code', '1200', 'debit', v_item.cost * v_allocate_qty),
        jsonb_build_object('account_code', '1100', 'credit', v_item.cost * v_allocate_qty)
      )
    );
  end loop;

  update public.fairs
  set status = 'scheduled', closed_at = null, equipment_rental_fee = 0
  where id = v_fair_id;
end;
$$;

revoke execute on function public.reset_demo_fair() from public;
grant execute on function public.reset_demo_fair() to authenticated;
