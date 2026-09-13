-- Extends record_sale() (migration 0010) with a third posting pattern for
-- the new 'wallet' channel. Card/online/in-person all collect cash into
-- Stripe Clearing at the moment of charge, so that's what a sale debits. A
-- wallet spend already collected the cash earlier, at funding time (into
-- Buyer Wallet Liability, migration 0019) — so a wallet sale must relieve
-- that liability instead of debiting Stripe Clearing a second time. Cash
-- sales are unchanged; margin/Org Payable handling is unchanged and shared
-- between card/online/in-person and wallet.
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
  v_debit_account text;
  v_description text;
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
      if p_channel = 'wallet' then
        v_debit_account := '1400';
        v_description := 'Wallet sale';
      else
        v_debit_account := '1000';
        v_description := 'Card/online sale';
      end if;

      v_margin := p_price_charged - p_wholesale_cost;
      v_lines := jsonb_build_array(
        jsonb_build_object('account_code', v_debit_account, 'debit', p_price_charged),
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
        'sale', p_fair_id, v_org_id, v_description, v_sale_id, v_lines
      );
    end if;
  end if;

  return v_sale_id;
end;
$$;
