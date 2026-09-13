-- Neither sendSettlementPayout() nor createSettlementPaymentLink()
-- (app/admin/fairs/actions.ts) previously recorded whether the money
-- actually moved, only that the attempt was made (stripe_transfer_id/
-- stripe_payment_link_id). This adds the three outcomes that matter:
--
-- - transfer_confirmed_at: a Stripe Transfer has no separate pending
--   state the way a bank Payout does — moving funds between the
--   platform's and a connected account's Stripe balance is synchronous
--   with the API call succeeding, so this is set immediately by the
--   Server Action itself, not by a webhook.
-- - transfer_reversed_at: the one way a "confirmed" transfer can still
--   un-happen later (a dispute clawback, fraud finding) — set by the
--   transfer.reversed webhook event.
-- - payment_link_paid_at: genuinely asynchronous (the org has to actually
--   click and pay) — set by the checkout.session.completed webhook event,
--   matched by `session.payment_link` back to stripe_payment_link_id.
alter table public.settlements
  add column transfer_confirmed_at timestamptz,
  add column transfer_reversed_at timestamptz,
  add column payment_link_paid_at timestamptz;
