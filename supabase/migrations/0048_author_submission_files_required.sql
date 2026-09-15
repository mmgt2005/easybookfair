-- Front cover, back cover, and interior PDF are no longer optional on the
-- author submission form (app/author/submit/page.tsx) — enforce that at
-- the schema level too, matching every other required field on this table
-- (author_name, author_email, title, suggested_retail_price).
alter table public.author_submissions
  alter column front_cover_image_url set not null,
  alter column back_cover_image_url set not null,
  alter column interior_pdf_url set not null;
