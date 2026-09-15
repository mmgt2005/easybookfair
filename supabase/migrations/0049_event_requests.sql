-- Lets an org request an author reading / book signing tied to a book
-- already allocated to one of their own fairs. Mirrors fair_requests
-- (migration 0030) and its later additions (0033's requested_by_email,
-- 0041's submitted_by_admin_id + admin-insert policy for "view as")
-- exactly: org proposes into a staging table, admin reviews via the
-- shared application_status enum, no authenticated update policy. Unlike
-- fair_requests, approving here doesn't create any further "real" row —
-- there's nothing else to create, the admin just coordinates the actual
-- reading/signing manually once approved.
create type public.event_type as enum ('author_reading', 'book_signing');

create table public.event_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  fair_id uuid not null references public.fairs (id) on delete cascade,
  catalog_item_id uuid not null,
  event_type public.event_type not null,
  -- Nullable: "no fixed date yet, TBD" is a valid request.
  requested_date date,
  notes text,
  status public.application_status not null default 'pending',
  admin_note text,
  requested_by uuid not null references auth.users (id),
  requested_by_email text,
  submitted_by_admin_id uuid references public.platform_admins (user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Enforces "this book is actually allocated to this fair" at the
  -- database level, not just in application code: allocations already has
  -- unique (fair_id, catalog_item_id) (migration 0002), so this composite
  -- FK also transitively guarantees catalog_item_id is a real catalog_items
  -- row (allocations' own FK already requires that) — no separate
  -- single-column FK to catalog_items is needed.
  foreign key (fair_id, catalog_item_id)
    references public.allocations (fair_id, catalog_item_id)
);

create index event_requests_org_id_idx on public.event_requests (org_id);
create index event_requests_fair_id_idx on public.event_requests (fair_id);

create trigger set_updated_at
  before update on public.event_requests
  for each row execute function app.set_updated_at();

alter table public.event_requests enable row level security;

-- Same shape as fair_requests_org_select/fair_requests_org_insert/
-- fair_requests_admin_write (0030) plus fair_requests_admin_insert (0041,
-- for admin "view as" submissions) — no authenticated update policy, so
-- only an admin can move status.
create policy "event_requests_org_select" on public.event_requests
  for select
  using (
    app.is_platform_admin()
    or org_id in (select app.current_org_ids())
  );

create policy "event_requests_org_insert" on public.event_requests
  for insert
  to authenticated
  with check (
    org_id in (select app.current_org_ids())
    and requested_by = auth.uid()
  );

create policy "event_requests_admin_insert" on public.event_requests
  for insert
  to authenticated
  with check (app.is_platform_admin());

create policy "event_requests_admin_write" on public.event_requests
  for update
  using (app.is_platform_admin())
  with check (app.is_platform_admin());
