-- An org that requests the in-person reader owes a flat equipment rental
-- fee, set by the admin at approval time (or adjusted later on the fair's
-- edit page) rather than by the org itself — the org doesn't own/price the
-- hardware. Netted against their payout at fair close (see close_fair(),
-- migration 0036).
alter table public.fairs
  add column equipment_rental_fee numeric(10, 2) not null default 0;
