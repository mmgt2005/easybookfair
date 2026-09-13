-- close_wallets_for_fair() already zeroed a wallet's balance on close, with
-- no record of what was actually donated once that happened — needed so a
-- parent can be sent a receipt (and look it up again later) after the fact.
alter table public.student_wallets
  add column donated_amount numeric(10, 2) not null default 0,
  add column closed_at timestamptz;

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
    set donated_amount = v_wallet.balance, closed_at = now(), balance = 0, status = 'closed'
    where id = v_wallet.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- Anon-safe, narrow read for the printable/emailed donation receipt page —
-- same posture as fair_public_info/get_checkout_session_public (migrations
-- 0025): only ever exposes a wallet that's actually closed with something
-- donated, keyed by the wallet's own unguessable id, no buyer login to
-- check against.
create or replace function public.wallet_donation_receipt(p_wallet_id uuid)
returns table (
  student_name text,
  fair_name text,
  donated_amount numeric,
  closed_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select sw.student_name, f.name, sw.donated_amount, sw.closed_at
  from public.student_wallets sw
  join public.fairs f on f.id = sw.fair_id
  where sw.id = p_wallet_id
    and sw.status = 'closed'
    and sw.donated_amount > 0;
$$;

revoke execute on function public.wallet_donation_receipt(uuid) from public;
grant execute on function public.wallet_donation_receipt(uuid) to anon, authenticated;
