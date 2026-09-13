-- A permanent, resettable sandbox fair for training — lets a new admin or
-- org staff member click through catalog, allocation, checkout, storefront,
-- and wallet flows without touching real data. Identified by
-- organizations.is_demo rather than a new column on every other table
-- (fairs, catalog_items) — everything else about it is a completely
-- ordinary fair/catalog/allocation, just seeded and easily reset.
alter table public.organizations
  add column is_demo boolean not null default false;

insert into public.organizations (name, is_school, is_demo, status)
values ('EasyBookFair Demo School', true, true, 'approved');

insert into public.fairs (
  org_id, name, start_date, end_date, return_deadline,
  allow_online, allow_wallet, allow_in_person, allow_cash
)
select id, 'Demo Training Fair', current_date, current_date + 6, current_date + 20,
       true, true, true, true
from public.organizations where is_demo;

-- Demo catalog items, prefixed so they're obviously identifiable in the
-- regular admin catalog list too (no separate "is demo" flag on
-- catalog_items — the catalog is shared platform-wide, not per-org).
-- stock_on_hand is seeded at the *full* quantity; reset_demo_fair() below
-- allocates a portion of it to the demo fair and is what both this seed
-- and any later reset actually run to reach the "ready to practice" state.
insert into public.catalog_items (item_type, title, cost, price, category, description, stock_on_hand) values
  ('book', '[Demo] The Great Adventure', 4.00, 9.99, 'Fiction', 'A sample title for practicing checkout and storefront browsing.', 50),
  ('book', '[Demo] Space Explorers', 3.50, 8.99, 'Science', 'A sample title for practicing checkout and storefront browsing.', 50),
  ('book', '[Demo] Funny Bunny Tales', 3.00, 7.99, 'Picture Books', 'A sample title for practicing checkout and storefront browsing.', 50),
  ('book', '[Demo] Mystery at Midnight', 4.50, 10.99, 'Mystery', 'A sample title for practicing checkout and storefront browsing.', 50),
  ('merchandise', '[Demo] EasyBookFair Pencil Set', 1.00, 3.99, 'Merchandise', 'A sample non-book item for practicing checkout and storefront browsing.', 50);

-- Resets the demo fair back to its pristine, ready-to-practice state:
-- clears every sale/checkout/wallet/settlement made against it, and
-- restores the demo catalog items' stock/allocation to the same fixed
-- quantities every time. Admin-gated the normal way (unlike this
-- migration's own seeding above, which runs as plain inserts with no
-- request context to check app.is_platform_admin() against).
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

-- Seed the initial allocated/ready-to-practice state now, so a freshly
-- migrated database doesn't need an admin to press "Reset" once before
-- anything shows up. Plain inserts, not a call to reset_demo_fair() above
-- — this runs as a direct migration connection with no auth.uid(), which
-- that function's app.is_platform_admin() check would reject.
do $$
declare
  v_org_id uuid;
  v_fair_id uuid;
  v_full_stock constant integer := 50;
  v_allocate_qty constant integer := 20;
  v_item record;
begin
  select o.id, f.id into v_org_id, v_fair_id
  from public.organizations o
  join public.fairs f on f.org_id = o.id
  where o.is_demo
  limit 1;

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
      'Demo fair — initial seed allocation', v_item.id,
      jsonb_build_array(
        jsonb_build_object('account_code', '1200', 'debit', v_item.cost * v_allocate_qty),
        jsonb_build_object('account_code', '1100', 'credit', v_item.cost * v_allocate_qty)
      )
    );
  end loop;
end $$;
