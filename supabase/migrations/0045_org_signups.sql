-- Lets an organization express interest in running a fair without needing
-- an account first — same shape as author_submissions (migration 0040):
-- a public form, admin review, and (on approval) a real organizations row
-- plus an invited account for the contact. Before this, organizations
-- could only ever be created directly by an admin
-- (app/admin/organizations/actions.ts, createOrganization) — there was no
-- self-serve "come sign up" path at all, unlike authors.
create table public.org_signups (
  id uuid primary key default gen_random_uuid(),
  org_name text not null,
  contact_name text not null,
  contact_email text not null,
  is_school boolean not null default false,
  message text,
  status public.application_status not null default 'pending',
  admin_note text,
  org_id uuid references public.organizations (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at
  before update on public.org_signups
  for each row execute function app.set_updated_at();

alter table public.org_signups enable row level security;

-- No "view your own past submissions" policy, unlike author_submissions —
-- there's no account yet for an unapproved org to sign in with, and once
-- approved the org's real dashboard (/org) is the place to look, not this
-- table.
create policy "org_signups_insert" on public.org_signups
  for insert
  to anon, authenticated
  with check (true);

create policy "org_signups_admin_all" on public.org_signups
  for all
  using (app.is_platform_admin())
  with check (app.is_platform_admin());
