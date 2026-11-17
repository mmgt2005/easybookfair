-- Checkout receipts: every in-person tender (card reader, cash, student
-- wallet) now gets a checkout_sessions row as its receipt record, not just
-- the reader (see app/admin/fairs/[fairId]/checkout/actions.ts). That
-- reuses this table purely as a line-item/receipt record, independent of
-- the original "cash has no PaymentIntent to link back to" reasoning that
-- motivated excluding it (migration 0010) — drop that check; the column
-- itself and payment_intent_id (which stays null for cash/wallet rows,
-- same as the sales table already allows) don't need to change.
alter table public.checkout_sessions
  drop constraint checkout_sessions_channel_check;

-- get_checkout_session_public() needs channel too, so the public order
-- page (app/fairs/[fairId]/order/[checkoutSessionId]/page.tsx) can tell an
-- in-person sale from an online one and skip copy that doesn't apply
-- (pickup status, "a confirmation email is on its way"). Same
-- drop-then-recreate as every other extension of this function — CREATE OR
-- REPLACE can't add new OUT columns.
drop function if exists public.get_checkout_session_public(uuid);

create or replace function public.get_checkout_session_public(p_checkout_session_id uuid)
returns table (
  id uuid,
  status text,
  fulfillment_status text,
  buyer_name text,
  channel public.sale_channel,
  line_items jsonb,
  fair_name text,
  tax_amount numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select cs.id, cs.status, cs.fulfillment_status, cs.buyer_name, cs.channel, cs.line_items, f.name, cs.tax_amount
  from public.checkout_sessions cs
  join public.fairs f on f.id = cs.fair_id
  where cs.id = p_checkout_session_id;
$$;

revoke execute on function public.get_checkout_session_public(uuid) from public;
grant execute on function public.get_checkout_session_public(uuid) to anon, authenticated;
