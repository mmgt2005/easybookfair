-- record_pool_donation (migration 0059) never captured an email for the
-- org-recorded path, so those donors could never be notified at close —
-- wallet_pool_fundings.donor_email already exists as a column (it was
-- always generic, not donor_stripe-specific), it just wasn't populated
-- for this path or accepted by this function. Adding a parameter means
-- create or replace would otherwise leave the old 3-arg signature behind
-- as a separate overload rather than truly replacing it, so the old one
-- is dropped explicitly first.
drop function if exists public.record_pool_donation(uuid, numeric, text);

create or replace function public.record_pool_donation(
  p_fair_id uuid,
  p_amount numeric,
  p_note text,
  p_donor_email text default null
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

  insert into public.wallet_pool_fundings (fair_id, source, amount, status, note, donor_email, recorded_by)
  values (p_fair_id, 'org_recorded', p_amount, 'completed', p_note, p_donor_email, auth.uid())
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

grant execute on function public.record_pool_donation(uuid, numeric, text, text) to authenticated;
