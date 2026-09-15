-- Author submissions need a front cover, a back cover, and the interior as
-- a PDF, all for admin review before approval. image_url (added in 0040)
-- is renamed to front_cover_image_url for clarity — it's still the one
-- copied to catalog_items.image_url on approval (see
-- app/admin/author-submissions/actions.ts).
alter table public.author_submissions
  rename column image_url to front_cover_image_url;

alter table public.author_submissions
  add column back_cover_image_url text,
  add column interior_pdf_url text;
