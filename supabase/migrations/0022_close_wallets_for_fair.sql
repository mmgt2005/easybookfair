-- Sweeps every active wallet's remaining balance for a fair into that
-- fair's org payout, per the decision that unused wallet balance becomes
-- additional org revenue (unlike Scholastic's own eWallet, which rolls
-- leftover balance into the student's own account for next time) — a
-- manual admin action for now, same as everything else about closing a
-- fair being manual until the full settlement engine exists (docs/spec.md).
-- Debits the wallet liability (relieving it) and credits Org Payable
-- directly, since this money was already collected at funding time — it's
-- moving from "owed as goods" to "owed as cash to the org," not new
-- revenue recognition the way a sale is.
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
  if not app.is_platform_admin() then
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

revoke execute on function public.close_wallets_for_fair(uuid) from public;
grant execute on function public.close_wallets_for_fair(uuid) to authenticated;
