-- Lets an org choose which buyer payment channels apply to their fair
-- (docs/spec.md, "Buyer payment options") instead of every channel always
-- being available. allow_cash is captured for completeness/future use but
-- not yet enforced anywhere — there's no cash-recording UI in the app at
-- all yet (only the database-level 'cash' sale_channel and ledger
-- handling exist), so this flag is presently inert.
alter table public.fairs
  add column allow_online boolean not null default true,
  add column allow_wallet boolean not null default false,
  add column allow_in_person boolean not null default true,
  add column allow_cash boolean not null default true;
