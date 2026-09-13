-- An org submits a request instead of a real fair — admin reviews and
-- either approves it (which creates the real `fairs` row, copying over
-- the requested dates and payment-option choices) or declines it. Mirrors
-- the org-application review pattern (`organizations.status`) rather than
-- letting orgs write `fairs` directly, which stays admin-only.
create table public.fair_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  requested_by uuid not null references auth.users (id),
  requested_name text not null,
  requested_start_date date not null,
  requested_end_date date not null,
  requested_return_deadline date not null,
  allow_online boolean not null default true,
  allow_wallet boolean not null default false,
  allow_in_person boolean not null default true,
  allow_cash boolean not null default true,
  status public.application_status not null default 'pending',
  admin_note text,
  -- Set once approved — the real fairs row this request became.
  fair_id uuid references public.fairs (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index fair_requests_org_id_idx on public.fair_requests (org_id);

create trigger set_updated_at
  before update on public.fair_requests
  for each row execute function app.set_updated_at();

alter table public.fair_requests enable row level security;

-- Org members see and create requests for their own org only; they can't
-- approve/decline themselves (no update policy for authenticated) — only
-- admin can move status, via the same admin-write pattern used elsewhere.
create policy "fair_requests_org_select" on public.fair_requests
  for select
  using (
    app.is_platform_admin()
    or org_id in (select app.current_org_ids())
  );

create policy "fair_requests_org_insert" on public.fair_requests
  for insert
  to authenticated
  with check (
    org_id in (select app.current_org_ids())
    and requested_by = auth.uid()
  );

create policy "fair_requests_admin_write" on public.fair_requests
  for update
  using (app.is_platform_admin())
  with check (app.is_platform_admin());
