-- Needed to send a wallet-funding confirmation email — wallet_fundings
-- (migration 0019) never collected the parent's email, since nothing read
-- it back before Resend was wired up.
alter table public.wallet_fundings
  add column parent_email text;
