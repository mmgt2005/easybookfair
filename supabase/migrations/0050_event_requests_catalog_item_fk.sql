-- Bug fix: event_requests.catalog_item_id had no direct foreign key to
-- catalog_items (migration 0049 only added the composite FK to
-- allocations, deliberately, to enforce "this book is allocated to this
-- fair"). But Supabase/PostgREST's embedding feature
-- (.select("...catalog_items(title)"), used in app/org/page.tsx and
-- app/admin/event-requests/page.tsx) resolves relationships from foreign
-- key constraints — with no single-column FK from event_requests to
-- catalog_items, it has no path to follow, so those embedded selects
-- silently failed (returning no rows, since the error was never checked)
-- even though the insert itself succeeded. This adds the missing FK
-- alongside the existing composite one — they enforce different things
-- (this one just "catalog_item_id is a real catalog item", already
-- implied transitively by the composite FK, but PostgREST needs it
-- spelled out directly to embed it) and don't conflict.
alter table public.event_requests
  add constraint event_requests_catalog_item_id_fkey
  foreign key (catalog_item_id) references public.catalog_items (id);
