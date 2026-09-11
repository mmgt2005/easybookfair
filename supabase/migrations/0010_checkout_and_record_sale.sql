-- Holds cart line items for a Stripe checkout, keyed by a session id that
-- goes into the PaymentIntent's metadata — the webhook looks a session up
-- by payment_intent_id once payment succeeds, rather than trying to fit an
-- entire cart into Stripe's metadata size limits. Cash sales never create
-- one of these (no PaymentIntent exists for cash at all — docs/spec.md,
-- "Cash sales").
--
-- Writes are service-role only (no RLS policy grants authenticated/anon
-- insert): initiating checkout means calling Stripe's API with the secret
-- key, which is already trusted server code, so this follows the same
-- pattern as sales/webhook_events/journal_entries. The real buyer-facing
-- checkout flow (Phase 4) will call this via a Server Action using the
-- service-role client, same as the webhook handler that reads it back.
create table public.checkout_sessions (
  id uuid primary key default gen_random_uuid(),
  fair_id uuid not null references public.fairs (id),
  channel public.sale_channel not null check (channel <> 'cash'),
  payment_intent_id text unique,
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed', 'cancelled')),
  -- jsonb array of {catalog_item_id, quantity, price_charged,
  -- wholesale_cost, promotion_id}. price_charged/wholesale_cost are
  -- snapshots taken at checkout-creation time, same reasoning as the
  -- columns of the same name on `sales` — catalog prices can change later.
  line_items jsonb not null,
  created_at timestamptz not null default now()
);

create index checkout_sessions_fair_id_idx on public.checkout_sessions (fair_id);

alter table public.checkout_sessions enable row level security;

create policy "checkout_sessions_select" on public.checkout_sessions
  for select
  using (
    app.is_platform_admin()
    or fair_id in (select id from public.fairs where org_id in (select app.current_org_ids()))
  );

-- record_sale() is the channel-agnostic sale writer (docs/spec.md build
-- plan, "channel-agnostic sale writing"): one write path for both the
-- webhook's card/online path and cash sales, branching only on which
-- journal entry pattern applies. SECURITY DEFINER so it can call
-- app.post_journal_entry(); service-role only (see grants below) since its
-- only caller today is the payment webhook, which has no authenticated
-- user context to check is_platform_admin() against.
create or replace function public.record_sale(
  p_fair_id uuid,
  p_catalog_item_id uuid,
  p_channel public.sale_channel,
  p_price_charged numeric,
  p_wholesale_cost numeric,
  p_payment_intent_id text,
  p_promotion_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_sale_id uuid;
  v_margin numeric;
  v_lines jsonb;
begin
  select org_id into v_org_id from public.fairs where id = p_fair_id;
  if v_org_id is null then
    raise exception 'fair % not found', p_fair_id;
  end if;

  insert into public.sales (
    fair_id, catalog_item_id, channel, price_charged, wholesale_cost, payment_intent_id, promotion_id
  )
  values (
    p_fair_id, p_catalog_item_id, p_channel, p_price_charged, p_wholesale_cost, p_payment_intent_id, p_promotion_id
  )
  returning id into v_sale_id;

  if p_channel = 'cash' then
    -- Cash sales invert the flow (docs/spec.md, "Cash sales"): the org
    -- already holds the retail cash, so only the wholesale portion is
    -- owed — no Org Payable line. Skip entirely for a free (cost = 0)
    -- item: there's no dollar movement to record, and a zero-amount
    -- journal entry would be rejected anyway.
    if p_wholesale_cost > 0 then
      perform app.post_journal_entry(
        'sale', p_fair_id, v_org_id, 'Cash sale', v_sale_id,
        jsonb_build_array(
          jsonb_build_object('account_code', '1300', 'debit', p_wholesale_cost),
          jsonb_build_object('account_code', '4000', 'credit', p_wholesale_cost)
        )
      );
    end if;
  else
    if p_price_charged > 0 then
      v_margin := p_price_charged - p_wholesale_cost;
      v_lines := jsonb_build_array(
        jsonb_build_object('account_code', '1000', 'debit', p_price_charged),
        jsonb_build_object('account_code', '4000', 'credit', p_wholesale_cost)
      );
      -- A steep promotion can push price below cost — the org then owes
      -- the difference instead of being paid it, so this line flips to a
      -- debit rather than going negative (journal_lines requires
      -- credit >= 0). Omitted entirely when the sale breaks exactly even.
      if v_margin > 0 then
        v_lines := v_lines || jsonb_build_array(
          jsonb_build_object('account_code', '2000', 'credit', v_margin)
        );
      elsif v_margin < 0 then
        v_lines := v_lines || jsonb_build_array(
          jsonb_build_object('account_code', '2000', 'debit', -v_margin)
        );
      end if;

      perform app.post_journal_entry(
        'sale', p_fair_id, v_org_id, 'Card/online sale', v_sale_id, v_lines
      );
    end if;
  end if;

  return v_sale_id;
end;
$$;

revoke execute on function public.record_sale(uuid, uuid, public.sale_channel, numeric, numeric, text, uuid) from public;
grant execute on function public.record_sale(uuid, uuid, public.sale_channel, numeric, numeric, text, uuid) to service_role;

-- Called by the payment webhook on payment_intent.succeeded — writes every
-- unit in the session's cart as one atomic transaction (all-or-nothing),
-- rather than the webhook route looping and calling record_sale() once per
-- unit over separate requests, where a failure partway through would leave
-- some units recorded and others not with no clean way to resume.
--
-- Idempotency is enforced here via `for update` + the status check, not by
-- the webhook_events table alone: `for update` serializes two concurrent
-- deliveries of the same event onto this one row, and the loser sees
-- status = 'completed' and no-ops. This means a redelivered event is safe
-- to call this again — but if this function itself fails partway (raising
-- an exception), the whole transaction rolls back, the webhook returns an
-- error, and the calling route's webhook_events row (inserted before
-- calling this, for fast-path dedup) will make a Stripe-initiated retry of
-- that same event skip reprocessing rather than trying again. That's a
-- known gap: a failed payment_intent.succeeded needs manual reconciliation
-- (or a resent event from Stripe's dashboard, which gets a new event id),
-- not automatic retry. Fine at this app's scale; revisit if that changes.
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

  update public.checkout_sessions set status = 'completed' where id = v_session.id;
end;
$$;

revoke execute on function public.record_checkout_sale(text) from public;
grant execute on function public.record_checkout_sale(text) to service_role;
