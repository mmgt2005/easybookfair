-- Lets org staff read their own fair's cash drawer suggestion (the org
-- "Fair setup package" page needs this, alongside allocations and
-- packing_suggestions, both already org-readable). Additive, not a
-- rewrite of cash_drawer_setups_admin_all (migration 0057) — Postgres
-- OR's multiple permissive policies together for the same command, so
-- this doesn't need to repeat app.is_platform_admin() (already covered
-- by the existing admin policy). Mirrors packing_suggestions_select's
-- org-scoping clause exactly (0005_rls.sql).
create policy "cash_drawer_setups_org_select" on public.cash_drawer_setups
  for select
  using (
    fair_id in (select id from public.fairs where org_id in (select app.current_org_ids()))
  );
