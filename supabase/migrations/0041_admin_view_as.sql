-- Backs the admin "view as" feature (an admin previews/acts in the org or
-- author portal as a specific org/author, without a real session swap —
-- see lib/viewAs.ts). Two things are needed at the database level:
--
-- 1. An audit trail: submitted_by_admin_id records that an admin, not the
--    org/author themselves, actually clicked submit — org_id/
--    author_user_id still point at the real target, so the row looks and
--    behaves exactly like a normal submission everywhere else.
-- 2. New insert policies: the existing org/author insert policies check
--    `auth.uid()` against the row being inserted, which an impersonating
--    admin's own auth.uid() will never match (they're not that org's
--    member or that author). Admins already review every one of these
--    rows anyway, so an unconditional admin insert policy is consistent
--    with the trust level the rest of the schema already gives them —
--    it's the application code (not RLS) that's responsible for setting
--    org_id/author_user_id to the correct impersonated target rather than
--    trusting client input, since this policy no longer constrains that.
alter table public.fair_requests
  add column submitted_by_admin_id uuid references public.platform_admins (user_id);

alter table public.author_submissions
  add column submitted_by_admin_id uuid references public.platform_admins (user_id);

create policy "fair_requests_admin_insert" on public.fair_requests
  for insert
  to authenticated
  with check (app.is_platform_admin());

create policy "author_submissions_admin_insert" on public.author_submissions
  for insert
  to authenticated
  with check (app.is_platform_admin());
