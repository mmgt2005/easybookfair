-- promotions (migration 0002) had no way to scope a promotion to one fair
-- — every book fair has its own catalog subset and its own bundle deals,
-- so a platform-wide promotion doesn't make sense here. Nullable rather
-- than not null: this table already existed with no writer, so there
-- could in principle be pre-existing rows in a real project with no fair
-- to attach to a not-null column; a null fair_id promotion is simply
-- never matched by any fair-scoped query going forward (lib/promotions.ts
-- always fetches `where fair_id = <this fair>`), not an error.
alter table public.promotions
  add column fair_id uuid references public.fairs (id) on delete cascade;

create index promotions_fair_id_idx on public.promotions (fair_id);
