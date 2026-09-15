-- Two gaps found while reviewing the event-request feature: (1) email was
-- the only contact method anywhere in the schema for an author — no
-- phone number existed on `authors` or `author_submissions`; (2) a book
-- an admin added directly (never through /author/submit) had zero path
-- to any author contact info at all — catalog_items has no author
-- columns and no FK to authors, so /admin/event-requests could only ever
-- show "No author on file" for such a book, even though an org can still
-- submit an event request for it.
--
-- Fix: add phone as a second contact channel, and let an admin attach
-- plain author contact info directly to a catalog item — deliberately
-- plain text fields here, not a FK to `authors`, since the whole point is
-- covering a book whose "author" may have no account in this system at
-- all. Safe to add to catalog_items: the public storefront never reads
-- this table directly (fair_storefront_items(), migration 0024, returns a
-- fixed column list; createGuestCheckout's service-role snapshot selects
-- only id/title/price/cost) and catalog_items_select_authenticated
-- (migration 0005) already exposes every column, including cost, to any
-- authenticated user — the same tradeoff this schema already accepts.
alter table public.catalog_items
  add column author_name text,
  add column author_email text,
  add column author_phone text;

alter table public.authors
  add column phone text;

alter table public.author_submissions
  add column author_phone text;
