-- New sale channel for student-wallet spends (docs/spec.md, "Buyer payment
-- options"). Kept in its own migration: Postgres won't let a newly added
-- enum value be used in the same transaction that added it, so this must
-- commit before any later migration references 'wallet'.
alter type public.sale_channel add value 'wallet';
