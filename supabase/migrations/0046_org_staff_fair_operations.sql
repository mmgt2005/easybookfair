-- Checkout, pickup, and wallets were admin-only in the UI, but that was
-- really just requireAdmin() plumbing plus a handful of RPCs hard-gated to
-- app.is_platform_admin() — org staff have always been able to request a
-- fair and see its payout, but never actually run it day-of. This lets an
-- org's own staff run their own fair's checkout/pickup/wallets, while an
-- admin still can (and can still operate any fair, not just ones they're
-- staff of).
--
-- app.can_operate_fair() generalizes the admin-only check used inside
-- record_cash_sale/spend_from_wallet/mark_checkout_picked_up/
-- close_wallets_for_fair: true for a platform admin (any fair), or for an
-- authenticated org member whose org owns this specific fair — mirroring
-- the same org-scoping already used by fairs_select/sales_select/
-- checkout_sessions_select (migration 0005).
create or replace function app.can_operate_fair(p_fair_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    app.is_platform_admin()
    or exists (
      select 1 from public.fairs f
      where f.id = p_fair_id and f.org_id in (select app.current_org_ids())
    );
$$;

grant execute on function app.can_operate_fair(uuid) to authenticated;

-- record_cash_sale (migration 0043): same body, only the auth check changes.
create or replace function public.record_cash_sale(
  p_fair_id uuid,
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
  if not app.can_operate_fair(p_fair_id) then
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

-- spend_from_wallet (migration 0039): same body, only the auth check changes.
create or replace function public.spend_from_wallet(
  p_wallet_id uuid,
  p_fair_id uuid,
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
  if not app.can_operate_fair(p_fair_id) then
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

-- mark_checkout_picked_up (migration 0023): takes only a checkout session
-- id, not a fair id, so its own fair_id is looked up first.
create or replace function public.mark_checkout_picked_up(p_checkout_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fair_id uuid;
begin
  select fair_id into v_fair_id
  from public.checkout_sessions
  where id = p_checkout_session_id;

  if v_fair_id is null or not app.can_operate_fair(v_fair_id) then
    raise exception 'not authorized';
  end if;

  update public.checkout_sessions
  set fulfillment_status = 'picked_up'
  where id = p_checkout_session_id
    and fulfillment_status = 'awaiting_pickup';
end;
$$;

-- close_wallets_for_fair (migration 0022): same body, only the auth check
-- changes.
create or replace function public.close_wallets_for_fair(p_fair_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_wallet record;
  v_count integer := 0;
begin
  if not app.can_operate_fair(p_fair_id) then
    raise exception 'not authorized';
  end if;

  select org_id into v_org_id from public.fairs where id = p_fair_id;
  if v_org_id is null then
    raise exception 'fair % not found', p_fair_id;
  end if;

  for v_wallet in
    select * from public.student_wallets
    where fair_id = p_fair_id and status = 'active'
    for update
  loop
    if v_wallet.balance > 0 then
      perform app.post_journal_entry(
        'wallet_closeout',
        p_fair_id,
        v_org_id,
        format('Unused wallet balance for %s added to org payout', v_wallet.student_name),
        v_wallet.id,
        jsonb_build_array(
          jsonb_build_object('account_code', '1400', 'debit', v_wallet.balance),
          jsonb_build_object('account_code', '2000', 'credit', v_wallet.balance)
        )
      );
    end if;

    update public.student_wallets
    set balance = 0, status = 'closed'
    where id = v_wallet.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- student_wallets/wallet_fundings were admin-only to read (migrations
-- 0018/0019) — additive org-scoped policies alongside those, same pattern
-- as sales_select_author (migration 0040) being additive to sales_select,
-- so the checkout screen's wallet search and the wallets management page
-- both work for org staff on their own fair.
create policy "student_wallets_org_select" on public.student_wallets
  for select
  using (fair_id in (select id from public.fairs where org_id in (select app.current_org_ids())));

create policy "wallet_fundings_org_select" on public.wallet_fundings
  for select
  using (
    wallet_id in (
      select id from public.student_wallets
      where fair_id in (select id from public.fairs where org_id in (select app.current_org_ids()))
    )
  );
