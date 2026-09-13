-- Lets authors submit books/merchandise for EasyBookFair to carry, without
-- needing an account first: a public submission form, admin review, and
-- (on approval) a real account created for them — see authors table below.

-- authors ---------------------------------------------------------
-- A lightweight role-marker table, same shape as platform_admins/
-- org_members: membership here is what unlocks the author portal
-- (requireAuthor(), lib/auth.ts). Rows are only ever created by the
-- approval Server Action (service role, bypassing RLS) — never by an
-- authenticated user directly, same as platform_admins.
create table public.authors (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  email text not null,
  created_at timestamptz not null default now()
);

alter table public.authors enable row level security;

create policy "authors_select_self" on public.authors
  for select
  using (app.is_platform_admin() or user_id = auth.uid());

-- author_submissions ---------------------------------------------------------
-- author_user_id is null for a first-time public submission (no account
-- exists yet) and set once approval creates/links one — a returning
-- author who's already signed in submits with it set directly instead of
-- going through the public form.
create table public.author_submissions (
  id uuid primary key default gen_random_uuid(),
  author_user_id uuid references public.authors (user_id),
  author_name text not null,
  author_email text not null,
  title text not null,
  description text,
  item_type public.item_type not null default 'book',
  category text,
  image_url text,
  suggested_retail_price numeric(10, 2) not null check (suggested_retail_price >= 0),
  -- The 65% figure is a business rule (docs discussion, not docs/spec.md
  -- yet), computed here rather than trusted from the client so it can
  -- never be submitted (or edited) independently of the retail price.
  wholesale_price numeric(10, 2) generated always as (round(suggested_retail_price * 0.65, 2)) stored,
  status public.application_status not null default 'pending',
  admin_note text,
  catalog_item_id uuid references public.catalog_items (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index author_submissions_author_user_id_idx on public.author_submissions (author_user_id);

create trigger set_updated_at
  before update on public.author_submissions
  for each row execute function app.set_updated_at();

alter table public.author_submissions enable row level security;

create policy "author_submissions_select" on public.author_submissions
  for select
  using (app.is_platform_admin() or author_user_id = auth.uid());

-- A single insert policy covers both the public form (anon, author_user_id
-- must be null — auth.uid() is null for anon anyway, so this reads the
-- same as "author_user_id is null") and a signed-in author submitting a
-- follow-up item as themselves.
create policy "author_submissions_insert" on public.author_submissions
  for insert
  to anon, authenticated
  with check (author_user_id is null or author_user_id = auth.uid());

create policy "author_submissions_admin_write" on public.author_submissions
  for update
  using (app.is_platform_admin())
  with check (app.is_platform_admin());

-- An approved author can see how their own catalog items are selling —
-- additive to sales_select (migration 0005), which stays org/admin-scoped.
create policy "sales_select_author" on public.sales
  for select
  using (
    catalog_item_id in (
      select catalog_item_id from public.author_submissions
      where author_user_id = auth.uid() and catalog_item_id is not null
    )
  );

-- Public bucket for submission images, uploaded before the author has any
-- account — kept separate from catalog-images (admin-controlled) since
-- these are unreviewed until an admin approves the submission.
insert into storage.buckets (id, name, public)
values ('author-submissions', 'author-submissions', true)
on conflict (id) do nothing;

-- Anyone can upload (the public form has no login), but only admins can
-- overwrite/delete — a submitter gets exactly one shot per file path
-- (random uuid names, same as catalog-images), not the ability to tamper
-- with another submission's image after the fact.
create policy "author_submissions_images_insert" on storage.objects
  for insert
  to anon, authenticated
  with check (bucket_id = 'author-submissions');

create policy "author_submissions_images_admin_write" on storage.objects
  for update
  using (bucket_id = 'author-submissions' and app.is_platform_admin())
  with check (bucket_id = 'author-submissions' and app.is_platform_admin());

create policy "author_submissions_images_admin_delete" on storage.objects
  for delete
  using (bucket_id = 'author-submissions' and app.is_platform_admin());
