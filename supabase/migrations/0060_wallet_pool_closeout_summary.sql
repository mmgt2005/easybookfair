-- Snapshots a wallet assistance pool's lifetime impact once it closes —
-- how many students it helped, how much assistance it gave out, and how
-- much was left over and swept into the org's payout. That data already
-- exists (every pool-assisted checkout posts a wallet_pool_assist entry,
-- close_wallets_for_fair posts one wallet_pool_closeout entry for
-- whatever's left), but nothing aggregates or stores it, so a donor has
-- no way to see the fair's overall impact after the fact. Mirrors
-- student_wallets' own donated_amount/closed_at pair (migrations
-- 0018/0022) — a permanent snapshot set once at close time, not
-- recomputed live afterward.
alter table public.wallet_pools
  add column students_helped_count integer,
  add column total_assisted numeric(10, 2),
  add column swept_amount numeric(10, 2),
  add column closed_at timestamptz;

-- close_wallets_for_fair (migration 0059): same body, with the pool
-- block extended to compute and store the snapshot before zeroing the
-- balance. A fair with no wallet_pools row at all (no donations ever
-- made) still no-ops safely — the final update just affects zero rows,
-- same as before this migration.
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
  v_students_helped integer;
  v_total_assisted numeric;
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

  select
    count(*) filter (where pool_assistance_used > 0),
    coalesce(sum(pool_assistance_used), 0)
  into v_students_helped, v_total_assisted
  from public.student_wallets
  where fair_id = p_fair_id;

  update public.wallet_pools
  set balance = 0,
      status = 'closed',
      students_helped_count = v_students_helped,
      total_assisted = v_total_assisted,
      swept_amount = coalesce(v_pool_balance, 0),
      closed_at = now()
  where fair_id = p_fair_id;

  return v_count;
end;
$$;

-- Anon-safe summary for a donor's close-out receipt — mirrors
-- wallet_donation_receipt() (migration 0037) exactly: only returns a row
-- once the pool has actually closed, since the snapshot columns are null
-- until then. One row per fair (not per wallet_id) since the pool is
-- shared, not tied to any one student or donor.
create or replace function public.pool_donation_summary(p_fair_id uuid)
returns table (
  fair_name text,
  students_helped_count integer,
  total_assisted numeric,
  swept_amount numeric,
  closed_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select f.name, wp.students_helped_count, wp.total_assisted, wp.swept_amount, wp.closed_at
  from public.wallet_pools wp
  join public.fairs f on f.id = wp.fair_id
  where wp.fair_id = p_fair_id
    and wp.status = 'closed';
$$;

revoke execute on function public.pool_donation_summary(uuid) from public;
grant execute on function public.pool_donation_summary(uuid) to anon, authenticated;
