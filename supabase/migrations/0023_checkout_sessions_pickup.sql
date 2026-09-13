-- Supports "order online, pick up during the fair" (docs/spec.md, "Buyer
-- payment options"): checkout_sessions already holds the cart, but had no
-- buyer identity (no login exists for buyers — guest checkout only, so
-- name/email are captured here directly) and no notion of whether an
-- already-paid order has actually been handed over yet.
alter table public.checkout_sessions
  add column buyer_name text,
  add column buyer_email text,
  add column fulfillment_status text check (fulfillment_status in ('awaiting_pickup', 'picked_up'));

-- record_checkout_sale (migration 0010) now also starts the pickup flow:
-- an online order becomes 'awaiting_pickup' the moment payment clears, so
-- the redemption screen has something to search for. In-person sales don't
-- use fulfillment_status at all (items already left the table in person),
-- so it's left null for that channel.
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

  update public.checkout_sessions
  set
    status = 'completed',
    fulfillment_status = case when v_session.channel = 'online' then 'awaiting_pickup' else null end
  where id = v_session.id;
end;
$$;

-- Marks an order handed over at the pickup table. Narrow, admin-gated RPC
-- rather than an RLS update policy — checkout_sessions otherwise has no
-- write access for authenticated users at all (writes are service-role/RPC
-- only, migration 0010), and this keeps that boundary intact rather than
-- opening up column-unrestricted UPDATE to admins.
create or replace function public.mark_checkout_picked_up(p_checkout_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not app.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  update public.checkout_sessions
  set fulfillment_status = 'picked_up'
  where id = p_checkout_session_id
    and fulfillment_status = 'awaiting_pickup';
end;
$$;

revoke execute on function public.mark_checkout_picked_up(uuid) from public;
grant execute on function public.mark_checkout_picked_up(uuid) to authenticated;
