-- Physical-reader (Stripe Terminal) checkout needs a Stripe Terminal
-- "Location" to discover/register readers against — one location per fair
-- venue is the natural granularity (docs/spec.md payments section: a fair
-- happens at a specific place). Nullable: only set once an admin actually
-- sets up Terminal for that fair; the checkout screen requires it before
-- offering the reader flow.
alter table public.fairs
  add column stripe_terminal_location_id text;
