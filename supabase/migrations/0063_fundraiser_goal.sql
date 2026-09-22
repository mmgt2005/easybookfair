-- Lets a fair opt into a public fundraiser goal + description, shown on
-- the homepage carousel (app/page.tsx) so donors can click through
-- straight to that fair's wallet-assistance-pool donation form.

alter table public.fairs
  add column fundraiser_goal_amount numeric(10, 2) check (fundraiser_goal_amount > 0),
  add column fundraiser_description text;

-- Org staff (or admin) sets/clears the fair's fundraiser goal. fairs has
-- no org-staff UPDATE policy at all (only fairs_admin_write, migration
-- 0005) — writing through a security definer RPC gated by
-- app.can_operate_fair() (migration 0046) avoids both opening broader
-- write access to the whole fairs row and the RLS-silent-no-op trap
-- already hit once this session on settlements (a raw .update() under
-- RLS matching zero rows with no error).
create or replace function public.set_fundraiser_goal(
  p_fair_id uuid,
  p_goal_amount numeric,
  p_description text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not app.can_operate_fair(p_fair_id) then
    raise exception 'not authorized';
  end if;

  if p_goal_amount is not null and p_goal_amount <= 0 then
    raise exception 'goal amount must be positive';
  end if;

  update public.fairs
  set fundraiser_goal_amount = p_goal_amount,
      fundraiser_description = nullif(trim(coalesce(p_description, '')), '')
  where id = p_fair_id;
end;
$$;

revoke execute on function public.set_fundraiser_goal(uuid, numeric, text) from public;
grant execute on function public.set_fundraiser_goal(uuid, numeric, text) to authenticated;

-- Public, anon-safe listing for the homepage carousel + results section.
-- fairs has no anon-select policy at all (fairs_select is org/admin
-- only, migration 0005) — same reasoning as fair_public_info/
-- fair_storefront_items being the only public read paths onto their
-- tables. Progress is computed inline with the same 2000/1300
-- journal-line math getPayoutEstimate()
-- (app/admin/fairs/[fairId]/sales/actions.ts) already uses app-side,
-- duplicated here in SQL since this must run for anon callers with no
-- per-fair auth/session to piggyback a Server Action on.
--
-- progress_amount = total ever donated to the pool (a monotonic sum of
-- wallet_pool_fundings.amount — never decreases as the pool is spent
-- down or swept) + the live/final payout estimate. These are always
-- different dollars: a pool-assisted sale's margin (price minus
-- wholesale cost) is what lands in payout_due, never the raw donated
-- amount itself, so adding the two here is not a double count of the
-- same money — re-derived directly from record_sale()/
-- spend_from_wallet()'s actual postings rather than assumed, since this
-- exact category of mistake was already caught and fixed twice earlier
-- for the payout report.
create or replace function public.fundraiser_fairs_public()
returns table (
  fair_id uuid,
  fair_name text,
  org_name text,
  status public.fair_status,
  fundraiser_goal_amount numeric,
  fundraiser_description text,
  total_donated numeric,
  payout_estimate numeric,
  progress_amount numeric,
  is_final boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  select
    f.id,
    f.name,
    o.name,
    f.status,
    f.fundraiser_goal_amount,
    f.fundraiser_description,
    coalesce(donated.total, 0) as total_donated,
    coalesce(s.net_payout, greatest(coalesce(ledger.payout_due, 0)
      - (greatest(coalesce(ledger.cash_wholesale_owed, 0), 0) + f.equipment_rental_fee), 0)
    ) as payout_estimate,
    coalesce(donated.total, 0) + coalesce(s.net_payout, greatest(coalesce(ledger.payout_due, 0)
      - (greatest(coalesce(ledger.cash_wholesale_owed, 0), 0) + f.equipment_rental_fee), 0)
    ) as progress_amount,
    (s.fair_id is not null) as is_final
  from public.fairs f
  join public.organizations o on o.id = f.org_id
  left join public.settlements s on s.fair_id = f.id
  left join lateral (
    select sum(wpf.amount) as total
    from public.wallet_pool_fundings wpf
    where wpf.fair_id = f.id and wpf.status = 'completed'
  ) donated on true
  left join lateral (
    select
      sum(case when jl.account_code = '2000' then jl.credit - jl.debit else 0 end) as payout_due,
      sum(case when jl.account_code = '1300' then jl.debit - jl.credit else 0 end) as cash_wholesale_owed
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.journal_entry_id
    where je.fair_id = f.id and jl.account_code in ('2000', '1300')
  ) ledger on true
  where f.fundraiser_goal_amount is not null
    and f.allow_wallet
    and o.is_school
    and f.status in ('scheduled', 'active', 'closed');
end;
$$;

revoke execute on function public.fundraiser_fairs_public() from public;
grant execute on function public.fundraiser_fairs_public() to anon, authenticated;
