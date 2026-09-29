-- Manual, opt-in, flat sales tax per fair — not Stripe Tax / address-based
-- multi-jurisdiction calculation (docs/spec.md's deferred note): this app
-- is pickup-only, so there's exactly one jurisdiction per fair and the org
-- already knows its own rate. Applied uniformly to all four sale channels
-- since each represents the same taxable event. Wallet *funding* is never
-- taxed — only a wallet *spend* is a purchase.

-- Seeded, admin-editable reference table of each US state's base sales
-- tax rate (county/city add-ons are NOT modeled here — the US has
-- 13,000+ combined-rate jurisdictions once county/city/special districts
-- are counted, and keeping that accurate is a real, continuous
-- data-maintenance commitment, the actual reason services like Avalara/
-- TaxJar/Stripe Tax exist and stay in business — not something to take
-- on as a side effect of one feature). Mirrors carton_specs/
-- label_templates' exact shape: a flat, admin-only, "configure once,
-- reuse/correct as needed" reference table with its own simple CRUD
-- screen, so a rate that changes via state legislation can be fixed
-- without a new migration.
create table public.sales_tax_state_rates (
  state_code text primary key check (state_code = upper(state_code) and length(state_code) = 2),
  state_name text not null,
  base_rate numeric(5, 4) not null check (base_rate >= 0 and base_rate <= 1),
  created_at timestamptz not null default now()
);

alter table public.sales_tax_state_rates enable row level security;

create policy "sales_tax_state_rates_select" on public.sales_tax_state_rates
  for select
  using (true); -- read by any authenticated org/admin user filling in the fair edit form

create policy "sales_tax_state_rates_admin_write" on public.sales_tax_state_rates
  for all
  using (app.is_platform_admin())
  with check (app.is_platform_admin());

-- Seed: all 50 states + DC's known base (state-level) sales tax rate.
-- These are the well-established statutory base rates, NOT combined
-- with any county/city add-on — flag this row's values for a periodic
-- manual sanity-check against each state's Department of Revenue site
-- (rates change via legislation occasionally; this table is exactly the
-- admin-editable escape hatch for when one does). Five states currently
-- levy no state-level sales tax at all (Alaska, Delaware, Montana, New
-- Hampshire, Oregon) — seeded at 0.0000 rather than omitted, so the
-- fair-edit dropdown can still show "0% state rate — check for local
-- add-ons" instead of silently having no entry for that state.
insert into public.sales_tax_state_rates (state_code, state_name, base_rate) values
  ('AL', 'Alabama', 0.0400), ('AK', 'Alaska', 0.0000), ('AZ', 'Arizona', 0.0560),
  ('AR', 'Arkansas', 0.0650), ('CA', 'California', 0.0725), ('CO', 'Colorado', 0.0290),
  ('CT', 'Connecticut', 0.0635), ('DE', 'Delaware', 0.0000), ('DC', 'District of Columbia', 0.0600),
  ('FL', 'Florida', 0.0600), ('GA', 'Georgia', 0.0400), ('HI', 'Hawaii', 0.0400),
  ('ID', 'Idaho', 0.0600), ('IL', 'Illinois', 0.0625), ('IN', 'Indiana', 0.0700),
  ('IA', 'Iowa', 0.0600), ('KS', 'Kansas', 0.0650), ('KY', 'Kentucky', 0.0600),
  ('LA', 'Louisiana', 0.0445), ('ME', 'Maine', 0.0550), ('MD', 'Maryland', 0.0600),
  ('MA', 'Massachusetts', 0.0625), ('MI', 'Michigan', 0.0600), ('MN', 'Minnesota', 0.0688),
  ('MS', 'Mississippi', 0.0700), ('MO', 'Missouri', 0.0423), ('MT', 'Montana', 0.0000),
  ('NE', 'Nebraska', 0.0550), ('NV', 'Nevada', 0.0685), ('NH', 'New Hampshire', 0.0000),
  ('NJ', 'New Jersey', 0.0663), ('NM', 'New Mexico', 0.0513), ('NY', 'New York', 0.0400),
  ('NC', 'North Carolina', 0.0475), ('ND', 'North Dakota', 0.0500), ('OH', 'Ohio', 0.0575),
  ('OK', 'Oklahoma', 0.0450), ('OR', 'Oregon', 0.0000), ('PA', 'Pennsylvania', 0.0600),
  ('RI', 'Rhode Island', 0.0700), ('SC', 'South Carolina', 0.0600), ('SD', 'South Dakota', 0.0420),
  ('TN', 'Tennessee', 0.0700), ('TX', 'Texas', 0.0625), ('UT', 'Utah', 0.0485),
  ('VT', 'Vermont', 0.0600), ('VA', 'Virginia', 0.0530), ('WA', 'Washington', 0.0650),
  ('WV', 'West Virginia', 0.0600), ('WI', 'Wisconsin', 0.0500), ('WY', 'Wyoming', 0.0400);

alter table public.fairs
  add column sales_tax_pct numeric(5, 4) check (
    sales_tax_pct is null or sales_tax_pct between 0 and 1
  ),
  -- Descriptive only — these three never drive the checkout math
  -- (sales_tax_pct alone does that). They exist so the org's chosen
  -- jurisdiction is on record for their own remittance bookkeeping, and
  -- so the fair edit form can suggest a state base rate from
  -- sales_tax_state_rates above. tax_state is a 2-letter code, FK'd to
  -- the reference table so the suggestion lookup can't silently miss.
  add column tax_state text references public.sales_tax_state_rates (state_code),
  add column tax_county text,
  add column tax_city text;

-- Sales tax is a pass-through liability owed to the org's own state, never
-- part of the org's payout — its own account so close_fair()/
-- getPayoutEstimate() (which only ever read 2000/1300) never see it.
-- 1350 is a second, narrower "cash the org physically holds" asset, used
-- only as the debit side of a *cash* sale's tax line — cash sales never
-- touch 1000 (Stripe Clearing) or 1300 (A/R — Orgs, read by close_fair()
-- as cash_wholesale_owed and which must stay untouched by tax).
insert into public.accounts (code, name, type) values
  ('2100', 'Sales Tax Payable', 'liability'),
  ('1350', 'Cash Held by Org — Sales Tax', 'asset');

alter table public.checkout_sessions
  add column tax_amount numeric(10, 2) not null default 0
    check (tax_amount >= 0);

-- record_sales_tax_collected(): "new liability account + a small
-- dedicated posting function called once per checkout event, not per
-- unit" — the record_pool_donation() pattern (0059) — so record_sale()'s
-- well-tested per-unit loop is untouched. p_channel picks the debit
-- account. No-ops silently on a null/zero amount so every caller can
-- call it unconditionally.
create or replace function public.record_sales_tax_collected(
  p_fair_id uuid,
  p_channel public.sale_channel,
  p_amount numeric,
  p_reference_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_debit_account text;
begin
  if p_amount is null or p_amount <= 0 then
    return;
  end if;

  select org_id into v_org_id from public.fairs where id = p_fair_id;
  if v_org_id is null then
    raise exception 'fair % not found', p_fair_id;
  end if;

  v_debit_account := case p_channel
    when 'wallet' then '1400'
    when 'cash' then '1350'
    else '1000' -- online, in_person
  end;

  perform app.post_journal_entry(
    'sales_tax', p_fair_id, v_org_id, 'Sales tax collected', p_reference_id,
    jsonb_build_array(
      jsonb_build_object('account_code', v_debit_account, 'debit', p_amount),
      jsonb_build_object('account_code', '2100', 'credit', p_amount)
    )
  );
end;
$$;

revoke execute on function public.record_sales_tax_collected(uuid, public.sale_channel, numeric, uuid) from public;
grant execute on function public.record_sales_tax_collected(uuid, public.sale_channel, numeric, uuid) to service_role;

-- record_checkout_sale (0010, extended 0023): one new call after the
-- per-unit loop, before marking the session completed. Uses
-- checkout_sessions.tax_amount (computed and charged at session-creation
-- time in TS), not a re-derivation from line_items.
create or replace function public.record_checkout_sale(p_payment_intent_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session record;
  v_item jsonb;
  v_qty integer;
  i integer;
begin
  select * into v_session
  from public.checkout_sessions
  where payment_intent_id = p_payment_intent_id
  for update;

  if v_session is null or v_session.status = 'completed' then
    return;
  end if;

  for v_item in select * from jsonb_array_elements(v_session.line_items)
  loop
    v_qty := (v_item ->> 'quantity')::integer;
    for i in 1..v_qty loop
      perform public.record_sale(
        v_session.fair_id,
        (v_item ->> 'catalog_item_id')::uuid,
        v_session.channel,
        (v_item ->> 'price_charged')::numeric,
        (v_item ->> 'wholesale_cost')::numeric,
        p_payment_intent_id,
        nullif(v_item ->> 'promotion_id', '')::uuid
      );
    end loop;
  end loop;

  perform public.record_sales_tax_collected(
    v_session.fair_id, v_session.channel, v_session.tax_amount, v_session.id
  );

  update public.checkout_sessions
  set
    status = 'completed',
    fulfillment_status = case when v_session.channel = 'online' then 'awaiting_pickup' else null end
  where id = v_session.id;
end;
$$;

revoke execute on function public.record_checkout_sale(text) from public;
grant execute on function public.record_checkout_sale(text) to service_role;

-- record_cash_sale (0043, extended 0046): same body, plus a subtotal
-- accumulator and one tax posting call after the loop — tax is computed
-- once on the subtotal, not per line item, to avoid rounding drift.
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
  v_subtotal numeric := 0;
  v_tax numeric;
  i integer;
begin
  if not app.can_operate_fair(p_fair_id) then
    raise exception 'not authorized';
  end if;

  select sales_tax_pct into v_tax_pct
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

  v_tax := round(v_subtotal * coalesce(v_tax_pct, 0), 2);
  perform public.record_sales_tax_collected(p_fair_id, 'cash', v_tax, gen_random_uuid());
end;
$$;

revoke execute on function public.record_cash_sale(uuid, jsonb) from public;
grant execute on function public.record_cash_sale(uuid, jsonb) to authenticated;

-- spend_from_wallet (0021, extended 0039/0046/0059): v_total_cost now
-- includes tax so pool-assistance shortfall/eligibility math reflects
-- what the buyer actually owes. After the existing per-unit loop, one
-- extra balance debit + one posting call for the tax portion — if the
-- wallet still can't cover it even after pool assistance,
-- student_wallets' own check (balance >= 0) aborts the whole call and
-- everything already done in it rolls back, same failure mode this
-- function already relies on today for an underfunded cart.
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

  select org_id, sales_tax_pct into v_org_id, v_tax_pct from public.fairs where id = p_fair_id;

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

  v_tax := round(v_subtotal * coalesce(v_tax_pct, 0), 2);
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

-- close_fair() (0036, extended 0055): same body, plus a new query for
-- sales tax's net 2100 balance, added to the settlement as a purely
-- informational column — never referenced by v_total_owed/v_net_payout,
-- same treatment equipment_rental_fee/missing_inventory_cost already get
-- for the figures that DO belong in those formulas.
alter table public.settlements
  add column sales_tax_collected numeric(12, 2) not null default 0;

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
  v_sales_tax_collected numeric(12, 2);
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

  -- Sales Tax Payable is a pure liability the org owes the state, not the
  -- platform: reported here for visibility, deliberately never added into
  -- v_total_owed/v_net_payout below and never journaled against 2000/1300
  -- — see record_sales_tax_collected().
  select coalesce(sum(jl.credit), 0) - coalesce(sum(jl.debit), 0)
  into v_sales_tax_collected
  from public.journal_lines jl
  join public.journal_entries je on je.id = jl.journal_entry_id
  where je.fair_id = p_fair_id and jl.account_code = '2100';

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

  -- UNCHANGED formulas — sales tax is never part of either.
  v_total_owed := v_cash_wholesale_owed + v_missing_inventory_cost + v_rental_fee;
  v_net_payout := v_payout_due - v_total_owed;

  insert into public.settlements (
    fair_id, org_id, cash_wholesale_owed, missing_inventory_cost,
    total_owed_by_org, payout_due, net_payout, equipment_rental_fee,
    sales_tax_collected
  ) values (
    p_fair_id, v_org_id, v_cash_wholesale_owed, v_missing_inventory_cost,
    v_total_owed, v_payout_due, v_net_payout, v_rental_fee,
    coalesce(v_sales_tax_collected, 0)
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

-- fair_public_info() (0025, extended by 0026/0031/0044/0062) needs
-- sales_tax_pct too — it's the storefront/wallet pages' only public read
-- path onto fairs, and StorefrontClient needs the rate to preview the
-- tax-inclusive total a buyer will actually be charged. Same
-- drop-then-recreate as every prior extension: CREATE OR REPLACE can't
-- add new OUT columns.
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
  sales_tax_pct numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    f.id, f.name, o.name, o.is_school, f.status, f.start_date, f.end_date,
    f.allow_online, f.allow_wallet, f.allow_in_person,
    o.is_demo, o.is_demo_enabled, f.sales_tax_pct
  from public.fairs f
  join public.organizations o on o.id = f.org_id
  where f.id = p_fair_id;
$$;

revoke execute on function public.fair_public_info(uuid) from public;
grant execute on function public.fair_public_info(uuid) to anon, authenticated;

-- get_checkout_session_public() (0025) needs tax_amount too — it's the
-- buyer's own order-confirmation page's only public read path onto
-- checkout_sessions, and the page needs to show the tax-inclusive total
-- the buyer was actually charged. Same drop-then-recreate as every other
-- extension: CREATE OR REPLACE can't add new OUT columns.
drop function if exists public.get_checkout_session_public(uuid);

create or replace function public.get_checkout_session_public(p_checkout_session_id uuid)
returns table (
  id uuid,
  status text,
  fulfillment_status text,
  buyer_name text,
  line_items jsonb,
  fair_name text,
  tax_amount numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select cs.id, cs.status, cs.fulfillment_status, cs.buyer_name, cs.line_items, f.name, cs.tax_amount
  from public.checkout_sessions cs
  join public.fairs f on f.id = cs.fair_id
  where cs.id = p_checkout_session_id;
$$;

revoke execute on function public.get_checkout_session_public(uuid) from public;
grant execute on function public.get_checkout_session_public(uuid) to anon, authenticated;

-- get_checkout_sessions_by_email() (0027) needs tax_amount too, for the
-- same reason and by the same drop-then-recreate pattern.
drop function if exists public.get_checkout_sessions_by_email(uuid, text);

create or replace function public.get_checkout_sessions_by_email(
  p_fair_id uuid,
  p_email text
)
returns table (
  id uuid,
  status text,
  fulfillment_status text,
  buyer_name text,
  line_items jsonb,
  created_at timestamptz,
  tax_amount numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select cs.id, cs.status, cs.fulfillment_status, cs.buyer_name, cs.line_items, cs.created_at, cs.tax_amount
  from public.checkout_sessions cs
  where cs.fair_id = p_fair_id
    and cs.channel = 'online'
    and lower(cs.buyer_email) = lower(p_email)
  order by cs.created_at desc;
$$;

revoke execute on function public.get_checkout_sessions_by_email(uuid, text) from public;
grant execute on function public.get_checkout_sessions_by_email(uuid, text) to anon, authenticated;
