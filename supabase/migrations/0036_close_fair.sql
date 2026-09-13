-- Settlement had a table (migration 0003) but nothing ever wrote to it —
-- "closing a fair" was still only spec/intended behavior (docs/MANUAL.md).
-- This adds a real, deliberately scoped-down close_fair(): it nets the
-- equipment rental fee (migration 0034) against payout, but does NOT yet
-- compute missing-inventory cost (there's no returns-recording feature to
-- drive it — allocations.quantity_returned exists but nothing ever writes
-- it, so treating unreturned stock as "missing" would wrongly charge an
-- org for books that are simply sitting in a box, not lost) and does NOT
-- automate the actual Stripe Transfer/Payment Link — it records the
-- settlement and marks the fair closed; moving real money is still a
-- manual follow-up step for now.

insert into public.accounts (code, name, type) values
  ('4100', 'Equipment Rental Revenue', 'revenue');

alter table public.settlements
  add column equipment_rental_fee numeric(12, 2) not null default 0;

alter table public.settlements
  drop constraint settlements_check,
  drop constraint settlements_check1;

alter table public.settlements
  add constraint settlements_total_owed_by_org_check
    check (total_owed_by_org = cash_wholesale_owed + missing_inventory_cost + equipment_rental_fee),
  add constraint settlements_net_payout_check
    check (net_payout = payout_due - total_owed_by_org);

-- payout_due and cash_wholesale_owed are read directly off the ledger (the
-- net balance of Org Payable / A/R for this fair) rather than re-derived
-- from `sales` — that automatically accounts for refunds and the wallet
-- close-out credit (migration 0022), both of which already post to the
-- same accounts, without this function needing to know about them
-- separately.
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
  v_missing_inventory_cost constant numeric(12, 2) := 0;
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

  -- Recognize the rental fee as revenue, clear the cash-sale receivable,
  -- and resolve whatever's left of Org Payable — a transfer out if the org
  -- is still owed money (net_payout > 0), or a residual receivable if the
  -- rental fee/cash owed outweighs their card/online margin (net_payout <
  -- 0), left for a Payment Link to collect rather than modeled here. Every
  -- line below nets to a debit total of payout_due, which is exactly the
  -- credit balance Org Payable already carries from each sale's own
  -- posting (migrations 0010/0020) plus any wallet close-out credit
  -- (migration 0022) — so this entry always clears it to zero, whichever
  -- branch runs.
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
