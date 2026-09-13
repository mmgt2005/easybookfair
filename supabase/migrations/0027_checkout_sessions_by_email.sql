-- Order-recovery lookup: with no buyer login and no confirmation email
-- (until Resend is wired up, and even after — a buyer's inbox isn't proof
-- of anything this app can check), the only way to recover a lost order
-- code is to search by the email you gave at checkout. Low-sensitivity
-- data (what was ordered, pickup status) at the same trust level as the
-- single-order lookup by unguessable id (migration 0025) — anyone who
-- knows/guesses the buyer's email can see this, not just the buyer. Fine
-- for what's exposed here, but do not extend this pattern to anything more
-- sensitive without adding real verification.
create or replace function public.get_checkout_sessions_by_email(
  p_fair_id uuid,
  p_email text
)
returns table (
  id uuid,
  status text,
  fulfillment_status text,
  buyer_name text,
  line_items jsonb,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select cs.id, cs.status, cs.fulfillment_status, cs.buyer_name, cs.line_items, cs.created_at
  from public.checkout_sessions cs
  where cs.fair_id = p_fair_id
    and cs.channel = 'online'
    and lower(cs.buyer_email) = lower(p_email)
  order by cs.created_at desc;
$$;

revoke execute on function public.get_checkout_sessions_by_email(uuid, text) from public;
grant execute on function public.get_checkout_sessions_by_email(uuid, text) to anon, authenticated;
