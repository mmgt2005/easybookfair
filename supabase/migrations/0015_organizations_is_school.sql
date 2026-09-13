-- Gates the student-wallet feature (docs/spec.md, "Buyer payment options"):
-- parent-funded per-student balances only make sense for a K-12 school
-- context, not every consigning organization on the platform. An admin sets
-- this on the organization edit screen.
alter table public.organizations
  add column is_school boolean not null default false;
