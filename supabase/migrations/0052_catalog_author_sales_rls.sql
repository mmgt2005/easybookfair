-- A catalog item can name an author directly (author_name/author_email/
-- author_phone, migration 0051) without that author ever having gone
-- through /author/submit. sales_select_author (migration 0040) only
-- covers sales for catalog items linked via author_submissions, so a
-- real (not admin-"viewing-as") author whose only link is a catalog
-- item's author_email couldn't see their own sales. This policy closes
-- that gap the same way, keyed by email instead of author_submissions.
create policy "sales_select_author_catalog" on public.sales
  for select
  using (
    catalog_item_id in (
      select id from public.catalog_items
      where lower(author_email) = lower(
        (select email from public.authors where user_id = auth.uid())
      )
    )
  );
