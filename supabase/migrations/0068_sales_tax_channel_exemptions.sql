-- Lets a fair exempt specific sale channels from its sales tax rate,
-- instead of the single rate always applying uniformly to all four
-- channels (migration 0064). Real-world motivation: several states'
-- nonprofit/school fundraiser sales tax exemptions turn on who the legal
-- seller is and whether the sale is an occasional, direct, in-person sale
-- by the exempt org itself — a platform-mediated online sale often fails
-- that test even when an in-person sale by the same org, at the same
-- fair, would qualify (confirmed directly from the Texas Comptroller,
-- publication 94-183, as a documented example of this mechanism; the
-- exact rule and whether it exists at all varies by state and isn't
-- something this app claims to know — see the UI links added below).
--
-- Four independent booleans, mirroring the existing allow_online/
-- allow_in_person/allow_cash/allow_wallet four-flag pattern already on
-- this table (migration 0039). `default true` on all four is load-bearing:
-- every fair that already has a rate configured today taxes all four
-- channels uniformly, and this migration must not silently change that
-- for a single existing fair — only an explicit uncheck changes anything.
alter table public.fairs
  add column tax_applies_online boolean not null default true,
  add column tax_applies_in_person boolean not null default true,
  add column tax_applies_cash boolean not null default true,
  add column tax_applies_wallet boolean not null default true;

-- record_checkout_sale() (online + in-person) needs no change here — it
-- posts whatever tax_amount was already computed and stored on the
-- checkout_sessions row at session-creation time in TypeScript, so the
-- per-channel decision for those two channels lives in
-- createGuestCheckout()/createInPersonCheckout() instead (app-level
-- change, not a migration). record_sales_tax_collected() already no-ops
-- on a zero amount, so passing 0 for an exempt channel is sufficient —
-- no change needed there either.

-- record_cash_sale() (0064): same body, plus a tax_applies_cash read and
-- one changed line — v_tax is 0 when the flag is false instead of always
-- being computed from v_tax_pct.
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
  v_tax_pct numeric;
  v_tax_applies_cash boolean;
  v_subtotal numeric := 0;
  v_tax numeric;
  i integer;
begin
  if not app.can_operate_fair(p_fair_id) then
    raise exception 'not authorized';
  end if;

  select sales_tax_pct, tax_applies_cash into v_tax_pct, v_tax_applies_cash
  from public.fairs where id = p_fair_id and allow_cash;

  if not found then
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
    v_subtotal := v_subtotal + v_price_charged * v_qty;

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

  v_tax := case when v_tax_applies_cash then round(v_subtotal * coalesce(v_tax_pct, 0), 2) else 0 end;
  perform public.record_sales_tax_collected(p_fair_id, 'cash', v_tax, gen_random_uuid());
end;
$$;

revoke execute on function public.record_cash_sale(uuid, jsonb) from public;
grant execute on function public.record_cash_sale(uuid, jsonb) to authenticated;

-- spend_from_wallet() (0064): same body, plus a tax_applies_wallet read
-- and the same one-line change. The existing tax-inclusive pool-
-- assistance shortfall math needs no further change — v_tax = 0 here is
-- the same case it already handles for "no rate configured", so a
-- wallet-exempt fair's pool assistance keeps working correctly.
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
  v_org_id uuid;
  v_tax_pct numeric;
  v_tax_applies_wallet boolean;
  v_item jsonb;
  v_catalog_item record;
  v_qty integer;
  v_price_charged numeric;
  v_promotion_id uuid;
  v_allocated integer;
  v_sold integer;
  v_available integer;
  v_subtotal numeric;
  v_tax numeric;
  v_total_cost numeric;
  v_shortfall numeric;
  v_pool_balance numeric;
  v_assist numeric;
  i integer;
begin
  if not app.can_operate_fair(p_fair_id) then
    raise exception 'not authorized';
  end if;

  select org_id, sales_tax_pct, tax_applies_wallet
  into v_org_id, v_tax_pct, v_tax_applies_wallet
  from public.fairs where id = p_fair_id;

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

  select coalesce(sum(
    (item ->> 'quantity')::integer *
    coalesce(
      (item ->> 'price_charged')::numeric,
      (select price from public.catalog_items where id = (item ->> 'catalog_item_id')::uuid)
    )
  ), 0)
  into v_subtotal
  from jsonb_array_elements(p_line_items) as item;

  v_tax := case when v_tax_applies_wallet then round(v_subtotal * coalesce(v_tax_pct, 0), 2) else 0 end;
  v_total_cost := v_subtotal + v_tax;

  v_shortfall := greatest(v_total_cost - v_wallet.balance, 0);

  if v_shortfall > 0 and v_wallet.balance < 10 then
    select balance into v_pool_balance
    from public.wallet_pools
    where fair_id = p_fair_id and status = 'active'
    for update;

    v_assist := least(
      v_shortfall,
      coalesce(v_pool_balance, 0),
      greatest(20 - v_wallet.pool_assistance_used, 0)
    );

    if v_assist > 0 then
      update public.wallet_pools set balance = balance - v_assist where fair_id = p_fair_id;
      update public.student_wallets
      set balance = balance + v_assist, pool_assistance_used = pool_assistance_used + v_assist
      where id = p_wallet_id;

      perform app.post_journal_entry(
        'wallet_pool_assist',
        p_fair_id,
        v_org_id,
        format('Pool assistance for %s', v_wallet.student_name),
        p_wallet_id,
        jsonb_build_array(
          jsonb_build_object('account_code', '1450', 'debit', v_assist),
          jsonb_build_object('account_code', '1400', 'credit', v_assist)
        )
      );

      v_wallet.balance := v_wallet.balance + v_assist;
    end if;
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

  if v_tax > 0 then
    update public.student_wallets set balance = balance - v_tax where id = p_wallet_id;
    perform public.record_sales_tax_collected(p_fair_id, 'wallet', v_tax, p_wallet_id);
  end if;

  return v_wallet.id;
