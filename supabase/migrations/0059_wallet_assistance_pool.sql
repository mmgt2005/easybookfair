-- A shared, fair-level pool that automatically covers part of a purchase
-- when a student's own wallet balance is low, funded either by a donor
-- (a live public Stripe payment) or by org staff recording a donation
-- already collected offline (cash, check, a sponsor). Unlike per-student
-- wallet funding (migration 0019), this money isn't earmarked for one
-- named student — it's a shared assistance fund the checkout flow draws
-- from automatically for a qualifying student, up to a per-student
-- lifetime cap, so no one student can drain a shared community pool.
--
-- 1500 exists only as the debit side of an org-recorded (offline)
-- donation — a trust-based placeholder exactly like this app's existing
-- cash-sale handling (record_cash_sale never verifies the org actually
-- collected the cash either), kept separate from 1000 (Stripe Clearing)
-- so a donation that never touched Stripe isn't misrepresented as
-- Stripe-held money.
insert into public.accounts (code, name, type) values
  ('1450', 'Wallet Assistance Pool Liability', 'liability'),
  ('1500', 'Donations Received (Org-Recorded)', 'asset');

-- One row per fair (upserted, not a history log — same reasoning as
-- cash_drawer_setups, migration 0057).
create table public.wallet_pools (
  id uuid primary key default gen_random_uuid(),
  fair_id uuid not null unique references public.fairs (id) on delete cascade,
  balance numeric(10, 2) not null default 0 check (balance >= 0),
  status text not null default 'active' check (status in ('active', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at
  before update on public.wallet_pools
  for each row execute function app.set_updated_at();

-- One row per funding event, mirroring wallet_fundings (migration 0019)
-- exactly, plus a `source` column distinguishing the two funding paths.
create table public.wallet_pool_fundings (
  id uuid primary key default gen_random_uuid(),
  fair_id uuid not null references public.fairs (id) on delete cascade,
  source text not null check (source in ('donor_stripe', 'org_recorded')),
  payment_intent_id text unique, -- set only for donor_stripe
  amount numeric(10, 2) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending', 'completed')),
  donor_email text,
  note text, -- e.g. "Fall festival bake sale proceeds" — org_recorded only
  recorded_by uuid references auth.users (id), -- org_recorded only
  created_at timestamptz not null default now()
);

create index wallet_pool_fundings_fair_id_idx on public.wallet_pool_fundings (fair_id);

-- Tracks how much of the $20 per-student lifetime cap this student has
-- already drawn from any fair's pool.
alter table public.student_wallets
  add column pool_assistance_used numeric(10, 2) not null default 0
    check (pool_assistance_used >= 0);

alter table public.wallet_pools enable row level security;

create policy "wallet_pools_admin_all" on public.wallet_pools
  for all
  using (app.is_platform_admin())
  with check (app.is_platform_admin());

create policy "wallet_pools_org_select" on public.wallet_pools
  for select
  using (fair_id in (select id from public.fairs where org_id in (select app.current_org_ids())));

alter table public.wallet_pool_fundings enable row level security;

create policy "wallet_pool_fundings_admin_select" on public.wallet_pool_fundings
  for select
  using (app.is_platform_admin());

create policy "wallet_pool_fundings_org_select" on public.wallet_pool_fundings
  for select
  using (fair_id in (select id from public.fairs where org_id in (select app.current_org_ids())));

-- Called by the payment webhook on payment_intent.succeeded, mirroring
-- record_wallet_funding's exact idempotency pattern (migration 0019):
-- `for update` + the status check is what makes a redelivered event safe
-- to reprocess. Upserts the fair's wallet_pools row if this is its
-- first-ever donation.
create or replace function public.record_pool_funding(p_payment_intent_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_funding record;
  v_org_id uuid;
begin
  select * into v_funding
  from public.wallet_pool_fundings
  where payment_intent_id = p_payment_intent_id
  for update;

  if v_funding is null or v_funding.status = 'completed' then
    return;
  end if;

  select org_id into v_org_id from public.fairs where id = v_funding.fair_id;

  insert into public.wallet_pools (fair_id, balance)
  values (v_funding.fair_id, v_funding.amount)
  on conflict (fair_id) do update
    set balance = public.wallet_pools.balance + v_funding.amount;

  perform app.post_journal_entry(
    'wallet_pool_funding',
    v_funding.fair_id,
    v_org_id,
    'Wallet assistance pool donation',
    v_funding.id,
    jsonb_build_array(
      jsonb_build_object('account_code', '1000', 'debit', v_funding.amount),
      jsonb_build_object('account_code', '1450', 'credit', v_funding.amount)
    )
  );

  update public.wallet_pool_fundings set status = 'completed' where id = v_funding.id;
end;
$$;

revoke execute on function public.record_pool_funding(text) from public;
grant execute on function public.record_pool_funding(text) to service_role;

-- Org-recorded path: staff enter a donation already collected outside
-- the app (cash, check, a sponsor) directly — no Stripe payment to wait
-- on, so this commits synchronously, same reasoning as record_cash_sale
-- posting immediately instead of via a webhook.
create or replace function public.record_pool_donation(
  p_fair_id uuid,
  p_amount numeric,
  p_note text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_funding_id uuid;
  v_pool_status text;
begin
  if not app.can_operate_fair(p_fair_id) then
    raise exception 'not authorized';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  select org_id into v_org_id from public.fairs where id = p_fair_id;
  if v_org_id is null then
    raise exception 'fair % not found', p_fair_id;
  end if;

  select status into v_pool_status from public.wallet_pools where fair_id = p_fair_id;
  if v_pool_status = 'closed' then
    raise exception 'this fair''s wallet assistance pool is already closed';
  end if;

  insert into public.wallet_pool_fundings (fair_id, source, amount, status, note, recorded_by)
  values (p_fair_id, 'org_recorded', p_amount, 'completed', p_note, auth.uid())
  returning id into v_funding_id;

  insert into public.wallet_pools (fair_id, balance)
  values (p_fair_id, p_amount)
  on conflict (fair_id) do update
    set balance = public.wallet_pools.balance + p_amount;

  perform app.post_journal_entry(
    'wallet_pool_funding',
    p_fair_id,
    v_org_id,
    'Wallet assistance pool donation (recorded by staff)',
    v_funding_id,
    jsonb_build_array(
      jsonb_build_object('account_code', '1500', 'debit', p_amount),
      jsonb_build_object('account_code', '1450', 'credit', p_amount)
    )
  );
end;
$$;

grant execute on function public.record_pool_donation(uuid, numeric, text) to authenticated;

-- Lets an in-person volunteer create a wallet on the spot for a student
-- who was never funded online — the clearest case of qualifying for pool
-- assistance (balance starts at exactly $0). student_wallets has no
-- authenticated-role insert policy (writes go through service-role code
-- or a security definer function, same as every other wallet mutation
-- in this app), so this needs its own RPC rather than a raw table
-- insert from the checkout action. Mirrors createWalletFunding's own
-- "exact-tuple lookup, else insert" logic.
create or replace function public.create_wallet_at_checkout(
  p_fair_id uuid,
  p_student_name text,
  p_grade text,
  p_teacher text
) returns public.student_wallets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet public.student_wallets;
  v_grade text := nullif(trim(p_grade), '');
  v_teacher text := nullif(trim(p_teacher), '');
begin
  if not app.can_operate_fair(p_fair_id) then
    raise exception 'not authorized';
  end if;

  if trim(p_student_name) = '' then
    raise exception 'student name is required';
  end if;

  select * into v_wallet
  from public.student_wallets
  where fair_id = p_fair_id
    and student_name = trim(p_student_name)
    and grade is not distinct from v_grade
    and teacher is not distinct from v_teacher;

  if found then
    return v_wallet;
  end if;

  insert into public.student_wallets (fair_id, student_name, grade, teacher)
  values (p_fair_id, trim(p_student_name), v_grade, v_teacher)
  returning * into v_wallet;

  return v_wallet;
end;
$$;

grant execute on function public.create_wallet_at_checkout(uuid, text, text, text) to authenticated;

-- spend_from_wallet (migration 0046): same body, with one new block
-- inserted before the existing per-line-item loop. A student whose own
-- balance is below $10 (including exactly $0) qualifies for pool
-- assistance; the pool covers exactly this checkout's shortfall, bounded
-- by the pool's remaining balance and the student's remaining room under
-- a $20 per-student lifetime cap (student_wallets.pool_assistance_used).
-- The pool "pays into" the student's own wallet balance as one small
-- internal transfer (1450 debit / 1400 credit) *before* the existing
-- loop runs, so record_sale() and every downstream sale/margin entry are
-- completely unaffected — they behave exactly as if the student had that
-- money in their wallet all along. If the assisted total still isn't
-- enough, the existing per-item `balance -= price_charged` update trips
-- the `check (balance >= 0)` constraint exactly as it does today, rolling
-- the whole checkout back — no change to that failure mode.
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
  v_item jsonb;
  v_catalog_item record;
  v_qty integer;
  v_price_charged numeric;
  v_promotion_id uuid;
  v_allocated integer;
  v_sold integer;
  v_available integer;
  v_total_cost numeric;
  v_shortfall numeric;
  v_pool_balance numeric;
  v_assist numeric;
  i integer;
begin
  if not app.can_operate_fair(p_fair_id) then
    raise exception 'not authorized';
  end if;

  select org_id into v_org_id from public.fairs where id = p_fair_id;

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
  into v_total_cost
  from jsonb_array_elements(p_line_items) as item;

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

  return v_wallet.id;
end;
$$;

-- close_wallets_for_fair (migration 0046): same body, with one addition
-- after the existing per-wallet loop — sweeps any unused pool balance
-- into the org's payout too, same treatment as unspent individual
-- wallet balances get in the loop above.
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
  v_pool_id uuid;
  v_pool_balance numeric;
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

  select id, balance into v_pool_id, v_pool_balance
  from public.wallet_pools
  where fair_id = p_fair_id and status = 'active'
  for update;

  if v_pool_balance > 0 then
    perform app.post_journal_entry(
      'wallet_pool_closeout',
      p_fair_id,
      v_org_id,
      'Unused wallet assistance pool balance added to org payout',
      v_pool_id,
      jsonb_build_array(
        jsonb_build_object('account_code', '1450', 'debit', v_pool_balance),
        jsonb_build_object('account_code', '2000', 'credit', v_pool_balance)
      )
    );
  end if;

  update public.wallet_pools set balance = 0, status = 'closed' where fair_id = p_fair_id;

  return v_count;
end;
$$;
