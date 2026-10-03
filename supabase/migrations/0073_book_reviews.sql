-- Public book reviews shown on an author's public page
-- (app/authors/[authorId]/page.tsx). No purchase verification at all
-- (product owner's decision — a strict online-only verification check
-- would have silently excluded every in-person buyer, since
-- checkout_sessions.buyer_email is only ever captured for the 'online'
-- channel) — anyone can submit, gated entirely by admin approval before
-- anything becomes publicly visible. Turnstile + honeypot (lib/spamGuard.ts,
-- already used on every other public form in this app) carry the
-- anti-abuse weight that purchase-verification would otherwise have.
create table public.book_reviews (
  id uuid primary key default gen_random_uuid(),
  catalog_item_id uuid not null references public.catalog_items (id),
  reviewer_name text not null,
  reviewer_email text not null,
  rating integer not null check (rating between 1 and 5),
  review_text text,
  status public.application_status not null default 'pending',
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index book_reviews_catalog_item_id_idx on public.book_reviews (catalog_item_id);

create trigger set_updated_at
  before update on public.book_reviews
  for each row execute function app.set_updated_at();

alter table public.book_reviews enable row level security;

create policy "book_reviews_admin_all" on public.book_reviews
  for all
  using (app.is_platform_admin())
  with check (app.is_platform_admin());

-- Public can only ever see approved reviews — pending/declined stay
-- admin-only, same "moderation queue is never publicly readable" posture
-- already used for every other application_status-gated table in this
-- app.
create policy "book_reviews_select_public" on public.book_reviews
  for select
  using (status = 'approved');

-- Plain insert policy — no RPC needed, since there's no cross-table check
-- to enforce. Mirrors author_submissions_insert's shape (anon +
-- authenticated, no further condition beyond the table's own checks).
-- Forcing status = 'pending' in the check means a submitter can never
-- self-publish by passing status = 'approved' directly.
create policy "book_reviews_insert_public" on public.book_reviews
  for insert to anon, authenticated
  with check (status = 'pending');

-- Public, anon-safe read of a book's approved reviews — same "security
-- definer RPC is the only public read path" pattern as every other public
-- RPC in this app (fair_public_info, author_public_profile, etc.), since
-- book_reviews_select_public alone would still require the caller to know
-- to filter by catalog_item_id themselves; wrapping it keeps the contract
-- explicit.
create or replace function public.book_reviews_public(p_catalog_item_id uuid)
returns table (
  reviewer_name text,
  rating integer,
  review_text text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select reviewer_name, rating, review_text, created_at
  from public.book_reviews
  where catalog_item_id = p_catalog_item_id
    and status = 'approved'
  order by created_at desc;
$$;

revoke execute on function public.book_reviews_public(uuid) from public;
grant execute on function public.book_reviews_public(uuid) to anon, authenticated;
