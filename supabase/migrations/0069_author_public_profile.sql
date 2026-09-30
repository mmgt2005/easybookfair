-- Bio + website an author can write about themselves, shown on their new
-- public profile page. No length/format constraint in SQL, matching this
-- app's existing free-text columns (fundraiser_description, etc.) —
-- website normalization (prepending https:// if missing a scheme) happens
-- in the Server Action, not here.
alter table public.authors
  add column bio text,
  add column website text;

-- Fixes a real, pre-existing bug: authors has only authors_select_self
-- (SELECT) — no UPDATE policy at all — so updateAuthor()
-- (app/admin/authors/actions.ts) has been silently no-op-ing every edit
-- through the regular RLS-scoped client. Mirrors the exact admin-write
-- policy shape used everywhere else in this app (organizations_admin_write,
-- fairs_admin_write, etc.).
create policy "authors_admin_write" on public.authors
  for all
  using (app.is_platform_admin())
  with check (app.is_platform_admin());

-- Lets an author edit ONLY their own bio/website (name/email/phone stay
-- admin-only, now actually enforced by the policy above) without opening
-- a broader self-UPDATE policy. Mirrors update_org_shipping_address()
-- (0066) and set_fundraiser_goal() (0063) exactly: security definer,
-- scoped to "self or admin" so an admin "viewing as" this author (a real
-- admin login) can also save on their behalf.
create or replace function public.update_author_profile(
  p_author_user_id uuid,
  p_bio text,
  p_website text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (app.is_platform_admin() or p_author_user_id = auth.uid()) then
    raise exception 'not authorized';
  end if;

  update public.authors
  set
    bio = nullif(trim(coalesce(p_bio, '')), ''),
    website = nullif(trim(coalesce(p_website, '')), '')
  where user_id = p_author_user_id;
end;
$$;

revoke execute on function public.update_author_profile(uuid, text, text) from public;
grant execute on function public.update_author_profile(uuid, text, text) to authenticated;

-- Public, anon-safe listing for the landing page's "Meet the Authors"
-- section — authors has no anon-select policy at all, same reasoning as
-- fair_public_info/fair_storefront_items being the only public read
-- paths onto their own tables. Qualification (real account + at least
-- one approved book via either source) mirrors the author portal's own
-- two-query logic exactly (app/author/(portal)/page.tsx).
create or replace function public.authors_public_list()
returns table (
  author_user_id uuid,
  name text
)
language sql
stable
security definer
set search_path = public
as $$
  select a.user_id, a.name
  from public.authors a
  where exists (
    select 1 from public.author_submissions s
    where s.author_user_id = a.user_id
      and s.status = 'approved'
      and s.catalog_item_id is not null
  )
  or exists (
    select 1 from public.catalog_items ci
    where lower(ci.author_email) = lower(a.email)
  )
  order by a.name;
$$;

revoke execute on function public.authors_public_list() from public;
grant execute on function public.authors_public_list() to anon, authenticated;

-- One author's public profile — same qualification gate as the list
-- above (an author who stops qualifying, e.g. their only book is
-- declined, correctly returns nothing here too instead of leaking a bio
-- via a guessed url).
create or replace function public.author_public_profile(p_author_user_id uuid)
returns table (
  author_user_id uuid,
  name text,
  bio text,
  website text
)
language sql
stable
security definer
set search_path = public
as $$
  select a.user_id, a.name, a.bio, a.website
  from public.authors a
  where a.user_id = p_author_user_id
    and (
      exists (
        select 1 from public.author_submissions s
        where s.author_user_id = a.user_id
          and s.status = 'approved'
          and s.catalog_item_id is not null
      )
      or exists (
        select 1 from public.catalog_items ci
        where lower(ci.author_email) = lower(a.email)
      )
    );
$$;

revoke execute on function public.author_public_profile(uuid) from public;
grant execute on function public.author_public_profile(uuid) to anon, authenticated;

-- That author's books — same two sources as the portal's own two
-- queries, unioned via `or` into one result set instead of two round
-- trips. Deliberately NOT gated by the qualification check above (unlike
-- author_public_profile()) — this also powers the author dashboard's own
-- "preview my public page" section, which needs to show correctly even
-- before the author has an approved book yet.
create or replace function public.author_public_books(p_author_user_id uuid)
returns table (
  catalog_item_id uuid,
  title text,
  description text,
  image_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select distinct ci.id, ci.title, ci.description, ci.image_url
  from public.catalog_items ci
  where ci.id in (
    select s.catalog_item_id
    from public.author_submissions s
    where s.author_user_id = p_author_user_id
      and s.status = 'approved'
      and s.catalog_item_id is not null
  )
  or lower(ci.author_email) = lower(
    (select email from public.authors where user_id = p_author_user_id)
  )
  order by ci.title;
$$;

revoke execute on function public.author_public_books(uuid) from public;
grant execute on function public.author_public_books(uuid) to anon, authenticated;