end;
$$;

-- set_fair_sales_tax() (0067): widened to also write the four new
-- columns. Old 4-argument signature is dropped since this is a
-- straightforward signature widening, same "drop then recreate" pattern
-- already used repeatedly in this codebase for RPC signature changes.
drop function if exists public.set_fair_sales_tax(uuid, text, numeric, numeric);

create or replace function public.set_fair_sales_tax(
  p_fair_id uuid,
  p_tax_state text,
  p_tax_county_pct numeric,
  p_tax_city_pct numeric,
  p_tax_applies_online boolean,
  p_tax_applies_in_person boolean,
  p_tax_applies_cash boolean,
  p_tax_applies_wallet boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base_rate numeric := 0;
  v_combined numeric;
begin
  if not app.can_operate_fair(p_fair_id) then
    raise exception 'not authorized';
  end if;

  if p_tax_county_pct is not null and (p_tax_county_pct < 0 or p_tax_county_pct > 1) then
    raise exception 'county rate must be between 0 and 1';
  end if;
  if p_tax_city_pct is not null and (p_tax_city_pct < 0 or p_tax_city_pct > 1) then
    raise exception 'city rate must be between 0 and 1';
  end if;

  if p_tax_state is not null then
    select base_rate into v_base_rate
    from public.sales_tax_state_rates
    where state_code = p_tax_state;

    if not found then
      raise exception 'unknown state code %', p_tax_state;
    end if;
  end if;

  v_combined := v_base_rate + coalesce(p_tax_county_pct, 0) + coalesce(p_tax_city_pct, 0);

  update public.fairs
  set
    tax_state = p_tax_state,
    tax_county_pct = p_tax_county_pct,
    tax_city_pct = p_tax_city_pct,
    sales_tax_pct = case when v_combined > 0 then round(v_combined, 4) else null end,
    tax_applies_online = p_tax_applies_online,
    tax_applies_in_person = p_tax_applies_in_person,
    tax_applies_cash = p_tax_applies_cash,
    tax_applies_wallet = p_tax_applies_wallet
  where id = p_fair_id;
end;
$$;

revoke execute on function public.set_fair_sales_tax(
  uuid, text, numeric, numeric, boolean, boolean, boolean, boolean
) from public;
grant execute on function public.set_fair_sales_tax(
  uuid, text, numeric, numeric, boolean, boolean, boolean, boolean
) to authenticated;

-- fair_public_info() (0025, extended repeatedly, most recently 0064 for
-- sales_tax_pct) is the storefront's only public read path onto fairs —
-- StorefrontClient needs tax_applies_online too, or its live preview would
-- keep showing tax on a fair whose online channel is exempt. Same
-- drop-then-recreate as every prior extension: CREATE OR REPLACE can't add
-- new OUT columns.
drop function if exists public.fair_public_info(uuid);

create or replace function public.fair_public_info(p_fair_id uuid)
returns table (
  fair_id uuid,
  fair_name text,
  org_name text,
  is_school boolean,
  status public.fair_status,
  start_date date,
  end_date date,
  allow_online boolean,
  allow_wallet boolean,
  allow_in_person boolean,
  is_demo boolean,
  is_demo_enabled boolean,
  sales_tax_pct numeric,
  tax_applies_online boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    f.id, f.name, o.name, o.is_school, f.status, f.start_date, f.end_date,
    f.allow_online, f.allow_wallet, f.allow_in_person,
    o.is_demo, o.is_demo_enabled, f.sales_tax_pct, f.tax_applies_online
  from public.fairs f
  join public.organizations o on o.id = f.org_id
  where f.id = p_fair_id;
$$;

revoke execute on function public.fair_public_info(uuid) from public;
grant execute on function public.fair_public_info(uuid) to anon, authenticated;
