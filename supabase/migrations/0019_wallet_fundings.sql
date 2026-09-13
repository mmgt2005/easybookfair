-- Holds one funding attempt for a student wallet, keyed by payment_intent_id
-- the same way checkout_sessions is (migration 0010) — the webhook looks
-- this up by payment_intent_id once payment succeeds, rather than trying to
-- infer which wallet a bare PaymentIntent belongs to.
--
-- Writes are service-role only (no RLS insert/update policy for
-- authenticated/anon): the public wallet-funding page creates this row via
-- the service-role client after calling Stripe's API with the secret key,
-- already trusted server code — same pattern as checkout_sessions.
create table public.wallet_fundings (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.student_wallets (id),
  payment_intent_id text unique,
  amount numeric(10, 2) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed', 'cancelled')),
  created_at timestamptz not null default now()
);

create index wallet_fundings_wallet_id_idx on public.wallet_fundings (wallet_id);

alter table public.wallet_fundings enable row level security;

create policy "wallet_fundings_admin_select" on public.wallet_fundings
  for select
  using (app.is_platform_admin());

-- Called by the payment webhook on payment_intent.succeeded, mirroring
-- record_checkout_sale's idempotency pattern (migration 0010): `for update`
-- + the status check is what makes a redelivered event safe to reprocess,
-- not the webhook_events table alone. Credits the wallet's balance and
-- posts the funding's ledger entry (Debit Stripe Clearing, Credit Buyer
-- Wallet Liability — the money is now owed back in goods, not yet earned
-- revenue) atomically with marking the funding completed.
create or replace function public.record_wallet_funding(p_payment_intent_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_funding record;
  v_wallet record;
  v_org_id uuid;
begin
  select * into v_funding
  from public.wallet_fundings
  where payment_intent_id = p_payment_intent_id
  for update;

  if v_funding is null or v_funding.status = 'completed' then
    return;
  end if;

  select sw.*, f.org_id into v_wallet
  from public.student_wallets sw
  join public.fairs f on f.id = sw.fair_id
  where sw.id = v_funding.wallet_id
  for update;

  update public.student_wallets
  set balance = balance + v_funding.amount
  where id = v_wallet.id;

  perform app.post_journal_entry(
    'wallet_funding',
    v_wallet.fair_id,
    v_wallet.org_id,
    format('Wallet funding for %s', v_wallet.student_name),
    v_funding.id,
    jsonb_build_array(
      jsonb_build_object('account_code', '1000', 'debit', v_funding.amount),
      jsonb_build_object('account_code', '1400', 'credit', v_funding.amount)
    )
  );

  update public.wallet_fundings set status = 'completed' where id = v_funding.id;
end;
$$;

revoke execute on function public.record_wallet_funding(text) from public;
grant execute on function public.record_wallet_funding(text) to service_role;
